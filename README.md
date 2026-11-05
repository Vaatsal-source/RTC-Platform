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
[Architecture](Chat-Platform/docs/ARCHITECTURE.md) · [WebSocket protocol](Chat-Platform/docs/WEBSOCKET_PROTOCOL.md) · [REST API](Chat-Platform/docs/API.md) · [**Deployment (free-tier friendly)**](Chat-Platform/docs/DEPLOYMENT.md)

---

## Quick start

Prerequisites: **Node ≥ 22**, **pnpm 11**, **Docker Desktop**.

### A) Run it on your machine (hot reload)

```bash
cd Chat-Platform
pnpm install                  # first time only
cp .env.example .env          # first time only; the defaults work locally
pnpm local                    # starts MongoDB + Redis + Mailpit in Docker, waits until they're ready, then api · websocket · worker · web
```

Open <http://localhost:5173>, register two users in two browsers (or one normal + one private window) and chat.
Every email the app sends (verification, password reset, invitations, offline mentions) lands in the local inbox at <http://localhost:8025> — set `SMTP_HOST=localhost` and `SMTP_PORT=1025` in `.env` to enable it.
Stop with Ctrl+C, then `pnpm infra:down`. (`pnpm infra:up` + `pnpm dev` are the same thing as `pnpm local`, in two steps.)

### B) Run the whole stack in Docker

```bash
cd Chat-Platform
cp .env.example .env     # then set JWT_SECRET, MONGO_PASSWORD, REDIS_PASSWORD (hex: openssl rand -hex 24)
docker compose up --build                                  # frontend :3000 · api :5000 · ws :8080
docker compose --profile scale --profile observability up --build   # + 2nd WS instance :8082, Prometheus :9090, Grafana :3001
```

Services: `frontend` (nginx), `api`, `websocket`, `worker`, `redis`, `mongodb` — plus optional profiles for a **Caddy HTTPS proxy**, **Cloudflare Tunnel**, a second WS instance, **Prometheus/Grafana**, **Alertmanager** and **daily backups**. MongoDB and Redis are password-protected; Prometheus/Grafana bind to localhost. See [Deployment](Chat-Platform/docs/DEPLOYMENT.md) for free hosting options.

---

## Monorepo layout

```
Chat-Platform/
├── apps/
│   ├── web/          React SPA (Vite, Tailwind v4, Zustand, React Query)
│   ├── api/          Express 5 REST API (auth + recovery, workspaces, channels, files, search, audit, …)
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
├── ops/              Caddy, Prometheus (+ alert rules), Alertmanager, Grafana provisioning + dashboard
├── docs/             Architecture, WebSocket protocol, REST API, deployment
├── scripts/e2e.ts    End-to-end test against a running stack (134 checks)
├── Dockerfile        One image recipe for api | websocket | worker
└── docker-compose.yml / docker-compose.dev.yml
```

Internal packages are consumed **as TypeScript source** (no build step between them); services run with `tsx`.

---

## Feature checklist

| Module | What's there |
|---|---|
| **1 Auth** | Register / login / logout / `GET /auth/me`, bcrypt, 1 h JWT + **rotating refresh tokens** (silent renewal), **email verification**, **password reset** (signs out every other session), logout revocation, rate limits, no user enumeration |
| **2 Workspaces** | Create, settings, invite by email — **including people with no account yet** (redeemed when they verify) — or invite link, roles (admin/member), remove/leave, rotate invite code, delete (owner); admins get an **audit log** and **insights** (messages/day, busiest channels) |
| **3 Channels** | Public, private (explicit members), archive (read-only), delete; `#general` auto-created |
| **4 Messaging (ws)** | Send, edit, delete (author or admin), history, infinite scroll, emoji reactions, thread replies, attachments |
| **5 Presence** | `online:<userId>` in Redis, multi-tab + multi-instance safe, `presence-updated` event |
| **6 Typing** | Ephemeral (no DB), 3 s auto-timeout |
| **7 Read receipts** | Sent → Delivered → Read, persisted (1:1 DMs and private channels) |
| **8 DMs** | 1:1 chat on the same channel machinery, presence, history |
| **9 Notifications** | Mentions, DM/thread-reply messages, invites — persisted by the worker, pushed live, bell + toasts, email for offline mentions |
| **10 Files** | Upload, inline image preview, download; auth-protected; unsafe types forced to download; local disk **or any S3-compatible bucket** (R2, B2, S3, MinIO) |
| **11 Search** | MongoDB text indexes: messages, users, channels — scoped to what the caller may see |
| **12 Activity feed** | Message sent · user joined · channel created · file uploaded |
| **Redis** | Presence, channel-membership cache, Pub/Sub (`message-created`, `presence-updated`, `notification-created`, …) |
| **BullMQ** | Notification, Audit and Email queues with retries/backoff |
| **Docker / CI** | Compose stack, per-service images, GitHub Actions (lint → typecheck → test → build → e2e with a mail catcher → docker) |
| **Observability** *(optional)* | Prometheus metrics on every service, Grafana dashboard, alert rules → **Alertmanager → Discord**, automated **MongoDB backups** |

