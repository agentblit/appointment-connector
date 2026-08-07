import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  lte,
  ne,
} from "drizzle-orm";
import { APPOINTMENT_ANONYMOUS_USER_ID } from "@/lib/appointment/constants";
import {
  appointmentApiKeys,
  appointmentAppointments,
  appointmentAvailabilityRules,
  appointmentEntities,
  appointmentWorkspaces,
  type AppointmentAvailabilityRuleRow,
  type AppointmentEntityRow,
  type AppointmentRow,
  type AppointmentWorkspaceRow,
} from "@/lib/appointment/schema";
import { hashApiKey } from "@/lib/auth/api-key-auth";
import { db } from "@/lib/db/client";

export type AppointmentEntityWithAvailability = AppointmentEntityRow & {
  availabilityRules: AppointmentAvailabilityRuleRow[];
};

export type AppointmentWorkspaceWithEntities = AppointmentWorkspaceRow & {
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
}): Promise<AppointmentWorkspaceRow | null> {
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
  return updated[0] ?? null;
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
}) {
  const inserted = await db
    .insert(appointmentEntities)
    .values({
      workspaceId: options.workspaceId,
      name: options.name.trim(),
      description: options.description?.trim() || null,
      updatedAt: new Date(),
    })
    .returning();
  return inserted[0];
}

export async function updateEntity(options: {
  entityId: string;
  name: string;
  description?: string | null;
}) {
  const updated = await db
    .update(appointmentEntities)
    .set({
      name: options.name.trim(),
      description: options.description?.trim() || null,
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

export async function replaceAvailabilityRulesForEntity(options: {
  entityId: string;
  rules: Array<{
    dayOfWeek: number;
    startTime: string;
    endTime: string;
  }>;
}) {
  await db.transaction(async (tx) => {
    await tx
      .delete(appointmentAvailabilityRules)
      .where(eq(appointmentAvailabilityRules.entityId, options.entityId));

    if (options.rules.length === 0) {
      return;
    }

    await tx.insert(appointmentAvailabilityRules).values(
      options.rules.map((rule) => ({
        entityId: options.entityId,
        dayOfWeek: rule.dayOfWeek,
        startTime: rule.startTime,
        endTime: rule.endTime,
      })),
    );
  });

  return listAvailabilityRulesForEntity(options.entityId);
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
  const conditions = [
    eq(appointmentAppointments.entityId, options.entityId),
    eq(appointmentAppointments.status, "confirmed"),
    lte(appointmentAppointments.startTime, options.endTime),
    gte(appointmentAppointments.endTime, options.startTime),
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

  const entities = await listEntities(workspace.id);
  if (entities.length === 0) {
    return {
      ...workspace,
      entities: [],
    } satisfies AppointmentWorkspaceWithEntities;
  }

  const entityIds = entities.map((entity) => entity.id);
  const rules = await db
    .select()
    .from(appointmentAvailabilityRules)
    .where(inArray(appointmentAvailabilityRules.entityId, entityIds))
    .orderBy(
      asc(appointmentAvailabilityRules.entityId),
      asc(appointmentAvailabilityRules.dayOfWeek),
      asc(appointmentAvailabilityRules.startTime),
    );

  const rulesByEntity = new Map<string, AppointmentAvailabilityRuleRow[]>();
  for (const rule of rules) {
    const existing = rulesByEntity.get(rule.entityId) ?? [];
    existing.push(rule);
    rulesByEntity.set(rule.entityId, existing);
  }

  return {
    ...workspace,
    entities: entities.map((entity) => ({
      ...entity,
      availabilityRules: rulesByEntity.get(entity.id) ?? [],
    })),
  } satisfies AppointmentWorkspaceWithEntities;
}
