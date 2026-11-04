import { getRedis } from '@repo/queue';

/**
 * Redis Pub/Sub delivers each event to EVERY subscriber. With several worker replicas
 * that would create duplicate activity rows etc., so exactly one replica claims each
 * (service, event) pair via SET NX and the rest skip it.
 */
export async function claim(service: string, eventKey: string, ttlSeconds = 3600): Promise<boolean> {
  const res = await getRedis().set(`evt:${service}:${eventKey}`, '1', 'EX', ttlSeconds, 'NX');
  return res === 'OK';
}
