"use client";

import { useState, type FormEvent } from "react";
import { ChevronDown } from "lucide-react";
import {
  APPOINTMENT_SLOT_DURATION_OPTIONS,
} from "@/lib/appointment/constants";
import { useWorkspace } from "@/lib/dashboard/workspace-context";
import {
  buttonOutlineClassName,
  buttonPrimaryClassName,
  hintClassName,
  inputClassName,
  labelClassName,
  textareaClassName,
  type WorkspaceRole,
} from "@/lib/dashboard/types";

export default function SettingsPage() {
  const {
    entityLabel,
    setEntityLabel,
    timezone,
    setTimezone,
    slotDurationMinutes,
    setSlotDurationMinutes,
    roles,
    setRoles,
    setEntities,
    timezoneOptions,
    setError,
    setNotice,
  } = useWorkspace();

  const [rolesOpen, setRolesOpen] = useState(false);
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  async function saveSettings(event?: FormEvent) {
    event?.preventDefault();
    setSavingSettings(true);
    setError("");
    setNotice("");
    try {
      const rolesPayload = roles
        .map((role) => ({
          id: role.id,
          name: role.name.trim(),
          description: role.description.trim(),
        }))
        .filter((role) => role.name.length > 0);

      const res = await fetch("/api/workspace", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityLabel,
          timezone,
          slotDurationMinutes,
          roles: rolesPayload,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        workspace?: {
          entityLabel: string;
          timezone: string;
          slotDurationMinutes: number;
          roles?: WorkspaceRole[];
        };
      };
      if (!res.ok || !data.ok || !data.workspace) {
        throw new Error(data.error ?? "Failed to save settings");
      }
      setEntityLabel(data.workspace.entityLabel);
      setTimezone(data.workspace.timezone);
      setSlotDurationMinutes(data.workspace.slotDurationMinutes);
      setRoles(data.workspace.roles ?? rolesPayload);
      setEntities((current) =>
        current.map((entity) => ({
          ...entity,
          roleIds: (entity.roleIds ?? []).filter((roleId) =>
            (data.workspace?.roles ?? rolesPayload).some(
              (role) => role.id === roleId,
            ),
          ),
        })),
      );
      setSettingsDirty(false);
      setNotice("Settings saved.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Failed to save settings",
      );
    } finally {
      setSavingSettings(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Shared defaults for all bookable entities.
        </p>
      </div>

      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <form
          className="space-y-4 px-5 py-4"
          onSubmit={(event) => void saveSettings(event)}
        >
          <div>
            <label className={labelClassName} htmlFor="entity-label">
              Entity name
            </label>
            <input
              id="entity-label"
              className={inputClassName}
              value={entityLabel}
              onChange={(event) => {
                setEntityLabel(event.target.value);
                setSettingsDirty(true);
              }}
              placeholder="eg. Doctor"
              disabled={savingSettings}
            />
            <p className={hintClassName}>
              Label for the people or resources you schedule (Doctor, Teacher,
              etc.).
            </p>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <button
                type="button"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground transition-colors hover:text-primary"
                aria-expanded={rolesOpen}
                onClick={(event) => {
                  event.preventDefault();
                  setRolesOpen((open) => !open);
                }}
              >
                <ChevronDown
                  className={`h-4 w-4 text-muted-foreground transition-transform ${
                    rolesOpen ? "" : "-rotate-90"
                  }`}
                  aria-hidden="true"
                />
                Roles
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
                {roles.length > 0 ? (
                  <span className="ml-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
                    {roles.length}
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                className={buttonOutlineClassName + " h-8 px-3 text-xs"}
                disabled={savingSettings}
                onClick={(event) => {
                  event.preventDefault();
                  setRolesOpen(true);
                  setRoles((current) => [
                    ...current,
                    { name: "", description: "" },
                  ]);
                  setSettingsDirty(true);
                }}
              >
                Add role
              </button>
            </div>
            {rolesOpen ? (
              roles.length === 0 ? (
                <p className={hintClassName + " !mt-0"}>
                  Optionally define valid roles (for example Cardiologist or
                  Pediatrician). Entities can pick one or more of these later.
                </p>
              ) : (
                <ul className="space-y-3">
                  {roles.map((role, index) => (
                    <li
                      key={role.id ?? `new-${index}`}
                      className="space-y-2 rounded-lg border border-border bg-muted/40 p-3"
                    >
                      <div className="flex items-start gap-2">
                        <input
                          className={inputClassName}
                          value={role.name}
                          onChange={(event) => {
                            const name = event.target.value;
                            setRoles((current) =>
                              current.map((item, i) =>
                                i === index ? { ...item, name } : item,
                              ),
                            );
                            setSettingsDirty(true);
                          }}
                          placeholder="Role name"
                          aria-label={`Role ${index + 1} name`}
                          disabled={savingSettings}
                        />
                        <button
                          type="button"
                          className="inline-flex h-10 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-border bg-card px-3 text-sm text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={savingSettings}
                          aria-label={`Remove role ${index + 1}`}
                          onClick={(event) => {
                            event.preventDefault();
                            setRoles((current) =>
                              current.filter((_, i) => i !== index),
                            );
                            setSettingsDirty(true);
                          }}
                        >
                          Remove
                        </button>
                      </div>
                      <textarea
                        className={textareaClassName}
                        value={role.description}
                        onChange={(event) => {
                          const description = event.target.value;
                          setRoles((current) =>
                            current.map((item, i) =>
                              i === index ? { ...item, description } : item,
                            ),
                          );
                          setSettingsDirty(true);
                        }}
                        placeholder="Role description (optional)"
                        aria-label={`Role ${index + 1} description`}
                        disabled={savingSettings}
                        rows={2}
                      />
                    </li>
                  ))}
                </ul>
              )
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClassName} htmlFor="timezone">
                Business timezone
              </label>
              <select
                id="timezone"
                className={inputClassName}
                value={timezone}
                onChange={(event) => {
                  setTimezone(event.target.value);
                  setSettingsDirty(true);
                }}
                disabled={savingSettings}
              >
                {timezoneOptions.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClassName} htmlFor="slot-duration">
                Slot duration
              </label>
              <select
                id="slot-duration"
                className={inputClassName}
                value={slotDurationMinutes}
                onChange={(event) => {
                  setSlotDurationMinutes(Number(event.target.value));
                  setSettingsDirty(true);
                }}
                disabled={savingSettings}
              >
                {APPOINTMENT_SLOT_DURATION_OPTIONS.map((option) => (
                  <option key={option.minutes} value={option.minutes}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              className={buttonPrimaryClassName + " h-9 px-3 text-xs"}
              disabled={savingSettings || !settingsDirty || !entityLabel.trim()}
            >
              {savingSettings ? "Saving…" : "Save settings"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
