"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  AvailabilityEditor,
  availabilityMapFromRules,
  emptyAvailabilityByDay,
  rulesFromAvailabilityMap,
  type AvailabilityRule,
} from "@/components/availability-editor";
import {
  GoogleIntegrationPanel,
  MeetingModeFields,
} from "@/components/meeting-mode-fields";
import { useWorkspace } from "@/lib/dashboard/workspace-context";
import {
  buttonPrimaryClassName,
  formatBookingRange,
  type BookingRow,
  type EntityRow,
} from "@/lib/dashboard/types";

function pluralize(label: string) {
  if (label.toLowerCase().endsWith("s")) return label;
  return `${label}s`;
}

export default function EntityDetailPage() {
  const params = useParams<{ entityId: string }>();
  const entityId = params.entityId;
  const {
    entities,
    setEntities,
    entityLabel,
    timezone,
    setTimezone,
    ready,
    googleOAuthConfigured,
    setError,
    setNotice,
  } = useWorkspace();

  const selectedEntity = useMemo(
    () => entities.find((entity) => entity.id === entityId) ?? null,
    [entities, entityId],
  );

  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [availabilityDraft, setAvailabilityDraft] = useState<
    Record<number, AvailabilityRule[]>
  >(emptyAvailabilityByDay());
  const [savingAvailability, setSavingAvailability] = useState(false);
  const [savedAvailability, setSavedAvailability] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(true);

  const [meetingMode, setMeetingMode] = useState<"online" | "offline">("offline");
  const [locationAddress, setLocationAddress] = useState("");
  const [locationMapsUrl, setLocationMapsUrl] = useState("");
  const [savingMeeting, setSavingMeeting] = useState(false);
  const [meetingDirty, setMeetingDirty] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedEntity) return;
    setMeetingMode(
      selectedEntity.meetingMode === "online" ? "online" : "offline",
    );
    setLocationAddress(selectedEntity.locationAddress ?? "");
    setLocationMapsUrl(selectedEntity.locationMapsUrl ?? "");
    setMeetingDirty(false);
  }, [selectedEntity]);

  const loadEntityDetail = useCallback(async () => {
    if (!selectedEntity) {
      setLoadingDetail(false);
      return;
    }
    setLoadingDetail(true);
    setError("");
    setNotice("");
    setSavedAvailability(false);
    setAvailabilityDraft(
      availabilityMapFromRules(selectedEntity.availabilityRules ?? []),
    );
    try {
      const res = await fetch(
        `/api/workspace/entities/${encodeURIComponent(selectedEntity.id)}/bookings`,
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
      setLoadingDetail(false);
    }
  }, [selectedEntity, setError, setNotice, setTimezone]);

  useEffect(() => {
    if (!ready) return;
    queueMicrotask(() => {
      void loadEntityDetail();
    });
  }, [ready, entityId, loadEntityDetail]);

  async function handleSaveMeeting(event?: FormEvent) {
    event?.preventDefault();
    if (!selectedEntity) return;

    if (
      meetingMode === "offline" &&
      !locationAddress.trim() &&
      !locationMapsUrl.trim()
    ) {
      setError("Offline mode requires an address and/or Google Maps URL");
      return;
    }

    setSavingMeeting(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch(
        `/api/workspace/entities/${encodeURIComponent(selectedEntity.id)}`,
        {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: selectedEntity.name,
            description: selectedEntity.description || undefined,
            roleIds: selectedEntity.roleIds ?? [],
            meetingMode,
            locationAddress:
              meetingMode === "offline" ? locationAddress.trim() || undefined : undefined,
            locationMapsUrl:
              meetingMode === "offline" ? locationMapsUrl.trim() || undefined : undefined,
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
        throw new Error(data.error ?? "Failed to save meeting settings");
      }

      setEntities((current) =>
        current.map((entity) =>
          entity.id === selectedEntity.id
            ? {
                ...entity,
                meetingMode: data.entity!.meetingMode ?? meetingMode,
                locationAddress: data.entity!.locationAddress,
                locationMapsUrl: data.entity!.locationMapsUrl,
                googleConnected:
                  data.google?.connected ?? entity.googleConnected,
                googleAccountEmail:
                  data.google?.accountEmail ?? entity.googleAccountEmail,
              }
            : entity,
        ),
      );
      setMeetingDirty(false);
      setNotice("Meeting settings saved.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Failed to save meeting settings",
      );
    } finally {
      setSavingMeeting(false);
    }
  }

  function connectGoogle(id: string) {
    window.location.href = `/api/workspace/entities/${encodeURIComponent(id)}/integrations/google/connect`;
  }

  async function disconnectGoogle(id: string) {
    setPendingAction(`disconnect-google:${id}`);
    setError("");
    setNotice("");
    try {
      const res = await fetch(
        `/api/workspace/entities/${encodeURIComponent(id)}/integrations/google`,
        { method: "DELETE", credentials: "include" },
      );
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Failed to disconnect Google");
      }
      setEntities((current) =>
        current.map((entity) =>
          entity.id === id
            ? {
                ...entity,
                googleConnected: false,
                googleAccountEmail: null,
              }
            : entity,
        ),
      );
    } catch (disconnectError) {
      setError(
        disconnectError instanceof Error
          ? disconnectError.message
          : "Failed to disconnect Google",
      );
    } finally {
      setPendingAction(null);
    }
  }

  async function handleSaveAvailability(event?: FormEvent) {
    event?.preventDefault();
    if (!entityId) return;
    const rules = rulesFromAvailabilityMap(availabilityDraft);
    setSavingAvailability(true);
    setSavedAvailability(false);
    setError("");
    try {
      const res = await fetch(
        `/api/workspace/entities/${encodeURIComponent(entityId)}/availability`,
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

  const listLabel = pluralize(entityLabel);

  if (ready && !selectedEntity) {
    return (
      <div className="space-y-4">
        <Link
          href="/entities"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to {listLabel.toLowerCase()}
        </Link>
        <p className="text-sm text-muted-foreground">
          {entityLabel} not found.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="border-b border-border px-5 py-3.5">
          <h2 className="text-sm font-semibold text-foreground">Meeting mode</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Choose online Google Meet or an offline location for this{" "}
            {entityLabel.toLowerCase()}.
          </p>
        </div>
        <form
          className="space-y-3 px-5 py-4"
          onSubmit={(event) => void handleSaveMeeting(event)}
        >
          <MeetingModeFields
            meetingMode={meetingMode}
            onMeetingModeChange={(mode) => {
              setMeetingMode(mode);
              setMeetingDirty(true);
            }}
            locationAddress={locationAddress}
            onLocationAddressChange={(value) => {
              setLocationAddress(value);
              setMeetingDirty(true);
            }}
            locationMapsUrl={locationMapsUrl}
            onLocationMapsUrlChange={(value) => {
              setLocationMapsUrl(value);
              setMeetingDirty(true);
            }}
            disabled={savingMeeting || pendingAction !== null}
            onlineHint={
              selectedEntity?.googleConnected
                ? null
                : "Connect Google below so Meet links can be created when bookings are made."
            }
          />
          {meetingMode === "online" && selectedEntity ? (
            <GoogleIntegrationPanel
              entityId={selectedEntity.id}
              connected={selectedEntity.googleConnected}
              accountEmail={selectedEntity.googleAccountEmail}
              googleConfigured={googleOAuthConfigured}
              disabled={savingMeeting || pendingAction !== null}
              onConnectGoogle={connectGoogle}
              onDisconnectGoogle={disconnectGoogle}
            />
          ) : null}
          <div className="flex justify-end">
            <button
              type="submit"
              className={buttonPrimaryClassName + " h-9 px-3 text-xs"}
              disabled={savingMeeting || !meetingDirty}
            >
              {savingMeeting ? "Saving…" : "Save meeting settings"}
            </button>
          </div>
        </form>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="border-b border-border px-5 py-3.5">
          <h2 className="text-sm font-semibold text-foreground">Availability</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Times in {timezone}
          </p>
        </div>
        <div className="px-5 py-4">
          {loadingDetail && !selectedEntity ? (
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
        {loadingDetail ? (
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
                    {formatBookingRange(booking.startLocal, booking.endLocal)}
                    <span className="ml-1 font-sans text-muted-foreground/70">
                      ({timezone})
                    </span>
                  </p>
                  {booking.meetingUrl ? (
                    <a
                      href={booking.meetingUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-block text-xs font-medium text-primary hover:underline"
                    >
                      Join Google Meet
                    </a>
                  ) : null}
                  {!booking.meetingUrl && booking.locationAddress ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {booking.locationAddress}
                    </p>
                  ) : null}
                  {!booking.meetingUrl && booking.locationMapsUrl ? (
                    <a
                      href={booking.locationMapsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-block text-xs font-medium text-primary hover:underline"
                    >
                      Open in Google Maps
                    </a>
                  ) : null}
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
  );
}
