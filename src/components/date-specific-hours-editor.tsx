"use client";

import { Calendar, Plus, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { TimeInput } from "@/components/availability-editor";
import {
  addCalendarDays,
  iterateCalendarDates,
} from "@/lib/appointment/appointment-utils";
import type { DateRule } from "@/lib/dashboard/types";

const dateFieldClassName =
  "h-8 w-36 shrink-0 rounded-lg border border-border bg-muted px-2 pr-8 text-sm text-foreground outline-none transition-shadow focus:border-ring focus:ring-2 focus:ring-ring/30 [&::-webkit-calendar-picker-indicator]:hidden";

const exceptionGridClassName =
  "grid grid-cols-[2.25rem_9rem_1.25rem_9rem_auto] items-center gap-x-2 gap-y-2";

const iconButtonClassName =
  "inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50";

const addButtonClassName =
  "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50";

function DateInput({
  value,
  disabled,
  onChange,
  "aria-label": ariaLabel,
}: {
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  "aria-label": string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="relative shrink-0">
      <input
        ref={inputRef}
        type="date"
        className={dateFieldClassName}
        value={value}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(event) => onChange(event.target.value)}
      />
      <button
        type="button"
        disabled={disabled}
        tabIndex={-1}
        aria-hidden="true"
        className="absolute top-1/2 right-1.5 flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded text-foreground/70 disabled:cursor-not-allowed disabled:opacity-50"
        onClick={() => {
          const input = inputRef.current;
          if (!input) return;
          try {
            input.showPicker();
          } catch {
            input.focus();
            input.click();
          }
        }}
      >
        <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

type TimeWindow = { startTime: string; endTime: string };

type ExceptionRange = {
  id: string;
  startDate: string;
  endDate: string;
  windows: TimeWindow[];
};

type ExceptionsEditorProps = {
  rules: DateRule[];
  onChange: (next: DateRule[]) => void;
  onValidityChange?: (valid: boolean) => void;
  disabled?: boolean;
};

function windowsKey(windows: TimeWindow[]): string {
  return JSON.stringify(windows);
}

function todayIsoDate(): string {
  const now = new Date();
  const yyyy = String(now.getFullYear()).padStart(4, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** Collapse contiguous same-hours dates into range rows for display. */
export function coalesceDateRules(rules: DateRule[]): ExceptionRange[] {
  const sorted = [...rules].sort((a, b) => a.date.localeCompare(b.date));
  const ranges: ExceptionRange[] = [];

  for (const rule of sorted) {
    const last = ranges[ranges.length - 1];
    if (
      last &&
      windowsKey(last.windows) === windowsKey(rule.windows) &&
      addCalendarDays(last.endDate, 1) === rule.date
    ) {
      last.endDate = rule.date;
      continue;
    }
    ranges.push({
      id: `loaded-${rule.date}-${ranges.length}`,
      startDate: rule.date,
      endDate: rule.date,
      windows: rule.windows.map((window) => ({ ...window })),
    });
  }

  return ranges;
}

/** Expand range rows into one rule per calendar date. Rejects overlapping ranges. */
export function exceptionRangesOverlapError(
  ranges: ExceptionRange[],
): string | null {
  const claimed = new Map<string, string>();
  for (const range of ranges) {
    const start = range.startDate;
    const end = range.endDate || range.startDate;
    if (!start || end < start) continue;
    for (const date of iterateCalendarDates(start, end)) {
      const otherId = claimed.get(date);
      if (otherId !== undefined && otherId !== range.id) {
        return `Exceptions overlap on ${date}. Adjust the ranges so each day appears once.`;
      }
      claimed.set(date, range.id);
    }
  }
  return null;
}

/** Expand range rows into one rule per calendar date. */
export function expandExceptionRanges(ranges: ExceptionRange[]): DateRule[] {
  const overlapError = exceptionRangesOverlapError(ranges);
  if (overlapError) {
    throw new Error(overlapError);
  }

  const byDate = new Map<string, TimeWindow[]>();
  for (const range of ranges) {
    const start = range.startDate;
    const end = range.endDate || range.startDate;
    if (!start || end < start) continue;
    for (const date of iterateCalendarDates(start, end)) {
      byDate.set(
        date,
        range.windows.map((window) => ({ ...window })),
      );
    }
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, windows]) => ({ date, windows }));
}

function nextOpenDate(ranges: ExceptionRange[]): string {
  const used = new Set(
    ranges.flatMap((range) => {
      if (!range.startDate) return [];
      const end = range.endDate || range.startDate;
      if (end < range.startDate) return [range.startDate];
      return iterateCalendarDates(range.startDate, end);
    }),
  );
  let date = todayIsoDate();
  while (used.has(date)) {
    date = addCalendarDays(date, 1);
  }
  return date;
}

let exceptionSeq = 0;
function newExceptionId(prefix: string): string {
  exceptionSeq += 1;
  return `${prefix}-${exceptionSeq}`;
}

export function ExceptionsEditor({
  rules,
  onChange,
  onValidityChange,
  disabled = false,
}: ExceptionsEditorProps) {
  const reactId = useId();
  const [ranges, setRanges] = useState(() => coalesceDateRules(rules));
  const [overlapError, setOverlapError] = useState<string | null>(null);
  const skipSyncFromProps = useRef(false);
  const rulesFingerprint = JSON.stringify(rules);

  useEffect(() => {
    if (skipSyncFromProps.current) {
      skipSyncFromProps.current = false;
      return;
    }
    setRanges(coalesceDateRules(JSON.parse(rulesFingerprint) as DateRule[]));
    setOverlapError(null);
    onValidityChange?.(true);
  }, [rulesFingerprint, onValidityChange]);

  function commit(next: ExceptionRange[]) {
    skipSyncFromProps.current = true;
    setRanges(next);
    const error = exceptionRangesOverlapError(next);
    setOverlapError(error);
    onValidityChange?.(!error);
    if (error) {
      if (error !== overlapError) {
        toast.error(error);
      }
      // Keep the last valid draft in the parent so save cannot apply a silent merge.
      return;
    }
    onChange(expandExceptionRanges(next));
  }

  function updateRange(
    id: string,
    updater: (range: ExceptionRange) => ExceptionRange,
  ) {
    commit(ranges.map((range) => (range.id === id ? updater(range) : range)));
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium text-foreground">Exceptions</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Override weekly hours for a date or range. Clear the hours to make
          those days unavailable.
        </p>
      </div>

      {ranges.length > 0 ? (
        <ul className="space-y-3">
          {ranges.map((range, index) => {
            const unavailable = range.windows.length === 0;
            return (
              <li
                key={range.id}
                className="relative rounded-lg border border-border bg-muted/30 p-3 pr-11"
              >
                <button
                  type="button"
                  className={`${iconButtonClassName} absolute top-2 right-2`}
                  disabled={disabled}
                  onClick={() =>
                    commit(ranges.filter((item) => item.id !== range.id))
                  }
                  aria-label={`Remove exception ${index + 1}`}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>

                <div className={exceptionGridClassName}>
                  <span className="text-xs text-muted-foreground">From</span>
                  <DateInput
                    value={range.startDate}
                    disabled={disabled}
                    aria-label={`Exception ${index + 1} start date`}
                    onChange={(startDate) => {
                      if (!startDate) return;
                      updateRange(range.id, (item) => ({
                        ...item,
                        startDate,
                        endDate:
                          item.endDate < startDate ? startDate : item.endDate,
                      }));
                    }}
                  />
                  <span className="text-center text-xs text-muted-foreground">
                    to
                  </span>
                  <DateInput
                    value={range.endDate}
                    disabled={disabled}
                    aria-label={`Exception ${index + 1} end date`}
                    onChange={(endDate) => {
                      if (!endDate) return;
                      updateRange(range.id, (item) => ({
                        ...item,
                        endDate,
                        startDate:
                          endDate < item.startDate ? endDate : item.startDate,
                      }));
                    }}
                  />
                  <span aria-hidden="true" />

                  {unavailable ? (
                    <>
                      <span aria-hidden="true" />
                      <div className="col-span-3 flex flex-wrap items-center gap-2">
                        <span className="text-sm text-muted-foreground">
                          Unavailable all day
                        </span>
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() =>
                            updateRange(range.id, (item) => ({
                              ...item,
                              windows: [
                                { startTime: "09:00", endTime: "17:00" },
                              ],
                            }))
                          }
                          className={addButtonClassName}
                        >
                          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                          Add
                        </button>
                      </div>
                      <span aria-hidden="true" />
                    </>
                  ) : (
                    range.windows.map((window, windowIndex) => (
                      <div
                        key={`${range.id}-window-${windowIndex}`}
                        className="col-span-5 grid grid-cols-subgrid items-center"
                      >
                        <span aria-hidden="true" />
                        <TimeInput
                          value={window.startTime}
                          disabled={disabled}
                          onChange={(next) =>
                            updateRange(range.id, (item) => ({
                              ...item,
                              windows: item.windows.map((entry, i) =>
                                i === windowIndex
                                  ? { ...entry, startTime: next }
                                  : entry,
                              ),
                            }))
                          }
                        />
                        <span className="text-center text-xs text-muted-foreground">
                          –
                        </span>
                        <TimeInput
                          value={window.endTime}
                          disabled={disabled}
                          onChange={(next) =>
                            updateRange(range.id, (item) => ({
                              ...item,
                              windows: item.windows.map((entry, i) =>
                                i === windowIndex
                                  ? { ...entry, endTime: next }
                                  : entry,
                              ),
                            }))
                          }
                        />
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className={iconButtonClassName}
                            disabled={disabled}
                            onClick={() =>
                              updateRange(range.id, (item) => ({
                                ...item,
                                windows: item.windows.filter(
                                  (_, i) => i !== windowIndex,
                                ),
                              }))
                            }
                            aria-label="Remove hours"
                          >
                            <Trash2
                              className="h-3.5 w-3.5"
                              aria-hidden="true"
                            />
                          </button>
                          {windowIndex === range.windows.length - 1 ? (
                            <button
                              type="button"
                              disabled={disabled}
                              onClick={() =>
                                updateRange(range.id, (item) => ({
                                  ...item,
                                  windows: [
                                    ...item.windows,
                                    { startTime: "14:00", endTime: "17:00" },
                                  ],
                                }))
                              }
                              className={addButtonClassName}
                            >
                              <Plus
                                className="h-3.5 w-3.5"
                                aria-hidden="true"
                              />
                              Add
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No exceptions yet.</p>
      )}

      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          const date = nextOpenDate(ranges);
          commit([
            ...ranges,
            {
              id: newExceptionId(`${reactId}-exception`),
              startDate: date,
              endDate: date,
              windows: [{ startTime: "09:00", endTime: "17:00" }],
            },
          ]);
        }}
        className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        Add exception
      </button>
    </div>
  );
}

/** @deprecated Use ExceptionsEditor */
export const DateSpecificHoursEditor = ExceptionsEditor;
