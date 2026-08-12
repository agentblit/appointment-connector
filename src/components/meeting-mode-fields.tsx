"use client";

import { Link2 } from "lucide-react";

export function MeetingModeFields({
  meetingMode,
  onMeetingModeChange,
  locationAddress,
  onLocationAddressChange,
  locationMapsUrl,
  onLocationMapsUrlChange,
  disabled,
  onlineHint,
}: {
  meetingMode: "online" | "offline";
  onMeetingModeChange: (mode: "online" | "offline") => void;
  locationAddress: string;
  onLocationAddressChange: (value: string) => void;
  locationMapsUrl: string;
  onLocationMapsUrlChange: (value: string) => void;
  disabled?: boolean;
  onlineHint?: string | null;
}) {
  const inputCls =
    "h-10 w-full rounded-lg border border-border bg-muted px-3 text-sm text-foreground outline-none transition-shadow placeholder:text-placeholder-foreground focus:border-ring focus:bg-card focus:ring-2 focus:ring-ring/30";

  return (
    <div className="space-y-2">
      <div>
        <p className="mb-1.5 text-xs font-semibold text-foreground">
          Meeting mode
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className={`inline-flex h-9 w-full cursor-pointer items-center justify-center rounded-lg border px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              meetingMode === "offline"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card text-foreground hover:bg-muted"
            }`}
            disabled={disabled}
            onClick={() => onMeetingModeChange("offline")}
          >
            Offline
          </button>
          <button
            type="button"
            className={`inline-flex h-9 w-full cursor-pointer items-center justify-center rounded-lg border px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              meetingMode === "online"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card text-foreground hover:bg-muted"
            }`}
            disabled={disabled}
            onClick={() => onMeetingModeChange("online")}
          >
            Online
          </button>
        </div>
        {meetingMode === "online" && onlineHint ? (
          <p className="mt-1 text-xs text-muted-foreground">{onlineHint}</p>
        ) : null}
      </div>

      {meetingMode === "offline" ? (
        <>
          <input
            className={inputCls}
            value={locationAddress}
            onChange={(event) => onLocationAddressChange(event.target.value)}
            placeholder="Address (required if no Maps URL)"
            disabled={disabled}
          />
          <input
            className={inputCls}
            value={locationMapsUrl}
            onChange={(event) => onLocationMapsUrlChange(event.target.value)}
            placeholder="Google Maps URL (required if no address)"
            disabled={disabled}
          />
        </>
      ) : null}
    </div>
  );
}

export function GoogleIntegrationPanel({
  entityId,
  connected,
  accountEmail,
  googleConfigured,
  disabled,
  onConnectGoogle,
  onDisconnectGoogle,
}: {
  entityId: string;
  connected?: boolean;
  accountEmail?: string | null;
  googleConfigured?: boolean;
  disabled?: boolean;
  onConnectGoogle?: (entityId: string) => void;
  onDisconnectGoogle?: (entityId: string) => void | Promise<void>;
}) {
  const btnOutlineCls =
    "inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50";

  if (!googleConfigured) {
    return (
      <p className="text-xs text-muted-foreground">
        Google OAuth is not configured on this server.
      </p>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-muted/40 p-3">
      <p className="text-xs font-semibold text-foreground">Google Meet</p>
      {connected ? (
        <div className="mt-2 space-y-2">
          <p className="text-xs text-muted-foreground">
            Connected as{" "}
            <span className="font-medium text-foreground">
              {accountEmail?.trim() || "Google account"}
            </span>
          </p>
          <button
            type="button"
            className={btnOutlineCls}
            disabled={disabled}
            onClick={() => void onDisconnectGoogle?.(entityId)}
          >
            Disconnect Google
          </button>
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          <p className="text-xs text-muted-foreground">
            Connect Google Calendar to generate Meet links for bookings.
          </p>
          <button
            type="button"
            className={btnOutlineCls}
            disabled={disabled}
            onClick={() => onConnectGoogle?.(entityId)}
          >
            <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
            Connect Google
          </button>
        </div>
      )}
    </div>
  );
}
