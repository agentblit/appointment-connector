import { randomBytes } from "node:crypto";
import { google } from "googleapis";
import { APPOINTMENT_OAUTH_PROVIDER_GOOGLE } from "@/lib/appointment/constants";
import {
  getOauthConnectionForEntity,
  upsertOauthConnection,
} from "@/lib/appointment/repo";
import { decryptSecret, encryptSecret } from "@/lib/crypto/token-cipher";

const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/userinfo.email",
];

function getGoogleOAuthConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const baseUrl = process.env.PUBLIC_BASE_URL?.trim();
  if (!clientId || !clientSecret || !baseUrl) {
    throw new Error("Google OAuth is not configured");
  }
  return { clientId, clientSecret, baseUrl };
}

export function getGoogleRedirectUri(): string {
  const { baseUrl } = getGoogleOAuthConfig();
  return `${baseUrl}/api/workspace/integrations/google/callback`;
}

export function createGoogleOAuthClient() {
  const { clientId, clientSecret } = getGoogleOAuthConfig();
  return new google.auth.OAuth2(clientId, clientSecret, getGoogleRedirectUri());
}

export function getGoogleAuthUrl(options: {
  entityId: string;
  state: string;
}): string {
  const client = createGoogleOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GOOGLE_SCOPES,
    state: options.state,
    include_granted_scopes: true,
  });
}

export async function exchangeGoogleCode(options: {
  entityId: string;
  code: string;
}) {
  const client = createGoogleOAuthClient();
  const { tokens } = await client.getToken(options.code);
  if (!tokens.access_token) {
    throw new Error("Google did not return an access token");
  }

  client.setCredentials(tokens);
  const oauth2 = google.oauth2({ version: "v2", auth: client });
  const profile = await oauth2.userinfo.get();
  const accountEmail = profile.data.email ?? null;

  await upsertOauthConnection({
    entityId: options.entityId,
    provider: APPOINTMENT_OAUTH_PROVIDER_GOOGLE,
    accessToken: encryptSecret(tokens.access_token),
    refreshToken: tokens.refresh_token
      ? encryptSecret(tokens.refresh_token)
      : null,
    expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    scope: tokens.scope ?? GOOGLE_SCOPES.join(" "),
    accountEmail,
  });

  return { accountEmail };
}

async function getAuthorizedGoogleClient(entityId: string) {
  const connection = await getOauthConnectionForEntity({
    entityId,
    provider: APPOINTMENT_OAUTH_PROVIDER_GOOGLE,
  });
  if (!connection) {
    throw new Error("Google is not connected for this entity");
  }

  const client = createGoogleOAuthClient();
  client.setCredentials({
    access_token: decryptSecret(connection.accessToken),
    refresh_token: connection.refreshToken
      ? decryptSecret(connection.refreshToken)
      : undefined,
    expiry_date: connection.expiresAt?.getTime(),
    scope: connection.scope ?? undefined,
  });

  client.on("tokens", (tokens) => {
    if (!tokens.access_token) return;
    void upsertOauthConnection({
      entityId,
      provider: APPOINTMENT_OAUTH_PROVIDER_GOOGLE,
      accessToken: encryptSecret(tokens.access_token),
      refreshToken: tokens.refresh_token
        ? encryptSecret(tokens.refresh_token)
        : connection.refreshToken,
      expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      scope: tokens.scope ?? connection.scope,
      accountEmail: connection.accountEmail,
    }).catch(() => {
      // Best-effort token refresh persistence.
    });
  });

  return client;
}

export type GoogleMeetBookingInput = {
  entityId: string;
  entityName: string;
  bookerName: string;
  bookerEmail: string;
  startTime: Date;
  endTime: Date;
  timezone: string;
};

export type GoogleMeetBookingResult = {
  meetingUrl: string;
  externalMeetingId: string;
};

export async function createGoogleMeetForBooking(
  input: GoogleMeetBookingInput,
): Promise<GoogleMeetBookingResult> {
  const auth = await getAuthorizedGoogleClient(input.entityId);
  const calendar = google.calendar({ version: "v3", auth });
  const requestId = randomBytes(16).toString("hex");

  const response = await calendar.events.insert({
    calendarId: "primary",
    conferenceDataVersion: 1,
    sendUpdates: "none",
    requestBody: {
      summary: `Appointment with ${input.bookerName}`,
      description: `Booked via Appointment Connector for ${input.entityName}.`,
      start: {
        dateTime: input.startTime.toISOString(),
        timeZone: input.timezone,
      },
      end: {
        dateTime: input.endTime.toISOString(),
        timeZone: input.timezone,
      },
      attendees: [{ email: input.bookerEmail, displayName: input.bookerName }],
      conferenceData: {
        createRequest: {
          requestId,
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
    },
  });

  const eventId = response.data.id;
  const meetingUrl =
    response.data.hangoutLink ??
    response.data.conferenceData?.entryPoints?.find(
      (entry) => entry.entryPointType === "video",
    )?.uri;

  if (!eventId || !meetingUrl) {
    throw new Error("Google Calendar did not return a Meet link");
  }

  return {
    meetingUrl,
    externalMeetingId: eventId,
  };
}

export async function updateGoogleMeetForBooking(options: {
  entityId: string;
  externalMeetingId: string;
  startTime: Date;
  endTime: Date;
  timezone: string;
}) {
  const auth = await getAuthorizedGoogleClient(options.entityId);
  const calendar = google.calendar({ version: "v3", auth });
  await calendar.events.patch({
    calendarId: "primary",
    eventId: options.externalMeetingId,
    sendUpdates: "none",
    requestBody: {
      start: {
        dateTime: options.startTime.toISOString(),
        timeZone: options.timezone,
      },
      end: {
        dateTime: options.endTime.toISOString(),
        timeZone: options.timezone,
      },
    },
  });
}

export async function deleteGoogleMeetForBooking(options: {
  entityId: string;
  externalMeetingId: string;
}) {
  const auth = await getAuthorizedGoogleClient(options.entityId);
  const calendar = google.calendar({ version: "v3", auth });
  await calendar.events.delete({
    calendarId: "primary",
    eventId: options.externalMeetingId,
    sendUpdates: "none",
  });
}

export function isGoogleOAuthConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() &&
      process.env.GOOGLE_CLIENT_SECRET?.trim() &&
      process.env.PUBLIC_BASE_URL?.trim(),
  );
}
