import { NextResponse } from "next/server";
import {
  validateAvailabilityRules,
  validateBookingPeriod,
  validateDateRules,
} from "@/lib/appointment/appointment-utils";
import {
  bookingPeriodFromEntity,
  ensureWorkspaceForUser,
  getEntityForWorkspace,
  listAvailabilityRulesForEntity,
  listDateRulesForEntity,
  replaceAvailabilityForEntity,
  serializeBookingPeriod,
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

  const [rules, dateRules] = await Promise.all([
    listAvailabilityRulesForEntity(entityId),
    listDateRulesForEntity(entityId),
  ]);
  return NextResponse.json({
    ok: true,
    rules,
    dateRules,
    bookingPeriod: serializeBookingPeriod(bookingPeriodFromEntity(owned.entity)),
  });
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

  const rulesError = validateAvailabilityRules(bodyParse.data.rules);
  if (rulesError) {
    return NextResponse.json({ ok: false, error: rulesError }, { status: 400 });
  }
  const dateRulesError = validateDateRules(bodyParse.data.dateRules);
  if (dateRulesError) {
    return NextResponse.json(
      { ok: false, error: dateRulesError },
      { status: 400 },
    );
  }
  const periodError = validateBookingPeriod(bodyParse.data.bookingPeriod);
  if (periodError) {
    return NextResponse.json({ ok: false, error: periodError }, { status: 400 });
  }

  const saved = await replaceAvailabilityForEntity({
    entityId,
    rules: bodyParse.data.rules,
    dateRules: bodyParse.data.dateRules,
    bookingPeriod: bodyParse.data.bookingPeriod,
  });

  return NextResponse.json({
    ok: true,
    rules: saved.rules,
    dateRules: saved.dateRules,
    bookingPeriod: serializeBookingPeriod(saved.bookingPeriod),
  });
}
