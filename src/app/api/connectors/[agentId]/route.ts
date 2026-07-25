import { NextResponse } from "next/server";
import {
  getConnectorWithEntities,
  upsert,
} from "@/lib/appointment/repo";
import { appointmentConnectorConfigSchema } from "@/lib/appointment/tools";
import {
  requireConnectorOwner,
  requireConnectorSetupAuth,
} from "@/lib/auth/require-connector-setup-auth";

type RouteContext = {
  params: Promise<{ agentId: string }>;
};

function serializeRole(role: { id: string; name: string; description: string }) {
  return {
    id: role.id,
    name: role.name,
    description: role.description,
  };
}

export async function GET(request: Request, context: RouteContext) {
  const { agentId } = await context.params;
  const auth = await requireConnectorSetupAuth(request, agentId);
  if (!auth.ok) {
    return auth.response;
  }

  const ownership = await requireConnectorOwner(agentId, auth.userId);
  if (!ownership.ok) {
    return ownership.response;
  }

  const connector = await getConnectorWithEntities(agentId);
  if (!connector) {
    return NextResponse.json({ ok: true, connector: null });
  }

  return NextResponse.json({
    ok: true,
    connector: {
      agentId: connector.agentId,
      entityLabel: connector.entityLabel,
      timezone: connector.timezone,
      slotDurationMinutes: connector.slotDurationMinutes,
      roles: connector.roles.map(serializeRole),
      entities: connector.entities.map((entity) => ({
        id: entity.id,
        name: entity.name,
        description: entity.description,
        roleIds: entity.roleIds ?? [],
        isActive: entity.isActive,
        availabilityRules: entity.availabilityRules.map((rule) => ({
          id: rule.id,
          dayOfWeek: rule.dayOfWeek,
          startTime: rule.startTime,
          endTime: rule.endTime,
        })),
      })),
    },
  });
}

export async function POST(request: Request, context: RouteContext) {
  const { agentId } = await context.params;
  const auth = await requireConnectorSetupAuth(request, agentId);
  if (!auth.ok) {
    return auth.response;
  }

  const ownership = await requireConnectorOwner(agentId, auth.userId);
  if (!ownership.ok) {
    return ownership.response;
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const bodyParse = appointmentConnectorConfigSchema.safeParse(json);
  if (!bodyParse.success) {
    const issue = bodyParse.error.issues[0];
    return NextResponse.json(
      { ok: false, error: issue?.message ?? "Invalid request body" },
      { status: 400 },
    );
  }

  const body = bodyParse.data;
  const { connector, roles } = await upsert({
    agentId,
    userId: auth.userId,
    entityLabel: body.entityLabel,
    timezone: body.timezone,
    slotDurationMinutes: body.slotDurationMinutes,
    roles: body.roles,
  });

  // finalize:true only persists config; agentblit reconnects via status.
  return NextResponse.json({
    ok: true,
    connector: {
      agentId: connector.agentId,
      entityLabel: connector.entityLabel,
      timezone: connector.timezone,
      slotDurationMinutes: connector.slotDurationMinutes,
      roles: roles.map(serializeRole),
    },
    finalize: Boolean(body.finalize),
  });
}
