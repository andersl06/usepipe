import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Start the compose Postgres instance if it is not already running.
    globalSetup: ['tests/preparar.ts'],
    // O teste de RLS aplica migration e semeia dois tenants: sequencial e com folga.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
