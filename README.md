# Appointment Connector

Standalone HTTP connector for Agentblit appointment booking.

## HTTP contract

| Endpoint | Method | Auth |
|----------|--------|------|
| `/api/1.0/tools/list` | GET | `X-API-Key` |
| `/api/1.0/tools/call` | POST | `X-API-Key` |
| `/api/1.0/resources/read` | GET | `X-API-Key` |
| `/api/1.0/appointments` | GET | `X-API-Key` |
| `/api/health` | GET | None |

In the dashboard (`/`): configure settings, add multiple entities with per-entity availability, and manage **API keys**. Paste a key into AgentBlit when connecting the Appointment connector.

Agents call `list_entities` first, then book against a specific `entity_id`.

List appointments for a booker (query params):

- `email` (required)
- `timezone` (optional IANA timezone for local time fields)

## Local development

Postgres runs in Docker; the app runs locally with hot reload:

```bash
cp .env.example .env
docker compose up -d
pnpm install
pnpm dev
# app: http://localhost:3080
# postgres: localhost:5433
# db:migrate (generate + apply) runs automatically on pnpm dev / container start
```

Reset the database (drops appointment, auth, and drizzle schemas; keeps `drizzle/` SQL files):

```bash
pnpm db:clean
pnpm dev   # re-applies migrations
```

## Environment

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Postgres connection |
| `PUBLIC_BASE_URL` | App base URL (Better Auth) |
| `BETTER_AUTH_SECRET` | Better Auth signing secret (required) |
| `GOOGLE_CLIENT_ID` | Google OAuth client id (Calendar + Meet) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |

### Google Meet (online entities)

Each online entity connects its own Google account from the dashboard. On booking, the connector creates a Google Calendar event with a Meet link on that entity's calendar.

1. Create a Google Cloud OAuth client (Web application).
2. Enable the Google Calendar API.
3. On the OAuth consent screen, add scopes `calendar` and `userinfo.email` (creating Meet links needs full calendar access, not only `calendar.events`).
4. Add this exact redirect URI in Google Cloud Console (Authorized redirect URIs):

   `{PUBLIC_BASE_URL}/api/workspace/integrations/google/callback`

   Example for local: `http://localhost:3080/api/workspace/integrations/google/callback`
5. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
6. Edit an entity → connect Google (reconnect after any scope change) → switch meeting mode to **Online**.

Offline entities store an address and/or Google Maps URL instead; no Google connection is required.

## Build and push

```bash
docker build --platform linux/amd64 -t registry.agentblit.com/appointment-connector:latest .
docker push registry.agentblit.com/appointment-connector:latest
```

## Production deploy

Manifests live in `infra/prod/internal/tools/`.

```bash
# 1. Secrets (once)
cp infra/prod/internal/tools/appointment-connector-secret.example.yaml \
   infra/prod/internal/tools/appointment-connector-secret.yaml
# fill BETTER_AUTH_SECRET, POSTGRES_PASSWORD, DATABASE_URL

kubectl apply -f infra/prod/internal/tools/appointment-connector-secret.yaml
kubectl apply -f infra/prod/internal/tools/appointment-connector.yaml

# 2. Image
cd appointment-connector
docker build --platform linux/amd64 -t registry.agentblit.com/appointment-connector:latest .
docker push registry.agentblit.com/appointment-connector:latest
kubectl rollout restart deployment/appointment-connector -n internal
kubectl rollout status deployment/appointment-connector -n internal
```

Public URL: `https://appointment-connector.agentblit.com`  
Health: `https://appointment-connector.agentblit.com/api/health`
