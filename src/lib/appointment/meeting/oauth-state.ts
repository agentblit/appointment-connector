import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const STATE_TTL_MS = 10 * 60 * 1000;

type OAuthStatePayload = {
  workspaceId: string;
  entityId: string;
  nonce: string;
  exp: number;
};

function getStateSecret(): string {
  const secret =
    process.env.OAUTH_TOKEN_SECRET?.trim() ||
    process.env.BETTER_AUTH_SECRET?.trim();
  if (!secret) {
    throw new Error("Missing OAUTH_TOKEN_SECRET or BETTER_AUTH_SECRET");
  }
  return secret;
}

function signPayload(encodedPayload: string): string {
  return createHmac("sha256", getStateSecret())
    .update(encodedPayload)
    .digest("base64url");
}

export function createOAuthState(options: {
  workspaceId: string;
  entityId: string;
}): string {
  const payload: OAuthStatePayload = {
    workspaceId: options.workspaceId,
    entityId: options.entityId,
    nonce: randomBytes(16).toString("base64url"),
    exp: Date.now() + STATE_TTL_MS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url",
  );
  return `${encodedPayload}.${signPayload(encodedPayload)}`;
}

export function verifyOAuthState(state: string): OAuthStatePayload {
  const [encodedPayload, signature] = state.split(".");
  if (!encodedPayload || !signature) {
    throw new Error("Invalid OAuth state");
  }
  const expected = signPayload(encodedPayload);
  const actual = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    actual.length !== expectedBuffer.length ||
    !timingSafeEqual(actual, expectedBuffer)
  ) {
    throw new Error("Invalid OAuth state signature");
  }

  const payload = JSON.parse(
    Buffer.from(encodedPayload, "base64url").toString("utf8"),
  ) as OAuthStatePayload;

  if (!payload.workspaceId || !payload.entityId || !payload.exp) {
    throw new Error("Invalid OAuth state payload");
  }
  if (Date.now() > payload.exp) {
    throw new Error("OAuth state expired");
  }

  return payload;
}
