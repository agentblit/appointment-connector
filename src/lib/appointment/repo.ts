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
  appointmentRoles,
  type AppointmentAvailabilityRuleRow,
  type AppointmentConnectorRow,
  type AppointmentEntityRow,
  type AppointmentRoleRow,
  type AppointmentRow,
} from "@/lib/appointment/schema";
import { db } from "@/lib/db/client";

export type AppointmentEntityWithAvailability = AppointmentEntityRow & {
  availabilityRules: AppointmentAvailabilityRuleRow[];
};

export type AppointmentConnectorWithEntities = AppointmentConnectorRow & {
  roles: AppointmentRoleRow[];
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

export async function listRoles(connectorId: string) {
  return db
    .select()
    .from(appointmentRoles)
    .where(eq(appointmentRoles.connectorId, connectorId))
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

async function syncConnectorRoles(options: {
  connectorId: string;
  roles?: Array<{ id?: string; name: string; description?: string }> | null;
}): Promise<AppointmentRoleRow[]> {
  const desired = normalizeRoleInputs(options.roles);
  const existing = await listRoles(options.connectorId);
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
        connectorId: options.connectorId,
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

    // Drop deleted role ids from entity assignments.
    const entities = await listEntities(options.connectorId);
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

  return listRoles(options.connectorId);
}

export async function upsert(options: {
  agentId: string;
  userId: string;
  entityLabel: string;
  timezone: string;
  slotDurationMinutes: number;
  roles?: Array<{ id?: string; name: string; description?: string }> | null;
}): Promise<{
  connector: AppointmentConnectorRow;
  roles: AppointmentRoleRow[];
}> {
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

  const connector = inserted[0];
  const roles = await syncConnectorRoles({
    connectorId: connector.id,
    roles: options.roles,
  });

  return { connector, roles };
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

/** Ensure selected entity role ids belong to the connector's roles. */
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
      error: "No roles are configured; leave roles unset or add roles in settings",
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

export async function createEntity(options: {
  connectorId: string;
  name: string;
  description?: string | null;
  roleIds?: string[] | null;
}) {
  const inserted = await db
    .insert(appointmentEntities)
    .values({
      connectorId: options.connectorId,
      name: options.name.trim(),
      description: options.description?.trim() || null,
      roleIds: normalizeRoleIds(options.roleIds),
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
  roleIds?: string[] | null;
}) {
  const updated = await db
    .update(appointmentEntities)
    .set({
      name: options.name.trim(),
      description: options.description?.trim() || null,
      roleIds: normalizeRoleIds(options.roleIds),
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

  const roles = await listRoles(connector.id);
  const entities = await listEntities(connector.id);
  if (entities.length === 0) {
    return {
      ...connector,
      roles,
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
    roles,
    entities: entities.map((entity) => ({
      ...entity,
      availabilityRules: rulesByEntity.get(entity.id) ?? [],
    })),
  } satisfies AppointmentConnectorWithEntities;
}
