import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

/**
 * Pipe Gestão as an SPA — the design from `docs/specs/2026-09-07-arquitetura-de-front.md`: Vite with SWC, a static front, and the NestJS `api` as the only gateway to the database.
 *
 * In development `/v1` is proxied to the `api` (3010), so the `pipe_sessao` (HttpOnly) cookie can travel back and forth on the SAME origin — no CORS, no token in the browser. In production both live under `.usepipe.com.br` and the cookie crosses via `Domain`, as the spec describes.
 *
 * `@pipe/ui` is consumed as source, with no build step — the same arrangement the Next app used with `transpilePackages`.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
      '@pipe/ui/estilos.css': path.resolve(import.meta.dirname, '../../packages/ui/src/estilos.css'),
      '@pipe/ui': path.resolve(import.meta.dirname, '../../packages/ui/src'),
    },
  },
  server: {
    port: Number(process.env['VITE_PORTA']) || 3110,
    proxy: {
      '/v1': {
        target: process.env['PIPE_URL_API'] || 'http://127.0.0.1:3010',
        changeOrigin: true,
      },
    },
  },
});
