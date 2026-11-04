# SyncGrid — Real-Time Team Chat Platform

A Slack-style team chat built as a **pnpm/Turbo monorepo** over **raw WebSockets (`ws`)**, with **Redis Pub/Sub** for horizontal scaling, **BullMQ** background workers, an **event-driven** core, MongoDB, and a React frontend.

```
                      React (Vite · Tailwind v4 · Zustand · React Query)
                                   │
                  ┌────────────────┴────────────────┐
              REST /api                      WebSocket (ws)
                  │                                 │
             API server  (×N)                 WS server  (×N)  ◄── channel subscriptions,
                  │  │                            │  │              presence, typing
                  │  └──────── Redis ─────────────┘  │
                  │       Pub/Sub  ·  cache  ·  presence
                  │             │
                  │        BullMQ queues ──► Worker (×N) ──► notifications · audit · email
                  │                              │
                  └───────────── MongoDB ◄───────┘
```

Everything the user asked for in the spec is implemented — see [Feature checklist](#feature-checklist). Deeper docs:
[Architecture](Chat-Platform/docs/ARCHITECTURE.md) · [WebSocket protocol](Chat-Platform/docs/WEBSOCKET_PROTOCOL.md) · [REST API](Chat-Platform/docs/API.md)

---

## Quick start

Prerequisites: **Node ≥ 22**, **pnpm 11**, **Docker Desktop**.

### A) Develop on the host (hot reload)

```bash
cd Chat-Platform
pnpm install
cp .env.example .env          # defaults work for local dev
pnpm infra:up                 # MongoDB + Redis (+ Redis Commander :8081) in Docker
pnpm dev                      # api :5000 · websocket :8080 · worker · web :5173
```

Open <http://localhost:5173>, register two users in two browsers, and chat.

### B) Run the whole stack in Docker

```bash
cd Chat-Platform
echo "JWT_SECRET=$(openssl rand -hex 32)" > .env
docker compose up --build                                  # frontend :3000 · api :5000 · ws :8080
docker compose --profile scale --profile observability up --build   # + 2nd WS instance :8082, Prometheus :9090, Grafana :3001 (admin/admin)
```

Services: `frontend` (nginx), `api`, `websocket`, `worker`, `redis`, `mongodb` — plus the optional profiles.

---

## Monorepo layout

```
Chat-Platform/
├── apps/
│   ├── web/          React SPA (Vite, Tailwind v4, Zustand, React Query)
│   ├── api/          Express 5 REST API (auth, workspaces, channels, files, search, …)
│   ├── websocket/    Raw `ws` server: auth on upgrade, channel subscriptions, presence, typing, receipts
│   └── worker/       BullMQ consumers + Redis Pub/Sub event services
├── packages/
│   ├── shared-types/ WS protocol (zod schemas), DTOs, domain-event types — the contract between all apps
│   ├── database/     Mongoose models (User, Workspace, WorkspaceMember, Channel, Message, Notification,
│   │                 AuditLog, File, Activity) + shared read services
│   ├── queue/        Redis clients, BullMQ queues, typed event bus, presence + channel-membership cache
│   ├── config/       zod-validated environment (fails fast on bad config)
│   ├── logger/       Winston (JSON in prod, pretty in dev)
│   └── ui/           Shared React components (Avatar, Modal, …)
├── ops/              Prometheus config + alert rules, Grafana provisioning + dashboard
├── scripts/e2e.ts    End-to-end test against a running stack (97 checks)
├── Dockerfile        One image recipe for api | websocket | worker
└── docker-compose.yml / docker-compose.dev.yml
```

Internal packages are consumed **as TypeScript source** (no build step between them); services run with `tsx`.

---

## Feature checklist

| Module | What's there |
|---|---|
| **1 Auth** | Register / login / logout / `GET /auth/me`, bcrypt, JWT, logout revokes the token (Redis blacklist), login rate limit, no user enumeration |
| **2 Workspaces** | Create, settings, invite by email **or** invite link, roles (admin/member), remove/leave, rotate invite code, delete (owner) |
| **3 Channels** | Public, private (explicit members), archive (read-only), delete; `#general` auto-created |
| **4 Messaging (ws)** | Send, edit, delete (author or admin), history, infinite scroll, emoji reactions, thread replies, attachments |
| **5 Presence** | `online:<userId>` in Redis, multi-tab + multi-instance safe, `presence-updated` event |
| **6 Typing** | Ephemeral (no DB), 3 s auto-timeout |
| **7 Read receipts** | Sent → Delivered → Read, persisted (1:1 DMs and private channels) |
| **8 DMs** | 1:1 chat on the same channel machinery, presence, history |
| **9 Notifications** | Mentions, DM/thread-reply messages, invites — persisted by the worker, pushed live, bell + toasts, email for offline mentions |
| **10 Files** | Upload, inline image preview, download; auth-protected; unsafe types forced to download |
| **11 Search** | MongoDB text indexes: messages, users, channels — scoped to what the caller may see |
| **12 Activity feed** | Message sent · user joined · channel created · file uploaded |
| **Redis** | Presence, channel-membership cache, Pub/Sub (`message-created`, `presence-updated`, `notification-created`, …) |
| **BullMQ** | Notification, Audit and Email queues with retries/backoff |
| **Docker / CI** | Compose stack, per-service images, GitHub Actions (lint → typecheck → test → build → e2e → docker) |
| **Observability** *(optional)* | Prometheus metrics on every service, Grafana dashboard, alert rules |

---

## Configuration

All services read the same variables (see [`.env.example`](Chat-Platform/.env.example)); they are validated at boot by `@repo/config`.

| Variable | Default | Notes |
|---|---|---|
| `MONGO_URI` | `mongodb://127.0.0.1:27017/syncgrid` | |
| `REDIS_URL` | `redis://127.0.0.1:6379` | |
| `JWT_SECRET` | dev value | **Required, ≥ 32 chars when `NODE_ENV=production`** — the app refuses to start otherwise |
| `API_PORT` / `WS_PORT` | `5000` / `8080` | |
| `CORS_ORIGIN` | `http://localhost:5173` | comma-separated; also enforced on the WS upgrade |
| `UPLOAD_DIR`, `MAX_UPLOAD_MB` | `./uploads`, `10` | |
| `SMTP_HOST` … | empty | empty ⇒ emails are logged instead of sent |
| `VITE_API_URL`, `VITE_WS_URL` | localhost | build-time, used by the browser |

---

## Scripts

| Command | |
|---|---|
| `pnpm dev` | all apps with reload |
| `pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm build` | what CI runs (via Turbo) |
| `pnpm e2e` | end-to-end suite against a running stack |
| `pnpm infra:up` / `infra:down` | dev MongoDB + Redis |

### Testing

* **Unit tests (53)** — protocol validation, mention parsing, notification rules, WS registry fan-out, presence semantics, message reducers, API auth/validation (no DB needed).
* **`pnpm e2e` (97 checks)** — real HTTP + WebSocket clients against the running stack: auth, roles, access control, every message feature, presence, receipts, DMs, files (incl. XSS and cross-tenant access), search, activity, logout/revocation. If a second WS instance is reachable on `:8082` (`WS_PORT=8082 pnpm --filter @repo/websocket start`, or `--profile scale`), Alice and Bob connect to **different instances**, so every cross-user assertion also proves the Redis backplane.

---

## Deploying

The Docker stack above is production-shaped; before exposing it to the internet:

1. **TLS + domain.** Put Caddy/nginx/Traefik in front (browsers need `https`/`wss`). Proxy WebSocket upgrades to `websocket:8080` with a long idle timeout, and set `app.set('trust proxy', 1)` in `apps/api/src/app.ts` so the login rate limiter sees real client IPs.
2. **Rebuild the frontend with real URLs** (`VITE_API_URL=https://api.example.com/api`, `VITE_WS_URL=wss://ws.example.com`) and set `CORS_ORIGIN` / `APP_URL` to your site.
3. **Secrets:** a random `JWT_SECRET` (≥ 32 chars; production refuses to boot otherwise), MongoDB auth and a Redis password (or managed services), a new Grafana admin password; keep Prometheus/Grafana off the public internet.
4. **Email:** set `SMTP_HOST/PORT/USER/PASS` and `EMAIL_FROM` (with SPF/DKIM). Until then emails are only logged.
5. **Files & backups:** persist the `uploads` volume (or move to S3 if you run several API replicas) and schedule MongoDB backups.
6. **Scale:** run several `websocket` containers behind the load balancer — Redis handles delivery, no sticky sessions needed.
7. **CI/CD:** set the repository variable `PUSH_IMAGES=true` to publish images to GHCR on merges to `main`; add Alertmanager (or Grafana alerts) to be notified by the provided alert rules.

---

## Design decisions worth knowing

* **Persist, then broadcast.** A message is written to MongoDB first; the id/timestamp clients see are the stored ones, and a failed write is reported to the sender instead of leaving a ghost message.
* **Redis is the backplane.** No process writes to another's sockets. Anything that wants to reach clients publishes on `ws:broadcast`; each WS instance delivers to the sockets *it* owns. Domain events (`message-created`, …) are published for services to react to — the message path never calls notification/audit code directly.
* **Pub/Sub is fire-and-forget, so durability is explicit:** consumers turn events into **BullMQ jobs** (retried, idempotent via deterministic job ids) before doing real work. Several worker replicas are safe — each event is claimed once (`SET NX`).
* **Authorization is enforced server-side on every frame**: channel access comes from the Redis membership cache (`channel:<id>:members`, invalidated by the API on any membership change). Private channels return *not found*, not *forbidden*.
* **DMs are channels** (`kind: 'dm'`), so history, subscriptions, receipts, search and access control are one code path.

## Known limitations

* Pub/Sub events aren't replayed: if the worker is down, *event-derived* notifications/activity for that window are lost (API-originated audit/email jobs are durable in BullMQ).
* Single Redis (no Sentinel/Cluster) and local-disk file storage (swap point: `apps/api/src/routes/file.routes.ts`).
* Read receipts are limited to DMs and private channels on purpose (in large public channels they'd be O(members²) frames).
* The WS JWT travels in the query string (browsers can't set headers on `WebSocket`); use TLS and avoid logging query strings at your proxy.
* Message search is word-based (MongoDB text index), not substring.
* Prometheus alert rules are provided but no Alertmanager is wired up.
* No refresh tokens (7-day JWT, revocable via logout).
