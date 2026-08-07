import crypto from "crypto";
import { eq } from "drizzle-orm";
import {
  appointmentApiKeys,
  appointmentWorkspaces,
  type AppointmentWorkspaceRow,
} from "@/lib/appointment/schema";
import { db } from "@/lib/db/client";

export const API_KEY_HEADER = "x-api-key";
export const API_KEY_PREFIX = "apt_";

export function hashApiKey(secret: string): string {
  return crypto.createHash("sha256").update(secret).digest("hex");
}

export function generateApiKey(): string {
  return `${API_KEY_PREFIX}${crypto.randomBytes(24).toString("base64url")}`;
}

export function getApiKeyFromRequest(request: Request): string | null {
  return request.headers.get(API_KEY_HEADER)?.trim() || null;
}

export type WorkspaceApiKeyAuth = {
  workspace: AppointmentWorkspaceRow;
  apiKeyId: string;
};

export async function requireWorkspaceApiKey(
  request: Request,
): Promise<WorkspaceApiKeyAuth> {
  const raw = getApiKeyFromRequest(request);
  if (!raw) {
    throw new Error("Missing X-API-Key header");
  }
  const hash = hashApiKey(raw);
  const rows = await db
    .select({
      workspace: appointmentWorkspaces,
      apiKeyId: appointmentApiKeys.id,
    })
    .from(appointmentApiKeys)
    .innerJoin(
      appointmentWorkspaces,
      eq(appointmentApiKeys.workspaceId, appointmentWorkspaces.id),
    )
    .where(eq(appointmentApiKeys.apiKeyHash, hash))
    .limit(1);
  const row = rows[0];
  if (!row) {
    throw new Error("Invalid API key");
  }
  return { workspace: row.workspace, apiKeyId: row.apiKeyId };
}
