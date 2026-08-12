import { NextResponse } from "next/server";
import {
  ensureWorkspaceForUser,
  getEntityForWorkspace,
  getGoogleIntegrationForEntity,
} from "@/lib/appointment/repo";
import { isGoogleOAuthConfigured } from "@/lib/appointment/meeting/google";
import { requireDashboardAuth } from "@/lib/auth/require-dashboard-auth";

type RouteContext = {
  params: Promise<{ entityId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
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

  const google = await getGoogleIntegrationForEntity(entityId);

  return NextResponse.json({
    ok: true,
    google: {
      configured: isGoogleOAuthConfigured(),
      connected: google.connected,
      accountEmail: google.connected ? google.accountEmail : null,
    },
  });
}