---

## Configuration

All services read the same variables (see [`.env.example`](Chat-Platform/.env.example)); they are validated at boot by `@repo/config`.

| Variable | Default | Notes |
|---|---|---|
| `MONGO_URI` | `mongodb://127.0.0.1:27017/syncgrid` | |
| `REDIS_URL` | `redis://127.0.0.1:6379` | |
| `JWT_SECRET` | dev value | **Required, ≥ 32 chars and not a placeholder when `NODE_ENV=production`** — the app refuses to start otherwise |
| `JWT_EXPIRES_IN`, `REFRESH_TOKEN_DAYS` | `1h`, `30` | access / refresh token lifetimes |
| `TRUST_PROXY` | `0` | set `1` behind Caddy / Cloudflare so rate limits see real IPs |
| `API_PORT` / `WS_PORT` | `5000` / `8080` | |
| `CORS_ORIGIN` | `http://localhost:5173` | comma-separated; also enforced on the WS upgrade |
| `UPLOAD_DIR`, `MAX_UPLOAD_MB` | `./uploads`, `10` | |
| `S3_BUCKET`, `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | empty | set a bucket to store files in S3/R2/B2 instead of disk |
| `SMTP_HOST` … | empty | empty ⇒ emails are logged instead of sent (dev: Mailpit, see `pnpm infra:up`) |
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

* **Unit tests (64)** — protocol validation, mention parsing, notification rules, WS registry fan-out, presence and token semantics, message reducers, API auth/validation (no DB needed).
* **`pnpm e2e` (134 checks)** — real HTTP + WebSocket clients against the running stack: auth (incl. refresh rotation), roles, access control, every message feature, rate limiting, presence, receipts, DMs, files (incl. XSS and cross-tenant access), search, activity, audit/analytics, and — when a [Mailpit](https://mailpit.axllent.org) is reachable — **email verification, password reset and invite-before-signup over real SMTP**. If a second WS instance is reachable on `:8082` (`WS_PORT=8082 pnpm --filter @repo/websocket start`, or `--profile scale`), Alice and Bob connect to **different instances**, so every cross-user assertion also proves the Redis backplane.

---

## Deploying

Free-tier friendly paths (your PC + Cloudflare Tunnel, or an Oracle "Always Free" VM + Caddy HTTPS), hardened compose defaults, SMTP/S3/backup/alert setup and a verification checklist are in **[docs/DEPLOYMENT.md](Chat-Platform/docs/DEPLOYMENT.md)**.

---

## Design decisions worth knowing

* **Persist, then broadcast.** A message is written to MongoDB first; the id/timestamp clients see are the stored ones, and a failed write is reported to the sender instead of leaving a ghost message.
* **Redis is the backplane.** No process writes to another's sockets. Anything that wants to reach clients publishes on `ws:broadcast`; each WS instance delivers to the sockets *it* owns. Domain events (`message-created`, …) are published for services to react to — the message path never calls notification/audit code directly.
* **Pub/Sub is fire-and-forget, so durability is explicit:** consumers turn events into **BullMQ jobs** (retried, idempotent via deterministic job ids) before doing real work. Several worker replicas are safe — each event is claimed once (`SET NX`).
* **Authorization is enforced server-side on every frame**: channel access comes from the Redis membership cache (`channel:<id>:members`, invalidated by the API on any membership change). Private channels return *not found*, not *forbidden*.
* **DMs are channels** (`kind: 'dm'`), so history, subscriptions, receipts, search and access control are one code path.

## Known limitations

* Pub/Sub events aren't replayed: if the worker is down, *event-derived* notifications/activity for that window are lost (API-originated audit/email jobs are durable in BullMQ).
* Single Redis and single MongoDB node (no Sentinel/replica set) — fine for small teams, not for high availability.
* Read receipts are limited to DMs and private channels on purpose (in large public channels they'd be O(members²) frames).
* The WS access token travels in the query string (browsers can't set headers on `WebSocket`); use TLS and avoid logging query strings at your proxy. Existing sockets stay open until they reconnect even if their token later expires.
* Tokens live in `localStorage` (mitigated by 1 h access tokens, rotating single-use refresh tokens and strict download headers) — an XSS bug would still expose them.
* Message search is word-based (MongoDB text index), not substring.
* Email verification is *soft*: unverified users can chat, but invitations sent to their address are only redeemed after verification.
* Alert delivery, Let's Encrypt, Cloudflare Tunnel and real SMTP/S3 providers are configured but need your accounts — see "What was verified" in the deployment guide.
