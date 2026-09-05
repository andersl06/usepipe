import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.teste.ts'],
    environment: 'node',
  },
});
