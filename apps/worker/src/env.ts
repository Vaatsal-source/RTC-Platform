import { loadConfig } from '@repo/config';
import { createLogger } from '@repo/logger';

export const config = loadConfig();
export const logger = createLogger('worker', config.LOG_LEVEL);
