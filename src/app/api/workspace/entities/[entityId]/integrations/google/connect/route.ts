import { NextResponse } from "next/server";
import {
  ensureWorkspaceForUser,
  getEntityForWorkspace,
} from "@/lib/appointment/repo";
import {
  getGoogleAuthUrl,
  isGoogleOAuthConfigured,
} from "@/lib/appointment/meeting/google";
import { createOAuthState } from "@/lib/appointment/meeting/oauth-state";
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

  if (!isGoogleOAuthConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Google OAuth is not configured on this server" },
      { status: 503 },
    );
  }

  const workspace = await ensureWorkspaceForUser({ userId: auth.userId });
  const owned = await getEntityForWorkspace({
    workspaceId: workspace.id,
    entityId,
  });
  if (!owned) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const state = createOAuthState({
    workspaceId: workspace.id,
    entityId,
  });
  const url = getGoogleAuthUrl({ entityId, state });
  return NextResponse.redirect(url);
}
