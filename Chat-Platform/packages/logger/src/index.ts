import winston from 'winston';

export type Logger = winston.Logger;

/**
 * Structured logger. JSON lines in production (easy to ship to Loki/ELK),
 * coloured human-readable lines in development.
 */
export function createLogger(service: string, level = process.env.LOG_LEVEL ?? 'info'): Logger {
  const isProd = process.env.NODE_ENV === 'production';

  const devFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message, service: svc, ...meta }) => {
      const rest = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
      return `${timestamp} [${svc}] ${level}: ${message}${rest}`;
    }),
  );

  const prodFormat = winston.format.combine(winston.format.timestamp(), winston.format.errors({ stack: true }), winston.format.json());

  return winston.createLogger({
    level,
    defaultMeta: { service },
    format: isProd ? prodFormat : winston.format.combine(winston.format.errors({ stack: true }), devFormat),
    transports: [new winston.transports.Console()],
    silent: process.env.NODE_ENV === 'test',
  });
}
