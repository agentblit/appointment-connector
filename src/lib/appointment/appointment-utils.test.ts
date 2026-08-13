import { describe, expect, it } from "vitest";
import {
  generateAvailableSlots,
  isDateInBookingPeriod,
  isSlotWithinAvailability,
  iterateCalendarDates,
  lastDateForMovingPeriod,
  validateBookingPeriod,
  windowsForDate,
} from "@/lib/appointment/appointment-utils";
import {
  exceptionRangesOverlapError,
  expandExceptionRanges,
} from "@/components/date-specific-hours-editor";

const weekly = [
  { dayOfWeek: 1, startTime: "09:00", endTime: "17:00" },
  { dayOfWeek: 2, startTime: "09:00", endTime: "17:00" },
];

describe("iterateCalendarDates", () => {
  it("includes both ends of a range", () => {
    expect(iterateCalendarDates("2026-08-15", "2026-08-17")).toEqual([
      "2026-08-15",
      "2026-08-16",
      "2026-08-17",
    ]);
  });
});

describe("windowsForDate", () => {
  it("uses weekly hours when no date rule exists", () => {
    expect(
      windowsForDate({
        dateStr: "2026-08-17",
        weekday: 1,
        weeklyRules: weekly,
        dateRules: [],
      }),
    ).toEqual([{ startTime: "09:00", endTime: "17:00" }]);
  });

  it("replaces weekly hours with date-specific hours", () => {
    expect(
      windowsForDate({
        dateStr: "2026-08-17",
        weekday: 1,
        weeklyRules: weekly,
        dateRules: [
          {
            date: "2026-08-17",
            windows: [{ startTime: "10:00", endTime: "12:00" }],
          },
        ],
      }),
    ).toEqual([{ startTime: "10:00", endTime: "12:00" }]);
  });

  it("returns no windows when the date is marked unavailable", () => {
    expect(
      windowsForDate({
        dateStr: "2026-08-17",
        weekday: 1,
        weeklyRules: weekly,
        dateRules: [{ date: "2026-08-17", windows: [] }],
      }),
    ).toEqual([]);
  });
});

describe("isDateInBookingPeriod", () => {
  it("allows every date when unlimited", () => {
    expect(
      isDateInBookingPeriod("2026-08-15", { type: "unlimited" }, {
        timezone: "UTC",
      }),
    ).toBe(true);
  });

  it("clamps to a fixed inclusive range", () => {
    const period = {
      type: "fixed" as const,
      availableFrom: "2026-03-01",
      availableTo: "2026-06-15",
    };
    expect(
      isDateInBookingPeriod("2026-02-28", period, { timezone: "UTC" }),
    ).toBe(false);
    expect(
      isDateInBookingPeriod("2026-03-01", period, { timezone: "UTC" }),
    ).toBe(true);
    expect(
      isDateInBookingPeriod("2026-06-15", period, { timezone: "UTC" }),
    ).toBe(true);
    expect(
      isDateInBookingPeriod("2026-06-16", period, { timezone: "UTC" }),
    ).toBe(false);
  });

  it("counts rolling calendar days from today", () => {
    const now = new Date("2026-08-13T12:00:00.000Z");
    const period = {
      type: "moving" as const,
      days: 3,
      daysKind: "calendar" as const,
    };
    expect(
      isDateInBookingPeriod("2026-08-13", period, { now, timezone: "UTC" }),
    ).toBe(true);
    expect(
      isDateInBookingPeriod("2026-08-15", period, { now, timezone: "UTC" }),
    ).toBe(true);
    expect(
      isDateInBookingPeriod("2026-08-16", period, { now, timezone: "UTC" }),
    ).toBe(false);
  });

  it("rejects fixed periods with a missing bound", () => {
    expect(
      isDateInBookingPeriod(
        "2026-03-01",
        { type: "fixed", availableFrom: "2026-03-01", availableTo: null },
        { timezone: "UTC" },
      ),
    ).toBe(false);
    expect(
      isDateInBookingPeriod(
        "2026-03-01",
        { type: "fixed", availableFrom: null, availableTo: "2026-06-15" },
        { timezone: "UTC" },
      ),
    ).toBe(false);
  });
});

describe("validateBookingPeriod", () => {
  it("requires both ends of a fixed window", () => {
    expect(
      validateBookingPeriod({
        type: "fixed",
        availableFrom: "2026-03-01",
        availableTo: null,
      }),
    ).toMatch(/both start and end/i);
    expect(
      validateBookingPeriod({
        type: "fixed",
        availableFrom: "2026-03-01",
        availableTo: "2026-02-01",
      }),
    ).toMatch(/on or before/i);
    expect(
      validateBookingPeriod({
        type: "fixed",
        availableFrom: "2026-03-01",
        availableTo: "2026-06-15",
      }),
    ).toBeNull();
  });
});

