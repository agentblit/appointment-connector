import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  inArray,
  lt,
  lte,
  ne,
} from "drizzle-orm";
import {
  APPOINTMENT_ANONYMOUS_USER_ID,
  APPOINTMENT_BOOKING_PERIOD_DAYS_KINDS,
  APPOINTMENT_BOOKING_PERIOD_TYPES,
  APPOINTMENT_OAUTH_PROVIDER_GOOGLE,
  type AppointmentBookingPeriodDaysKind,
  type AppointmentBookingPeriodType,
} from "@/lib/appointment/constants";
import type {
  BookingPeriodInput,
  DateRuleInput,
  TimeWindowInput,
} from "@/lib/appointment/appointment-utils";
import { UNLIMITED_BOOKING_PERIOD } from "@/lib/appointment/appointment-utils";
import {
  appointmentApiKeys,
  appointmentAppointments,
  appointmentAvailabilityDateRules,
  appointmentAvailabilityDateRuleWindows,
  appointmentAvailabilityRules,
  appointmentEntities,
  appointmentOauthConnections,
  appointmentRoles,
  appointmentWorkspaces,
  type AppointmentAvailabilityRuleRow,
  type AppointmentEntityRow,
  type AppointmentOauthConnectionRow,
  type AppointmentRoleRow,
  type AppointmentRow,
  type AppointmentWorkspaceRow,
} from "@/lib/appointment/schema";
import { hashApiKey } from "@/lib/auth/api-key-auth";
import { db } from "@/lib/db/client";

export type AppointmentEntityWithAvailability = AppointmentEntityRow & {
  availabilityRules: AppointmentAvailabilityRuleRow[];
  dateRules: DateRuleInput[];
};

export function bookingPeriodFromEntity(
  entity: Pick<
    AppointmentEntityRow,
    | "bookingPeriodType"
    | "availableFrom"
    | "availableTo"
    | "bookingPeriodDays"
    | "bookingPeriodDaysKind"
  >,
): BookingPeriodInput {
  const type = APPOINTMENT_BOOKING_PERIOD_TYPES.includes(
    entity.bookingPeriodType as AppointmentBookingPeriodType,
  )
    ? (entity.bookingPeriodType as AppointmentBookingPeriodType)
    : "unlimited";
  const daysKind = APPOINTMENT_BOOKING_PERIOD_DAYS_KINDS.includes(
    entity.bookingPeriodDaysKind as AppointmentBookingPeriodDaysKind,
  )
    ? (entity.bookingPeriodDaysKind as AppointmentBookingPeriodDaysKind)
    : null;

  if (type === "unlimited") {
    return { ...UNLIMITED_BOOKING_PERIOD };
  }
  if (type === "fixed") {
    return {
      type: "fixed",
      availableFrom: entity.availableFrom,
      availableTo: entity.availableTo,
      days: null,
      daysKind: null,
    };
  }
  return {
    type: "moving",
    availableFrom: null,
    availableTo: null,
    days: entity.bookingPeriodDays,
    daysKind: daysKind ?? "calendar",
  };
}

export function serializeBookingPeriod(period: BookingPeriodInput) {
  if (period.type === "fixed") {
    return {
      type: "fixed" as const,
      availableFrom: period.availableFrom ?? null,
      availableTo: period.availableTo ?? null,
      days: null,
      daysKind: null,
    };
  }
  if (period.type === "moving") {
    return {
      type: "moving" as const,
      availableFrom: null,
      availableTo: null,
      days: period.days ?? null,
      daysKind: period.daysKind ?? "calendar",
    };
  }
  return {
    type: "unlimited" as const,
    availableFrom: null,
    availableTo: null,
    days: null,
    daysKind: null,
  };
}

export type AppointmentWorkspaceWithEntities = AppointmentWorkspaceRow & {
  roles: AppointmentRoleRow[];
  entities: AppointmentEntityWithAvailability[];
};

