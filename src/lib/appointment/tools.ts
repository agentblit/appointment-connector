import { z } from "zod";
import { APPOINTMENT_SLOT_DURATION_MINUTES } from "@/lib/appointment/constants";
import {
  isValidIanaTimezone,
  isValidIsoDate,
} from "@/lib/appointment/appointment-utils";

/** Matches agentblit `ToolPermissionMode` wire values. */
export enum ToolPermissionMode {
  AlwaysAllow = "always_allow",
  NeedsApproval = "needs_approval",
  Blocked = "blocked",
}

export type ToolUiMeta = {
  resourceUri: string;
  visibility?: Array<"model" | "app">;
};

export type Tool = {
  name: string;
  description: string;
  parameters: object;
  permissionMode: ToolPermissionMode;
  ui?: ToolUiMeta;
};

const ask = ToolPermissionMode.NeedsApproval;
const allow = ToolPermissionMode.AlwaysAllow;

export const APPOINTMENT_TOOL_KEY = "appointment";

export const UI_CHECK_SLOTS = "ui://appointment/check-slots";
export const UI_APPOINTMENTS = "ui://appointment/appointments";
export const MCP_APP_MIME_TYPE = "text/html;profile=mcp-app";

const isoDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

const isoDateTimeSchema = z
  .string()
  .trim()
  .datetime({ offset: true, message: "Date-time must be ISO 8601 with offset" });

const userTimezoneSchema = z
  .string()
  .trim()
  .min(1, "timezone is required")
  .refine(isValidIanaTimezone, "timezone must be a valid IANA timezone");

export const checkAvailableSlotsArgsSchema = z.object({
  entity_id: z.string().uuid("entity_id must be a valid UUID"),
  date_from: isoDateSchema,
  date_to: isoDateSchema,
  timezone: userTimezoneSchema,
});

export const bookAppointmentArgsSchema = z.object({
  entity_id: z.string().uuid("entity_id must be a valid UUID"),
  slot_start: isoDateTimeSchema,
  slot_end: isoDateTimeSchema,
  name: z.string().trim().min(1, "name is required"),
  email: z.string().trim().email("email must be a valid email"),
  timezone: userTimezoneSchema,
});

export const cancelAppointmentArgsSchema = z.object({
  appointment_id: z.string().uuid("appointment_id must be a valid UUID"),
  timezone: userTimezoneSchema.optional(),
});

export const rescheduleAppointmentArgsSchema = z.object({
  appointment_id: z.string().uuid("appointment_id must be a valid UUID"),
  new_slot_start: isoDateTimeSchema,
  new_slot_end: isoDateTimeSchema,
  timezone: userTimezoneSchema,
});

export const listUserAppointmentsArgsSchema = z.object({
  email: z.string().trim().email("email must be a valid email"),
  timezone: userTimezoneSchema.optional(),
});

export const appointmentRoleSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Role name is required").max(100),
  description: z.string().trim().max(500).optional().default(""),
});

export const appointmentWorkspaceConfigSchema = z.object({
  entityLabel: z.string().trim().min(1, "Entity label is required").max(100),
  timezone: z
    .string()
    .trim()
    .min(1, "Timezone is required")
    .refine(isValidIanaTimezone, "Timezone must be a valid IANA timezone"),
  slotDurationMinutes: z
    .number()
    .int()
    .refine(
      (value) =>
        APPOINTMENT_SLOT_DURATION_MINUTES.includes(
          value as (typeof APPOINTMENT_SLOT_DURATION_MINUTES)[number],
        ),
      "Invalid slot duration",
    ),
  roles: z.array(appointmentRoleSchema).max(50).optional().default([]),
});

