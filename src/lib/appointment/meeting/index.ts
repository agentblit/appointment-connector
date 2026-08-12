import {
  APPOINTMENT_MEETING_MODES,
  type AppointmentMeetingMode,
} from "@/lib/appointment/constants";
import type { AppointmentEntityRow, AppointmentRow } from "@/lib/appointment/schema";
import {
  createGoogleMeetForBooking,
  deleteGoogleMeetForBooking,
  updateGoogleMeetForBooking,
} from "@/lib/appointment/meeting/google";

export function isMeetingMode(value: string): value is AppointmentMeetingMode {
  return APPOINTMENT_MEETING_MODES.includes(value as AppointmentMeetingMode);
}

export function appointmentMeetingDetails(appointment: AppointmentRow) {
  if (appointment.meetingUrl) {
    return {
      meeting_url: appointment.meetingUrl,
    };
  }
  return {
    location_address: appointment.locationAddress ?? null,
    location_maps_url: appointment.locationMapsUrl ?? null,
  };
}

export function entityMeetingSummary(entity: AppointmentEntityRow) {
  const summary: Record<string, unknown> = {
    meeting_mode: entity.meetingMode,
  };
  if (entity.meetingMode === "offline") {
    summary.location_address = entity.locationAddress ?? null;
    summary.location_maps_url = entity.locationMapsUrl ?? null;
  }
  return summary;
}

export async function createMeetingForBooking(options: {
  entity: AppointmentEntityRow;
  bookerName: string;
  bookerEmail: string;
  startTime: Date;
  endTime: Date;
  timezone: string;
}) {
  if (options.entity.meetingMode !== "online") {
    return {
      meetingUrl: null,
      externalMeetingId: null,
      locationAddress: options.entity.locationAddress?.trim() || null,
      locationMapsUrl: options.entity.locationMapsUrl?.trim() || null,
    };
  }

  const meet = await createGoogleMeetForBooking({
    entityId: options.entity.id,
    entityName: options.entity.name,
    bookerName: options.bookerName,
    bookerEmail: options.bookerEmail,
    startTime: options.startTime,
    endTime: options.endTime,
    timezone: options.timezone,
  });

  return {
    meetingUrl: meet.meetingUrl,
    externalMeetingId: meet.externalMeetingId,
    locationAddress: null,
    locationMapsUrl: null,
  };
}

export async function updateMeetingForBooking(options: {
  entity: AppointmentEntityRow;
  appointment: AppointmentRow;
  startTime: Date;
  endTime: Date;
  timezone: string;
}) {
  if (
    options.entity.meetingMode !== "online" ||
    !options.appointment.externalMeetingId
  ) {
    return;
  }

  await updateGoogleMeetForBooking({
    entityId: options.entity.id,
    externalMeetingId: options.appointment.externalMeetingId,
    startTime: options.startTime,
    endTime: options.endTime,
    timezone: options.timezone,
  });
}

export async function deleteMeetingForBooking(options: {
  entity: AppointmentEntityRow;
  appointment: AppointmentRow;
}) {
  if (
    options.entity.meetingMode !== "online" ||
    !options.appointment.externalMeetingId
  ) {
    return;
  }

  try {
    await deleteGoogleMeetForBooking({
      entityId: options.entity.id,
      externalMeetingId: options.appointment.externalMeetingId,
    });
  } catch {
    // Best-effort cleanup.
  }
}
