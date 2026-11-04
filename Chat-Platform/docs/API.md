# REST API

Base URL `http://localhost:5000/api` (`/auth/*` is additionally exposed without the `/api` prefix, as in the spec).
All endpoints except register/login need `Authorization: Bearer <jwt>`.
Success → `{ "success": true, … }`. Failure → `{ "success": false, "message": string, "errors"?: [{field,message}] }` with a conventional status (400 validation, 401 auth, 403 permission, 404 not found *or not visible to you*, 409 conflict).

Message **writes** (send/edit/delete/react/receipts) happen over WebSocket — see [WEBSOCKET_PROTOCOL.md](WEBSOCKET_PROTOCOL.md). Types: [`packages/shared-types/src/dto.ts`](../packages/shared-types/src/dto.ts).

## Auth
| | |
|---|---|
| `POST /auth/register` `{name,email,password≥8}` | → `{token,user}` |
| `POST /auth/login` `{email,password}` | → `{token,user}` (rate-limited) |
| `POST /auth/logout` | revokes the token |
| `GET /auth/me` | → `{user}` |

## Workspaces (roles: `admin`, `member`)
| | |
|---|---|
| `POST /workspaces` `{name,description?}` | creator becomes admin; `#general` is created |
| `GET /workspaces` | the caller's workspaces (with `myRole`; `inviteCode` for admins) |
| `GET /workspaces/:id` · `PATCH /workspaces/:id` (admin) · `DELETE /workspaces/:id` (owner) | |
| `POST /workspaces/join` `{code}` | join by invite code |
| `POST /workspaces/:id/invite-code` (admin) | rotate the invite code |
| `GET /workspaces/:id/members` | members + role + `online` |
| `POST /workspaces/:id/members` `{email \| userId}` (admin) | add an existing user; sends notification + email |
| `PATCH /workspaces/:id/members/:userId` `{role}` (admin) | the owner's role is fixed |
| `DELETE /workspaces/:id/members/:userId` | admin removes, or a member leaves |
| `GET /workspaces/:id/activity?limit=` | activity feed (private-channel events hidden from non-members) |
| `GET /workspaces/:id/channels` · `POST /workspaces/:id/channels` `{name,isPrivate?,memberIds?}` | public + the private channels you're in |

## Channels & messages
| | |
|---|---|
| `GET /channels/:id` | |
| `GET /channels/:id/messages?before=&limit=` | paginated history (newest page first, `before` = message id) → `{messages,hasMore}` |
| `PATCH /channels/:id` `{name}` · `POST /channels/:id/archive` · `…/unarchive` · `DELETE /channels/:id` | workspace admin or channel creator; `#general` can't be deleted |
| `GET /channels/:id/members` · `POST /channels/:id/members` `{userId}` · `DELETE /channels/:id/members/:userId` | private channels |
| `GET /messages/:id/replies` | thread replies |

## Direct messages
`GET /dms` — your DM channels with `dmUser` + presence · `POST /dms` `{userId}` — find-or-create (only between people who share a workspace).

## Notifications, files, search
| | |
|---|---|
| `GET /notifications?unread=1&limit=` | → `{notifications, unreadCount}` |
| `POST /notifications/read` `{ids?}` | omit `ids` to mark all read |
| `POST /files` multipart: `channelId` **then** `file` | → `{file}`; then reference `file.id` in `SEND_MESSAGE.attachmentIds` |
| `GET /files/:id[?download=1]` | access-checked; raster images inline, everything else as attachment |
| `GET /search?q=&workspaceId=` | → `{messages,users,channels}` (MongoDB text index; only what you may see) |
| `GET /search/users?q=&workspaceId=` | people picker |

## Ops
`GET /health` (Mongo + Redis status, 503 if degraded) · `GET /metrics` (Prometheus).
