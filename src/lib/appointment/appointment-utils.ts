import type {
  AppointmentBookingPeriodDaysKind,
  AppointmentBookingPeriodType,
} from "@/lib/appointment/constants";
import type { AppointmentAvailabilityRuleRow } from "@/lib/appointment/schema";

export type AvailabilityRuleInput = Pick<
  AppointmentAvailabilityRuleRow,
  "dayOfWeek" | "startTime" | "endTime"
>;

export type TimeWindowInput = {
  startTime: string;
  endTime: string;
};

export type DateRuleInput = {
  date: string;
  windows: TimeWindowInput[];
};

export type BookingPeriodInput = {
  type: AppointmentBookingPeriodType;
  availableFrom?: string | null;
  availableTo?: string | null;
  days?: number | null;
  daysKind?: AppointmentBookingPeriodDaysKind | null;
};

export type ConfirmedAppointmentSlot = {
  startTime: Date;
  endTime: Date;
  status: string;
};

export type GeneratedTimeSlot = {
  start: string;
  end: string;
};

export const UNLIMITED_BOOKING_PERIOD: BookingPeriodInput = {
  type: "unlimited",
  availableFrom: null,
  availableTo: null,
  days: null,
  daysKind: null,
};

const WEEKDAY_TO_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function parseTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    throw new Error(`Invalid time value: ${time}`);
  }
  return hours * 60 + minutes;
}

export function minutesToTimeString(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function formatDateInTimezone(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Format an instant as `YYYY-MM-DD HH:MM` in the given IANA timezone. */
export function formatDateTimeInTimezone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const read = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "00";
  const hour = read("hour") === "24" ? "00" : read("hour");
  return `${read("year")}-${read("month")}-${read("day")} ${hour}:${read("minute")}`;
}

export function isValidIanaTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Convert an inclusive calendar day range in `timezone` to UTC bounds.
 * `utcToExclusive` is the instant of the next local midnight after dateTo.
 */
export function userDateRangeToUtcBounds(
  dateFrom: string,
  dateTo: string,
  timezone: string,
): { utcFrom: Date; utcToExclusive: Date } {
  const utcFrom = zonedDateTimeToUtc(dateFrom, "00:00", timezone);
  const endNoon = zonedDateTimeToUtc(dateTo, "12:00", timezone);
  const nextLocalDate = formatDateInTimezone(
    new Date(endNoon.getTime() + 24 * 60 * 60 * 1000),
    timezone,
  );
  return {
    utcFrom,
    utcToExclusive: zonedDateTimeToUtc(nextLocalDate, "00:00", timezone),
  };
}

export function getWeekdayInTimezone(date: Date, timezone: string): number {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
  }).format(date);
  return WEEKDAY_TO_INDEX[weekday] ?? 0;
}

export function zonedDateTimeToUtc(
  dateStr: string,
  timeStr: string,
  timezone: string,
): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hour, minute] = timeStr.split(":").map(Number);
  let utcMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const current = new Date(utcMs);
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hour12: false,
    }).formatToParts(current);

    const read = (type: string) =>
      Number(parts.find((part) => part.type === type)?.value ?? 0);

    const actualYear = read("year");
    const actualMonth = read("month");
    const actualDay = read("day");
    const actualHour = read("hour") % 24;
    const actualMinute = read("minute");

    const targetTotalMinutes = hour * 60 + minute;
    const actualTotalMinutes = actualHour * 60 + actualMinute;
    const dayOffsetMinutes =
      (actualYear - year) * 525_600 +
      (actualMonth - month) * 43_200 +
      (actualDay - day) * 1_440;
    const diffMinutes = dayOffsetMinutes + (actualTotalMinutes - targetTotalMinutes);
    if (diffMinutes === 0) {
      return current;
    }
    utcMs -= diffMinutes * 60_000;
  }

  return new Date(utcMs);
}

export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  return (
    utc.getUTCFullYear() === year &&
    utc.getUTCMonth() === month - 1 &&
    utc.getUTCDate() === day
  );
}

