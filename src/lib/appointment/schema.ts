import {
  boolean,
  index,
  integer,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const appointmentSchema = pgSchema("appointment");

export const appointmentConnectors = appointmentSchema.table(
  "connectors",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: varchar("agent_id", { length: 10 }).notNull().unique(),
    userId: varchar("user_id", { length: 255 }).notNull(),
    entityLabel: varchar("entity_label", { length: 100 }).notNull(),
    timezone: varchar("timezone", { length: 64 }).notNull(),
    slotDurationMinutes: integer("slot_duration_minutes").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("appointment_connectors_agent_id_idx").on(t.agentId),
    index("appointment_connectors_user_id_idx").on(t.userId),
  ],
);

export const appointmentRoles = appointmentSchema.table(
  "roles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    connectorId: uuid("connector_id")
      .notNull()
      .references(() => appointmentConnectors.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    description: text("description").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("appointment_roles_connector_name_uidx").on(
      t.connectorId,
      t.name,
    ),
    index("appointment_roles_connector_id_idx").on(t.connectorId),
  ],
);

export const appointmentEntities = appointmentSchema.table(
  "entities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    connectorId: uuid("connector_id")
      .notNull()
      .references(() => appointmentConnectors.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    roleIds: uuid("role_ids").array().notNull().default([]),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("appointment_entities_connector_name_uidx").on(
      t.connectorId,
      t.name,
    ),
    index("appointment_entities_connector_id_idx").on(t.connectorId),
  ],
);

export const appointmentAvailabilityRules = appointmentSchema.table(
  "availability_rules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => appointmentEntities.id, { onDelete: "cascade" }),
    dayOfWeek: integer("day_of_week").notNull(),
    startTime: varchar("start_time", { length: 5 }).notNull(),
    endTime: varchar("end_time", { length: 5 }).notNull(),
  },
  (t) => [index("appointment_availability_entity_id_idx").on(t.entityId)],
);

export const appointmentAppointments = appointmentSchema.table(
  "appointments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => appointmentEntities.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    userId: varchar("user_id", { length: 64 })
      .notNull()
      .default("anonymous"),
    startTime: timestamp("start_time", { withTimezone: true }).notNull(),
    endTime: timestamp("end_time", { withTimezone: true }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("confirmed"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("appointment_appointments_entity_start_idx").on(
      t.entityId,
      t.startTime,
    ),
  ],
);

export type AppointmentConnectorRow = typeof appointmentConnectors.$inferSelect;
export type AppointmentRoleRow = typeof appointmentRoles.$inferSelect;
export type AppointmentEntityRow = typeof appointmentEntities.$inferSelect;
export type AppointmentAvailabilityRuleRow =
  typeof appointmentAvailabilityRules.$inferSelect;
export type AppointmentRow = typeof appointmentAppointments.$inferSelect;