export const appointmentEntitySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(255),
  description: z.string().trim().max(2000).optional(),
  /** Selected role ids from workspace roles. */
  roleIds: z.array(z.string().uuid()).max(20).optional().default([]),
  meetingMode: z.enum(["online", "offline"]).default("offline"),
  locationAddress: z.string().trim().max(2000).optional(),
  locationMapsUrl: z
    .union([z.string().trim().url("Maps URL must be a valid URL"), z.literal("")])
    .optional(),
});

export const appointmentEntityMeetingSchema = z
  .object({
    meetingMode: z.enum(["online", "offline"]),
    locationAddress: z.string().trim().max(2000).optional(),
    locationMapsUrl: z
      .union([z.string().trim().url("Maps URL must be a valid URL"), z.literal("")])
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.meetingMode === "offline") {
      const hasAddress = Boolean(data.locationAddress?.trim());
      const hasMaps = Boolean(data.locationMapsUrl?.trim());
      if (!hasAddress && !hasMaps) {
        ctx.addIssue({
          code: "custom",
          message:
            "Offline entities require an address and/or Google Maps URL",
          path: ["locationAddress"],
        });
      }
    }
  });

const hhmmSchema = z
  .string()
  .trim()
  .regex(/^\d{2}:\d{2}$/, "Time must be HH:MM");

const calendarDateSchema = isoDateSchema.refine(
  isValidIsoDate,
  "Date must be a valid calendar day (YYYY-MM-DD)",
);

const timeWindowSchema = z.object({
  startTime: hhmmSchema,
  endTime: hhmmSchema,
});

export const appointmentBookingPeriodSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("unlimited"),
    availableFrom: z.null().optional(),
    availableTo: z.null().optional(),
    days: z.null().optional(),
    daysKind: z.null().optional(),
  }),
  z.object({
    type: z.literal("fixed"),
    availableFrom: calendarDateSchema,
    availableTo: calendarDateSchema,
    days: z.null().optional(),
    daysKind: z.null().optional(),
  }),
  z.object({
    type: z.literal("moving"),
    days: z.number().int().min(1).max(730),
    daysKind: z.enum(["calendar", "weekdays"]).default("calendar"),
    availableFrom: z.null().optional(),
    availableTo: z.null().optional(),
  }),
]);

export const appointmentAvailabilityRulesSchema = z.object({
  rules: z.array(
    z.object({
      dayOfWeek: z.number().int().min(0).max(6),
      startTime: hhmmSchema,
      endTime: hhmmSchema,
    }),
  ),
  // Required (no defaults): omitting these would wipe exceptions / reset the
  // booking window when replaceAvailabilityForEntity persists the full payload.
  dateRules: z.array(
    z.object({
      date: calendarDateSchema,
      windows: z.array(timeWindowSchema).default([]),
    }),
  ),
  bookingPeriod: appointmentBookingPeriodSchema,
});

const timezoneProperty = {
  type: "string",
  description:
    "IANA timezone of the chat user (e.g. America/New_York). Dates and local times are interpreted/displayed in this timezone.",
};

