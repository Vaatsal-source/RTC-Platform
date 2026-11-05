import { loadConfig } from '@repo/config';
import { createLogger } from '@repo/logger';

export const config = loadConfig();
export const logger = createLogger('ws', config.LOG_LEVEL);
