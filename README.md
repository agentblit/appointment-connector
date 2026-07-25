# Appointment Tool

Standalone HTTP connector for Agentblit appointment booking.

## HTTP contract

| Endpoint | Method |
|----------|--------|
| `/api/1.0/tools/list` | GET |
| `/api/1.0/tools/call` | POST |
| `/api/1.0/connector/status` | GET |
| `/api/1.0/connector/disconnect` | POST |
| `/setup` | GET (config UI) |
| `/api/health` | GET |

Agent context header (required on status/call/disconnect):

- `X-Agentblit-Agent-Id`

Status response:

```json
{ "status": "setup_required" | "configured", "configuration_url": "https://.../setup" }
```

Setup URL includes query params: `agentId`, `connectorKey`.

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
| `AGENTBLIT_APP_URL` | Post-setup redirect base |
| `PUBLIC_BASE_URL` | App base URL (setup `configuration_url`, Better Auth) |
| `BETTER_AUTH_SECRET` | Better Auth signing secret (required) |

## Build and push

```bash
docker build --platform linux/amd64 -t registry.agentblit.com/appointment-tool:latest .
docker push registry.agentblit.com/appointment-tool:latest
```
