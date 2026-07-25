"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
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
import { APPOINTMENT_CONNECTOR_KEY } from "@/lib/appointment/tools";
import { authClient } from "@/lib/auth-client";
import { Calendar, ChevronRight, Link2 } from "lucide-react";

type ConnectorRole = {
  id: string;
  name: string;
  description: string;
};

type ConnectorSummary = {
  agentId: string;
  entityLabel: string;
  timezone: string;
  slotDurationMinutes: number;
};

type EntityRow = {
  id: string;
  name: string;
  description?: string | null;
  roleIds?: string[] | null;
  isActive?: boolean;
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

function connectorQuery(agentId: string) {
  return new URLSearchParams({
    agentId,
    connectorKey: APPOINTMENT_CONNECTOR_KEY,
  }).toString();
}

/** `YYYY-MM-DD HH:MM – HH:MM` when same day; otherwise full start and end. */
function formatBookingRange(startLocal: string, endLocal: string): string {
  const [startDate, startTime] = startLocal.split(" ");
  const [endDate, endTime] = endLocal.split(" ");
  if (startDate && endDate && startDate === endDate && startTime && endTime) {
    return `${startDate} ${startTime} – ${endTime}`;
  }
  return `${startLocal} – ${endLocal}`;
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

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const agentIdParam = searchParams.get("connector")?.trim() ?? "";
  const entityIdParam = searchParams.get("entity")?.trim() ?? "";

  const { data: session, isPending: sessionPending } = authClient.useSession();
  const isAuthenticated = Boolean(session?.user);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [connectors, setConnectors] = useState<ConnectorSummary[]>([]);
  const [entities, setEntities] = useState<EntityRow[]>([]);
  const [entityLabel, setEntityLabel] = useState("Entity");
  const [roles, setRoles] = useState<ConnectorRole[]>([]);
  const [timezone, setTimezone] = useState("UTC");
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [availabilityDraft, setAvailabilityDraft] = useState<
    Record<number, AvailabilityRule[]>
  >(emptyAvailabilityByDay());
  const [savingAvailability, setSavingAvailability] = useState(false);
  const [savedAvailability, setSavedAvailability] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const loadedEntityKeyRef = useRef<string | null>(null);

  const selectedConnector = useMemo(
    () => connectors.find((c) => c.agentId === agentIdParam) ?? null,
    [connectors, agentIdParam],
  );
  const selectedEntity = useMemo(
    () => entities.find((e) => e.id === entityIdParam) ?? null,
    [entities, entityIdParam],
  );

  const setSelection = useCallback(
    (next: { connector?: string | null; entity?: string | null }) => {
      const params = new URLSearchParams();
      const connector =
        next.connector === undefined ? agentIdParam : next.connector;
      const entity = next.entity === undefined ? entityIdParam : next.entity;
      if (connector) params.set("connector", connector);
      if (connector && entity) params.set("entity", entity);
      const query = params.toString();
      router.replace(query ? `/?${query}` : "/");
    },
    [agentIdParam, entityIdParam, router],
  );

  const loadConnectors = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/connectors", { credentials: "include" });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        connectors?: ConnectorSummary[];
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Failed to load connectors");
      }
      setConnectors(data.connectors ?? []);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load connectors",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const loadConnectorDetail = useCallback(async (agentId: string) => {
    setPendingAction("entities");
    setError("");
    try {
      const res = await fetch(
        `/api/connectors/${encodeURIComponent(agentId)}?${connectorQuery(agentId)}`,
        { credentials: "include" },
      );
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        connector?: {
          entityLabel: string;
          timezone: string;
          roles?: ConnectorRole[];
          entities: EntityRow[];
        } | null;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Failed to load connector");
      }
      if (!data.connector) {
        setEntities([]);
        setEntityLabel("Entity");
        setRoles([]);
        return;
      }
      setEntityLabel(data.connector.entityLabel);
      setTimezone(data.connector.timezone);
      setRoles(data.connector.roles ?? []);
      setEntities(data.connector.entities);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load connector",
      );
      setEntities([]);
      setRoles([]);
    } finally {
      setPendingAction(null);
    }
  }, []);

  const loadEntityDetail = useCallback(
    async (agentId: string, entity: EntityRow) => {
      setPendingAction("entity");
      setError("");
      setSavedAvailability(false);
      setAvailabilityDraft(
        availabilityMapFromRules(entity.availabilityRules ?? []),
      );
      try {
        const res = await fetch(
          `/api/connectors/${encodeURIComponent(agentId)}/entities/${encodeURIComponent(entity.id)}/bookings?${connectorQuery(agentId)}`,
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
    },
    [],
  );

  useEffect(() => {
    if (sessionPending) return;
    if (!isAuthenticated) {
      router.replace("/login?next=" + encodeURIComponent("/"));
      return;
    }
    queueMicrotask(() => {
      void loadConnectors();
    });
  }, [sessionPending, isAuthenticated, loadConnectors, router]);

  useEffect(() => {
    if (!isAuthenticated || !agentIdParam) {
      queueMicrotask(() => {
        setEntities([]);
        loadedEntityKeyRef.current = null;
      });
      return;
    }
    loadedEntityKeyRef.current = null;
    queueMicrotask(() => {
      void loadConnectorDetail(agentIdParam);
    });
  }, [isAuthenticated, agentIdParam, loadConnectorDetail]);

  useEffect(() => {
    if (!isAuthenticated || !agentIdParam || !entityIdParam) {
      queueMicrotask(() => {
        setBookings([]);
        loadedEntityKeyRef.current = null;
      });
      return;
    }
    const entity = entities.find((e) => e.id === entityIdParam);
    if (!entity) return;

    const key = `${agentIdParam}:${entityIdParam}`;
    if (loadedEntityKeyRef.current === key) return;
    loadedEntityKeyRef.current = key;
    queueMicrotask(() => {
      void loadEntityDetail(agentIdParam, entity);
    });
  }, [
    isAuthenticated,
    agentIdParam,
    entityIdParam,
    entities,
    loadEntityDetail,
  ]);

  async function signOut() {
    await authClient.signOut();
    router.replace("/login");
  }

  async function handleAddEntity(input: {
    name: string;
    description: string;
    roleIds: string[];
  }) {
    if (!agentIdParam) return;

    setPendingAction("add-entity");
    setError("");
    try {
      const res = await fetch(
        `/api/connectors/${encodeURIComponent(agentIdParam)}/entities?${connectorQuery(agentIdParam)}`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: input.name,
            description: input.description || undefined,
            roleIds: input.roleIds,
          }),
        },
      );
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
    roleIds: string[];
  }) {
    if (!agentIdParam) return;

    setPendingAction(`edit-entity:${input.entityId}`);
    setError("");
    try {
      const res = await fetch(
        `/api/connectors/${encodeURIComponent(agentIdParam)}/entities/${encodeURIComponent(input.entityId)}?${connectorQuery(agentIdParam)}`,
        {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: input.name,
            description: input.description || undefined,
            roleIds: input.roleIds,
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
                  roleIds: data.entity!.roleIds ?? [],
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
    if (!agentIdParam) return;
    setPendingAction(`delete-entity:${entityId}`);
    setError("");
    try {
      const res = await fetch(
        `/api/connectors/${encodeURIComponent(agentIdParam)}/entities/${encodeURIComponent(entityId)}?${connectorQuery(agentIdParam)}`,
        { method: "DELETE", credentials: "include" },
      );
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Failed to delete entity");
      }

      setEntities((current) => current.filter((entity) => entity.id !== entityId));
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
    if (!agentIdParam || !entityIdParam) return;
    const rules = rulesFromAvailabilityMap(availabilityDraft);
    setSavingAvailability(true);
    setSavedAvailability(false);
    setError("");
    try {
      const res = await fetch(
        `/api/connectors/${encodeURIComponent(agentIdParam)}/entities/${encodeURIComponent(entityIdParam)}/availability?${connectorQuery(agentIdParam)}`,
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

      {agentIdParam || entityIdParam ? (
        <nav className="mb-6 flex flex-wrap items-center gap-1 text-sm">
          <button
            type="button"
            className="cursor-pointer rounded px-1 py-0.5 text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => setSelection({ connector: null, entity: null })}
          >
            Connectors
          </button>
          {agentIdParam ? (
            <>
              <ChevronRight
                className="h-4 w-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <button
                type="button"
                className={`cursor-pointer rounded px-1 py-0.5 transition-colors hover:text-foreground ${
                  entityIdParam
                    ? "text-muted-foreground"
                    : "font-medium text-foreground"
                }`}
                onClick={() => setSelection({ entity: null })}
              >
                {selectedConnector
                  ? `${selectedConnector.entityLabel} · ${selectedConnector.agentId}`
                  : agentIdParam}
              </button>
            </>
          ) : null}
          {selectedEntity ? (
            <>
              <ChevronRight
                className="h-4 w-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <button
                type="button"
                className="cursor-pointer rounded px-1 py-0.5 font-medium text-foreground"
                aria-current="page"
              >
                {selectedEntity.name}
              </button>
            </>
          ) : null}
        </nav>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !agentIdParam ? (
        <section>
          <h2 className="mb-4 text-lg font-semibold text-foreground">
            Your connectors
          </h2>
          {connectors.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Link2 className="h-4 w-4" aria-hidden="true" />
              </div>
              <p className="text-sm font-medium text-foreground">No connectors yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Open setup from Agentblit (Add tool) to configure appointments for an agent.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {connectors.map((connector) => (
                <li key={connector.agentId}>
                  <button
                    type="button"
                    className="group flex w-full cursor-pointer items-center gap-4 rounded-xl border border-border bg-card px-5 py-4 text-left shadow-sm transition-all hover:border-primary/40 hover:shadow-md"
                    onClick={() =>
                      setSelection({ connector: connector.agentId, entity: null })
                    }
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                      <Link2 className="h-4 w-4" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground">
                        {connector.entityLabel}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                          {connector.agentId}
                        </code>
                        <span className="text-xs text-muted-foreground">·</span>
                        <span className="text-xs text-muted-foreground">
                          {connector.timezone}
                        </span>
                        <span className="text-xs text-muted-foreground">·</span>
                        <span className="text-xs text-muted-foreground">
                          {connector.slotDurationMinutes} min slots
                        </span>
                      </div>
                    </div>
                    <ChevronRight
                      className="h-4 w-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : !entityIdParam ? (
        <EntityManager
          entityLabel={entityLabel}
          entities={entities}
          availableRoles={roles}
          pendingAction={pendingAction}
          loading={pendingAction === "entities"}
          disabled={savingAvailability}
          onAdd={handleAddEntity}
          onUpdate={handleUpdateEntity}
          onDelete={handleDeleteEntity}
          onSelect={(entityId) => setSelection({ entity: entityId })}
          onValidationError={setError}
        />
      ) : (
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
