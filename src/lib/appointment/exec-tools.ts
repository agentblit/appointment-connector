import {
  cancelAppointmentRecord,
  createAppointmentRecord,
  getAppointmentForAgent,
  getByAgentId,
  getEntityForAgent,
  hasOverlappingConfirmedAppointment,
  listAppointmentsForBookerInConnector,
  listAppointmentsForEntityInRange,
  listAvailabilityRulesForEntity,
  listEntities,
  listRoles,
  mapRolesById,
  rescheduleAppointmentRecord,
  resolveRoleSummaries,
} from "@/lib/appointment/repo";
import {
  formatDateInTimezone,
  formatDateTimeInTimezone,
  generateAvailableSlots,
  isSlotWithinAvailability,
  userDateRangeToUtcBounds,
} from "@/lib/appointment/appointment-utils";
import {
  bookAppointmentArgsSchema,
  cancelAppointmentArgsSchema,
  checkAvailableSlotsArgsSchema,
  listUserAppointmentsArgsSchema,
  rescheduleAppointmentArgsSchema,
} from "@/lib/appointment/tools";

export type AppointmentToolCallResult = {
  content: Array<{ type: "text"; text: string }>;
};

function mcpStyleResult(data: Record<string, unknown>): AppointmentToolCallResult {
  const text = JSON.stringify(data);
  return { content: [{ type: "text", text }] };
}

function withLocalTimes(
  start: Date,
  end: Date,
  userTimezone: string,
): {
  start: string;
  end: string;
  start_local: string;
  end_local: string;
} {
  return {
    start: start.toISOString(),
    end: end.toISOString(),
    start_local: formatDateTimeInTimezone(start, userTimezone),
    end_local: formatDateTimeInTimezone(end, userTimezone),
  };
}

async function assertConfiguredConnector(agentId: string) {
  const connector = await getByAgentId(agentId);
  if (!connector) {
    throw new Error("Appointment connector is not configured for this agent");
  }
  return connector;
}

export async function executeAppointmentTool(options: {
  agentId: string;
  toolName: string;
  args: unknown;
}): Promise<AppointmentToolCallResult> {
  const { agentId, toolName, args } = options;

  switch (toolName) {
    case "list_entities":
      return listEntitiesTool(agentId);
    case "check_available_slots":
      return checkAvailableSlotsTool({ agentId, args });
    case "book_appointment":
      return bookAppointmentTool({ agentId, args });
    case "cancel_appointment":
      return cancelAppointmentTool({ agentId, args });
    case "reschedule_appointment":
      return rescheduleAppointmentTool({ agentId, args });
    case "list_user_appointments":
      return listUserAppointmentsTool({ agentId, args });
    default:
      throw new Error(`Unknown Appointment tool: ${toolName}`);
  }
}

async function listEntitiesTool(
  agentId: string,
): Promise<AppointmentToolCallResult> {
  const connector = await assertConfiguredConnector(agentId);
  const [entities, roles] = await Promise.all([
    listEntities(connector.id),
    listRoles(connector.id),
  ]);
  const rolesById = mapRolesById(roles);

  return mcpStyleResult({
    ok: true,
    entity_label: connector.entityLabel,
    business_timezone: connector.timezone,
    roles: roles.map((role) => ({
      id: role.id,
      name: role.name,
      description: role.description,
    })),
    entities: entities.map((entity) => ({
      id: entity.id,
      name: entity.name,
      description: entity.description,
      roles: resolveRoleSummaries(entity.roleIds, rolesById),
      is_active: entity.isActive,
    })),
  });
}

