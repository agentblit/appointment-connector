import { NextResponse } from "next/server";
import { isValidIanaTimezone } from "@/lib/appointment/appointment-utils";
import { isGoogleOAuthConfigured } from "@/lib/appointment/meeting/google";
import {
  bookingPeriodFromEntity,
  ensureWorkspaceForUser,
  getGoogleIntegrationForEntity,
  getWorkspaceWithEntities,
  listApiKeys,
  serializeBookingPeriod,
  updateWorkspace,
} from "@/lib/appointment/repo";
import { appointmentWorkspaceConfigSchema } from "@/lib/appointment/tools";
import { requireDashboardAuth } from "@/lib/auth/require-dashboard-auth";

/** Load (or create) the user's workspace with entities. */
export async function GET(request: Request) {
  const auth = await requireDashboardAuth(request);
  if (!auth.ok) {
    return auth.response;
  }

  const timezoneParam = new URL(request.url).searchParams.get("timezone")?.trim();
  const preferredTimezone =
    timezoneParam && isValidIanaTimezone(timezoneParam)
      ? timezoneParam
      : undefined;

  const workspace = await ensureWorkspaceForUser({
    userId: auth.userId,
    timezone: preferredTimezone,
  });
  const full = await getWorkspaceWithEntities(workspace.id);
  if (!full) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const apiKeys = await listApiKeys(workspace.id);

  const entities = await Promise.all(
    full.entities.map(async (entity) => {
      const google = await getGoogleIntegrationForEntity(entity.id);
      return {
        id: entity.id,
        name: entity.name,
        description: entity.description,
        roleIds: entity.roleIds ?? [],
        meetingMode: entity.meetingMode,
        locationAddress: entity.locationAddress,
        locationMapsUrl: entity.locationMapsUrl,
        googleConnected: google.connected,
        googleAccountEmail: google.connected ? google.accountEmail : null,
        availabilityRules: entity.availabilityRules.map((rule) => ({
          id: rule.id,
          dayOfWeek: rule.dayOfWeek,
          startTime: rule.startTime,
          endTime: rule.endTime,
        })),
        dateRules: entity.dateRules,
        bookingPeriod: serializeBookingPeriod(bookingPeriodFromEntity(entity)),
      };
    }),
  );

  return NextResponse.json({
    ok: true,
    googleOAuthConfigured: isGoogleOAuthConfigured(),
    workspace: {
      id: full.id,
      entityLabel: full.entityLabel,
      timezone: full.timezone,
      slotDurationMinutes: full.slotDurationMinutes,
      roles: full.roles.map((role) => ({
        id: role.id,
        name: role.name,
        description: role.description,
      })),
      entities,
      apiKeys: apiKeys.map((key) => ({
        id: key.id,
        label: key.label,
        createdAt: key.createdAt.toISOString(),
      })),
    },
  });
}

/** Update workspace settings (entity label, timezone, slot duration, roles). */
export async function PUT(request: Request) {
  const auth = await requireDashboardAuth(request);
  if (!auth.ok) {
    return auth.response;
  }

  const workspace = await ensureWorkspaceForUser({ userId: auth.userId });

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const bodyParse = appointmentWorkspaceConfigSchema.safeParse(json);
  if (!bodyParse.success) {
    const issue = bodyParse.error.issues[0];
    return NextResponse.json(
      { ok: false, error: issue?.message ?? "Invalid request body" },
      { status: 400 },
    );
  }

  const body = bodyParse.data;
  const updated = await updateWorkspace({
    workspaceId: workspace.id,
    userId: auth.userId,
    entityLabel: body.entityLabel,
    timezone: body.timezone,
    slotDurationMinutes: body.slotDurationMinutes,
    roles: body.roles,
  });
  if (!updated) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    workspace: {
      id: updated.workspace.id,
      entityLabel: updated.workspace.entityLabel,
      timezone: updated.workspace.timezone,
      slotDurationMinutes: updated.workspace.slotDurationMinutes,
      roles: updated.roles.map((role) => ({
        id: role.id,
        name: role.name,
        description: role.description,
      })),
    },
  });
}
