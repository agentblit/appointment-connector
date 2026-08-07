import {
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

/** One workspace per user: shared settings for all bookable entities. */
export const appointmentWorkspaces = appointmentSchema.table(
  "workspaces",
  {
    id: uuid("id").defaultRandom().primaryKey(),
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
    uniqueIndex("appointment_workspaces_user_id_uidx").on(t.userId),
  ],
);

export const appointmentApiKeys = appointmentSchema.table(
  "api_keys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => appointmentWorkspaces.id, { onDelete: "cascade" }),
    apiKeyHash: varchar("api_key_hash", { length: 128 }).notNull().unique(),
    label: varchar("label", { length: 100 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("appointment_api_keys_workspace_id_idx").on(t.workspaceId),
  ],
);

export const appointmentEntities = appointmentSchema.table(
  "entities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => appointmentWorkspaces.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("appointment_entities_workspace_name_uidx").on(
      t.workspaceId,
      t.name,
    ),
    index("appointment_entities_workspace_id_idx").on(t.workspaceId),
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

export type AppointmentWorkspaceRow = typeof appointmentWorkspaces.$inferSelect;
export type AppointmentApiKeyRow = typeof appointmentApiKeys.$inferSelect;
export type AppointmentEntityRow = typeof appointmentEntities.$inferSelect;
export type AppointmentAvailabilityRuleRow =
  typeof appointmentAvailabilityRules.$inferSelect;
export type AppointmentRow = typeof appointmentAppointments.$inferSelect;