export async function getWorkspaceById(workspaceId: string) {
  const rows = await db
    .select()
    .from(appointmentWorkspaces)
    .where(eq(appointmentWorkspaces.id, workspaceId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getWorkspaceByUserId(userId: string) {
  const rows = await db
    .select()
    .from(appointmentWorkspaces)
    .where(eq(appointmentWorkspaces.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

/** One workspace per user. Creates defaults if missing. */
export async function ensureWorkspaceForUser(options: {
  userId: string;
  timezone?: string;
}): Promise<AppointmentWorkspaceRow> {
  const existing = await getWorkspaceByUserId(options.userId);
  if (existing) return existing;

  const inserted = await db
    .insert(appointmentWorkspaces)
    .values({
      userId: options.userId,
      entityLabel: "Entity",
      timezone: options.timezone?.trim() || "UTC",
      slotDurationMinutes: 30,
      updatedAt: new Date(),
    })
    .returning();
  return inserted[0];
}

export async function updateWorkspace(options: {
  workspaceId: string;
  userId: string;
  entityLabel: string;
  timezone: string;
  slotDurationMinutes: number;
  roles?: Array<{ id?: string; name: string; description?: string }> | null;
}): Promise<{
  workspace: AppointmentWorkspaceRow;
  roles: AppointmentRoleRow[];
} | null> {
  const updated = await db
    .update(appointmentWorkspaces)
    .set({
      entityLabel: options.entityLabel.trim(),
      timezone: options.timezone,
      slotDurationMinutes: options.slotDurationMinutes,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(appointmentWorkspaces.id, options.workspaceId),
        eq(appointmentWorkspaces.userId, options.userId),
      ),
    )
    .returning();
  const workspace = updated[0];
  if (!workspace) return null;

  const roles = await syncWorkspaceRoles({
    workspaceId: workspace.id,
    roles: options.roles,
  });

  return { workspace, roles };
}

export async function listRoles(workspaceId: string) {
  return db
    .select()
    .from(appointmentRoles)
    .where(eq(appointmentRoles.workspaceId, workspaceId))
    .orderBy(asc(appointmentRoles.name));
}

function normalizeRoleInputs(
  roles?: Array<{ id?: string; name: string; description?: string }> | null,
) {
  if (!roles?.length) return [];
  const seen = new Set<string>();
  const normalized: Array<{ id?: string; name: string; description: string }> =
    [];
  for (const role of roles) {
    const name = role.name.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push({
      id: role.id?.trim() || undefined,
      name,
      description: role.description?.trim() ?? "",
    });
  }
  return normalized;
}

async function syncWorkspaceRoles(options: {
  workspaceId: string;
  roles?: Array<{ id?: string; name: string; description?: string }> | null;
}): Promise<AppointmentRoleRow[]> {
  const desired = normalizeRoleInputs(options.roles);
  const existing = await listRoles(options.workspaceId);
  const existingById = new Map(existing.map((role) => [role.id, role]));

  const keptIds = new Set<string>();

  for (const role of desired) {
    if (role.id && existingById.has(role.id)) {
      const current = existingById.get(role.id)!;
      if (
        current.name !== role.name ||
        current.description !== role.description
      ) {
        await db
          .update(appointmentRoles)
          .set({
            name: role.name,
            description: role.description,
            updatedAt: new Date(),
          })
          .where(eq(appointmentRoles.id, role.id));
      }
      keptIds.add(role.id);
      continue;
    }

    const inserted = await db
      .insert(appointmentRoles)
      .values({
        workspaceId: options.workspaceId,
        name: role.name,
        description: role.description,
        updatedAt: new Date(),
      })
      .returning();
    keptIds.add(inserted[0].id);
  }

  const removedIds = existing
    .map((role) => role.id)
    .filter((id) => !keptIds.has(id));

  if (removedIds.length > 0) {
    await db
      .delete(appointmentRoles)
      .where(inArray(appointmentRoles.id, removedIds));

    const entities = await listEntities(options.workspaceId);
    for (const entity of entities) {
      const nextIds = (entity.roleIds ?? []).filter(
        (id) => !removedIds.includes(id),
      );
      if (nextIds.length !== (entity.roleIds ?? []).length) {
        await db
          .update(appointmentEntities)
          .set({ roleIds: nextIds, updatedAt: new Date() })
          .where(eq(appointmentEntities.id, entity.id));
      }
    }
  }

  return listRoles(options.workspaceId);
}

function normalizeRoleIds(roleIds?: string[] | null) {
  if (!roleIds?.length) return [];
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const roleId of roleIds) {
    const value = roleId.trim();
    if (!value) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    normalized.push(value);
  }
  return normalized;
}

/** Ensure selected entity role ids belong to the workspace's roles. */
export function resolveEntityRoleIds(options: {
  availableRoles: Array<{ id: string }> | null | undefined;
  selectedRoleIds?: string[] | null;
}): { ok: true; roleIds: string[] } | { ok: false; error: string } {
  const selected = normalizeRoleIds(options.selectedRoleIds);
  const available = options.availableRoles ?? [];
  const availableIds = new Set(available.map((role) => role.id));

  if (selected.length === 0) {
    return { ok: true, roleIds: [] };
  }

  if (available.length === 0) {
    return {
      ok: false,
      error:
        "No roles are configured; leave roles unset or add roles in settings",
    };
  }

  for (const roleId of selected) {
    if (!availableIds.has(roleId)) {
      return { ok: false, error: `Unknown role id "${roleId}"` };
    }
  }

  return { ok: true, roleIds: selected };
}

export function mapRolesById(roles: AppointmentRoleRow[]) {
  return new Map(roles.map((role) => [role.id, role]));
}

export function resolveRoleSummaries(
  roleIds: string[] | null | undefined,
  rolesById: Map<string, AppointmentRoleRow>,
) {
  return (roleIds ?? [])
    .map((id) => rolesById.get(id))
    .filter((role): role is AppointmentRoleRow => Boolean(role))
    .map((role) => ({
      id: role.id,
      name: role.name,
      description: role.description,
    }));
}

export async function createApiKey(options: {
  workspaceId: string;
  apiKeyPlaintext: string;
  label?: string | null;
}) {
  const inserted = await db
    .insert(appointmentApiKeys)
    .values({
      workspaceId: options.workspaceId,
      apiKeyHash: hashApiKey(options.apiKeyPlaintext),
      label: options.label?.trim() || null,
    })
    .returning();
  return inserted[0];
}

export async function listApiKeys(workspaceId: string) {
  return db
    .select({
      id: appointmentApiKeys.id,
      label: appointmentApiKeys.label,
      createdAt: appointmentApiKeys.createdAt,
    })
    .from(appointmentApiKeys)
    .where(eq(appointmentApiKeys.workspaceId, workspaceId))
    .orderBy(desc(appointmentApiKeys.createdAt));
}

export async function deleteApiKey(options: {
  apiKeyId: string;
  workspaceId: string;
}) {
  const deleted = await db
    .delete(appointmentApiKeys)
    .where(
      and(
        eq(appointmentApiKeys.id, options.apiKeyId),
        eq(appointmentApiKeys.workspaceId, options.workspaceId),
      ),
    )
    .returning({ id: appointmentApiKeys.id });
  return deleted[0] ?? null;
}

export async function listEntities(workspaceId: string) {
  return db
    .select()
    .from(appointmentEntities)
    .where(eq(appointmentEntities.workspaceId, workspaceId))
    .orderBy(asc(appointmentEntities.name));
}

export async function getEntityById(entityId: string) {
  const rows = await db
    .select()
    .from(appointmentEntities)
    .where(eq(appointmentEntities.id, entityId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getEntityForWorkspace(options: {
  workspaceId: string;
  entityId: string;
}) {
  const rows = await db
    .select({
      entity: appointmentEntities,
      workspace: appointmentWorkspaces,
    })
    .from(appointmentEntities)
    .innerJoin(
      appointmentWorkspaces,
      eq(appointmentEntities.workspaceId, appointmentWorkspaces.id),
    )
    .where(
      and(
        eq(appointmentEntities.id, options.entityId),
        eq(appointmentWorkspaces.id, options.workspaceId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function createEntity(options: {
  workspaceId: string;
  name: string;
  description?: string | null;
  roleIds?: string[] | null;
  meetingMode?: string;
  locationAddress?: string | null;
  locationMapsUrl?: string | null;
}) {
  const inserted = await db
    .insert(appointmentEntities)
    .values({
      workspaceId: options.workspaceId,
      name: options.name.trim(),
      description: options.description?.trim() || null,
      roleIds: normalizeRoleIds(options.roleIds),
      meetingMode: options.meetingMode ?? "offline",
      locationAddress: options.locationAddress?.trim() || null,
      locationMapsUrl: options.locationMapsUrl?.trim() || null,
      updatedAt: new Date(),
    })
    .returning();
  return inserted[0];
}

export async function updateEntity(options: {
  entityId: string;
  name: string;
  description?: string | null;
  roleIds?: string[] | null;
  meetingMode?: string;
  locationAddress?: string | null;
  locationMapsUrl?: string | null;
}) {
  const updated = await db
    .update(appointmentEntities)
    .set({
      name: options.name.trim(),
      description: options.description?.trim() || null,
      roleIds: normalizeRoleIds(options.roleIds),
      ...(options.meetingMode !== undefined
        ? { meetingMode: options.meetingMode }
        : {}),
      ...(options.locationAddress !== undefined
        ? { locationAddress: options.locationAddress?.trim() || null }
        : {}),
      ...(options.locationMapsUrl !== undefined
        ? { locationMapsUrl: options.locationMapsUrl?.trim() || null }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(appointmentEntities.id, options.entityId))
    .returning();
  return updated[0] ?? null;
}

export async function deleteEntity(entityId: string) {
  const deleted = await db
    .delete(appointmentEntities)
    .where(eq(appointmentEntities.id, entityId))
    .returning({ id: appointmentEntities.id });
  return deleted[0] ?? null;
}

export async function listAvailabilityRulesForEntity(entityId: string) {
  return db
    .select()
    .from(appointmentAvailabilityRules)
    .where(eq(appointmentAvailabilityRules.entityId, entityId))
    .orderBy(
      asc(appointmentAvailabilityRules.dayOfWeek),
      asc(appointmentAvailabilityRules.startTime),
    );
}

export async function listDateRulesForEntity(
  entityId: string,
): Promise<DateRuleInput[]> {
  const rules = await db
    .select()
    .from(appointmentAvailabilityDateRules)
    .where(eq(appointmentAvailabilityDateRules.entityId, entityId))
    .orderBy(asc(appointmentAvailabilityDateRules.date));
  return assembleDateRules(rules);
}

async function assembleDateRules(
  rules: Array<{ id: string; date: string }>,
): Promise<DateRuleInput[]> {
  if (rules.length === 0) {
    return [];
  }
  const windows = await db
    .select()
    .from(appointmentAvailabilityDateRuleWindows)
    .where(
      inArray(
        appointmentAvailabilityDateRuleWindows.ruleId,
        rules.map((rule) => rule.id),
      ),
    )
    .orderBy(
      asc(appointmentAvailabilityDateRuleWindows.startTime),
      asc(appointmentAvailabilityDateRuleWindows.endTime),
    );

  const windowsByRule = new Map<string, TimeWindowInput[]>();
  for (const window of windows) {
    const existing = windowsByRule.get(window.ruleId) ?? [];
    existing.push({
      startTime: window.startTime,
      endTime: window.endTime,
    });
    windowsByRule.set(window.ruleId, existing);
  }

  return rules.map((rule) => ({
    date: rule.date,
    windows: windowsByRule.get(rule.id) ?? [],
  }));
}

export async function replaceAvailabilityForEntity(options: {
  entityId: string;
  rules: Array<{
    dayOfWeek: number;
    startTime: string;
    endTime: string;
  }>;
  dateRules: DateRuleInput[];
  bookingPeriod: BookingPeriodInput;
}) {
  const period = serializeBookingPeriod(options.bookingPeriod);

  await db.transaction(async (tx) => {
    await tx
      .update(appointmentEntities)
      .set({
        bookingPeriodType: period.type,
        availableFrom: period.availableFrom,
        availableTo: period.availableTo,
        bookingPeriodDays: period.days,
        bookingPeriodDaysKind: period.daysKind,
        updatedAt: new Date(),
      })
      .where(eq(appointmentEntities.id, options.entityId));

    await tx
      .delete(appointmentAvailabilityRules)
      .where(eq(appointmentAvailabilityRules.entityId, options.entityId));

    if (options.rules.length > 0) {
      await tx.insert(appointmentAvailabilityRules).values(
        options.rules.map((rule) => ({
          entityId: options.entityId,
          dayOfWeek: rule.dayOfWeek,
          startTime: rule.startTime,
          endTime: rule.endTime,
        })),
      );
    }

    await tx
      .delete(appointmentAvailabilityDateRules)
      .where(eq(appointmentAvailabilityDateRules.entityId, options.entityId));

    for (const dateRule of options.dateRules) {
      const inserted = await tx
        .insert(appointmentAvailabilityDateRules)
        .values({
          entityId: options.entityId,
          date: dateRule.date,
        })
        .returning({ id: appointmentAvailabilityDateRules.id });
      const ruleId = inserted[0]?.id;
      if (!ruleId || dateRule.windows.length === 0) {
        continue;
      }
      await tx.insert(appointmentAvailabilityDateRuleWindows).values(
        dateRule.windows.map((window) => ({
          ruleId,
          startTime: window.startTime,
          endTime: window.endTime,
        })),
      );
    }
  });

  const [rules, dateRules, entity] = await Promise.all([
    listAvailabilityRulesForEntity(options.entityId),
    listDateRulesForEntity(options.entityId),
    getEntityById(options.entityId),
  ]);

  return {
    rules,
    dateRules,
    bookingPeriod: entity
      ? bookingPeriodFromEntity(entity)
      : serializeBookingPeriod(options.bookingPeriod),
  };
}

export async function listAppointmentsForEntityInRange(options: {
  entityId: string;
  dateFrom: Date;
  dateTo: Date;
}) {
  return db
    .select()
    .from(appointmentAppointments)
    .where(
      and(
        eq(appointmentAppointments.entityId, options.entityId),
        lte(appointmentAppointments.startTime, options.dateTo),
        gte(appointmentAppointments.endTime, options.dateFrom),
      ),
    )
    .orderBy(asc(appointmentAppointments.startTime));
}

export async function listAppointmentsForEntity(
  entityId: string,
  options?: { limit?: number },
) {
  const limit = options?.limit ?? 100;
  return db
    .select()
    .from(appointmentAppointments)
    .where(eq(appointmentAppointments.entityId, entityId))
    .orderBy(desc(appointmentAppointments.startTime))
    .limit(limit);
}

export async function getAppointmentById(appointmentId: string) {
  const rows = await db
    .select()
    .from(appointmentAppointments)
    .where(eq(appointmentAppointments.id, appointmentId))
    .limit(1);
  return rows[0] ?? null;
}

export async function listAppointmentsForBookerInWorkspace(options: {
  workspaceId: string;
  email: string;
}) {
  return db
    .select({
      appointment: appointmentAppointments,
      entity: appointmentEntities,
    })
    .from(appointmentAppointments)
    .innerJoin(
      appointmentEntities,
      eq(appointmentAppointments.entityId, appointmentEntities.id),
    )
    .where(
      and(
        eq(appointmentEntities.workspaceId, options.workspaceId),
        eq(
          appointmentAppointments.email,
          options.email.trim().toLowerCase(),
        ),
      ),
    )
    .orderBy(asc(appointmentAppointments.startTime));
}

export async function getAppointmentForWorkspace(options: {
  workspaceId: string;
  appointmentId: string;
}) {
  const rows = await db
    .select({
      appointment: appointmentAppointments,
      entity: appointmentEntities,
      workspace: appointmentWorkspaces,
    })
    .from(appointmentAppointments)
    .innerJoin(
      appointmentEntities,
      eq(appointmentAppointments.entityId, appointmentEntities.id),
    )
    .innerJoin(
      appointmentWorkspaces,
      eq(appointmentEntities.workspaceId, appointmentWorkspaces.id),
    )
    .where(
      and(
        eq(appointmentAppointments.id, options.appointmentId),
        eq(appointmentWorkspaces.id, options.workspaceId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function hasOverlappingConfirmedAppointment(options: {
  entityId: string;
  startTime: Date;
  endTime: Date;
  excludeAppointmentId?: string;
}) {
  // Half-open intervals [start, end): adjacent slots (e.g. 09:00–09:30 and
  // 09:30–10:00) must not count as overlapping — match generateAvailableSlots.
  const conditions = [
    eq(appointmentAppointments.entityId, options.entityId),
    eq(appointmentAppointments.status, "confirmed"),
    lt(appointmentAppointments.startTime, options.endTime),
    gt(appointmentAppointments.endTime, options.startTime),
  ];

  if (options.excludeAppointmentId) {
    conditions.push(
      ne(appointmentAppointments.id, options.excludeAppointmentId),
    );
  }

  const rows = await db
    .select({ id: appointmentAppointments.id })
    .from(appointmentAppointments)
    .where(and(...conditions))
    .limit(1);
  return Boolean(rows[0]);
}

export async function createAppointmentRecord(options: {
  entityId: string;
  name: string;
  email: string;
  startTime: Date;
  endTime: Date;
  userId?: string;
  meetingUrl?: string | null;
  externalMeetingId?: string | null;
  locationAddress?: string | null;
  locationMapsUrl?: string | null;
}): Promise<AppointmentRow> {
  const inserted = await db
    .insert(appointmentAppointments)
    .values({
      entityId: options.entityId,
      name: options.name.trim(),
      email: options.email.trim().toLowerCase(),
      userId: options.userId ?? APPOINTMENT_ANONYMOUS_USER_ID,
      startTime: options.startTime,
      endTime: options.endTime,
      status: "confirmed",
      meetingUrl: options.meetingUrl?.trim() || null,
      externalMeetingId: options.externalMeetingId?.trim() || null,
      locationAddress: options.locationAddress?.trim() || null,
      locationMapsUrl: options.locationMapsUrl?.trim() || null,
      updatedAt: new Date(),
    })
    .returning();
  return inserted[0];
}

export async function cancelAppointmentRecord(appointmentId: string) {
  const updated = await db
    .update(appointmentAppointments)
    .set({
      status: "cancelled",
      updatedAt: new Date(),
    })
    .where(eq(appointmentAppointments.id, appointmentId))
    .returning();
  return updated[0] ?? null;
}

export async function rescheduleAppointmentRecord(options: {
  appointmentId: string;
  startTime: Date;
  endTime: Date;
}) {
  const updated = await db
    .update(appointmentAppointments)
    .set({
      startTime: options.startTime,
      endTime: options.endTime,
      updatedAt: new Date(),
    })
    .where(eq(appointmentAppointments.id, options.appointmentId))
    .returning();
  return updated[0] ?? null;
}

export async function getWorkspaceWithEntities(workspaceId: string) {
  const workspace = await getWorkspaceById(workspaceId);
  if (!workspace) {
    return null;
  }

  const [entities, roles] = await Promise.all([
    listEntities(workspace.id),
    listRoles(workspace.id),
  ]);

  if (entities.length === 0) {
    return {
      ...workspace,
      roles,
      entities: [],
    } satisfies AppointmentWorkspaceWithEntities;
  }

  const entityIds = entities.map((entity) => entity.id);
  const [rules, dateRuleRows] = await Promise.all([
    db
      .select()
      .from(appointmentAvailabilityRules)
      .where(inArray(appointmentAvailabilityRules.entityId, entityIds))
      .orderBy(
        asc(appointmentAvailabilityRules.entityId),
        asc(appointmentAvailabilityRules.dayOfWeek),
        asc(appointmentAvailabilityRules.startTime),
      ),
    db
      .select()
      .from(appointmentAvailabilityDateRules)
      .where(inArray(appointmentAvailabilityDateRules.entityId, entityIds))
      .orderBy(
        asc(appointmentAvailabilityDateRules.entityId),
        asc(appointmentAvailabilityDateRules.date),
      ),
  ]);

  const rulesByEntity = new Map<string, AppointmentAvailabilityRuleRow[]>();
  for (const rule of rules) {
    const existing = rulesByEntity.get(rule.entityId) ?? [];
    existing.push(rule);
    rulesByEntity.set(rule.entityId, existing);
  }

  const dateRulesByEntity = new Map<string, DateRuleInput[]>();
  if (dateRuleRows.length > 0) {
    const windows = await db
      .select()
      .from(appointmentAvailabilityDateRuleWindows)
      .where(
        inArray(
          appointmentAvailabilityDateRuleWindows.ruleId,
          dateRuleRows.map((rule) => rule.id),
        ),
      )
      .orderBy(
        asc(appointmentAvailabilityDateRuleWindows.startTime),
        asc(appointmentAvailabilityDateRuleWindows.endTime),
      );
    const windowsByRule = new Map<string, TimeWindowInput[]>();
    for (const window of windows) {
      const existing = windowsByRule.get(window.ruleId) ?? [];
      existing.push({
        startTime: window.startTime,
        endTime: window.endTime,
      });
      windowsByRule.set(window.ruleId, existing);
    }
    for (const rule of dateRuleRows) {
      const existing = dateRulesByEntity.get(rule.entityId) ?? [];
      existing.push({
        date: rule.date,
        windows: windowsByRule.get(rule.id) ?? [],
      });
      dateRulesByEntity.set(rule.entityId, existing);
    }
  }

  return {
    ...workspace,
    roles,
    entities: entities.map((entity) => ({
      ...entity,
      availabilityRules: rulesByEntity.get(entity.id) ?? [],
      dateRules: dateRulesByEntity.get(entity.id) ?? [],
    })),
  } satisfies AppointmentWorkspaceWithEntities;
}

export async function getOauthConnectionForEntity(options: {
  entityId: string;
  provider: string;
}): Promise<AppointmentOauthConnectionRow | null> {
  const rows = await db
    .select()
    .from(appointmentOauthConnections)
    .where(
      and(
        eq(appointmentOauthConnections.entityId, options.entityId),
        eq(appointmentOauthConnections.provider, options.provider),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function upsertOauthConnection(options: {
  entityId: string;
  provider: string;
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: Date | null;
  scope?: string | null;
  accountEmail?: string | null;
}) {
  const existing = await getOauthConnectionForEntity({
    entityId: options.entityId,
    provider: options.provider,
  });

  if (existing) {
    const updated = await db
      .update(appointmentOauthConnections)
      .set({
        accessToken: options.accessToken,
        refreshToken: options.refreshToken ?? existing.refreshToken,
        expiresAt: options.expiresAt ?? null,
        scope: options.scope ?? existing.scope,
        accountEmail: options.accountEmail ?? existing.accountEmail,
        updatedAt: new Date(),
      })
      .where(eq(appointmentOauthConnections.id, existing.id))
      .returning();
    return updated[0];
  }

  const inserted = await db
    .insert(appointmentOauthConnections)
    .values({
      entityId: options.entityId,
      provider: options.provider,
      accessToken: options.accessToken,
      refreshToken: options.refreshToken ?? null,
      expiresAt: options.expiresAt ?? null,
      scope: options.scope ?? null,
      accountEmail: options.accountEmail ?? null,
      updatedAt: new Date(),
    })
    .returning();
  return inserted[0];
}

export async function deleteOauthConnectionForEntity(options: {
  entityId: string;
  provider: string;
}) {
  const deleted = await db
    .delete(appointmentOauthConnections)
    .where(
      and(
        eq(appointmentOauthConnections.entityId, options.entityId),
        eq(appointmentOauthConnections.provider, options.provider),
      ),
    )
    .returning({ id: appointmentOauthConnections.id });
  return deleted[0] ?? null;
}

export async function hasGoogleConnectionForEntity(entityId: string) {
  const connection = await getOauthConnectionForEntity({
    entityId,
    provider: APPOINTMENT_OAUTH_PROVIDER_GOOGLE,
  });
  return Boolean(connection);
}

export async function getGoogleIntegrationForEntity(entityId: string) {
  const connection = await getOauthConnectionForEntity({
    entityId,
    provider: APPOINTMENT_OAUTH_PROVIDER_GOOGLE,
  });
  if (!connection) {
    return { connected: false as const };
  }
  return {
    connected: true as const,
    accountEmail: connection.accountEmail,
  };
}
