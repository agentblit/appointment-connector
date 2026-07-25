"use client";

import { Check, ChevronDown, ChevronRight, Pencil, Trash2, X } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";

export type EntityManagerRole = {
  id: string;
  name: string;
  description: string;
};

export type EntityManagerItem = {
  id: string;
  name: string;
  description?: string | null;
  roleIds?: string[] | null;
};

function pluralize(label: string) {
  if (label.toLowerCase().endsWith("s")) return label;
  return label + "s";
}

type EntityManagerProps = {
  entityLabel: string;
  entities: EntityManagerItem[];
  /** Valid roles from connector settings; empty means roles are not used. */
  availableRoles?: EntityManagerRole[];
  pendingAction: string | null;
  loading?: boolean;
  disabled?: boolean;
  emptyMessage?: string;
  onAdd: (input: {
    name: string;
    description: string;
    roleIds: string[];
  }) => void | Promise<void>;
  onUpdate: (input: {
    entityId: string;
    name: string;
    description: string;
    roleIds: string[];
  }) => void | Promise<void>;
  onDelete: (entityId: string) => void | Promise<void>;
  onSelect?: (entityId: string) => void;
  onValidationError?: (message: string) => void;
};

function RoleChips({
  roleIds,
  availableRoles,
}: {
  roleIds: string[];
  availableRoles: EntityManagerRole[];
}) {
  if (roleIds.length === 0) return null;
  const labels = roleIds.map(
    (id) => availableRoles.find((role) => role.id === id)?.name ?? id,
  );
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {labels.map((label, index) => (
        <span
          key={`${roleIds[index]}-${label}`}
          className="inline-flex rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary"
        >
          {label}
        </span>
      ))}
    </div>
  );
}

