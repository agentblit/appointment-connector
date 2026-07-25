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
  appointmentAppointments,
  appointmentAvailabilityRules,
  appointmentConnectors,
  appointmentEntities,
  type AppointmentAvailabilityRuleRow,
  type AppointmentConnectorRow,
  type AppointmentEntityRow,
  type AppointmentRow,
} from "@/lib/appointment/schema";
import { db } from "@/lib/db/client";

export type AppointmentEntityWithAvailability = AppointmentEntityRow & {
  availabilityRules: AppointmentAvailabilityRuleRow[];
};

export type AppointmentConnectorWithEntities = AppointmentConnectorRow & {
  entities: AppointmentEntityWithAvailability[];
};

export async function getByAgentId(agentId: string) {
  const rows = await db
    .select()
    .from(appointmentConnectors)
    .where(eq(appointmentConnectors.agentId, agentId))
    .limit(1);
  return rows[0] ?? null;
}

export async function listConnectorsByUserId(userId: string) {
  return db
    .select()
    .from(appointmentConnectors)
    .where(eq(appointmentConnectors.userId, userId))
    .orderBy(asc(appointmentConnectors.entityLabel), asc(appointmentConnectors.agentId));
}

export async function upsert(options: {
  agentId: string;
  userId: string;
  entityLabel: string;
  timezone: string;
  slotDurationMinutes: number;
}): Promise<AppointmentConnectorRow> {
  const inserted = await db
    .insert(appointmentConnectors)
    .values({
      agentId: options.agentId,
      userId: options.userId,
      entityLabel: options.entityLabel.trim(),
      timezone: options.timezone,
      slotDurationMinutes: options.slotDurationMinutes,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [appointmentConnectors.agentId],
      set: {
        entityLabel: options.entityLabel.trim(),
        timezone: options.timezone,
        slotDurationMinutes: options.slotDurationMinutes,
        updatedAt: new Date(),
      },
      // Only update when the requesting user actually owns the existing row;
      // a race between two different users hitting the same agentId should
      // be a silent no-op for the losing user rather than a data overwrite.
      where: eq(appointmentConnectors.userId, options.userId),
    })
    .returning();
  return inserted[0];
}

export async function deleteConnectorByAgentId(agentId: string) {
  const deleted = await db
    .delete(appointmentConnectors)
    .where(eq(appointmentConnectors.agentId, agentId))
    .returning({ id: appointmentConnectors.id });
  return deleted[0] ?? null;
}

export async function listEntities(connectorId: string) {
  return db
    .select()
    .from(appointmentEntities)
    .where(eq(appointmentEntities.connectorId, connectorId))
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

export async function getEntityForAgent(options: {
  agentId: string;
  entityId: string;
}) {
  const rows = await db
    .select({
      entity: appointmentEntities,
      connector: appointmentConnectors,
    })
    .from(appointmentEntities)
    .innerJoin(
      appointmentConnectors,
      eq(appointmentEntities.connectorId, appointmentConnectors.id),
    )
    .where(
      and(
        eq(appointmentEntities.id, options.entityId),
        eq(appointmentConnectors.agentId, options.agentId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

function normalizeTags(tags?: string[] | null) {
  if (!tags?.length) return [];
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const tag of tags) {
    const value = tag.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(value);
  }
  return normalized;
}

export async function createEntity(options: {
  connectorId: string;
  name: string;
  description?: string | null;
  tags?: string[] | null;
}) {
  const inserted = await db
    .insert(appointmentEntities)
    .values({
      connectorId: options.connectorId,
      name: options.name.trim(),
      description: options.description?.trim() || null,
      tags: normalizeTags(options.tags),
      isActive: true,
      updatedAt: new Date(),
    })
    .returning();
  return inserted[0];
}

export async function updateEntity(options: {
  entityId: string;
  name: string;
  description?: string | null;
  tags?: string[] | null;
}) {
  const updated = await db
    .update(appointmentEntities)
    .set({
      name: options.name.trim(),
      description: options.description?.trim() || null,
      tags: normalizeTags(options.tags),
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

export async function listAppointmentsForBookerInConnector(options: {
  connectorId: string;
  bookerEmail: string;
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
        eq(appointmentEntities.connectorId, options.connectorId),
        eq(
          appointmentAppointments.bookerEmail,
          options.bookerEmail.trim().toLowerCase(),
        ),
      ),
    )
    .orderBy(asc(appointmentAppointments.startTime));
}

export async function getAppointmentForAgent(options: {
  agentId: string;
  appointmentId: string;
}) {
  const rows = await db
    .select({
      appointment: appointmentAppointments,
      entity: appointmentEntities,
      connector: appointmentConnectors,
    })
    .from(appointmentAppointments)
    .innerJoin(
      appointmentEntities,
      eq(appointmentAppointments.entityId, appointmentEntities.id),
    )
    .innerJoin(
      appointmentConnectors,
      eq(appointmentEntities.connectorId, appointmentConnectors.id),
    )
    .where(
      and(
        eq(appointmentAppointments.id, options.appointmentId),
        eq(appointmentConnectors.agentId, options.agentId),
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
  bookerName: string;
  bookerEmail: string;
  startTime: Date;
  endTime: Date;
  bookerUserId?: string;
}): Promise<AppointmentRow> {
  const inserted = await db
    .insert(appointmentAppointments)
    .values({
      entityId: options.entityId,
      bookerName: options.bookerName.trim(),
      bookerEmail: options.bookerEmail.trim().toLowerCase(),
      bookerUserId: options.bookerUserId ?? APPOINTMENT_ANONYMOUS_USER_ID,
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

export async function getConnectorWithEntities(agentId: string) {
  const connector = await getByAgentId(agentId);
  if (!connector) {
    return null;
  }

  const entities = await listEntities(connector.id);
  if (entities.length === 0) {
    return {
      ...connector,
      entities: [],
    } satisfies AppointmentConnectorWithEntities;
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
    ...connector,
    entities: entities.map((entity) => ({
      ...entity,
      availabilityRules: rulesByEntity.get(entity.id) ?? [],
    })),
  } satisfies AppointmentConnectorWithEntities;
}
