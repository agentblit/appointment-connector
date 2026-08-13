"use client";

import type { BookingPeriod } from "@/lib/dashboard/types";

const dateInputClassName =
  "h-8 rounded-lg border border-border bg-muted px-2 text-sm text-foreground outline-none transition-shadow focus:border-ring focus:ring-2 focus:ring-ring/30";

const choiceButtonClassName = (active: boolean) =>
  `inline-flex h-8 cursor-pointer items-center rounded-lg border px-3 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
    active
      ? "border-primary bg-primary/10 text-foreground"
      : "border-border bg-card text-muted-foreground hover:bg-muted"
  }`;

type BookingPeriodEditorProps = {
  value: BookingPeriod;
  onChange: (next: BookingPeriod) => void;
  disabled?: boolean;
};

export function BookingPeriodEditor({
  value,
  onChange,
  disabled = false,
}: BookingPeriodEditorProps) {
  const isFixed = value.type === "fixed";
  const isMoving = value.type === "moving";

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium text-foreground">Date range</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          When invitees can book, independent of weekly hours.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() =>
            onChange({
              type: "unlimited",
              availableFrom: null,
              availableTo: null,
              days: null,
              daysKind: null,
            })
          }
          className={choiceButtonClassName(value.type === "unlimited")}
        >
          Indefinitely
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() =>
            onChange({
              type: "fixed",
              availableFrom: value.type === "fixed" ? value.availableFrom : "",
              availableTo: value.type === "fixed" ? value.availableTo : "",
              days: null,
              daysKind: null,
            })
          }
          className={choiceButtonClassName(isFixed)}
        >
          Within a date range
        </button>
      </div>
      {isMoving ? (
        <p className="text-xs text-muted-foreground">
          This entity uses a rolling window (next {value.days ?? "?"}{" "}
          {value.daysKind === "weekdays" ? "weekdays" : "calendar days"}).
          Choose Indefinitely or a date range to replace it.
        </p>
      ) : null}
      {isFixed ? (
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-muted-foreground">
            From
            <input
              type="date"
              className={`${dateInputClassName} ml-2`}
              value={value.availableFrom ?? ""}
              disabled={disabled}
              onChange={(event) =>
                onChange({
                  ...value,
                  type: "fixed",
                  availableFrom: event.target.value || null,
                })
              }
            />
          </label>
          <label className="text-xs text-muted-foreground">
            To
            <input
              type="date"
              className={`${dateInputClassName} ml-2`}
              value={value.availableTo ?? ""}
              disabled={disabled}
              onChange={(event) =>
                onChange({
                  ...value,
                  type: "fixed",
                  availableTo: event.target.value || null,
                })
              }
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}