function RoleMultiSelect({
  id,
  selected,
  onChange,
  availableRoles,
  disabled,
}: {
  id?: string;
  selected: string[];
  onChange: (roles: string[]) => void;
  availableRoles: EntityManagerRole[];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function toggle(roleId: string) {
    if (selected.includes(roleId)) {
      onChange(selected.filter((id) => id !== roleId));
      return;
    }
    onChange([...selected, roleId]);
  }

  function remove(roleId: string, event: ReactMouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    onChange(selected.filter((id) => id !== roleId));
  }

  function roleLabel(roleId: string) {
    return availableRoles.find((role) => role.id === roleId)?.name ?? roleId;
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        id={id}
        className={`flex min-h-10 w-full cursor-pointer items-center gap-2 rounded-lg border border-border bg-muted px-2.5 py-1.5 text-left transition-shadow focus:border-ring focus:bg-card focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 ${
          open ? "border-ring bg-card ring-2 ring-ring/30" : ""
        }`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {selected.length === 0 ? (
            <span className="px-0.5 text-sm text-placeholder-foreground">
              Roles (optional)
            </span>
          ) : (
            selected.map((roleId) => {
              const label = roleLabel(roleId);
              return (
                <span
                  key={roleId}
                  className="inline-flex max-w-full items-center gap-1 rounded-md bg-card px-2 py-0.5 text-xs font-medium text-foreground ring-1 ring-border"
                >
                  <span className="truncate">{label}</span>
                  <span
                    role="button"
                    tabIndex={-1}
                    className="inline-flex h-3.5 w-3.5 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label={`Remove ${label}`}
                    onClick={(event) => remove(roleId, event)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onChange(selected.filter((id) => id !== roleId));
                      }
                    }}
                  >
                    <X className="h-3 w-3" aria-hidden="true" />
                  </span>
                </span>
              );
            })
          )}
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-multiselectable="true"
          className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-border bg-card py-1 shadow-lg"
        >
          {availableRoles.map((role) => {
            const checked = selected.includes(role.id);
            return (
              <li key={role.id} role="option" aria-selected={checked}>
                <button
                  type="button"
                  className="flex w-full cursor-pointer items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-muted"
                  onClick={() => toggle(role.id)}
                >
                  <span
                    className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                      checked
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-muted"
                    }`}
                    aria-hidden="true"
                  >
                    {checked ? <Check className="h-3 w-3" /> : null}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-foreground">
                      {role.name}
                    </span>
                    {role.description ? (
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {role.description}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

export function EntityManager({
  entityLabel,
  entities,
  availableRoles = [],
  pendingAction,
  loading = false,
  disabled = false,
  emptyMessage,
  onAdd,
  onUpdate,
  onDelete,
  onSelect,
  onValidationError,
}: EntityManagerProps) {
  const [newEntityName, setNewEntityName] = useState("");
  const [newEntityDescription, setNewEntityDescription] = useState("");
  const [newEntityRoles, setNewEntityRoles] = useState<string[]>([]);
  const [editingEntityId, setEditingEntityId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editRoles, setEditRoles] = useState<string[]>([]);

  const isBusy = disabled || pendingAction !== null;
  const showRoles = availableRoles.length > 0;

  const inputCls =
    "h-10 w-full rounded-lg border border-border bg-muted px-3 text-sm text-foreground outline-none transition-shadow placeholder:text-placeholder-foreground focus:border-ring focus:bg-card focus:ring-2 focus:ring-ring/30";
  const textareaCls =
    "min-h-20 w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground outline-none transition-shadow placeholder:text-placeholder-foreground focus:border-ring focus:bg-card focus:ring-2 focus:ring-ring/30";
  const btnOutlineCls =
    "inline-flex h-9 cursor-pointer items-center justify-center rounded-lg border border-border bg-card px-3.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50";
  const btnPrimaryCls =
    "inline-flex h-9 cursor-pointer items-center justify-center rounded-lg bg-primary px-3.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";

  async function handleAdd(event: FormEvent) {
    event.preventDefault();
    if (!newEntityName.trim()) {
      onValidationError?.(`Enter a ${entityLabel.toLowerCase()} name`);
      return;
    }
    try {
      await onAdd({
        name: newEntityName.trim(),
        description: newEntityDescription.trim(),
        roleIds: showRoles ? newEntityRoles : [],
      });
      setNewEntityName("");
      setNewEntityDescription("");
      setNewEntityRoles([]);
    } catch {
      // Parent reports the error.
    }
  }

  function startEdit(entity: EntityManagerItem) {
    setEditingEntityId(entity.id);
    setEditName(entity.name);
    setEditDescription(entity.description ?? "");
    setEditRoles(entity.roleIds ?? []);
  }

  function cancelEdit() {
    setEditingEntityId(null);
    setEditName("");
    setEditDescription("");
    setEditRoles([]);
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (!editingEntityId) return;
    if (!editName.trim()) {
      onValidationError?.(`Enter a ${entityLabel.toLowerCase()} name`);
      return;
    }
    try {
      await onUpdate({
        entityId: editingEntityId,
        name: editName.trim(),
        description: editDescription.trim(),
        roleIds: showRoles ? editRoles : [],
      });
      cancelEdit();
    } catch {
      // Parent reports the error.
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <p className="mb-3 text-sm font-semibold text-foreground">
          Add {entityLabel.toLowerCase()}
        </p>
        <form className="flex flex-col gap-2" onSubmit={(e) => void handleAdd(e)}>
          <input
            id="entity-name"
            className={inputCls}
            value={newEntityName}
            onChange={(event) => setNewEntityName(event.target.value)}
            placeholder={`${entityLabel} name`}
            disabled={isBusy}
          />
          {showRoles ? (
            <RoleMultiSelect
              id="entity-roles"
              selected={newEntityRoles}
              onChange={setNewEntityRoles}
              availableRoles={availableRoles}
              disabled={isBusy}
            />
          ) : null}
          <textarea
            id="entity-description"
            className={textareaCls}
            value={newEntityDescription}
            onChange={(event) => setNewEntityDescription(event.target.value)}
            placeholder="Description (optional)"
            disabled={isBusy}
            rows={3}
          />
          <div className="flex justify-end">
            <button
              type="submit"
              className={btnPrimaryCls}
              disabled={isBusy || !newEntityName.trim()}
            >
              {pendingAction === "add-entity" ? "Adding…" : "Add"}
            </button>
          </div>
        </form>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-foreground">
          {pluralize(entityLabel)}
        </h2>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : entities.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-6 py-10 text-center">
            <p className="text-sm text-muted-foreground">
              {emptyMessage ??
                `No ${entityLabel.toLowerCase()}s yet. Add one above.`}
            </p>
          </div>
        ) : (
          <ul className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            {entities.map((entity, index) => {
              const editing = editingEntityId === entity.id;
              const entityRoles = entity.roleIds ?? [];

              if (editing) {
                return (
                  <li
                    key={entity.id}
                    className={`px-4 py-3 ${index !== 0 ? "border-t border-border" : ""}`}
                  >
                    <form
                      className="space-y-2"
                      onSubmit={(event) => void handleSave(event)}
                    >
                      <input
                        className={inputCls}
                        value={editName}
                        onChange={(event) => setEditName(event.target.value)}
                        placeholder="Name"
                        disabled={isBusy}
                        aria-label="Entity name"
                        autoFocus
                      />
                      {showRoles ? (
                        <RoleMultiSelect
                          selected={editRoles}
                          onChange={setEditRoles}
                          availableRoles={availableRoles}
                          disabled={isBusy}
                        />
                      ) : null}
                      <textarea
                        className={textareaCls}
                        value={editDescription}
                        onChange={(event) =>
                          setEditDescription(event.target.value)
                        }
                        placeholder="Description (optional)"
                        disabled={isBusy}
                        aria-label="Entity description"
                        rows={3}
                      />
                      <div className="flex gap-2 pt-1">
                        <button
                          type="submit"
                          className={btnPrimaryCls}
                          disabled={isBusy || !editName.trim()}
                        >
                          {pendingAction === `edit-entity:${entity.id}`
                            ? "Saving…"
                            : "Save"}
                        </button>
                        <button
                          type="button"
                          className={btnOutlineCls}
                          disabled={isBusy}
                          onClick={cancelEdit}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  </li>
                );
              }

              return (
                <li
                  key={entity.id}
                  className={`flex items-center gap-2 ${
                    index !== 0 ? "border-t border-border" : ""
                  }`}
                >
                  {onSelect ? (
                    <button
                      type="button"
                      className="min-w-0 flex-1 cursor-pointer px-4 py-3.5 text-left transition-colors hover:bg-muted/60"
                      onClick={() => onSelect(entity.id)}
                    >
                      <p className="text-sm font-medium text-foreground">
                        {entity.name}
                      </p>
                      <RoleChips
                        roleIds={entityRoles}
                        availableRoles={availableRoles}
                      />
                      {entity.description ? (
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                          {entity.description}
                        </p>
                      ) : null}
                    </button>
                  ) : (
                    <div className="min-w-0 flex-1 px-4 py-3.5">
                      <p className="text-sm font-medium text-foreground">
                        {entity.name}
                      </p>
                      <RoleChips
                        roleIds={entityRoles}
                        availableRoles={availableRoles}
                      />
                      {entity.description ? (
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                          {entity.description}
                        </p>
                      ) : null}
                    </div>
                  )}
                  <div className="flex shrink-0 items-center gap-1 pr-3">
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => startEdit(entity)}
                      disabled={isBusy}
                      aria-label={`Edit ${entity.name}`}
                    >
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => void onDelete(entity.id)}
                      disabled={isBusy}
                      aria-label={`Delete ${entity.name}`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                    {onSelect ? (
                      <ChevronRight
                        className="h-4 w-4 text-muted-foreground"
                        aria-hidden="true"
                      />
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
