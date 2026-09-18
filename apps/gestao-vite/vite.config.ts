import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

/**
 * Pipe Gestão como SPA — o desenho de `docs/specs/2026-09-07-arquitetura-de-front.md`:
 * Vite com SWC, front estático, e a `api` NestJS como a única porta para o banco.
 *
 * Em desenvolvimento o `/v1` é proxy para a `api` (3010), para o cookie
 * `pipe_sessao` (HttpOnly) ir e voltar na MESMA origem — sem CORS e sem token
 * no navegador. Em produção os dois vivem sob `.usepipe.com.br` e o cookie
 * atravessa por `Domain`, como a spec descreve.
 *
 * `@pipe/ui` é consumido como fonte, sem passo de build — o mesmo arranjo que
 * o Next fazia com `transpilePackages`.
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
