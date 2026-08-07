import { NextResponse } from "next/server";
import { formatDateTimeInTimezone } from "@/lib/appointment/appointment-utils";
import { listAppointmentsForBookerInWorkspace } from "@/lib/appointment/repo";
import { listUserAppointmentsArgsSchema } from "@/lib/appointment/tools";
import { requireWorkspaceApiKey } from "@/lib/auth/api-key-auth";

/**
 * GET /api/1.0/appointments?email=...&timezone=...
 *
 * Lists appointments for a booker (matched by email) on this workspace.
 * Requires X-API-Key.
 */
export async function GET(request: Request) {
  let workspace: Awaited<
    ReturnType<typeof requireWorkspaceApiKey>
  >["workspace"];
  try {
    ({ workspace } = await requireWorkspaceApiKey(request));
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unauthorized",
      },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  const parsed = listUserAppointmentsArgsSchema.safeParse({
    email: url.searchParams.get("email") ?? "",
    timezone: url.searchParams.get("timezone") || undefined,
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json(
      { error: issue?.message ?? "Invalid query parameters" },
      { status: 400 },
    );
  }

  const email = parsed.data.email.trim().toLowerCase();
  const rows = await listAppointmentsForBookerInWorkspace({
    workspaceId: workspace.id,
    email,
  });

  const appointments = rows.map(({ appointment, entity }) => {
    const item: Record<string, unknown> = {
      appointment_id: appointment.id,
      entity_id: entity.id,
      entity_name: entity.name,
      name: appointment.name,
      email: appointment.email,
      status: appointment.status,
      start_time: appointment.startTime.toISOString(),
      end_time: appointment.endTime.toISOString(),
    };
    if (parsed.data.timezone) {
      item.start_local = formatDateTimeInTimezone(
        appointment.startTime,
        parsed.data.timezone,
      );
      item.end_local = formatDateTimeInTimezone(
        appointment.endTime,
        parsed.data.timezone,
      );
    }
    return item;
  });

  return NextResponse.json({
    ok: true,
    email,
    business_timezone: workspace.timezone,
    count: appointments.length,
    appointments,
    ...(parsed.data.timezone
      ? { user_timezone: parsed.data.timezone }
      : {}),
  });
}
