# WebSocket protocol

`ws` has no event abstraction, so every frame in both directions is JSON `{ "type": string, "payload": object }`.
The authoritative definitions (zod schemas + TypeScript types) are in
[`packages/shared-types/src/ws.ts`](../packages/shared-types/src/ws.ts); the server validates **every** client frame against them.

## Connecting

```
ws://host:8080/?token=<JWT from POST /api/auth/login>
```

* Invalid/expired/revoked token → the socket opens and is immediately closed with code **`4401`** (clients should log out, not retry).
* Disallowed `Origin` → HTTP 403 on upgrade.
* Frames larger than 64 KB close the connection. ~20 frames/s sustained (burst 40) per socket; excess gets `ERROR { code: "RATE_LIMITED" }`.
* Server pings every 30 s; clients answer automatically (browsers do). No pong ⇒ the server terminates the socket.
* `GET :8080/health` and `GET :8080/metrics` are served on the same port.

## Client → Server

| `type` | `payload` | Notes |
|---|---|---|
| `JOIN_CHANNEL` | `{ channelId }` | access-checked; replies `CHANNEL_JOINED` + `MESSAGE_HISTORY` |
| `LEAVE_CHANNEL` | `{ channelId }` | stop receiving the channel |
| `SEND_MESSAGE` | `{ channelId, content, tempId?, attachmentIds? }` | `content` may be empty if attachments are present |
| `SEND_THREAD_REPLY` | `{ parentMessageId, channelId, content, tempId? }` | one level deep |
| `EDIT_MESSAGE` | `{ messageId, channelId, newContent }` | author only |
| `DELETE_MESSAGE` | `{ messageId, channelId }` | author, or workspace admin; soft delete |
| `ADD_REACTION` / `REMOVE_REACTION` | `{ messageId, channelId, emoji }` | idempotent |
| `TYPING_START` / `TYPING_STOP` | `{ channelId }` | auto-stops after 3 s |
| `MARK_DELIVERED` / `MARK_READ` | `{ messageId, channelId }` | persisted; broadcast as `RECEIPT_UPDATE` |
| `LOAD_MORE_MESSAGES` | `{ channelId, before }` | `before` = id of the oldest message you have |

```json
{ "type": "SEND_MESSAGE", "payload": { "channelId": "66f…", "content": "Hello @bob", "tempId": "temp_1" } }
```

## Server → Client

| `type` | `payload` |
|---|---|
| `CONNECTED` | `{ userId, username, message, onlineUserIds }` |
| `PRESENCE_SNAPSHOT` | `{ onlineUserIds }` — resent when your workspace membership changes |
| `PRESENCE_UPDATE` | `{ userId, username, status: "online" \| "offline" }` |
| `CHANNEL_JOINED` | `{ channelId }` |
| `MESSAGE_HISTORY` / `MORE_MESSAGES_LOADED` | `{ channelId, messages: MessageDTO[], hasMore }` (oldest → newest, top-level messages only) |
| `NEW_MESSAGE` / `THREAD_REPLY` | `MessageDTO` (+ `tempId` so the sender can replace its optimistic copy) |
| `MESSAGE_EDITED` | `{ messageId, channelId, newContent, editedAt }` |
| `MESSAGE_DELETED` | `{ messageId, channelId }` |
| `REACTION_UPDATE` | `{ messageId, channelId, emoji, userId, action: "add" \| "remove" }` |
| `TYPING_UPDATE` | `{ channelId, userId, username, isTyping }` |
| `RECEIPT_UPDATE` | `{ messageId, channelId, userId, status: "delivered" \| "read" }` |
| `NOTIFICATION` | `NotificationDTO` (+ `senderName`) |
| `CHANNEL_UPDATED` | `{ channelId, workspaceId, change: "created" \| "renamed" \| "archived" \| "unarchived" \| "deleted" \| "members" }` |
| `ERROR` | `{ message, code? }` — codes: `INVALID_MESSAGE`, `NOT_FOUND`, `FORBIDDEN`, `ARCHIVED`, `RATE_LIMITED`, `INTERNAL`, `BAD_REQUEST` |

`MessageDTO`: `{ id, channelId, content, timestamp, user: {id,name}, parentMessageId, reactions: [{emoji,userIds}], attachments: FileDTO[], isEdited, isDeleted, deliveredTo, readBy, replyCount, tempId? }`.

## Receipts: Sent → Delivered → Read

*Sent* = the server persisted and broadcast the message (implicit). A receiving client reports `MARK_DELIVERED` when the frame arrives and `MARK_READ` when it is visible. The web client does this for DMs and private channels only.

## Reconnecting

On reconnect, re-send `JOIN_CHANNEL` for the open channel to get fresh history (the web client does this when `connected` flips). The server re-subscribes you to every channel you can access automatically.