describe("exception range expansion", () => {
  it("expands a range into per-day rules", () => {
    expect(
      expandExceptionRanges([
        {
          id: "a",
          startDate: "2026-08-15",
          endDate: "2026-08-16",
          windows: [{ startTime: "10:00", endTime: "12:00" }],
        },
      ]),
    ).toEqual([
      {
        date: "2026-08-15",
        windows: [{ startTime: "10:00", endTime: "12:00" }],
      },
      {
        date: "2026-08-16",
        windows: [{ startTime: "10:00", endTime: "12:00" }],
      },
    ]);
  });

  it("rejects overlapping ranges instead of silently overwriting", () => {
    const ranges = [
      {
        id: "a",
        startDate: "2026-08-15",
        endDate: "2026-08-17",
        windows: [{ startTime: "09:00", endTime: "12:00" }],
      },
      {
        id: "b",
        startDate: "2026-08-16",
        endDate: "2026-08-16",
        windows: [{ startTime: "13:00", endTime: "17:00" }],
      },
    ];
    expect(exceptionRangesOverlapError(ranges)).toMatch(/overlap on 2026-08-16/);
    expect(() => expandExceptionRanges(ranges)).toThrow(/overlap on 2026-08-16/);
  });
});

describe("lastDateForMovingPeriod", () => {
  it("counts weekdays only", () => {
    // Thursday 13 Aug 2026 + 3 weekdays = Monday 17 Aug
    expect(
      lastDateForMovingPeriod("2026-08-13", 3, "weekdays", "UTC"),
    ).toBe("2026-08-17");
  });
});

describe("generateAvailableSlots", () => {
  const monday = "2026-08-17";
  const now = new Date("2026-08-01T00:00:00.000Z");

  it("generates weekly slots", () => {
    const slots = generateAvailableSlots({
      rules: weekly,
      existingAppointments: [],
      dateFrom: monday,
      dateTo: monday,
      slotDurationMinutes: 60,
      timezone: "UTC",
      now,
    });
    expect(slots[0]?.start).toBe("2026-08-17T09:00:00.000Z");
    expect(slots.at(-1)?.start).toBe("2026-08-17T16:00:00.000Z");
  });

  it("hides a blocked date", () => {
    const slots = generateAvailableSlots({
      rules: weekly,
      dateRules: [{ date: monday, windows: [] }],
      existingAppointments: [],
      dateFrom: monday,
      dateTo: monday,
      slotDurationMinutes: 60,
      timezone: "UTC",
      now,
    });
    expect(slots).toEqual([]);
  });

  it("uses custom hours instead of weekly hours", () => {
    const slots = generateAvailableSlots({
      rules: weekly,
      dateRules: [
        {
          date: monday,
          windows: [{ startTime: "10:00", endTime: "12:00" }],
        },
      ],
      existingAppointments: [],
      dateFrom: monday,
      dateTo: monday,
      slotDurationMinutes: 60,
      timezone: "UTC",
      now,
    });
    expect(slots.map((slot) => slot.start)).toEqual([
      "2026-08-17T10:00:00.000Z",
      "2026-08-17T11:00:00.000Z",
    ]);
  });

  it("does not generate slots outside a fixed booking window", () => {
    const slots = generateAvailableSlots({
      rules: weekly,
      bookingPeriod: {
        type: "fixed",
        availableFrom: "2026-03-01",
        availableTo: "2026-06-15",
      },
      existingAppointments: [],
      dateFrom: monday,
      dateTo: monday,
      slotDurationMinutes: 60,
      timezone: "UTC",
      now,
    });
    expect(slots).toEqual([]);
  });

  it("still subtracts confirmed bookings", () => {
    const slots = generateAvailableSlots({
      rules: weekly,
      existingAppointments: [
        {
          startTime: new Date("2026-08-17T09:00:00.000Z"),
          endTime: new Date("2026-08-17T10:00:00.000Z"),
          status: "confirmed",
        },
      ],
      dateFrom: monday,
      dateTo: monday,
      slotDurationMinutes: 60,
      timezone: "UTC",
      now,
    });
    expect(slots[0]?.start).toBe("2026-08-17T10:00:00.000Z");
  });
});

describe("isSlotWithinAvailability", () => {
  const slotStart = new Date("2026-08-17T10:00:00.000Z");
  const slotEnd = new Date("2026-08-17T11:00:00.000Z");

  it("rejects a slot on an unavailable date", () => {
    expect(
      isSlotWithinAvailability({
        rules: weekly,
        dateRules: [{ date: "2026-08-17", windows: [] }],
        slotStart,
        slotEnd,
        timezone: "UTC",
        now: new Date("2026-08-01T00:00:00.000Z"),
      }),
    ).toBe(false);
  });

  it("accepts a slot inside custom date hours", () => {
    expect(
      isSlotWithinAvailability({
        rules: weekly,
        dateRules: [
          {
            date: "2026-08-17",
            windows: [{ startTime: "10:00", endTime: "12:00" }],
          },
        ],
        slotStart,
        slotEnd,
        timezone: "UTC",
        now: new Date("2026-08-01T00:00:00.000Z"),
      }),
    ).toBe(true);
  });

  it("rejects a slot outside the booking period", () => {
    expect(
      isSlotWithinAvailability({
        rules: weekly,
        bookingPeriod: {
          type: "fixed",
          availableFrom: "2026-03-01",
          availableTo: "2026-06-15",
        },
        slotStart,
        slotEnd,
        timezone: "UTC",
        now: new Date("2026-08-01T00:00:00.000Z"),
      }),
    ).toBe(false);
  });
});
