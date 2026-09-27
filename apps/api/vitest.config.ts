import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    globalSetup: ['../../packages/db/tests/preparar.ts'],
    // The end-to-end test applies the migration, starts the API and drains the outbox.
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 180_000,
    // isolated-vm (script sandbox) requires this flag on Node 20+; same flag as the Dockerfile CMD.
    poolOptions: { forks: { execArgv: ['--no-node-snapshot'] } },
  },
});
