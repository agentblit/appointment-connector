import { NextResponse } from "next/server";
import { formatDateTimeInTimezone } from "@/lib/appointment/appointment-utils";
import {
  getEntityForAgent,
  listAppointmentsForEntity,
} from "@/lib/appointment/repo";
import {
  requireConnectorOwner,
  requireConnectorSetupAuth,
} from "@/lib/auth/require-connector-setup-auth";

type RouteContext = {
  params: Promise<{ agentId: string; entityId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { agentId, entityId } = await context.params;
  const auth = await requireConnectorSetupAuth(request, agentId);
  if (!auth.ok) {
    return auth.response;
  }

  const ownership = await requireConnectorOwner(agentId, auth.userId);
  if (!ownership.ok) {
    return ownership.response;
  }
  if (!ownership.connector) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const owned = await getEntityForAgent({ agentId, entityId });
  if (!owned) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const appointments = await listAppointmentsForEntity(entityId);
  const timezone = owned.connector.timezone;

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
