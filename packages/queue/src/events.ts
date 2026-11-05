import type { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';
import {
  WS_BROADCAST_CHANNEL,
  type BroadcastEnvelope,
  type BroadcastTarget,
  type DomainEvent,
  type DomainEventType,
  type EventOf,
  type ServerMessageType,
} from '@repo/shared-types';
import { createRedis, getRedis } from './redis.js';

// ═══════════════════════════════════════════════════════════════════════════
// Event bus on Redis Pub/Sub.
//
//   publisher (api / ws)  ──publish('message-created', event)──▶  Redis
//   subscribers (worker, ws)  ◀──────────────────────────────────  Redis
//
// Publishers don't know who consumes an event — that's the whole point.
// Pub/Sub is fire-and-forget: anything that must not be lost (notifications,
// audit) is converted to a BullMQ job by the subscriber.
// ═══════════════════════════════════════════════════════════════════════════

export async function publishEvent(event: DomainEvent): Promise<void> {
  try {
    await getRedis().publish(event.type, JSON.stringify(event));
  } catch (err) {
    console.error(`[events] failed to publish ${event.type}:`, (err as Error).message);
  }
}

type Handler<T extends DomainEventType> = (event: EventOf<T>) => void | Promise<void>;

export interface EventSubscriber {
  on<T extends DomainEventType>(type: T, handler: Handler<T>): void;
  start(): Promise<void>;
  close(): Promise<void>;
}

/**
 * Typed subscriber. Uses its own connection because a Redis connection in
 * subscribe mode can't issue regular commands.
 */
export function createEventSubscriber(name = 'events'): EventSubscriber {
  const sub: Redis = createRedis({ name: `${name}-sub`, subscriber: true });
  const handlers = new Map<string, Array<(e: any) => void | Promise<void>>>();

  sub.on('message', (channel, raw) => {
    const list = handlers.get(channel);
    if (!list) return;
    let event: DomainEvent;
    try {
      event = JSON.parse(raw);
    } catch {
      console.error(`[events] dropped malformed payload on ${channel}`);
      return;
    }
    for (const h of list) {
      Promise.resolve(h(event)).catch((err) => console.error(`[events] handler for ${channel} threw:`, err));
    }
  });

  return {
    on(type, handler) {
      const list = handlers.get(type) ?? [];
      list.push(handler as any);
      handlers.set(type, list);
    },
    async start() {
      const channels = [...handlers.keys()];
      if (channels.length) await sub.subscribe(...channels);
    },
    async close() {
      sub.disconnect();
    },
  };
}

// ─── Client-bound frames across WS instances ─────────────────────────────────
// Any process (api, ws, worker) can push a frame to connected clients by
// publishing on `ws:broadcast`; every WS instance forwards it to the matching
// sockets it owns. This is what makes the WS tier horizontally scalable.

export const INSTANCE_ID = process.env.INSTANCE_ID || randomUUID().slice(0, 8);

export async function publishBroadcast(
  target: BroadcastTarget,
  type: ServerMessageType,
  payload: unknown,
  excludeUserId?: string | null,
): Promise<void> {
  const envelope: BroadcastEnvelope = {
    origin: INSTANCE_ID,
    target,
    frame: JSON.stringify({ type, payload }),
    excludeUserId: excludeUserId ?? null,
  };
  try {
    await getRedis().publish(WS_BROADCAST_CHANNEL, JSON.stringify(envelope));
  } catch (err) {
    console.error('[events] failed to publish broadcast:', (err as Error).message);
  }
}