export const APPOINTMENT_TOOLS: Tool[] = [
  {
    name: "list_entities",
    description:
      "List all bookable entities (providers) for this agent, including IDs, names, descriptions, roles, and optional role assignments. ALWAYS call this first when the user asks who/what to see, which provider fits a need, or wants a recommendation. Suggest matching entities in chat and wait for the user to choose one before calling check_available_slots or book_appointment.",
    parameters: {
      type: "object",
      properties: {},
    },
    permissionMode: allow,
  },
  {
    name: "check_available_slots",
    description:
      "Show available appointment times for one specific entity the user already chose. Only call after list_entities (or a clear prior choice) and the user has confirmed which entity to book—do not jump straight here for 'who should I see?' questions. Pass the chat user's IANA timezone so date_from/date_to and returned local times match that user. If the result has an empty slots array, tell the user clearly that nothing is available in that range (do not imply they can pick a time).",
    parameters: {
      type: "object",
      properties: {
        entity_id: {
          type: "string",
          description: "UUID of the entity to check (from list_entities)",
        },
        date_from: {
          type: "string",
          description:
            "Start date (YYYY-MM-DD) in the chat user's timezone",
        },
        date_to: {
          type: "string",
          description: "End date (YYYY-MM-DD) in the chat user's timezone",
        },
        timezone: timezoneProperty,
      },
      required: ["entity_id", "date_from", "date_to", "timezone"],
    },
    permissionMode: allow,
    ui: { resourceUri: UI_CHECK_SLOTS },
  },
  {
    name: "book_appointment",
    description:
      "Book an appointment slot for a configured entity using the booker's name and email. Prefer a slot the user picked from check_available_slots. Use ISO-8601 times with offset. Pass the chat user's timezone for local confirmation times. The result includes meeting details: for online bookings meeting_url (Google Meet link); for offline bookings location_address and/or location_maps_url. ALWAYS include those meeting details in your confirmation to the user.",
    parameters: {
      type: "object",
      properties: {
        entity_id: {
          type: "string",
          description: "UUID of the entity to book",
        },
        slot_start: {
          type: "string",
          description:
            "Slot start as ISO 8601 with offset (UTC or local offset)",
        },
        slot_end: {
          type: "string",
          description: "Slot end as ISO 8601 with offset (UTC or local offset)",
        },
        name: {
          type: "string",
          description: "Name of the person booking the appointment",
        },
        email: {
          type: "string",
          description: "Email of the person booking the appointment",
        },
        timezone: timezoneProperty,
      },
      required: [
        "entity_id",
        "slot_start",
        "slot_end",
        "name",
        "email",
        "timezone",
      ],
    },
    permissionMode: ask,
  },
  {
    name: "cancel_appointment",
    description: "Cancel an existing confirmed appointment.",
    parameters: {
      type: "object",
      properties: {
        appointment_id: {
          type: "string",
          description: "UUID of the appointment to cancel",
        },
        timezone: {
          ...timezoneProperty,
          description: `${timezoneProperty.description} Optional; used for local time fields in the response.`,
        },
      },
      required: ["appointment_id"],
    },
    permissionMode: ask,
  },
  {
    name: "reschedule_appointment",
    description:
      "Reschedule an existing confirmed appointment to a new slot. Use ISO-8601 times with offset from check_available_slots.",
    parameters: {
      type: "object",
      properties: {
        appointment_id: {
          type: "string",
          description: "UUID of the appointment to reschedule",
        },
        new_slot_start: {
          type: "string",
          description: "New slot start as ISO 8601 with offset",
        },
        new_slot_end: {
          type: "string",
          description: "New slot end as ISO 8601 with offset",
        },
        timezone: timezoneProperty,
      },
      required: [
        "appointment_id",
        "new_slot_start",
        "new_slot_end",
        "timezone",
      ],
    },
    permissionMode: ask,
  },
  {
    name: "list_user_appointments",
    description:
      "List all appointments booked by a user (matched by email) for this agent, including confirmed and cancelled ones.",
    parameters: {
      type: "object",
      properties: {
        email: {
          type: "string",
          description: "Email of the person whose appointments to list",
        },
        timezone: {
          ...timezoneProperty,
          description: `${timezoneProperty.description} Optional; used for local time fields in the response.`,
        },
      },
      required: ["email"],
    },
    permissionMode: allow,
    ui: { resourceUri: UI_APPOINTMENTS },
  },
];

/** OpenAI tools/list shape including `permission_mode` and MCP Apps `_meta.ui`. */
export function toOpenAiToolsList() {
  return {
    tools: APPOINTMENT_TOOLS.map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
      permission_mode: tool.permissionMode,
      ...(tool.ui
        ? {
            _meta: {
              ui: {
                resourceUri: tool.ui.resourceUri,
                ...(tool.ui.visibility
                  ? { visibility: tool.ui.visibility }
                  : {}),
              },
            },
          }
        : {}),
    })),
  };
}
