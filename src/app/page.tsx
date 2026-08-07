"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AvailabilityEditor,
  availabilityMapFromRules,
  emptyAvailabilityByDay,
  rulesFromAvailabilityMap,
  type AvailabilityRule,
} from "@/components/availability-editor";
import { EntityManager } from "@/components/entity-manager";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  APPOINTMENT_SLOT_DURATION_OPTIONS,
  APPOINTMENT_TIMEZONES,
} from "@/lib/appointment/constants";
import { authClient } from "@/lib/auth-client";
import {
  Calendar,
  Check,
  ChevronRight,
  Copy,
  KeyRound,
  Plus,
  Trash2,
} from "lucide-react";

type ApiKeyMeta = {
  id: string;
  label: string | null;
  createdAt: string;
};

type EntityRow = {
  id: string;
  name: string;
  description?: string | null;
  availabilityRules: AvailabilityRule[];
};

type BookingRow = {
  id: string;
  name: string;
  email: string;
  startTime: string;
  endTime: string;
  startLocal: string;
  endLocal: string;
  status: string;
};

const inputClassName =
  "h-10 w-full rounded-lg border border-border bg-muted px-3 text-sm text-foreground outline-none transition-shadow focus:border-ring focus:bg-card focus:ring-2 focus:ring-ring/30";
const labelClassName = "mb-1.5 block text-sm font-semibold text-foreground";
const hintClassName = "mt-1 text-xs text-muted-foreground";
const buttonPrimaryClassName =
  "inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";

function formatBookingRange(startLocal: string, endLocal: string): string {
  const [startDate, startTime] = startLocal.split(" ");
  const [endDate, endTime] = endLocal.split(" ");
  if (startDate && endDate && startDate === endDate && startTime && endTime) {
    return `${startDate} ${startTime} – ${endTime}`;
  }
  return `${startLocal} – ${endLocal}`;
}

function formatKeyDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function DashboardShell({
  email,
  onSignOut,
  children,
}: {
  email: string;
  onSignOut: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-card/90 backdrop-blur-sm">
        <nav className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Calendar className="h-4 w-4" aria-hidden="true" />
            </div>
            <span className="text-sm font-semibold text-foreground">
              Appointment
            </span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="hidden max-w-[200px] truncate text-xs text-muted-foreground sm:block">
              {email}
            </span>
            <ThemeToggle />
            <button
              type="button"
              onClick={onSignOut}
              className="inline-flex h-8 cursor-pointer items-center justify-center rounded-lg border border-border bg-card px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted"
            >
              Sign out
            </button>
          </div>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        {children}
      </main>
    </div>
  );
}