async function checkAvailableSlotsTool(options: {
  agentId: string;
  args: unknown;
}): Promise<AppointmentToolCallResult> {
  const parsed = checkAvailableSlotsArgsSchema.safeParse(options.args ?? {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(issue?.message ?? "Invalid check_available_slots arguments");
  }

  const connector = await assertConfiguredConnector(options.agentId);
  const entity = await getEntityForAgent({
    agentId: options.agentId,
    entityId: parsed.data.entity_id,
  });
  if (!entity || entity.connector.id !== connector.id) {
    throw new Error("Entity not found for this agent");
  }

  if (parsed.data.date_from > parsed.data.date_to) {
    throw new Error("date_from must be on or before date_to");
  }

  const userTimezone = parsed.data.timezone;
  const businessTimezone = connector.timezone;
  const { utcFrom, utcToExclusive } = userDateRangeToUtcBounds(
    parsed.data.date_from,
    parsed.data.date_to,
    userTimezone,
  );

  // Expand calendar bounds in business TZ so evening slots that spill across
  // midnight in the user's TZ are still generated.
  const businessDateFrom = formatDateInTimezone(utcFrom, businessTimezone);
  const businessDateTo = formatDateInTimezone(
    new Date(utcToExclusive.getTime() - 1),
    businessTimezone,
  );

  const rules = await listAvailabilityRulesForEntity(entity.entity.id);
  const appointments = await listAppointmentsForEntityInRange({
    entityId: entity.entity.id,
    dateFrom: utcFrom,
    dateTo: new Date(utcToExclusive.getTime() - 1),
  });

  const generated = generateAvailableSlots({
    rules,
    existingAppointments: appointments,
    dateFrom: businessDateFrom,
    dateTo: businessDateTo,
    slotDurationMinutes: connector.slotDurationMinutes,
    timezone: businessTimezone,
  });

  const slots = generated
    .map((slot) => {
      const start = new Date(slot.start);
      const end = new Date(slot.end);
      return { start, end };
    })
    .filter(
      (slot) => slot.start >= utcFrom && slot.start < utcToExclusive,
    )
    .map((slot) => withLocalTimes(slot.start, slot.end, userTimezone));

  return mcpStyleResult({
    ok: true,
    entity_id: entity.entity.id,
    entity_name: entity.entity.name,
    entity_label: connector.entityLabel,
    business_timezone: businessTimezone,
    user_timezone: userTimezone,
    slot_duration_minutes: connector.slotDurationMinutes,
    slots,
  });
}

async function bookAppointmentTool(options: {
  agentId: string;
  args: unknown;
}): Promise<AppointmentToolCallResult> {
  const parsed = bookAppointmentArgsSchema.safeParse(options.args ?? {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(issue?.message ?? "Invalid book_appointment arguments");
  }

  const connector = await assertConfiguredConnector(options.agentId);
  const entity = await getEntityForAgent({
    agentId: options.agentId,
    entityId: parsed.data.entity_id,
  });
  if (!entity || entity.connector.id !== connector.id) {
    throw new Error("Entity not found for this agent");
  }

  const slotStart = new Date(parsed.data.slot_start);
  const slotEnd = new Date(parsed.data.slot_end);
  if (Number.isNaN(slotStart.getTime()) || Number.isNaN(slotEnd.getTime())) {
    throw new Error("Invalid slot start or end time");
  }
  if (slotEnd <= slotStart) {
    throw new Error("slot_end must be after slot_start");
  }

  const durationMinutes = Math.round(
    (slotEnd.getTime() - slotStart.getTime()) / 60_000,
  );
  if (durationMinutes !== connector.slotDurationMinutes) {
    throw new Error(
      `Slot duration must be ${connector.slotDurationMinutes} minutes`,
    );
  }

  const rules = await listAvailabilityRulesForEntity(entity.entity.id);
  if (
    !isSlotWithinAvailability({
      rules,
      slotStart,
      slotEnd,
      timezone: connector.timezone,
    })
  ) {
    throw new Error("Requested slot is outside configured availability");
  }

  const hasConflict = await hasOverlappingConfirmedAppointment({
    entityId: entity.entity.id,
    startTime: slotStart,
    endTime: slotEnd,
  });
  if (hasConflict) {
    throw new Error("Requested slot is no longer available");
  }

  const appointment = await createAppointmentRecord({
    entityId: entity.entity.id,
    bookerName: parsed.data.booker_name,
    bookerEmail: parsed.data.booker_email,
    startTime: slotStart,
    endTime: slotEnd,
  });

  const local = withLocalTimes(
    appointment.startTime,
    appointment.endTime,
    parsed.data.timezone,
  );

  return mcpStyleResult({
    ok: true,
    appointment_id: appointment.id,
    entity_id: entity.entity.id,
    entity_name: entity.entity.name,
    business_timezone: connector.timezone,
    user_timezone: parsed.data.timezone,
    start_time: local.start,
    end_time: local.end,
    start_local: local.start_local,
    end_local: local.end_local,
    booker_name: appointment.bookerName,
    booker_email: appointment.bookerEmail,
    status: appointment.status,
  });
}

async function cancelAppointmentTool(options: {
  agentId: string;
  args: unknown;
}): Promise<AppointmentToolCallResult> {
  const parsed = cancelAppointmentArgsSchema.safeParse(options.args ?? {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(issue?.message ?? "Invalid cancel_appointment arguments");
  }

  const appointment = await getAppointmentForAgent({
    agentId: options.agentId,
    appointmentId: parsed.data.appointment_id,
  });
  if (!appointment) {
    throw new Error("Appointment not found for this agent");
  }
  if (appointment.appointment.status === "cancelled") {
    throw new Error("Appointment is already cancelled");
  }

  const updated = await cancelAppointmentRecord(appointment.appointment.id);
  if (!updated) {
    throw new Error("Failed to cancel appointment");
  }

  const result: Record<string, unknown> = {
    ok: true,
    appointment_id: updated.id,
    status: updated.status,
    business_timezone: appointment.connector.timezone,
    start_time: updated.startTime.toISOString(),
    end_time: updated.endTime.toISOString(),
  };
  if (parsed.data.timezone) {
    const local = withLocalTimes(
      updated.startTime,
      updated.endTime,
      parsed.data.timezone,
    );
    result.user_timezone = parsed.data.timezone;
    result.start_local = local.start_local;
    result.end_local = local.end_local;
  }

  return mcpStyleResult(result);
}

async function rescheduleAppointmentTool(options: {
  agentId: string;
  args: unknown;
}): Promise<AppointmentToolCallResult> {
  const parsed = rescheduleAppointmentArgsSchema.safeParse(options.args ?? {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(
      issue?.message ?? "Invalid reschedule_appointment arguments",
    );
  }

  const appointment = await getAppointmentForAgent({
    agentId: options.agentId,
    appointmentId: parsed.data.appointment_id,
  });
  if (!appointment) {
    throw new Error("Appointment not found for this agent");
  }
  if (appointment.appointment.status !== "confirmed") {
    throw new Error("Only confirmed appointments can be rescheduled");
  }

  const connector = appointment.connector;
  const slotStart = new Date(parsed.data.new_slot_start);
  const slotEnd = new Date(parsed.data.new_slot_end);
  if (Number.isNaN(slotStart.getTime()) || Number.isNaN(slotEnd.getTime())) {
    throw new Error("Invalid slot start or end time");
  }
  if (slotEnd <= slotStart) {
    throw new Error("new_slot_end must be after new_slot_start");
  }

  const durationMinutes = Math.round(
    (slotEnd.getTime() - slotStart.getTime()) / 60_000,
  );
  if (durationMinutes !== connector.slotDurationMinutes) {
    throw new Error(
      `Slot duration must be ${connector.slotDurationMinutes} minutes`,
    );
  }

  const rules = await listAvailabilityRulesForEntity(appointment.entity.id);
  if (
    !isSlotWithinAvailability({
      rules,
      slotStart,
      slotEnd,
      timezone: connector.timezone,
    })
  ) {
    throw new Error("Requested slot is outside configured availability");
  }

  const hasConflict = await hasOverlappingConfirmedAppointment({
    entityId: appointment.entity.id,
    startTime: slotStart,
    endTime: slotEnd,
    excludeAppointmentId: appointment.appointment.id,
  });
  if (hasConflict) {
    throw new Error("Requested slot is no longer available");
  }

  const updated = await rescheduleAppointmentRecord({
    appointmentId: appointment.appointment.id,
    startTime: slotStart,
    endTime: slotEnd,
  });
  if (!updated) {
    throw new Error("Failed to reschedule appointment");
  }

  const local = withLocalTimes(
    updated.startTime,
    updated.endTime,
    parsed.data.timezone,
  );

  return mcpStyleResult({
    ok: true,
    appointment_id: updated.id,
    entity_id: appointment.entity.id,
    business_timezone: connector.timezone,
    user_timezone: parsed.data.timezone,
    start_time: local.start,
    end_time: local.end,
    start_local: local.start_local,
    end_local: local.end_local,
    status: updated.status,
  });
}

async function listUserAppointmentsTool(options: {
  agentId: string;
  args: unknown;
}): Promise<AppointmentToolCallResult> {
  const parsed = listUserAppointmentsArgsSchema.safeParse(options.args ?? {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(
      issue?.message ?? "Invalid list_user_appointments arguments",
    );
  }

  const connector = await assertConfiguredConnector(options.agentId);
  const rows = await listAppointmentsForBookerInConnector({
    connectorId: connector.id,
    bookerEmail: parsed.data.booker_email,
  });

  const appointments = rows.map(({ appointment, entity }) => {
    const item: Record<string, unknown> = {
      appointment_id: appointment.id,
      entity_id: entity.id,
      entity_name: entity.name,
      booker_name: appointment.bookerName,
      booker_email: appointment.bookerEmail,
      status: appointment.status,
      start_time: appointment.startTime.toISOString(),
      end_time: appointment.endTime.toISOString(),
    };
    if (parsed.data.timezone) {
      const local = withLocalTimes(
        appointment.startTime,
        appointment.endTime,
        parsed.data.timezone,
      );
      item.start_local = local.start_local;
      item.end_local = local.end_local;
    }
    return item;
  });

  const result: Record<string, unknown> = {
    ok: true,
    booker_email: parsed.data.booker_email.trim().toLowerCase(),
    business_timezone: connector.timezone,
    count: appointments.length,
    appointments,
  };
  if (parsed.data.timezone) {
    result.user_timezone = parsed.data.timezone;
  }

  return mcpStyleResult(result);
}
