import { NextResponse } from "next/server";
import {
  createEntity,
  ensureWorkspaceForUser,
  listEntities,
} from "@/lib/appointment/repo";
import { appointmentEntitySchema } from "@/lib/appointment/tools";
import { requireDashboardAuth } from "@/lib/auth/require-dashboard-auth";

export async function GET(request: Request) {
  const auth = await requireDashboardAuth(request);
  if (!auth.ok) {
    return auth.response;
  }

  const workspace = await ensureWorkspaceForUser({ userId: auth.userId });
  const entities = await listEntities(workspace.id);
  return NextResponse.json({
    ok: true,
    entityLabel: workspace.entityLabel,
    entities,
  });
}

export async function POST(request: Request) {
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

  const bodyParse = appointmentEntitySchema.safeParse(json);
  if (!bodyParse.success) {
    const issue = bodyParse.error.issues[0];
    return NextResponse.json(
      { ok: false, error: issue?.message ?? "Invalid request body" },
      { status: 400 },
    );
  }

  try {
    const entity = await createEntity({
      workspaceId: workspace.id,
      name: bodyParse.data.name,
      description: bodyParse.data.description,
    });
    return NextResponse.json({ ok: true, entity });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create entity";
    if (message.includes("unique")) {
      return NextResponse.json(
        { ok: false, error: "An entity with this name already exists" },
        { status: 400 },
      );
    }
    throw error;
  }
}
