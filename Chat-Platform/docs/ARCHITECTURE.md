# Architecture

## Components

| App | Responsibility | Scales by |
|---|---|---|
| `api` | REST: auth, workspaces, channels, DMs, history reads, files, search, notifications, activity | more replicas (stateless) |
| `websocket` | Upgrade auth, per-socket state, channel subscriptions, typing, presence, message writes | more replicas (Redis fan-out) |
| `worker` | BullMQ consumers (notifications, audit, email) + event services (notification, audit, activity, analytics) | more replicas (event claims, idempotent jobs) |
| `web` | SPA; Zustand holds live message state, React Query holds server state | static hosting / CDN |

## Message lifecycle

```
Client ──SEND_MESSAGE──► WS instance A
                         1. zod-validate frame, rate-limit
                         2. requireChannel(): Redis channel:<id>:members (miss → Mongo)
                         3. Message.create()                         ← persist first
                         4. PUBLISH ws:broadcast {channel, NEW_MESSAGE}
                         5. PUBLISH message-created {…recipients, mentions}
                                  │                         │
              every WS instance ◄─┘                         └─► worker (any replica; claims once)
              delivers to ITS subscribers of the channel          ├ notification service → BullMQ 'notifications' job
              (sender gets it back with its tempId)               │     → Notification doc → PUBLISH notification-created
                                                                  │          → WS instance owning the user pushes NOTIFICATION
                                                                  ├ audit service → BullMQ 'audit' → AuditLog
                                                                  ├ activity service → Activity doc
                                                                  └ analytics service → Redis counters
```

## Connection lifecycle (`apps/websocket/src/index.ts`)

```
HTTP Upgrade ─► origin allow-list ─► JWT verify (+ logout blacklist) ──fail──► accept then close(4401)
      │ok
      ▼
 Register ─► Subscribe to channels (all the user can see) ─► presence (Redis) ─► CONNECTED { onlineUserIds } ─► Ready
      │
      ▼   every 30 s:  ping → pong → alive   (no pong ⇒ terminate); refresh presence TTLs
```

Subscriptions are manual (`Map<channelId, Set<socket>>`); they're kept in step with the API through `CHANNEL_UPDATED` frames (new private channel/DM → subscribe; removed from a channel → unsubscribe; joined/left a workspace → recompute scope and resend a presence snapshot).

## Redis usage

| Key / channel | Type | Purpose |
|---|---|---|
| `online:<userId>` | string `"true"`, TTL 90 s | presence (spec) |
| `presence:sockets:<userId>` | set of `<instance>:<socket>`, TTL 90 s | multi-tab/instance: offline only when the set empties; TTLs heal crashed instances |
| `channel:<id>:members` | set, TTL 5 min | who may see/post in a channel — hot path of every WS frame |
| `blacklist:<jwt>` | string, TTL = token remainder | logout revocation |
| `evt:<service>:<key>` | string NX, TTL 1 h | claim an event so one worker replica handles it |
| `analytics:messages:<date>`, `analytics:posters:<date>` | hash / set | cheap rollups |
| `ws:broadcast` | pub/sub | client-bound frames across WS instances |
| `message-created`, `presence-updated`, `notification-created`, `channel-created`, `user-joined`, `file-uploaded` | pub/sub | domain events |
| `bull:notifications|audit|email:*` | BullMQ | durable job queues |

## Data model (MongoDB)

`User` · `Workspace` (+ `inviteCode`) · `WorkspaceMember` (role) · `Channel` (`kind: public|private|dm`, `memberIds`, `isArchived`, `dmKey`) · `Message` (reactions, `deliveredTo`/`readBy`, `parentMessageId`, attachments, soft delete) · `Notification` · `AuditLog` · `File` (metadata; bytes on disk) · `Activity`.
Text indexes on message content, user name/email and channel name power search. Messages are indexed `{channelId, parentMessageId, _id}` for history.

## Security model

* **JWT** (HS256) verified on every REST call and on WS upgrade; logout blacklists the token. Production refuses to boot with a weak `JWT_SECRET`.
* **Tenant isolation:** workspace/channel membership is checked for every read and write; non-members get *404* (existence isn't revealed). Search, activity and file downloads honour the same rules.
* **Input validation:** zod on every REST body/query and on every WS frame; WS frames are size-capped (64 KB) and rate-limited per socket.
* **Files:** random on-disk names, size limit, access-checked downloads; only raster images render inline — everything else (HTML, SVG…) is served as an attachment with `nosniff` and a sandbox CSP.
* **Passwords:** bcrypt; identical response for unknown email vs. wrong password; login/register rate-limited.
* **Browser:** helmet headers, CORS allow-list (also applied to WS `Origin`), message content rendered via React (escaped), mentions only styled when they resolve to real members.

## Observability

Every service exposes Prometheus metrics (`api:5000/metrics`, `websocket:8080/metrics`, `worker:9102/metrics`): HTTP latency histogram, WS connections / frames / broadcasts, domain events, **`queue_jobs{queue,state}`** (backlog), default process/memory metrics. `ops/` provisions Prometheus (scrape + alert rules: high 5xx rate, queue backlog, failed jobs, memory spike, target down) and a Grafana dashboard. Redis metrics come from `redis_exporter`.
