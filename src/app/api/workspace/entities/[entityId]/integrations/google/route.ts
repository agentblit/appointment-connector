import { NextResponse } from "next/server";
import { APPOINTMENT_OAUTH_PROVIDER_GOOGLE } from "@/lib/appointment/constants";
import {
  deleteOauthConnectionForEntity,
  ensureWorkspaceForUser,
  getEntityForWorkspace,
} from "@/lib/appointment/repo";
import { requireDashboardAuth } from "@/lib/auth/require-dashboard-auth";

type RouteContext = {
  params: Promise<{ entityId: string }>;
};

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

  await deleteOauthConnectionForEntity({
    entityId,
    provider: APPOINTMENT_OAUTH_PROVIDER_GOOGLE,
  });

  return NextResponse.json({ ok: true });
}