/** Add `days` to a YYYY-MM-DD calendar date (not timezone-aware). */
export function addCalendarDays(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  const yyyy = String(utc.getUTCFullYear()).padStart(4, "0");
  const mm = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(utc.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function iterateCalendarDates(dateFrom: string, dateTo: string): string[] {
  const dates: string[] = [];
  if (dateFrom > dateTo) {
    return dates;
  }
  let current = dateFrom;
  while (current <= dateTo) {
    dates.push(current);
    current = addCalendarDays(current, 1);
    if (dates.length > 366) {
      break;
    }
  }
  return dates;
}

function iterateDateStrings(
  dateFrom: string,
  dateTo: string,
  timezone: string,
): string[] {
  const dates: string[] = [];
  let current = dateFrom;
  while (current <= dateTo) {
    dates.push(current);
    const noonUtc = zonedDateTimeToUtc(current, "12:00", timezone);
    const next = new Date(noonUtc.getTime() + 24 * 60 * 60 * 1000);
    current = formatDateInTimezone(next, timezone);
    if (dates.length > 366) {
      break;
    }
  }
  return dates;
}

export function lastDateForMovingPeriod(
  today: string,
  days: number,
  daysKind: AppointmentBookingPeriodDaysKind,
  timezone: string,
): string {
  if (daysKind === "calendar") {
    return addCalendarDays(today, Math.max(days, 1) - 1);
  }

  let counted = 0;
  let current = today;
  let last = today;
  for (let step = 0; step < 800 && counted < days; step += 1) {
    const weekday = getWeekdayInTimezone(
      zonedDateTimeToUtc(current, "12:00", timezone),
      timezone,
    );
    if (weekday !== 0 && weekday !== 6) {
      counted += 1;
      last = current;
    }
    if (counted >= days) {
      break;
    }
    current = addCalendarDays(current, 1);
  }
  return last;
}

export function isDateInBookingPeriod(
  dateStr: string,
  period: BookingPeriodInput,
  options: { now?: Date; timezone: string },
): boolean {
  if (period.type === "unlimited") {
    return true;
  }

  if (period.type === "fixed") {
    if (!period.availableFrom || !period.availableTo) {
      return false;
    }
    if (dateStr < period.availableFrom || dateStr > period.availableTo) {
      return false;
    }
    return true;
  }

  const days = period.days ?? 0;
  if (days <= 0) {
    return false;
  }
  const today = formatDateInTimezone(options.now ?? new Date(), options.timezone);
  if (dateStr < today) {
    return false;
  }
  const last = lastDateForMovingPeriod(
    today,
    days,
    period.daysKind === "weekdays" ? "weekdays" : "calendar",
    options.timezone,
  );
  return dateStr <= last;
}

export function windowsForDate(options: {
  dateStr: string;
  weekday: number;
  weeklyRules: AvailabilityRuleInput[];
  dateRules: DateRuleInput[];
}): TimeWindowInput[] {
  const dateRule = options.dateRules.find((rule) => rule.date === options.dateStr);
  if (dateRule) {
    return dateRule.windows;
  }
  return options.weeklyRules
    .filter((rule) => rule.dayOfWeek === options.weekday)
    .map((rule) => ({
      startTime: rule.startTime,
      endTime: rule.endTime,
    }));
}

function slotsOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  return aStart < bEnd && aEnd > bStart;
}

export function generateAvailableSlots(options: {
  rules: AvailabilityRuleInput[];
  dateRules?: DateRuleInput[];
  bookingPeriod?: BookingPeriodInput;
  existingAppointments: ConfirmedAppointmentSlot[];
  dateFrom: string;
  dateTo: string;
  slotDurationMinutes: number;
  timezone: string;
  now?: Date;
}): GeneratedTimeSlot[] {
  const {
    rules,
    dateRules = [],
    bookingPeriod = UNLIMITED_BOOKING_PERIOD,
    existingAppointments,
    dateFrom,
    dateTo,
    slotDurationMinutes,
    timezone,
    now = new Date(),
  } = options;

  const slots: GeneratedTimeSlot[] = [];
  const confirmed = existingAppointments.filter(
    (appointment) => appointment.status === "confirmed",
  );

  for (const dateStr of iterateDateStrings(dateFrom, dateTo, timezone)) {
    if (
      !isDateInBookingPeriod(dateStr, bookingPeriod, { now, timezone })
    ) {
      continue;
    }

    const weekday = getWeekdayInTimezone(
      zonedDateTimeToUtc(dateStr, "12:00", timezone),
      timezone,
    );
    const dayWindows = windowsForDate({
      dateStr,
      weekday,
      weeklyRules: rules,
      dateRules,
    });

    for (const window of dayWindows) {
      const ruleStart = parseTimeToMinutes(window.startTime);
      const ruleEnd = parseTimeToMinutes(window.endTime);
      if (ruleEnd <= ruleStart) {
        continue;
      }

      for (
        let slotStartMinutes = ruleStart;
        slotStartMinutes + slotDurationMinutes <= ruleEnd;
        slotStartMinutes += slotDurationMinutes
      ) {
        const slotEndMinutes = slotStartMinutes + slotDurationMinutes;
        const slotStart = zonedDateTimeToUtc(
          dateStr,
          minutesToTimeString(slotStartMinutes),
          timezone,
        );
        const slotEnd = zonedDateTimeToUtc(
          dateStr,
          minutesToTimeString(slotEndMinutes),
          timezone,
        );

        if (slotStart < now) {
          continue;
        }

        const hasConflict = confirmed.some((appointment) =>
          slotsOverlap(
            slotStart,
            slotEnd,
            appointment.startTime,
            appointment.endTime,
          ),
        );
        if (hasConflict) {
          continue;
        }

        slots.push({
          start: slotStart.toISOString(),
          end: slotEnd.toISOString(),
        });
      }
    }
  }

  return slots.sort((a, b) => a.start.localeCompare(b.start));
}

export function isSlotWithinAvailability(options: {
  rules: AvailabilityRuleInput[];
  dateRules?: DateRuleInput[];
  bookingPeriod?: BookingPeriodInput;
  slotStart: Date;
  slotEnd: Date;
  timezone: string;
  now?: Date;
}): boolean {
  const {
    rules,
    dateRules = [],
    bookingPeriod = UNLIMITED_BOOKING_PERIOD,
    slotStart,
    slotEnd,
    timezone,
    now = new Date(),
  } = options;
  const dateStr = formatDateInTimezone(slotStart, timezone);
  if (!isDateInBookingPeriod(dateStr, bookingPeriod, { now, timezone })) {
    return false;
  }

  const weekday = getWeekdayInTimezone(slotStart, timezone);
  const startMinutes = parseTimeToMinutes(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(slotStart),
  );
  const endMinutes = parseTimeToMinutes(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(slotEnd),
  );

  if (formatDateInTimezone(slotEnd, timezone) !== dateStr) {
    return false;
  }

  return windowsForDate({
    dateStr,
    weekday,
    weeklyRules: rules,
    dateRules,
  }).some((window) => {
    const ruleStart = parseTimeToMinutes(window.startTime);
    const ruleEnd = parseTimeToMinutes(window.endTime);
    return startMinutes >= ruleStart && endMinutes <= ruleEnd;
  });
}

export function validateAvailabilityRules(
  rules: AvailabilityRuleInput[],
): string | null {
  for (const rule of rules) {
    if (rule.dayOfWeek < 0 || rule.dayOfWeek > 6) {
      return "Day of week must be between 0 and 6";
    }
    const start = parseTimeToMinutes(rule.startTime);
    const end = parseTimeToMinutes(rule.endTime);
    if (end <= start) {
      return "Availability end time must be after start time";
    }
  }
  return null;
}

export function validateDateRules(dateRules: DateRuleInput[]): string | null {
  const seen = new Set<string>();
  for (const rule of dateRules) {
    if (!isValidIsoDate(rule.date)) {
      return "Exception dates require a valid YYYY-MM-DD date";
    }
    if (seen.has(rule.date)) {
      return "Each date can only have one exception rule";
    }
    seen.add(rule.date);
    for (const window of rule.windows) {
      const start = parseTimeToMinutes(window.startTime);
      const end = parseTimeToMinutes(window.endTime);
      if (end <= start) {
        return "Exception end time must be after start time";
      }
    }
  }
  return null;
}

export function validateBookingPeriod(
  period: BookingPeriodInput,
): string | null {
  if (period.type === "fixed") {
    if (!period.availableFrom || !period.availableTo) {
      return "Booking window requires both start and end dates";
    }
    if (!isValidIsoDate(period.availableFrom)) {
      return "Booking window start must be a valid YYYY-MM-DD date";
    }
    if (!isValidIsoDate(period.availableTo)) {
      return "Booking window end must be a valid YYYY-MM-DD date";
    }
    if (period.availableFrom > period.availableTo) {
      return "Booking window start must be on or before the end date";
    }
    return null;
  }
  if (period.type === "moving") {
    const days = period.days ?? 0;
    if (!Number.isInteger(days) || days < 1 || days > 730) {
      return "Rolling booking window must be between 1 and 730 days";
    }
  }
  return null;
}
