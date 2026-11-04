import { describe, expect, it } from 'vitest';
import { parseConfig } from './index';

describe('parseConfig', () => {
  it('applies defaults', () => {
    const cfg = parseConfig({});
    expect(cfg.API_PORT).toBe(5000);
    expect(cfg.WS_PORT).toBe(8080);
    expect(cfg.NODE_ENV).toBe('development');
  });

  it('coerces numeric env vars', () => {
    expect(parseConfig({ API_PORT: '6001' }).API_PORT).toBe(6001);
  });

  it('rejects invalid values', () => {
    expect(() => parseConfig({ API_PORT: 'abc' })).toThrow(/API_PORT/);
  });

  it('refuses a weak JWT secret in production', () => {
    expect(() => parseConfig({ NODE_ENV: 'production' })).toThrow(/JWT_SECRET/);
    expect(() => parseConfig({ NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(40) })).not.toThrow();
  });

  it('refuses the .env.example placeholder in production even though it is long enough', () => {
    expect(() => parseConfig({ NODE_ENV: 'production', JWT_SECRET: 'change-me-in-production-please-use-32+chars' })).toThrow(/JWT_SECRET/);
  });
});
