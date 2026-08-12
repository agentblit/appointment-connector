import { NextResponse } from "next/server";
import {
  ensureWorkspaceForUser,
  getEntityForWorkspace,
  updateEntity,
} from "@/lib/appointment/repo";
import { exchangeGoogleCode } from "@/lib/appointment/meeting/google";
import { verifyOAuthState } from "@/lib/appointment/meeting/oauth-state";
import { requireDashboardAuth } from "@/lib/auth/require-dashboard-auth";

function entitiesListUrl(query?: Record<string, string>) {
  const baseUrl = process.env.PUBLIC_BASE_URL?.trim() || "http://localhost:3080";
  const url = new URL("/entities", baseUrl);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

function entityDetailUrl(entityId: string, query?: Record<string, string>) {
  const baseUrl = process.env.PUBLIC_BASE_URL?.trim() || "http://localhost:3080";
  const url = new URL(
    `/entities/${encodeURIComponent(entityId)}`,
    baseUrl,
  );
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

export async function GET(request: Request) {
  const auth = await requireDashboardAuth(request);
  if (!auth.ok) {
    return auth.response;
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError) {
    return NextResponse.redirect(
      entitiesListUrl({
        google: "error",
        message: oauthError,
      }),
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      entitiesListUrl({
        google: "error",
        message: "missing_code",
      }),
    );
  }

  let statePayload;
  try {
    statePayload = verifyOAuthState(state);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "invalid_state";
    return NextResponse.redirect(
      entitiesListUrl({
        google: "error",
        message,
      }),
    );
  }

  const { entityId, workspaceId } = statePayload;

  const workspace = await ensureWorkspaceForUser({ userId: auth.userId });
  if (workspaceId !== workspace.id) {
    return NextResponse.redirect(
      entityDetailUrl(entityId, {
        google: "error",
        message: "workspace_mismatch",
      }),
    );
  }

  const owned = await getEntityForWorkspace({
    workspaceId: workspace.id,
    entityId,
  });
  if (!owned) {
    return NextResponse.redirect(
      entitiesListUrl({
        google: "error",
        message: "not_found",
      }),
    );
  }

  try {
    const result = await exchangeGoogleCode({ entityId, code });
    await updateEntity({
      entityId,
      name: owned.entity.name,
      description: owned.entity.description,
      roleIds: owned.entity.roleIds ?? [],
      meetingMode: "online",
      locationAddress: null,
      locationMapsUrl: null,
    });
    return NextResponse.redirect(
      entityDetailUrl(entityId, {
        google: "connected",
        ...(result.accountEmail ? { email: result.accountEmail } : {}),
      }),
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "google_connect_failed";
    return NextResponse.redirect(
      entityDetailUrl(entityId, {
        google: "error",
        message,
      }),
    );
  }
}
