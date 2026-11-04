import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

// No Mongo/Redis needed: these tests cover everything that happens *before* the database is touched
// (auth guard, validation, error shaping). End-to-end behaviour is covered by `pnpm e2e`.
const redis = vi.hoisted(() => ({ exists: vi.fn(async () => 0), ping: vi.fn(async () => 'PONG'), setex: vi.fn() }));
vi.mock('@repo/queue', async (orig) => ({ ...(await orig<object>()), getRedis: () => redis, enqueueAudit: vi.fn(), enqueueEmail: vi.fn() }));

import { createApp } from './app';
import { signToken } from './middleware/auth';

const app = createApp();
const token = signToken({ userId: 'a'.repeat(24), email: 'a@b.co', name: 'Ann' });

beforeEach(() => redis.exists.mockResolvedValue(0));

describe('auth guard', () => {
  it('rejects requests without a token', async () => {
    const res = await request(app).get('/api/workspaces');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('rejects garbage and wrongly-signed tokens', async () => {
    expect((await request(app).get('/api/workspaces').set('Authorization', 'Bearer nope')).status).toBe(401);
    const forged = jwt.sign({ userId: 'x', email: 'x@y.z', name: 'X' }, 'some-other-secret');
    expect((await request(app).get('/api/workspaces').set('Authorization', `Bearer ${forged}`)).status).toBe(401);
  });

  it('rejects revoked (logged-out) tokens', async () => {
    redis.exists.mockResolvedValue(1);
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/revoked/i);
  });
});

describe('validation', () => {
  it('rejects a weak password at registration', async () => {
    const res = await request(app).post('/api/auth/register').send({ name: 'Ann', email: 'ann@x.io', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.errors[0].field).toBe('password');
  });

  it('rejects a malformed email', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'not-an-email', password: 'x' });
    expect(res.status).toBe(400);
  });

  it('rejects invalid JSON bodies cleanly', async () => {
    const res = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{oops');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/JSON/);
  });

  it('validates channel names', async () => {
    const res = await request(app)
      .post(`/api/workspaces/${'b'.repeat(24)}/channels`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Has Spaces!' });
    expect(res.status).toBe(400);
  });
});

describe('misc', () => {
  it('serves the spec-style /auth alias', async () => {
    const res = await request(app).post('/auth/login').send({});
    expect(res.status).toBe(400); // reached the validator, i.e. the route exists
  });

  it('returns JSON 404 for unknown routes', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('exposes prometheus metrics', async () => {
    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.text).toContain('api_http_request_duration_seconds');
  });

  it('does not advertise the framework', async () => {
    expect((await request(app).get('/')).headers['x-powered-by']).toBeUndefined();
  });
});
