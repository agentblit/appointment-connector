"use client";

import {
  type FormEvent,
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
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
import { Calendar, ChevronDown } from "lucide-react";

type Step = "config" | "entities" | "availability";

type EntityRow = {
  id: string;
  name: string;
  description?: string | null;
  roleIds?: string[] | null;
  availabilityRules: AvailabilityRule[];
};

type ConnectorRole = {
  id?: string;
  name: string;
  description: string;
};

type ConnectorConfig = {
  entityLabel: string;
  timezone: string;
  slotDurationMinutes: number;
  roles: ConnectorRole[];
};

type SetupClaims = {
  agentId: string;
  connectorKey: string;
};

const STEPS: { id: Step; label: string }[] = [
  { id: "config", label: "Settings" },
  { id: "entities", label: "Entities" },
  { id: "availability", label: "Availability" },
];

const defaultConfig: ConnectorConfig = {
  entityLabel: "Doctor",
  timezone: "UTC",
  slotDurationMinutes: 30,
  roles: [],
};

const textareaClassName =
  "min-h-20 w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground outline-none transition-shadow focus:border-ring focus:bg-card focus:ring-2 focus:ring-ring/30";

const inputClassName =
  "h-10 w-full rounded-lg border border-border bg-muted px-3 text-sm text-foreground outline-none transition-shadow focus:border-ring focus:bg-card focus:ring-2 focus:ring-ring/30";
const labelClassName = "mb-1.5 block text-sm font-semibold text-foreground";
const hintClassName = "mt-1 text-xs text-muted-foreground";
const buttonPrimaryClassName =
  "inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";
const buttonOutlineClassName =
  "inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50";
const footerClassName = "flex items-center justify-between gap-3 pt-2";

function setupQuery(claims: SetupClaims) {
  return new URLSearchParams({
    agentId: claims.agentId,
    connectorKey: claims.connectorKey,
  }).toString();
}

function SetupShell({
  step,
  onStepChange,
  error,
  children,
  loading = false,
  email,
  onSwitchAccount,
}: {
  step: Step;
  onStepChange?: (step: Step) => void;
  error: string;
  children: ReactNode;
  loading?: boolean;
  email?: string;
  onSwitchAccount?: () => void;
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
              Appointment setup
            </span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {email ? (
              <span className="hidden max-w-[200px] truncate text-xs text-muted-foreground sm:block">
                {email}
              </span>
            ) : null}
            <ThemeToggle />
            {onSwitchAccount ? (
              <button
                type="button"
                onClick={onSwitchAccount}
                className="inline-flex h-8 cursor-pointer items-center justify-center rounded-lg border border-border bg-card px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted"
              >
                Switch
              </button>
            ) : null}
          </div>
        </nav>
      </header>

      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <header className="mb-6">
          <h1 className="text-lg font-semibold text-foreground">
            Configure connector
          </h1>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">
            Set bookable entities, availability, and slot duration for this
            agent.
          </p>
        </header>

        <nav aria-label="Setup steps" className="mb-6">
          <ol className="flex flex-wrap gap-2">
            {STEPS.map((item, index) => {
              const selected = step === item.id;
              const reachable = onStepChange && !loading;

              return (
                <li key={item.id}>
                  <button
                    type="button"
                    disabled={!reachable}
                    aria-current={selected ? "step" : undefined}
                    onClick={(event) => {
                      event.preventDefault();
                      onStepChange?.(item.id);
                    }}
                    className={`inline-flex h-9 cursor-pointer items-center rounded-lg border px-3 text-sm transition-colors disabled:cursor-default ${
                      selected
                        ? "border-primary bg-primary-soft font-medium text-primary"
                        : "border-border text-muted-foreground hover:text-foreground disabled:hover:text-muted-foreground"
                    }`}
                  >
                    <span className="tabular-nums">{index + 1}.</span>
                    <span className="ml-1">{item.label}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <div role="status" aria-live="polite" aria-atomic="true" className="mb-5">
          {error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}
        </div>

        <div className="relative">
          {loading ? (
            <div className="space-y-4" aria-busy="true" aria-live="polite">
              <div className="h-4 w-40 animate-pulse rounded bg-muted" />
              <div className="h-10 w-full animate-pulse rounded-lg bg-muted" />
              <div className="h-4 w-56 animate-pulse rounded bg-muted" />
              <div className="h-10 w-full animate-pulse rounded-lg bg-muted" />
              <div className="h-10 w-full animate-pulse rounded-lg bg-muted" />
              <p className="pt-2 text-sm text-muted-foreground">Loading setup…</p>
            </div>
          ) : (
            children
          )}
        </div>
      </div>
    </div>
  );
}

function AppointmentSetupWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const agentIdParam = searchParams.get("agentId")?.trim() ?? "";
  const connectorKeyParam = searchParams.get("connectorKey")?.trim() ?? "";

  const claims = useMemo((): SetupClaims | null => {
    if (!agentIdParam || !connectorKeyParam) {
      return null;
    }
    return {
      agentId: agentIdParam,
      connectorKey: connectorKeyParam,
    };
  }, [agentIdParam, connectorKeyParam]);

  const setupReturnPath = useMemo(() => {
    const params = new URLSearchParams();
    if (agentIdParam) params.set("agentId", agentIdParam);
    if (connectorKeyParam) params.set("connectorKey", connectorKeyParam);
    const query = params.toString();
    return query ? `/setup?${query}` : "/setup";
  }, [agentIdParam, connectorKeyParam]);

  const { data: session, isPending: sessionPending } = authClient.useSession();
  const isAuthenticated = Boolean(session?.user);

  const [step, setStep] = useState<Step>("config");
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [config, setConfig] = useState<ConnectorConfig>(defaultConfig);
  const [configDirty, setConfigDirty] = useState(false);
  const [connectorExists, setConnectorExists] = useState(false);
  const [rolesOpen, setRolesOpen] = useState(true);
  const [timezoneOptions, setTimezoneOptions] = useState<string[]>([
    ...APPOINTMENT_TIMEZONES,
  ]);
  const [entities, setEntities] = useState<EntityRow[]>([]);
  const [expandedEntityId, setExpandedEntityId] = useState<string | null>(null);
  const [availabilityDrafts, setAvailabilityDrafts] = useState<
    Record<string, Record<number, AvailabilityRule[]>>
  >({});
  const [savedAvailabilityId, setSavedAvailabilityId] = useState<string | null>(
    null,
  );

  const agentId = claims?.agentId ?? "";

  const loadConnector = useCallback(async () => {
    if (!agentIdParam || !connectorKeyParam) {
      setLoading(false);
      setError("Missing setup params. Return to Agentblit and try again.");
      return;
    }

    const queryClaims: SetupClaims = {
      agentId: agentIdParam,
      connectorKey: connectorKeyParam,
    };

    const browserTimezone =
      typeof Intl !== "undefined"
        ? Intl.DateTimeFormat().resolvedOptions().timeZone?.trim() || ""
        : "";
    if (browserTimezone) {
      setTimezoneOptions((current) =>
        current.includes(browserTimezone)
          ? current
          : [browserTimezone, ...current],
      );
    }

    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/connectors/${encodeURIComponent(queryClaims.agentId)}?${setupQuery(queryClaims)}`,
        { credentials: "include" },
      );
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        connector?: {
          entityLabel: string;
          timezone: string;
          slotDurationMinutes: number;
          roles?: Array<{ id: string; name: string; description: string }>;
          entities: EntityRow[];
        } | null;
      };

      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Failed to load appointment connector");
      }

      if (data.connector) {
        const savedTimezone = data.connector.timezone;
        setTimezoneOptions((current) =>
          current.includes(savedTimezone)
            ? current
            : [savedTimezone, ...current],
        );
        setConfig({
          entityLabel: data.connector.entityLabel,
          timezone: savedTimezone,
          slotDurationMinutes: data.connector.slotDurationMinutes,
          roles: data.connector.roles ?? [],
        });
        setConfigDirty(false);
        setConnectorExists(true);
        setEntities(data.connector.entities);
        setAvailabilityDrafts(
          Object.fromEntries(
            data.connector.entities.map((entity) => [
              entity.id,
              availabilityMapFromRules(entity.availabilityRules),
            ]),
          ),
        );
        if (data.connector.entities.length > 0) {
          setExpandedEntityId(data.connector.entities[0]?.id ?? null);
        }
      } else if (browserTimezone) {
        setConnectorExists(false);
        setConfig((current) => ({
          ...current,
          timezone: browserTimezone,
        }));
        setConfigDirty(true);
      } else {
        setConnectorExists(false);
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load appointment connector",
      );
    } finally {
      setLoading(false);
    }
  }, [agentIdParam, connectorKeyParam]);

  useEffect(() => {
    if (sessionPending) return;
    if (!isAuthenticated) {
      router.replace(
        `/login?next=${encodeURIComponent(setupReturnPath)}`,
      );
      return;
    }
    queueMicrotask(() => {
      void loadConnector();
    });
  }, [
    sessionPending,
    isAuthenticated,
    loadConnector,
    router,
    setupReturnPath,
  ]);

  const isBusy = pendingAction !== null;

  async function switchAccount() {
    await authClient.signOut();
    router.replace(`/login?next=${encodeURIComponent(setupReturnPath)}`);
  }

  async function saveConfig(finalize = false) {
    if (!claims || !agentId) {
      setError("Missing setup params. Return to Agentblit and try again.");
      return false;
    }

    const roles = config.roles
      .map((role) => ({
        id: role.id,
        name: role.name.trim(),
        description: role.description.trim(),
      }))
      .filter((role) => role.name.length > 0);

    setPendingAction(finalize ? "finalize" : "config");
    setError("");
    try {
      const res = await fetch(
        `/api/connectors/${encodeURIComponent(agentId)}?${setupQuery(claims)}`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entityLabel: config.entityLabel,
            timezone: config.timezone,
            slotDurationMinutes: config.slotDurationMinutes,
            roles,
            finalize,
          }),
        },
      );
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        connector?: {
          roles?: Array<{ id: string; name: string; description: string }>;
        };
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Failed to save appointment connector");
      }

      setConfig((current) => ({
        ...current,
        roles: data.connector?.roles ?? roles,
      }));
      setConfigDirty(false);
      setConnectorExists(true);

      if (finalize) {
        window.location.href = `/api/setup/finish?${setupQuery(claims)}`;
      }
      return true;
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Failed to save appointment connector",
      );
      return false;
    } finally {
      setPendingAction(null);
    }
  }

  async function handleConfigNext(event?: FormEvent) {
    event?.preventDefault();
    const saved = await saveConfig(false);
    if (saved) {
      setStep("entities");
    }
  }

  async function goToStep(next: Step) {
    if (next === step) return;
    setError("");

    // Persist settings when leaving Settings via step nav (or if never saved).
    if (step === "config" && next !== "config") {
      if (configDirty || !connectorExists) {
        const saved = await saveConfig(false);
        if (!saved) return;
      }
    }

    setStep(next);
  }

  function updateConfig(
    updater: (current: ConnectorConfig) => ConnectorConfig,
  ) {
    setConfig((current) => updater(current));
    setConfigDirty(true);
  }

  async function handleAddEntity(input: {
    name: string;
    description: string;
    roleIds: string[];
  }) {
    if (!claims) {
      setError("Missing setup params. Return to Agentblit and try again.");
      throw new Error("Missing setup params");
    }

    setPendingAction("add-entity");
    setError("");
    try {
      const res = await fetch(
        `/api/connectors/${encodeURIComponent(agentId)}/entities?${setupQuery(claims)}`,
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
      setAvailabilityDrafts((current) => ({
        ...current,
        [data.entity!.id]: emptyAvailabilityByDay(),
      }));
      setExpandedEntityId(data.entity.id);
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
    if (!claims) {
      setError("Missing setup params. Return to Agentblit and try again.");
      throw new Error("Missing setup params");
    }

    setPendingAction(`edit-entity:${input.entityId}`);
    setError("");
    try {
      const res = await fetch(
        `/api/connectors/${encodeURIComponent(agentId)}/entities/${encodeURIComponent(input.entityId)}?${setupQuery(claims)}`,
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
    if (!claims) {
      setError("Missing setup params. Return to Agentblit and try again.");
      return;
    }
    setPendingAction(`delete-entity:${entityId}`);
    setError("");
    try {
      const res = await fetch(
        `/api/connectors/${encodeURIComponent(agentId)}/entities/${encodeURIComponent(entityId)}?${setupQuery(claims)}`,
        { method: "DELETE", credentials: "include" },
      );
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Failed to delete entity");
      }

      setEntities((current) => current.filter((entity) => entity.id !== entityId));
      setAvailabilityDrafts((current) => {
        const next = { ...current };
        delete next[entityId];
        return next;
      });
      if (expandedEntityId === entityId) {
        setExpandedEntityId(null);
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

  function updateAvailabilityDraft(
    entityId: string,
    dayOfWeek: number,
    updater: (rules: AvailabilityRule[]) => AvailabilityRule[],
  ) {
    setSavedAvailabilityId(null);
    setAvailabilityDrafts((current) => {
      const entityMap = current[entityId] ?? emptyAvailabilityByDay();
      return {
        ...current,
        [entityId]: {
          ...entityMap,
          [dayOfWeek]: updater(entityMap[dayOfWeek] ?? []),
        },
      };
    });
  }

  async function handleSaveAvailability(entityId: string) {
    if (!claims) {
      setError("Missing setup params. Return to Agentblit and try again.");
      return;
    }
    const draft = availabilityDrafts[entityId] ?? emptyAvailabilityByDay();
    const rules = rulesFromAvailabilityMap(draft);

    setPendingAction(`availability:${entityId}`);
    setError("");
    setSavedAvailabilityId(null);
    try {
      const res = await fetch(
        `/api/connectors/${encodeURIComponent(agentId)}/entities/${encodeURIComponent(entityId)}/availability?${setupQuery(claims)}`,
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
          entity.id === entityId
            ? { ...entity, availabilityRules: data.rules ?? rules }
            : entity,
        ),
      );
      setSavedAvailabilityId(entityId);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Failed to save availability",
      );
    } finally {
      setPendingAction(null);
    }
  }

  async function handleFinalize(event?: FormEvent) {
    event?.preventDefault();
    if (entities.length === 0) {
      setError(`Add at least one ${config.entityLabel.toLowerCase()}`);
      setStep("entities");
      return;
    }

    const missingAvailability = entities.some(
      (entity) => (entity.availabilityRules?.length ?? 0) === 0,
    );
    if (missingAvailability) {
      setError("Configure availability for every entity before finishing");
      setStep("availability");
      return;
    }

    await saveConfig(true);
  }

  const shellLoading = sessionPending || !isAuthenticated || loading;

  return (
    <SetupShell
      step={step}
      onStepChange={
        shellLoading
          ? undefined
          : (next) => {
              void goToStep(next);
            }
      }
      error={error}
      loading={shellLoading}
      email={session?.user?.email ?? undefined}
      onSwitchAccount={
        isAuthenticated ? () => void switchAccount() : undefined
      }
    >
      {isAuthenticated && step === "config" ? (
        <form
          className="flex flex-col space-y-6 rounded-xl border border-border bg-card p-5 shadow-sm"
          onSubmit={(event) => void handleConfigNext(event)}
        >
          <div>
            <label className={labelClassName} htmlFor="entity-label">
              Entity name
            </label>
            <input
              id="entity-label"
              className={inputClassName}
              value={config.entityLabel}
              onChange={(event) =>
                updateConfig((current) => ({
                  ...current,
                  entityLabel: event.target.value,
                }))
              }
              placeholder="Doctor"
            />
            <p className={hintClassName}>
              All entities in this connector share one type, such as Doctor or
              Teacher.
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
                {config.roles.length > 0 ? (
                  <span className="ml-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
                    {config.roles.length}
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                className={buttonOutlineClassName + " h-8 px-3 text-xs"}
                disabled={isBusy}
                onClick={(event) => {
                  event.preventDefault();
                  setRolesOpen(true);
                  updateConfig((current) => ({
                    ...current,
                    roles: [...current.roles, { name: "", description: "" }],
                  }));
                }}
              >
                Add role
              </button>
            </div>
            {rolesOpen ? (
              config.roles.length === 0 ? (
                <p className={hintClassName + " !mt-0"}>
                  Optionally define valid roles (for example Cardiologist or
                  Pediatrician). Entities can pick one or more of these later.
                </p>
              ) : (
                <ul className="space-y-3">
                  {config.roles.map((role, index) => (
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
                            updateConfig((current) => ({
                              ...current,
                              roles: current.roles.map((item, i) =>
                                i === index ? { ...item, name } : item,
                              ),
                            }));
                          }}
                          placeholder="Role name"
                          aria-label={`Role ${index + 1} name`}
                          disabled={isBusy}
                        />
                        <button
                          type="button"
                          className="inline-flex h-10 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-border bg-card px-3 text-sm text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={isBusy}
                          aria-label={`Remove role ${index + 1}`}
                          onClick={(event) => {
                            event.preventDefault();
                            updateConfig((current) => ({
                              ...current,
                              roles: current.roles.filter((_, i) => i !== index),
                            }));
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
                          updateConfig((current) => ({
                            ...current,
                            roles: current.roles.map((item, i) =>
                              i === index ? { ...item, description } : item,
                            ),
                          }));
                        }}
                        placeholder="Role description (optional)"
                        aria-label={`Role ${index + 1} description`}
                        disabled={isBusy}
                        rows={2}
                      />
                    </li>
                  ))}
                </ul>
              )
            ) : config.roles.length > 0 ? (
              <p className={hintClassName + " !mt-0"}>
                {config.roles.length} role
                {config.roles.length === 1 ? "" : "s"} configured. Expand to
                edit.
              </p>
            ) : (
              <p className={hintClassName + " !mt-0"}>
                Optionally define valid roles. Expand or use Add role to start.
              </p>
            )}
          </div>

          <div>
            <label className={labelClassName} htmlFor="timezone">
              Business timezone
            </label>
            <select
              id="timezone"
              className={inputClassName}
              value={config.timezone}
              onChange={(event) =>
                updateConfig((current) => ({
                  ...current,
                  timezone: event.target.value,
                }))
              }
            >
              {timezoneOptions.map((timezone) => (
                <option key={timezone} value={timezone}>
                  {timezone}
                </option>
              ))}
            </select>
            <p className={hintClassName}>
              Availability windows are interpreted in this timezone. Chat users
              can each use their own local timezone when booking.
            </p>
          </div>

          <div>
            <label className={labelClassName} htmlFor="slot-duration">
              Slot duration
            </label>
            <select
              id="slot-duration"
              className={inputClassName}
              value={config.slotDurationMinutes}
              onChange={(event) =>
                updateConfig((current) => ({
                  ...current,
                  slotDurationMinutes: Number(event.target.value),
                }))
              }
            >
              {APPOINTMENT_SLOT_DURATION_OPTIONS.map((option) => (
                <option key={option.minutes} value={option.minutes}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className={`${footerClassName} justify-end`}>
            <button
              type="submit"
              className={buttonPrimaryClassName}
              disabled={isBusy}
            >
              {pendingAction === "config" ? "Saving…" : "Continue"}
            </button>
          </div>
        </form>
      ) : null}

      {isAuthenticated && step === "entities" ? (
        <div className="flex flex-col space-y-6">
          <EntityManager
            entityLabel={config.entityLabel}
            entities={entities}
            availableRoles={config.roles.filter(
              (role): role is { id: string; name: string; description: string } =>
                Boolean(role.id && role.name.trim()),
            )}
            pendingAction={pendingAction}
            disabled={isBusy}
            emptyMessage={`No ${config.entityLabel.toLowerCase()}s added yet.`}
            onAdd={handleAddEntity}
            onUpdate={handleUpdateEntity}
            onDelete={handleDeleteEntity}
            onValidationError={setError}
          />

          <div className={footerClassName}>
            <button
              type="button"
              className={buttonOutlineClassName}
              onClick={(event) => {
                event.preventDefault();
                void goToStep("config");
              }}
              disabled={isBusy}
            >
              Back
            </button>
            <button
              type="button"
              className={buttonPrimaryClassName}
              onClick={(event) => {
                event.preventDefault();
                void goToStep("availability");
              }}
              disabled={isBusy || entities.length === 0}
            >
              Continue
            </button>
          </div>
        </div>
      ) : null}

      {isAuthenticated && step === "availability" ? (
        <form
          className="flex flex-col space-y-6"
          onSubmit={(event) => void handleFinalize(event)}
        >
          <div>
            {entities.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Add entities before configuring availability.
              </p>
            ) : (
              <div className="space-y-3">
                {entities.map((entity) => {
                  const open = expandedEntityId === entity.id;
                  const draft =
                    availabilityDrafts[entity.id] ?? emptyAvailabilityByDay();

                  return (
                    <div
                      key={entity.id}
                      className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
                    >
                      <button
                        type="button"
                        className="flex w-full cursor-pointer items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/60"
                        aria-expanded={open}
                        onClick={(event) => {
                          event.preventDefault();
                          setExpandedEntityId(open ? null : entity.id);
                        }}
                      >
                        <span className="w-3 shrink-0 text-xs text-muted-foreground">
                          {open ? "▾" : "▸"}
                        </span>
                        <span className="text-sm font-semibold text-foreground">
                          {entity.name}
                        </span>
                      </button>

                      {open ? (
                        <div className="border-t border-border px-4 py-4">
                          <AvailabilityEditor
                            draft={draft}
                            onChange={(dayOfWeek, updater) =>
                              updateAvailabilityDraft(
                                entity.id,
                                dayOfWeek,
                                updater,
                              )
                            }
                            onSave={() => {
                              void handleSaveAvailability(entity.id);
                            }}
                            saving={
                              pendingAction === `availability:${entity.id}`
                            }
                            saved={savedAvailabilityId === entity.id}
                            disabled={isBusy}
                          />
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className={footerClassName}>
            <button
              type="button"
              className={buttonOutlineClassName}
              onClick={(event) => {
                event.preventDefault();
                void goToStep("entities");
              }}
              disabled={isBusy}
            >
              Back
            </button>
            <button
              type="submit"
              className={buttonPrimaryClassName}
              disabled={isBusy}
            >
              {pendingAction === "finalize" ? "Saving…" : "Save and finish"}
            </button>
          </div>
        </form>
      ) : null}
    </SetupShell>
  );
}

export default function AppointmentSetupPage() {
  return (
    <Suspense
      fallback={
        <SetupShell step="config" error="" loading>
          {null}
        </SetupShell>
      }
    >
      <AppointmentSetupWizard />
    </Suspense>
  );
}
