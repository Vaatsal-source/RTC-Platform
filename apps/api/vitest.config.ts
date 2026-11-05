import os from 'node:os';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      NODE_ENV: 'test',
      JWT_SECRET: 'test-secret-test-secret-test-secret',
      UPLOAD_DIR: path.join(os.tmpdir(), 'syncgrid-api-test-uploads'),
    },
  },
});
