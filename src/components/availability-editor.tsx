"use client";

import { Check, Clock, Plus, Trash2 } from "lucide-react";
import { APPOINTMENT_DAY_LABELS } from "@/lib/appointment/constants";

export type AvailabilityRule = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
};

export function emptyAvailabilityByDay(): Record<number, AvailabilityRule[]> {
  return { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
}

export function rulesFromAvailabilityMap(
  map: Record<number, AvailabilityRule[]>,
): AvailabilityRule[] {
  return Object.values(map).flat();
}

export function availabilityMapFromRules(
  rules: AvailabilityRule[],
): Record<number, AvailabilityRule[]> {
  const map = emptyAvailabilityByDay();
  for (const rule of rules) {
    map[rule.dayOfWeek] = [...(map[rule.dayOfWeek] ?? []), rule];
  }
  return map;
}

const timeInputClassName =
  "relative h-8 w-36 shrink-0 rounded-lg border border-border bg-muted px-2 pr-8 text-sm text-foreground outline-none transition-shadow focus:border-ring focus:ring-2 focus:ring-ring/30 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:top-0 [&::-webkit-calendar-picker-indicator]:right-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-8 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0";

export function TimeInput({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="relative shrink-0">
      <input
        type="time"
        className={timeInputClassName}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
      <Clock
        className="pointer-events-none absolute top-1/2 right-2 h-3.5 w-3.5 -translate-y-1/2 text-foreground/70"
        aria-hidden="true"
      />
    </div>
  );
}

type AvailabilityEditorProps = {
  draft: Record<number, AvailabilityRule[]>;
  onChange: (
    dayOfWeek: number,
    updater: (rules: AvailabilityRule[]) => AvailabilityRule[],
  ) => void;
  onSave?: () => void;
  saving?: boolean;
  saved?: boolean;
  disabled?: boolean;
  hideSave?: boolean;
};

export function AvailabilityEditor({
  draft,
  onChange,
  onSave,
  saving = false,
  saved = false,
  disabled = false,
  hideSave = false,
}: AvailabilityEditorProps) {
  const isBusy = saving || disabled;

  return (
    <div>
      <div className="divide-y divide-border">
        {APPOINTMENT_DAY_LABELS.map((label, dayOfWeek) => {
          const dayRules = draft[dayOfWeek] ?? [];
          const enabled = dayRules.length > 0;

          return (
            <div
              key={label}
              className="flex min-h-13 flex-col gap-2 py-3 sm:flex-row sm:items-start sm:gap-6"
            >
              <label className="flex w-36 shrink-0 cursor-pointer items-center gap-2.5 pt-0.5">
                <button
                  type="button"
                  role="switch"
                  aria-checked={enabled}
                  disabled={isBusy}
                  onClick={() => {
                    if (enabled) {
                      onChange(dayOfWeek, () => []);
                    } else {
                      onChange(dayOfWeek, () => [
                        { dayOfWeek, startTime: "09:00", endTime: "18:00" },
                      ]);
                    }
                  }}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${
                    enabled ? "bg-primary" : "bg-muted"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                      enabled ? "translate-x-4" : "translate-x-0.5"
                    }`}
                  />
                </button>
                <span
                  className={`text-sm ${
                    enabled
                      ? "font-medium text-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  {label}
                </span>
              </label>

              {enabled ? (
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  {dayRules.map((rule, index) => (
                    <div
                      key={`${dayOfWeek}-${index}`}
                      className="flex flex-wrap items-center gap-2"
                    >
                      <TimeInput
                        value={rule.startTime}
                        disabled={isBusy}
                        onChange={(next) =>
                          onChange(dayOfWeek, (rules) =>
                            rules.map((item, i) =>
                              i === index
                                ? { ...item, startTime: next }
                                : item,
                            ),
                          )
                        }
                      />
                      <span className="text-xs text-muted-foreground">–</span>
                      <TimeInput
                        value={rule.endTime}
                        disabled={isBusy}
                        onChange={(next) =>
                          onChange(dayOfWeek, (rules) =>
                            rules.map((item, i) =>
                              i === index ? { ...item, endTime: next } : item,
                            ),
                          )
                        }
                      />
                      <button
                        type="button"
                        className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={isBusy}
                        onClick={() =>
                          onChange(dayOfWeek, (rules) =>
                            rules.filter((_, i) => i !== index),
                          )
                        }
                        aria-label="Remove window"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                      {index === dayRules.length - 1 ? (
                        <button
                          type="button"
                          className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={isBusy}
                          onClick={() =>
                            onChange(dayOfWeek, (rules) => [
                              ...rules,
                              {
                                dayOfWeek,
                                startTime: "14:00",
                                endTime: "18:00",
                              },
                            ])
                          }
                        >
                          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                          Add
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <span className="pt-0.5 text-sm text-muted-foreground">
                  Closed
                </span>
              )}
            </div>
          );
        })}
      </div>

      {hideSave ? null : (
        <div className="mt-4 flex items-center justify-end gap-3 border-t border-border pt-4">
          {saved ? (
            <span className="flex items-center gap-1.5 text-xs font-medium text-success">
              <Check
                className="h-3.5 w-3.5"
                strokeWidth={2.5}
                aria-hidden="true"
              />
              Saved
            </span>
          ) : null}
          <button
            type="button"
            className="inline-flex h-9 cursor-pointer items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={onSave}
            disabled={isBusy}
          >
            {saving ? "Saving…" : "Save availability"}
          </button>
        </div>
      )}
    </div>
  );
}
