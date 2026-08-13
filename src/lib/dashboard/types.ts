import type { AvailabilityRule } from "@/components/availability-editor";
import type {
  AppointmentBookingPeriodDaysKind,
  AppointmentBookingPeriodType,
} from "@/lib/appointment/constants";

export type ApiKeyMeta = {
  id: string;
  label: string | null;
  createdAt: string;
};

export type WorkspaceRole = {
  id?: string;
  name: string;
  description: string;
};

export type DateRule = {
  date: string;
  windows: Array<{ startTime: string; endTime: string }>;
};

export type BookingPeriod = {
  type: AppointmentBookingPeriodType;
  availableFrom: string | null;
  availableTo: string | null;
  days: number | null;
  daysKind: AppointmentBookingPeriodDaysKind | null;
};

export const emptyBookingPeriod = (): BookingPeriod => ({
  type: "unlimited",
  availableFrom: null,
  availableTo: null,
  days: null,
  daysKind: null,
});

export type EntityRow = {
  id: string;
  name: string;
  description?: string | null;
  roleIds?: string[] | null;
  meetingMode?: "online" | "offline" | null;
  locationAddress?: string | null;
  locationMapsUrl?: string | null;
  googleConnected?: boolean;
  googleAccountEmail?: string | null;
  availabilityRules: AvailabilityRule[];
  dateRules: DateRule[];
  bookingPeriod: BookingPeriod;
};

export type BookingRow = {
  id: string;
  name: string;
  email: string;
  startTime: string;
  endTime: string;
  startLocal: string;
  endLocal: string;
  status: string;
  meetingUrl?: string | null;
  locationAddress?: string | null;
  locationMapsUrl?: string | null;
};

export const inputClassName =
  "h-10 w-full rounded-lg border border-border bg-muted px-3 text-sm text-foreground outline-none transition-shadow focus:border-ring focus:bg-card focus:ring-2 focus:ring-ring/30";
export const labelClassName = "mb-1.5 block text-sm font-semibold text-foreground";
export const hintClassName = "mt-1 text-xs text-muted-foreground";
export const buttonPrimaryClassName =
  "inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";
export const buttonOutlineClassName =
  "inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50";
export const textareaClassName =
  "min-h-20 w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground outline-none transition-shadow focus:border-ring focus:bg-card focus:ring-2 focus:ring-ring/30";

export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone?.trim() || "UTC";
  } catch {
    return "UTC";
  }
}

export function formatBookingRange(startLocal: string, endLocal: string): string {
  const [startDate, startTime] = startLocal.split(" ");
  const [endDate, endTime] = endLocal.split(" ");
  if (startDate && endDate && startDate === endDate && startTime && endTime) {
    return `${startDate} ${startTime} – ${endTime}`;
  }
  return `${startLocal} – ${endLocal}`;
}

export function formatKeyDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}
