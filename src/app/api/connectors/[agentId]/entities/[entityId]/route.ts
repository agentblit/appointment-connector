import { NextResponse } from "next/server";
import {
  deleteEntity,
  getEntityForAgent,
  listRoles,
  resolveEntityRoleIds,
  updateEntity,
} from "@/lib/appointment/repo";
import { appointmentEntitySchema } from "@/lib/appointment/tools";
import {
  requireConnectorOwner,
  requireConnectorSetupAuth,
} from "@/lib/auth/require-connector-setup-auth";

type RouteContext = {
  params: Promise<{ agentId: string; entityId: string }>;
};

export async function PUT(request: Request, context: RouteContext) {
  const { agentId, entityId } = await context.params;
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

  const bodyParse = appointmentEntitySchema.safeParse(json);
  if (!bodyParse.success) {
    const issue = bodyParse.error.issues[0];
    return NextResponse.json(
      { ok: false, error: issue?.message ?? "Invalid request body" },
      { status: 400 },
    );
  }

  const owned = await getEntityForAgent({ agentId, entityId });
  if (!owned) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const availableRoles = await listRoles(owned.connector.id);
  const resolved = resolveEntityRoleIds({
    availableRoles,
    selectedRoleIds: bodyParse.data.roleIds,
  });
  if (!resolved.ok) {
    return NextResponse.json({ ok: false, error: resolved.error }, { status: 400 });
  }

  try {
    const updated = await updateEntity({
      entityId,
      name: bodyParse.data.name,
      description: bodyParse.data.description,
      roleIds: resolved.roleIds,
    });
    return NextResponse.json({ ok: true, entity: updated });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update entity";
    if (message.includes("unique")) {
      return NextResponse.json(
        { ok: false, error: "An entity with this name already exists" },
        { status: 400 },
      );
    }
    throw error;
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const { agentId, entityId } = await context.params;
  const auth = await requireConnectorSetupAuth(request, agentId);
  if (!auth.ok) {
    return auth.response;
  }

  const ownership = await requireConnectorOwner(agentId, auth.userId);
  if (!ownership.ok) {
    return ownership.response;
  }

  const owned = await getEntityForAgent({ agentId, entityId });
  if (!owned) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  await deleteEntity(entityId);
  return NextResponse.json({ ok: true });
}
