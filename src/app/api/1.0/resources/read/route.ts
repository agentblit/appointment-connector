import { NextResponse, type NextRequest } from "next/server";
import {
  MCP_APP_MIME_TYPE,
  UI_APPOINTMENTS,
  UI_CHECK_SLOTS,
} from "@/lib/appointment/tools";
import {
  APPOINTMENTS_HTML,
  CHECK_SLOTS_HTML,
} from "@/lib/appointment/ui-resources";
import { requireWorkspaceApiKey } from "@/lib/auth/api-key-auth";

const RESOURCES: Record<
  string,
  { name: string; description: string; html: string }
> = {
  [UI_CHECK_SLOTS]: {
    name: "check_slots",
    description: "Interactive available-slot picker for booking",
    html: CHECK_SLOTS_HTML,
  },
  [UI_APPOINTMENTS]: {
    name: "appointments",
    description: "Interactive list of user appointments",
    html: APPOINTMENTS_HTML,
  },
};

/**
 * MCP Apps `resources/read` mirror for HTTP agents.
 * Agentblit calls this server-to-server; browsers never hit it directly.
 * Requires X-API-Key.
 */
export async function GET(req: NextRequest) {
  try {
    await requireWorkspaceApiKey(req);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unauthorized",
      },
      { status: 401 },
    );
  }

  const uri = req.nextUrl.searchParams.get("uri")?.trim() ?? "";
  if (!uri) {
    return NextResponse.json(
      { error: "Missing `uri` query parameter" },
      { status: 400 },
    );
  }
  if (!uri.startsWith("ui://")) {
    return NextResponse.json(
      { error: "Only ui:// resources are supported" },
      { status: 400 },
    );
  }

  const resource = RESOURCES[uri];
  if (!resource) {
    return NextResponse.json(
      { error: `Unknown resource: ${uri}` },
      { status: 404 },
    );
  }

  return NextResponse.json({
    contents: [
      {
        uri,
        mimeType: MCP_APP_MIME_TYPE,
        text: resource.html,
        _meta: {
          ui: {
            prefersBorder: true,
            csp: {
              connectDomains: [],
              resourceDomains: [],
            },
          },
        },
      },
    ],
  });
}
