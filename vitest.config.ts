import { defineConfig } from 'vitest/config';
import { testDatabaseUrl } from './tests/support/test-db.js';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    globalSetup: ['tests/support/global-setup.ts'],
    // Os testes de integração compartilham um único banco: um arquivo por vez
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: testDatabaseUrl(),
      JWT_SECRET: 'test-secret-test-secret-test-secret-123456',
      ADMIN_LOGIN: 'admin',
      ADMIN_PASSWORD: 'admin-inicial',
      ANTHROPIC_API_KEY: ''
    }
  }
});
