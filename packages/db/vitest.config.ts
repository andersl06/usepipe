import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Sobe o Postgres do compose se ele ainda não estiver de pé.
    globalSetup: ['tests/preparar.ts'],
    // O teste de RLS aplica migration e semeia dois tenants: sequencial e com folga.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
