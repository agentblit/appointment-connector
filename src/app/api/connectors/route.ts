import { NextResponse } from "next/server";
import { listConnectorsByUserId } from "@/lib/appointment/repo";
import { authErrorResponse } from "@/lib/auth/http";
import { requireAuth } from "@/lib/auth/requireAuth";

export async function GET(request: Request) {
  let userId: string;
  try {
    userId = await requireAuth(request);
  } catch (error) {
    return (
      authErrorResponse(error) ??
      NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    );
  }

  const connectors = await listConnectorsByUserId(userId);
  return NextResponse.json({
    ok: true,
    connectors: connectors.map((connector) => ({
      agentId: connector.agentId,
      entityLabel: connector.entityLabel,
      timezone: connector.timezone,
      slotDurationMinutes: connector.slotDurationMinutes,
    })),
  });
}
