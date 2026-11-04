import { z } from 'zod';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { config as loadDotenv } from 'dotenv';

// ─── Environment validation ───────────────────────────────────────────────────
// One schema for every service. Each service calls loadConfig() once at boot;
// a bad/missing variable fails fast with a readable message instead of a
// mysterious runtime error later.

const DEV_JWT_SECRET = 'dev_secret_change_in_prod';

const port = (def: number) => z.coerce.number().int().min(1).max(65535).default(def);

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'debug']).default('info'),

  MONGO_URI: z.string().default('mongodb://127.0.0.1:27017/syncgrid'),
  REDIS_URL: z.string().default('redis://127.0.0.1:6379'),

  JWT_SECRET: z.string().default(DEV_JWT_SECRET),
  JWT_EXPIRES_IN: z.string().default('7d'),

  API_PORT: port(5000),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  APP_URL: z.string().default('http://localhost:5173'),
  UPLOAD_DIR: z.string().default('./uploads'),
  MAX_UPLOAD_MB: z.coerce.number().positive().default(10),

  WS_PORT: port(8080),

  WORKER_METRICS_PORT: port(9102),
  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: port(587),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  EMAIL_FROM: z.string().default('SyncGrid <no-reply@syncgrid.local>'),
});

export type AppConfig = z.infer<typeof schema>;

let cached: AppConfig | null = null;

/** Walk up from cwd looking for a `.env` so every app in the monorepo shares one file. */
function findEnvFile(): string | null {
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    const candidate = path.join(dir, '.env');
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function parseConfig(env: Record<string, string | undefined>): AppConfig {
  const result = schema.safeParse(env);
  if (!result.success) {
    const details = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  const cfg = result.data;
  // Placeholders from .env.example / the dev default are public knowledge, whatever their length.
  const placeholder = cfg.JWT_SECRET === DEV_JWT_SECRET || /change-?me/i.test(cfg.JWT_SECRET);
  if (cfg.NODE_ENV === 'production' && (placeholder || cfg.JWT_SECRET.length < 32)) {
    throw new Error('JWT_SECRET must be set to a random value of at least 32 characters in production (not a placeholder)');
  }
  return cfg;
}

export function loadConfig(): AppConfig {
  if (cached) return cached;
  const envFile = findEnvFile();
  if (envFile) loadDotenv({ path: envFile, quiet: true });
  cached = parseConfig(process.env);
  return cached;
}

/** Test helper. */
export function resetConfigCache(): void {
  cached = null;
}
