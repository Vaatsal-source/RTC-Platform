# SyncGrid

A real-time team chat platform with workspaces, channels, threads, direct messages and file sharing. It is built as a TypeScript monorepo around a raw [`ws`](https://github.com/websockets/ws) WebSocket server, Redis Pub/Sub for horizontal scaling, and BullMQ workers for background processing.

```
                    React (Vite, Tailwind, Zustand, React Query)
                                      |
                     +----------------+----------------+
                  REST /api                      WebSocket (ws)
                     |                                 |
                API server (xN)                   WS server (xN)
                     |  |                              |  |
                     |  +----------- Redis ------------+  |
                     |        Pub/Sub, cache, presence     |
                     |                |                    |
                     |           BullMQ queues             |
                     |                |                    |
                     |          Worker (xN)                |
                     |   notifications, audit, email,      |
                     |   activity, analytics               |
                     +--------------- MongoDB -------------+
```

Further documentation: [Architecture](docs/ARCHITECTURE.md) | [WebSocket protocol](docs/WEBSOCKET_PROTOCOL.md) | [REST API](docs/API.md) | [Deployment](docs/DEPLOYMENT.md)

## Features

- **Accounts:** registration and login with bcrypt and JWT, short-lived access tokens with rotating refresh tokens, email verification, password reset, token revocation on logout.
- **Workspaces:** create and configure workspaces, admin and member roles, invitations by email (including addresses without an account yet) or invite link, audit log and usage insights for admins.
- **Channels:** public, private and archived (read-only) channels; one-to-one direct messages.
- **Messaging over WebSocket:** send, edit and delete messages, history with infinite scroll, emoji reactions, thread replies, @mentions, attachments, typing indicators, read receipts (sent, delivered, read), online presence.
- **Files:** upload, inline image preview and download, stored on local disk or any S3-compatible bucket.
- **Notifications:** mentions, direct messages, thread replies and invites, delivered live and persisted; email for mentions received while offline.
- **Search:** messages, users and channels, limited to what the requesting user may see.
- **Activity feed** per workspace.
- **Operations:** Docker Compose stack, GitHub Actions pipeline, Prometheus metrics and alert rules, Grafana dashboard, automated MongoDB backups.

## Getting started

Requirements: Node.js 22 or later, pnpm 11, Docker Desktop.

```bash
pnpm install
cp .env.example .env
pnpm local
```

`pnpm local` starts MongoDB, Redis and a local mail catcher (Mailpit) in Docker, waits for them to become healthy, and then starts the API (port 5000), the WebSocket server (8080), the worker and the web app (5173).

- Application: <http://localhost:5173>
- Mail inbox: <http://localhost:8025>. Verification, password-reset and invitation emails arrive here when `SMTP_HOST=localhost` and `SMTP_PORT=1025` are set in `.env`; without SMTP settings the worker only logs them.

Stop with Ctrl+C and run `pnpm infra:down` to stop the containers.

### Running everything in Docker

```bash
cp .env.example .env      # set JWT_SECRET, MONGO_PASSWORD and REDIS_PASSWORD (for example: openssl rand -hex 24)
docker compose up --build
```

This starts `frontend` (nginx, port 3000), `api`, `websocket`, `worker`, `mongodb` and `redis`. Optional Compose profiles add a Caddy reverse proxy, a Cloudflare Tunnel, a second WebSocket instance, Prometheus and Grafana, Alertmanager, and scheduled backups. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Repository layout

```
.
  apps/
    web/            React single-page app
    api/            Express REST API
    websocket/      WebSocket server (ws)
    worker/         BullMQ consumers and event services
  packages/
    shared-types/   WebSocket protocol (zod schemas), DTOs, event types
    database/       Mongoose models and shared queries
    queue/          Redis clients, BullMQ queues, event bus, presence, token store
    config/         Environment validation
    logger/         Structured logging (Winston)
    ui/             Shared React components
  ops/              Caddy, Prometheus, Alertmanager and Grafana configuration
  docs/             Architecture, protocol, API and deployment documentation
  scripts/e2e.ts    End-to-end test suite
  Dockerfile        Image for the api, websocket and worker services
  docker-compose.yml, docker-compose.dev.yml
```

Internal packages are consumed as TypeScript source, so there is no build step between them. The Node services run through `tsx`.

## Configuration

All services read the same environment variables, validated at start-up by `@repo/config`. A template is provided in [`.env.example`](.env.example).

| Variable | Default | Description |
|---|---|---|
| `MONGO_URI` | `mongodb://127.0.0.1:27017/syncgrid` | MongoDB connection string |
| `REDIS_URL` | `redis://127.0.0.1:6379` | Redis connection string |
| `JWT_SECRET` | development value | Must be a random value of at least 32 characters when `NODE_ENV=production`; the services refuse to start otherwise |
| `JWT_EXPIRES_IN`, `REFRESH_TOKEN_DAYS` | `1h`, `30` | Access and refresh token lifetimes |
| `API_PORT`, `WS_PORT` | `5000`, `8080` | Service ports |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed origins, also enforced on the WebSocket upgrade |
| `TRUST_PROXY` | `0` | Number of reverse-proxy hops in front of the API |
| `AUTH_RATE_LIMIT` | `30` | Credential attempts per IP per 15 minutes |
| `UPLOAD_DIR`, `MAX_UPLOAD_MB` | `./uploads`, `10` | Local file storage |
| `S3_BUCKET`, `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | empty | Store files in an S3-compatible bucket instead of on disk |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` | empty | Outgoing email; when `SMTP_HOST` is empty, messages are logged |
| `VITE_API_URL`, `VITE_WS_URL` | localhost URLs | Build-time URLs used by the browser (`/api` and `/ws` for a single-origin proxy setup) |

## Scripts

| Command | Description |
|---|---|
| `pnpm local` | Start the infrastructure containers and all apps |
| `pnpm dev` | Start all apps with hot reload (infrastructure must already be running) |
| `pnpm infra:up`, `pnpm infra:down` | Start or stop MongoDB, Redis and Mailpit |
| `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` | The checks run by CI, orchestrated by Turbo |
| `pnpm e2e` | End-to-end suite against a running stack |

## Testing

- **Unit tests** (Vitest) cover protocol validation, mention parsing, notification rules, WebSocket registry fan-out, presence and token handling, client message reducers, and API authentication and validation. They need no database.
- **End-to-end suite** (`pnpm e2e`) drives a running stack with real HTTP and WebSocket clients: authentication and token rotation, roles and access control, the full messaging feature set, rate limiting, presence, receipts, direct messages, file handling, search, activity, audit and analytics. When a Mailpit instance is reachable (`MAILPIT_URL`, default `http://localhost:8025`) it also exercises the email verification, password-reset and invitation flows end to end. When a second WebSocket instance is available on port 8082, the two test users connect to different instances, which also covers the Redis backplane.

CI runs lint, type checking, unit tests, the build and the end-to-end suite (with Mailpit) on every pull request, and builds the Docker images on merges to `main`.

## Design notes

- **Persist, then broadcast.** A message is written to MongoDB before it is sent to clients, so the identifier and timestamp clients receive are the stored ones, and a failed write is reported to the sender.
- **Redis as the backplane.** Processes never write to each other's sockets. Client-bound frames are published on `ws:broadcast` and each WebSocket instance delivers them to the sockets it owns. Domain events (`message-created`, `presence-updated`, `notification-created`, and others) are published on Redis and consumed by the worker, so the message path has no direct dependency on notification or audit code.
- **Durability.** Pub/Sub is fire-and-forget, so consumers convert events into BullMQ jobs, which are retried and idempotent, before doing any work. With several workers running, each event is claimed by exactly one of them.
- **Authorization on every frame.** Channel access is checked against a Redis-cached member set that the API invalidates on any membership change. Resources a user cannot access are reported as not found rather than forbidden.
- **Direct messages are channels** of kind `dm`, so history, subscriptions, receipts, search and access control share one code path.

## Limitations

- Pub/Sub events are not replayed. If the worker is offline, notifications and activity derived from events in that period are lost; audit and email jobs created by the API are durable.
- MongoDB and Redis run as single nodes, with no replica set or Sentinel.
- Read receipts apply to direct messages and private channels only, to avoid quadratic fan-out in large public channels.
- The WebSocket access token is sent in the connection URL, because browsers cannot set headers on a WebSocket. Use TLS and avoid logging query strings in front of the service. An already-open socket stays connected until it reconnects, even after its token expires.
- Tokens are stored in `localStorage`.
- Message search is word-based (MongoDB text index) and does not match substrings.
- Email verification does not block use of the application, but invitations sent to an address are only redeemed once it is verified.
