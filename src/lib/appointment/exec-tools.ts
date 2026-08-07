import {
  cancelAppointmentRecord,
  createAppointmentRecord,
  getAppointmentForWorkspace,
  getEntityForWorkspace,
  getWorkspaceById,
  hasOverlappingConfirmedAppointment,
  listAppointmentsForBookerInWorkspace,
  listAppointmentsForEntityInRange,
  listAvailabilityRulesForEntity,
  listEntities,
  rescheduleAppointmentRecord,
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

async function assertConfiguredWorkspace(workspaceId: string) {
  const workspace = await getWorkspaceById(workspaceId);
  if (!workspace) {
    throw new Error("Appointment workspace is not configured");
  }
  return workspace;
}

export async function executeAppointmentTool(options: {
  workspaceId: string;
  toolName: string;
  args: unknown;
}): Promise<AppointmentToolCallResult> {
  const { workspaceId, toolName, args } = options;

  switch (toolName) {
    case "list_entities":
      return listEntitiesTool(workspaceId);
    case "check_available_slots":
      return checkAvailableSlotsTool({ workspaceId, args });
    case "book_appointment":
      return bookAppointmentTool({ workspaceId, args });
    case "cancel_appointment":
      return cancelAppointmentTool({ workspaceId, args });
    case "reschedule_appointment":
      return rescheduleAppointmentTool({ workspaceId, args });
    case "list_user_appointments":
      return listUserAppointmentsTool({ workspaceId, args });
    default:
      throw new Error(`Unknown Appointment tool: ${toolName}`);
  }
}

async function listEntitiesTool(
  workspaceId: string,
): Promise<AppointmentToolCallResult> {
  const workspace = await assertConfiguredWorkspace(workspaceId);
  const entities = await listEntities(workspace.id);

  return mcpStyleResult({
    ok: true,
    entity_label: workspace.entityLabel,
    business_timezone: workspace.timezone,
    entities: entities.map((entity) => ({
      id: entity.id,
      name: entity.name,
      description: entity.description,
    })),
  });
}

async function checkAvailableSlotsTool(options: {
  workspaceId: string;
  args: unknown;
}): Promise<AppointmentToolCallResult> {
  const parsed = checkAvailableSlotsArgsSchema.safeParse(options.args ?? {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(issue?.message ?? "Invalid check_available_slots arguments");
  }

  const workspace = await assertConfiguredWorkspace(options.workspaceId);
  const owned = await getEntityForWorkspace({
    workspaceId: options.workspaceId,
    entityId: parsed.data.entity_id,
  });
  if (!owned) {
    throw new Error("Entity not found for this workspace");
  }

  if (parsed.data.date_from > parsed.data.date_to) {
    throw new Error("date_from must be on or before date_to");
  }

  const userTimezone = parsed.data.timezone;
  const businessTimezone = workspace.timezone;
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

  const rules = await listAvailabilityRulesForEntity(owned.entity.id);
  const appointments = await listAppointmentsForEntityInRange({
    entityId: owned.entity.id,
    dateFrom: utcFrom,
    dateTo: new Date(utcToExclusive.getTime() - 1),
  });

  const generated = generateAvailableSlots({
    rules,
    existingAppointments: appointments,
    dateFrom: businessDateFrom,
    dateTo: businessDateTo,
    slotDurationMinutes: workspace.slotDurationMinutes,
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
    entity_id: owned.entity.id,
    entity_name: owned.entity.name,
    entity_label: workspace.entityLabel,
    business_timezone: businessTimezone,
    user_timezone: userTimezone,
    slot_duration_minutes: workspace.slotDurationMinutes,
    slots,
  });
}

async function bookAppointmentTool(options: {
  workspaceId: string;
  args: unknown;
}): Promise<AppointmentToolCallResult> {
  const parsed = bookAppointmentArgsSchema.safeParse(options.args ?? {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(issue?.message ?? "Invalid book_appointment arguments");
  }

  const workspace = await assertConfiguredWorkspace(options.workspaceId);
  const owned = await getEntityForWorkspace({
    workspaceId: options.workspaceId,
    entityId: parsed.data.entity_id,
  });
  if (!owned) {
    throw new Error("Entity not found for this workspace");
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
  if (durationMinutes !== workspace.slotDurationMinutes) {
    throw new Error(
      `Slot duration must be ${workspace.slotDurationMinutes} minutes`,
    );
  }

  const rules = await listAvailabilityRulesForEntity(owned.entity.id);
  if (
    !isSlotWithinAvailability({
      rules,
      slotStart,
      slotEnd,
      timezone: workspace.timezone,
    })
  ) {
    throw new Error("Requested slot is outside configured availability");
  }

  const hasConflict = await hasOverlappingConfirmedAppointment({
    entityId: owned.entity.id,
    startTime: slotStart,
    endTime: slotEnd,
  });
  if (hasConflict) {
    throw new Error("Requested slot is no longer available");
  }

  const appointment = await createAppointmentRecord({
    entityId: owned.entity.id,
    name: parsed.data.name,
    email: parsed.data.email,
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
    entity_id: owned.entity.id,
    entity_name: owned.entity.name,
    business_timezone: workspace.timezone,
    user_timezone: parsed.data.timezone,
    start_time: local.start,
    end_time: local.end,
    start_local: local.start_local,
    end_local: local.end_local,
    name: appointment.name,
    email: appointment.email,
    status: appointment.status,
  });
}

async function cancelAppointmentTool(options: {
  workspaceId: string;
  args: unknown;
}): Promise<AppointmentToolCallResult> {
  const parsed = cancelAppointmentArgsSchema.safeParse(options.args ?? {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(issue?.message ?? "Invalid cancel_appointment arguments");
  }

  const appointment = await getAppointmentForWorkspace({
    workspaceId: options.workspaceId,
    appointmentId: parsed.data.appointment_id,
  });
  if (!appointment) {
    throw new Error("Appointment not found for this workspace");
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
    business_timezone: appointment.workspace.timezone,
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
  workspaceId: string;
  args: unknown;
}): Promise<AppointmentToolCallResult> {
  const parsed = rescheduleAppointmentArgsSchema.safeParse(options.args ?? {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(
      issue?.message ?? "Invalid reschedule_appointment arguments",
    );
  }

  const appointment = await getAppointmentForWorkspace({
    workspaceId: options.workspaceId,
    appointmentId: parsed.data.appointment_id,
  });
  if (!appointment) {
    throw new Error("Appointment not found for this workspace");
  }
  if (appointment.appointment.status !== "confirmed") {
    throw new Error("Only confirmed appointments can be rescheduled");
  }

  const workspace = appointment.workspace;
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
  if (durationMinutes !== workspace.slotDurationMinutes) {
    throw new Error(
      `Slot duration must be ${workspace.slotDurationMinutes} minutes`,
    );
  }

  const rules = await listAvailabilityRulesForEntity(appointment.entity.id);
  if (
    !isSlotWithinAvailability({
      rules,
      slotStart,
      slotEnd,
      timezone: workspace.timezone,
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
    business_timezone: workspace.timezone,
    user_timezone: parsed.data.timezone,
    start_time: local.start,
    end_time: local.end,
    start_local: local.start_local,
    end_local: local.end_local,
    status: updated.status,
  });
}

async function listUserAppointmentsTool(options: {
  workspaceId: string;
  args: unknown;
}): Promise<AppointmentToolCallResult> {
  const parsed = listUserAppointmentsArgsSchema.safeParse(options.args ?? {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(
      issue?.message ?? "Invalid list_user_appointments arguments",
    );
  }

  const workspace = await assertConfiguredWorkspace(options.workspaceId);
  const rows = await listAppointmentsForBookerInWorkspace({
    workspaceId: workspace.id,
    email: parsed.data.email,
  });

  const appointments = rows.map(({ appointment, entity }) => {
    const item: Record<string, unknown> = {
      appointment_id: appointment.id,
      entity_id: entity.id,
      entity_name: entity.name,
      name: appointment.name,
      email: appointment.email,
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
    email: parsed.data.email.trim().toLowerCase(),
    business_timezone: workspace.timezone,
    count: appointments.length,
    appointments,
  };
  if (parsed.data.timezone) {
    result.user_timezone = parsed.data.timezone;
  }

  return mcpStyleResult(result);
}
