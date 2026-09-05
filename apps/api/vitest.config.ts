import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    globalSetup: ['../../packages/db/tests/preparar.ts'],
    // O teste de ponta a ponta aplica migration, sobe a API e drena o outbox.
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 180_000,
  },
});
