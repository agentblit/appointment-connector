import { NextResponse } from "next/server";
import { validateAvailabilityRules } from "@/lib/appointment/appointment-utils";
import {
  ensureWorkspaceForUser,
  getEntityForWorkspace,
  listAvailabilityRulesForEntity,
  replaceAvailabilityRulesForEntity,
} from "@/lib/appointment/repo";
import { appointmentAvailabilityRulesSchema } from "@/lib/appointment/tools";
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

  const rules = await listAvailabilityRulesForEntity(entityId);
  return NextResponse.json({ ok: true, rules });
}

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

  const bodyParse = appointmentAvailabilityRulesSchema.safeParse(json);
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

  const validationError = validateAvailabilityRules(bodyParse.data.rules);
  if (validationError) {
    return NextResponse.json(
      { ok: false, error: validationError },
      { status: 400 },
    );
  }

  const rules = await replaceAvailabilityRulesForEntity({
    entityId,
    rules: bodyParse.data.rules,
  });

  return NextResponse.json({ ok: true, rules });
}