function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone?.trim() || "UTC";
  } catch {
    return "UTC";
  }
}

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const entityIdParam = searchParams.get("entity")?.trim() ?? "";

  const { data: session, isPending: sessionPending } = authClient.useSession();
  const isAuthenticated = Boolean(session?.user);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [entities, setEntities] = useState<EntityRow[]>([]);
  const [entityLabel, setEntityLabel] = useState("Entity");
  const [timezone, setTimezone] = useState(browserTimezone);
  const [slotDurationMinutes, setSlotDurationMinutes] = useState(30);
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [availabilityDraft, setAvailabilityDraft] = useState<
    Record<number, AvailabilityRule[]>
  >(emptyAvailabilityByDay());
  const [savingAvailability, setSavingAvailability] = useState(false);
  const [savedAvailability, setSavedAvailability] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [apiKeys, setApiKeys] = useState<ApiKeyMeta[]>([]);
  const [creatingKey, setCreatingKey] = useState(false);
  const [revealedApiKey, setRevealedApiKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [revokingKeyId, setRevokingKeyId] = useState<string | null>(null);
  const [timezoneOptions, setTimezoneOptions] = useState<string[]>(() => {
    const tz = browserTimezone();
    return APPOINTMENT_TIMEZONES.includes(
      tz as (typeof APPOINTMENT_TIMEZONES)[number],
    )
      ? [...APPOINTMENT_TIMEZONES]
      : [tz, ...APPOINTMENT_TIMEZONES];
  });
  const loadedEntityKeyRef = useRef<string | null>(null);

  const selectedEntity = useMemo(
    () => entities.find((e) => e.id === entityIdParam) ?? null,
    [entities, entityIdParam],
  );

  const setEntitySelection = useCallback(
    (entityId: string | null) => {
      const params = new URLSearchParams();
      if (entityId) params.set("entity", entityId);
      const query = params.toString();
      router.replace(query ? `/?${query}` : "/");
    },
    [router],
  );

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const preferredTimezone = browserTimezone();
      const url = new URL("/api/workspace", window.location.origin);
      if (preferredTimezone) {
        url.searchParams.set("timezone", preferredTimezone);
      }
      const res = await fetch(url.pathname + url.search, {
        credentials: "include",
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        workspace?: {
          id: string;
          entityLabel: string;
          timezone: string;
          slotDurationMinutes: number;
          entities: EntityRow[];
          apiKeys?: ApiKeyMeta[];
        };
      };
      if (!res.ok || !data.ok || !data.workspace) {
        throw new Error(data.error ?? "Failed to load workspace");
      }
      const ws = data.workspace;
      setEntityLabel(ws.entityLabel);
      setTimezone(ws.timezone);
      setSlotDurationMinutes(ws.slotDurationMinutes);
      setEntities(ws.entities);
      setApiKeys(ws.apiKeys ?? []);
      setSettingsDirty(false);
      setReady(true);
      setTimezoneOptions((current) => {
        const next = new Set(current);
        next.add(preferredTimezone);
        next.add(ws.timezone);
        return [...next];
      });
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load workspace",
      );
      setReady(false);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadEntityDetail = useCallback(async (entity: EntityRow) => {
    setPendingAction("entity");
    setError("");
    setSavedAvailability(false);
    setAvailabilityDraft(
      availabilityMapFromRules(entity.availabilityRules ?? []),
    );
    try {
      const res = await fetch(
        `/api/workspace/entities/${encodeURIComponent(entity.id)}/bookings`,
        { credentials: "include" },
      );
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        timezone?: string;
        bookings?: BookingRow[];
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Failed to load bookings");
      }
      if (data.timezone) setTimezone(data.timezone);
      setBookings(data.bookings ?? []);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load bookings",
      );
      setBookings([]);
    } finally {
      setPendingAction(null);
    }
  }, []);

  useEffect(() => {
    if (sessionPending) return;
    if (!isAuthenticated) {
      router.replace("/login?next=" + encodeURIComponent("/"));
      return;
    }
    queueMicrotask(() => {
      void loadWorkspace();
    });
  }, [sessionPending, isAuthenticated, loadWorkspace, router]);

  useEffect(() => {
    if (!isAuthenticated || !ready || !entityIdParam) {
      queueMicrotask(() => {
        setBookings([]);
        loadedEntityKeyRef.current = null;
      });
      return;
    }
    const entity = entities.find((e) => e.id === entityIdParam);
    if (!entity) return;

    if (loadedEntityKeyRef.current === entityIdParam) return;
    loadedEntityKeyRef.current = entityIdParam;
    queueMicrotask(() => {
      void loadEntityDetail(entity);
    });
  }, [
    isAuthenticated,
    ready,
    entityIdParam,
    entities,
    loadEntityDetail,
  ]);

  async function signOut() {
    await authClient.signOut();
    router.replace("/login");
  }

  async function saveSettings(event?: FormEvent) {
    event?.preventDefault();
    setSavingSettings(true);
    setError("");
    try {
      const res = await fetch("/api/workspace", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityLabel,
          timezone,
          slotDurationMinutes,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        workspace?: {
          entityLabel: string;
          timezone: string;
          slotDurationMinutes: number;
        };
      };
      if (!res.ok || !data.ok || !data.workspace) {
        throw new Error(data.error ?? "Failed to save settings");
      }
      setEntityLabel(data.workspace.entityLabel);
      setTimezone(data.workspace.timezone);
      setSlotDurationMinutes(data.workspace.slotDurationMinutes);
      setSettingsDirty(false);
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

  async function createApiKey() {
    setCreatingKey(true);
    setError("");
    setRevealedApiKey(null);
    try {
      const res = await fetch("/api/api-keys", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        apiKey?: string;
        apiKeyMeta?: ApiKeyMeta;
      };
      if (!res.ok || !data.ok || !data.apiKey || !data.apiKeyMeta) {
        throw new Error(data.error ?? "Failed to create API key");
      }
      setRevealedApiKey(data.apiKey);
      setApiKeys((current) => [data.apiKeyMeta!, ...current]);
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Failed to create API key",
      );
    } finally {
      setCreatingKey(false);
    }
  }

  async function revokeApiKey(keyId: string) {
    setRevokingKeyId(keyId);
    setError("");
    try {
      const res = await fetch(
        `/api/api-keys/${encodeURIComponent(keyId)}`,
        { method: "DELETE", credentials: "include" },
      );
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Failed to revoke API key");
      }
      setApiKeys((current) => current.filter((key) => key.id !== keyId));
      if (revealedApiKey) setRevealedApiKey(null);
    } catch (revokeError) {
      setError(
        revokeError instanceof Error
          ? revokeError.message
          : "Failed to revoke API key",
      );
    } finally {
      setRevokingKeyId(null);
    }
  }

  async function copyApiKey() {
    if (!revealedApiKey) return;
    try {
      await navigator.clipboard.writeText(revealedApiKey);
      setCopiedKey(true);
      window.setTimeout(() => setCopiedKey(false), 2000);
    } catch {
      // ignore
    }
  }

  async function handleAddEntity(input: {
    name: string;
    description: string;
  }) {
    setPendingAction("add-entity");
    setError("");
    try {
      const res = await fetch("/api/workspace/entities", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: input.name,
          description: input.description || undefined,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        entity?: EntityRow;
      };
      if (!res.ok || !data.ok || !data.entity) {
        throw new Error(data.error ?? "Failed to add entity");
      }

      setEntities((current) =>
        [...current, { ...data.entity!, availabilityRules: [] }].sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
      );
    } catch (addError) {
      const message =
        addError instanceof Error ? addError.message : "Failed to add entity";
      setError(message);
      throw addError instanceof Error ? addError : new Error(message);
    } finally {
      setPendingAction(null);
    }
  }

  async function handleUpdateEntity(input: {
    entityId: string;
    name: string;
    description: string;
  }) {
    setPendingAction(`edit-entity:${input.entityId}`);
    setError("");
    try {
      const res = await fetch(
        `/api/workspace/entities/${encodeURIComponent(input.entityId)}`,
        {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: input.name,
            description: input.description || undefined,
          }),
        },
      );
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        entity?: EntityRow;
      };
      if (!res.ok || !data.ok || !data.entity) {
        throw new Error(data.error ?? "Failed to update entity");
      }

      setEntities((current) =>
        current
          .map((entity) =>
            entity.id === input.entityId
              ? {
                  ...entity,
                  name: data.entity!.name,
                  description: data.entity!.description,
                }
              : entity,
          )
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
    } catch (editError) {
      const message =
        editError instanceof Error
          ? editError.message
          : "Failed to update entity";
      setError(message);
      throw editError instanceof Error ? editError : new Error(message);
    } finally {
      setPendingAction(null);
    }
  }

  async function handleDeleteEntity(entityId: string) {
    setPendingAction(`delete-entity:${entityId}`);
    setError("");
    try {
      const res = await fetch(
        `/api/workspace/entities/${encodeURIComponent(entityId)}`,
        { method: "DELETE", credentials: "include" },
      );
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Failed to delete entity");
      }

      setEntities((current) => current.filter((entity) => entity.id !== entityId));
      if (entityIdParam === entityId) {
        setEntitySelection(null);
      }
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Failed to delete entity",
      );
    } finally {
      setPendingAction(null);
    }
  }

  async function handleSaveAvailability() {
    if (!entityIdParam) return;
    const rules = rulesFromAvailabilityMap(availabilityDraft);
    setSavingAvailability(true);
    setSavedAvailability(false);
    setError("");
    try {
      const res = await fetch(
        `/api/workspace/entities/${encodeURIComponent(entityIdParam)}/availability`,
        {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rules }),
        },
      );
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        rules?: AvailabilityRule[];
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Failed to save availability");
      }
      setEntities((current) =>
        current.map((entity) =>
          entity.id === entityIdParam
            ? { ...entity, availabilityRules: data.rules ?? rules }
            : entity,
        ),
      );
      setSavedAvailability(true);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Failed to save availability",
      );
    } finally {
      setSavingAvailability(false);
    }
  }

  if (sessionPending || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  const email = session?.user?.email ?? "";

  return (
    <DashboardShell email={email} onSignOut={() => void signOut()}>
      <div role="status" aria-live="polite" aria-atomic="true" className="mb-5">
        {error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}
      </div>

      {entityIdParam ? (
        <nav className="mb-6 flex flex-wrap items-center gap-1 text-sm">
          <button
            type="button"
            className="cursor-pointer rounded px-1 py-0.5 text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => setEntitySelection(null)}
          >
            Entities
          </button>
          {selectedEntity ? (
            <>
              <ChevronRight
                className="h-4 w-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <span className="rounded px-1 py-0.5 font-medium text-foreground">
                {selectedEntity.name}
              </span>
            </>
          ) : null}
        </nav>
      ) : null}

      {loading || !ready ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : entityIdParam ? (
        <div className="space-y-6">
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="border-b border-border px-5 py-3.5">
              <h2 className="text-sm font-semibold text-foreground">
                Availability
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Times in {timezone}
              </p>
            </div>
            <div className="px-5 py-4">
              {pendingAction === "entity" && !selectedEntity ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : (
                <AvailabilityEditor
                  draft={availabilityDraft}
                  onChange={(dayOfWeek, updater) => {
                    setSavedAvailability(false);
                    setAvailabilityDraft((current) => ({
                      ...current,
                      [dayOfWeek]: updater(current[dayOfWeek] ?? []),
                    }));
                  }}
                  onSave={() => void handleSaveAvailability()}
                  saving={savingAvailability}
                  saved={savedAvailability}
                  disabled={savingAvailability}
                />
              )}
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="border-b border-border px-5 py-3.5">
              <h2 className="text-sm font-semibold text-foreground">Bookings</h2>
            </div>
            {pendingAction === "entity" ? (
              <p className="px-5 py-4 text-sm text-muted-foreground">Loading…</p>
            ) : bookings.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <p className="text-sm text-muted-foreground">No bookings yet.</p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {bookings.map((booking) => (
                  <li
                    key={booking.id}
                    className="flex items-start justify-between gap-4 px-5 py-4"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground">
                        {booking.name}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {booking.email}
                      </p>
                      <p className="mt-1.5 font-mono text-xs text-muted-foreground">
                        {formatBookingRange(
                          booking.startLocal,
                          booking.endLocal,
                        )}
                        <span className="ml-1 font-sans text-muted-foreground/70">
                          ({timezone})
                        </span>
                      </p>
                    </div>
                    <span
                      className={`mt-0.5 inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${
                        booking.status === "confirmed"
                          ? "bg-success/15 text-success ring-success/30"
                          : "bg-muted text-muted-foreground ring-border"
                      }`}
                    >
                      {booking.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="border-b border-border px-5 py-3.5">
              <h2 className="text-sm font-semibold text-foreground">Settings</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Shared defaults for all bookable entities.
              </p>
            </div>
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
                  Label for the people or resources you schedule (Doctor,
                  Teacher, etc.).
                </p>
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

          <section>
            <EntityManager
              entityLabel={entityLabel}
              entities={entities}
              pendingAction={pendingAction}
              disabled={savingAvailability}
              emptyMessage={`No ${entityLabel.toLowerCase()}s yet. Add one to configure availability.`}
              onAdd={handleAddEntity}
              onUpdate={handleUpdateEntity}
              onDelete={handleDeleteEntity}
              onSelect={(entityId) => setEntitySelection(entityId)}
              onValidationError={setError}
            />
          </section>

          <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  API keys
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Paste a key into AgentBlit when connecting the Appointment
                  tool.
                </p>
              </div>
              <button
                type="button"
                className={buttonPrimaryClassName + " h-9 shrink-0 px-3 text-xs"}
                disabled={creatingKey}
                onClick={() => void createApiKey()}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                {creatingKey ? "Creating…" : "Create key"}
              </button>
            </div>

            <div className="px-5 py-4">
              {revealedApiKey ? (
                <div className="mb-4 rounded-lg border border-border bg-muted/40 p-4">
                  <p className="text-xs font-medium text-foreground">
                    Copy this key now — it will not be shown again.
                  </p>
                  <div className="mt-2 flex items-start gap-2">
                    <code className="min-w-0 flex-1 break-all rounded-lg bg-card px-3 py-2 font-mono text-xs text-foreground">
                      {revealedApiKey}
                    </code>
                    <button
                      type="button"
                      onClick={() => void copyApiKey()}
                      className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-muted"
                    >
                      {copiedKey ? (
                        <Check className="h-3.5 w-3.5 text-primary" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      {copiedKey ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <button
                    type="button"
                    className="mt-2 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setRevealedApiKey(null)}
                  >
                    Dismiss
                  </button>
                </div>
              ) : null}

              {apiKeys.length === 0 ? (
                <div className="py-8 text-center">
                  <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <KeyRound className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <p className="text-sm font-medium text-foreground">
                    No API keys yet
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Create a key to connect this schedule to an AgentBlit agent.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {apiKeys.map((key) => (
                    <li
                      key={key.id}
                      className="flex items-center justify-between gap-3 py-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          {key.label?.trim() || "API key"}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Created {formatKeyDate(key.createdAt)}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                        disabled={revokingKeyId === key.id}
                        aria-label="Revoke API key"
                        onClick={() => void revokeApiKey(key.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      )}
    </DashboardShell>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex max-w-3xl flex-1 flex-col justify-center px-4 py-16">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </main>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
