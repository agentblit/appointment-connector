import { NextResponse } from "next/server";
import { formatDateTimeInTimezone } from "@/lib/appointment/appointment-utils";
import {
  ensureWorkspaceForUser,
  getEntityForWorkspace,
  listAppointmentsForEntity,
} from "@/lib/appointment/repo";
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

  const appointments = await listAppointmentsForEntity(entityId);
  const timezone = owned.workspace.timezone;

  return NextResponse.json({
    ok: true,
    timezone,
    bookings: appointments.map((appointment) => ({
      id: appointment.id,
      name: appointment.name,
      email: appointment.email,
      startTime: appointment.startTime.toISOString(),
      endTime: appointment.endTime.toISOString(),
      startLocal: formatDateTimeInTimezone(appointment.startTime, timezone),
      endLocal: formatDateTimeInTimezone(appointment.endTime, timezone),
      status: appointment.status,
    })),
  });
}
