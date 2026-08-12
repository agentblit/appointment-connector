"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EntityManager } from "@/components/entity-manager";
import { useWorkspace } from "@/lib/dashboard/workspace-context";
import type { EntityRow, WorkspaceRole } from "@/lib/dashboard/types";

function pluralize(label: string) {
  if (label.toLowerCase().endsWith("s")) return label;
  return `${label}s`;
}

export default function EntitiesPage() {
  const router = useRouter();
  const {
    entities,
    setEntities,
    entityLabel,
    roles,
    setError,
    setNotice,
  } = useWorkspace();
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  async function handleAddEntity(input: {
    name: string;
    description: string;
    roleIds: string[];
  }) {
    setPendingAction("add-entity");
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/workspace/entities", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: input.name,
          description: input.description || undefined,
          roleIds: input.roleIds,
          meetingMode: "offline",
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
    roleIds: string[];
  }) {
    setPendingAction(`edit-entity:${input.entityId}`);
    setError("");
    setNotice("");
    try {
      const existing = entities.find((entity) => entity.id === input.entityId);
      const res = await fetch(
        `/api/workspace/entities/${encodeURIComponent(input.entityId)}`,
        {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: input.name,
            description: input.description || undefined,
            roleIds: input.roleIds,
            meetingMode: existing?.meetingMode ?? "offline",
            locationAddress: existing?.locationAddress || undefined,
            locationMapsUrl: existing?.locationMapsUrl || undefined,
          }),
        },
      );
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        entity?: EntityRow;
        google?: {
          connected?: boolean;
          accountEmail?: string | null;
        };
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
                  meetingMode: data.entity!.meetingMode ?? entity.meetingMode,
                  locationAddress:
                    data.entity!.locationAddress ?? entity.locationAddress,
                  locationMapsUrl:
                    data.entity!.locationMapsUrl ?? entity.locationMapsUrl,
                  googleConnected:
                    data.google?.connected ?? entity.googleConnected,
                  googleAccountEmail:
                    data.google?.accountEmail ?? entity.googleAccountEmail,
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
    setNotice("");
    try {
      const res = await fetch(
        `/api/workspace/entities/${encodeURIComponent(entityId)}`,
        { method: "DELETE", credentials: "include" },
      );
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Failed to delete entity");
      }
      setEntities((current) =>
        current.filter((entity) => entity.id !== entityId),
      );
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

  return (
    <div className="space-y-2">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-foreground">
          {pluralize(entityLabel)}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Add and manage bookable {entityLabel.toLowerCase()}s. Open one to
          configure meeting mode, availability, and bookings.
        </p>
      </div>
      <EntityManager
        entityLabel={entityLabel}
        entities={entities}
        availableRoles={roles
          .filter(
            (role): role is WorkspaceRole & { id: string } =>
              Boolean(role.id?.trim()) && Boolean(role.name.trim()),
          )
          .map((role) => ({
            id: role.id,
            name: role.name,
            description: role.description,
          }))}
        pendingAction={pendingAction}
        emptyMessage={`No ${entityLabel.toLowerCase()}s yet. Add one above.`}
        onAdd={handleAddEntity}
        onUpdate={handleUpdateEntity}
        onDelete={handleDeleteEntity}
        onSelect={(entityId) =>
          router.push(`/entities/${encodeURIComponent(entityId)}`)
        }
        onValidationError={setError}
      />
    </div>
  );
}
