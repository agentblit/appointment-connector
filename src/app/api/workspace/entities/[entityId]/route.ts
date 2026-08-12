import { NextResponse } from "next/server";
import {
  deleteEntity,
  ensureWorkspaceForUser,
  getEntityForWorkspace,
  getGoogleIntegrationForEntity,
  listRoles,
  resolveEntityRoleIds,
  updateEntity,
} from "@/lib/appointment/repo";
import {
  appointmentEntityMeetingSchema,
  appointmentEntitySchema,
} from "@/lib/appointment/tools";
import { requireDashboardAuth } from "@/lib/auth/require-dashboard-auth";

type RouteContext = {
  params: Promise<{ entityId: string }>;
};

export async function PUT(request: Request, context: RouteContext) {
  const { entityId } = await context.params;
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

  const bodyParse = appointmentEntitySchema.safeParse(json);
  if (!bodyParse.success) {
    const issue = bodyParse.error.issues[0];
    return NextResponse.json(
      { ok: false, error: issue?.message ?? "Invalid request body" },
      { status: 400 },
    );
  }

  const owned = await getEntityForWorkspace({
    workspaceId: workspace.id,
    entityId,
  });
  if (!owned) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const roles = await listRoles(workspace.id);
  const roleIdsResult = resolveEntityRoleIds({
    availableRoles: roles,
    selectedRoleIds: bodyParse.data.roleIds,
  });
  if (!roleIdsResult.ok) {
    return NextResponse.json(
      { ok: false, error: roleIdsResult.error },
      { status: 400 },
    );
  }

  // Only enforce offline location when switching to / saving offline meeting config
  // with explicit location fields present in the request body.
  const bodyRecord = (json ?? {}) as Record<string, unknown>;
  const isMeetingConfigSave =
    "meetingMode" in bodyRecord &&
    ("locationAddress" in bodyRecord ||
      "locationMapsUrl" in bodyRecord ||
      bodyRecord.meetingMode === "online");
  if (isMeetingConfigSave) {
    const meetingParse = appointmentEntityMeetingSchema.safeParse({
      meetingMode: bodyParse.data.meetingMode,
      locationAddress: bodyParse.data.locationAddress,
      locationMapsUrl: bodyParse.data.locationMapsUrl,
    });
    if (!meetingParse.success) {
      const issue = meetingParse.error.issues[0];
      return NextResponse.json(
        { ok: false, error: issue?.message ?? "Invalid meeting settings" },
        { status: 400 },
      );
    }
  }

  try {
    const updated = await updateEntity({
      entityId,
      name: bodyParse.data.name,
      description: bodyParse.data.description,
      roleIds: roleIdsResult.roleIds,
      meetingMode: bodyParse.data.meetingMode,
      locationAddress:
        bodyParse.data.meetingMode === "offline"
          ? bodyParse.data.locationAddress
          : null,
      locationMapsUrl:
        bodyParse.data.meetingMode === "offline"
          ? bodyParse.data.locationMapsUrl
          : null,
    });
    const google = await getGoogleIntegrationForEntity(entityId);
    return NextResponse.json({
      ok: true,
      entity: updated,
      google: {
        connected: google.connected,
        accountEmail: google.connected ? google.accountEmail : null,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update entity";
    if (message.includes("unique")) {
      return NextResponse.json(
        { ok: false, error: "An entity with this name already exists" },
        { status: 400 },
      );
    }
    throw error;
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const { entityId } = await context.params;
  const auth = await requireDashboardAuth(request);
  if (!auth.ok) {
    return auth.response;
  }

  const workspace = await ensureWorkspaceForUser({ userId: auth.userId });
  const owned = await getEntityForWorkspace({
    workspaceId: workspace.id,
    entityId,
  });
  if (!owned) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  await deleteEntity(entityId);
  return NextResponse.json({ ok: true });
}
