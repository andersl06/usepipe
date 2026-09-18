import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

/**
 * Pipe Desk como SPA — o mesmo arranjo de `apps/gestao-vite/vite.config.ts`:
 * Vite com SWC, front estático, e a `api` NestJS como a única porta para o banco.
 *
 * Em desenvolvimento o `/v1` é proxy para a `api` (3010), para o cookie
 * `pipe_sessao` (HttpOnly) ir e voltar na MESMA origem — sem CORS e sem token
 * no navegador. A porta 3210 é a do Desk; a Gestão fica na 3110.
 *
 * `@pipe/ui` é consumido como fonte, sem passo de build.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
      '@pipe/ui/estilos.css': path.resolve(
        import.meta.dirname,
        '../../packages/ui/src/estilos.css',
      ),
      '@pipe/ui': path.resolve(import.meta.dirname, '../../packages/ui/src'),
    },
  },
  server: {
    port: Number(process.env['VITE_PORTA']) || 3210,
    proxy: {
      '/v1': {
        target: process.env['PIPE_URL_API'] || 'http://127.0.0.1:3010',
        changeOrigin: true,
      },
    },
  },
});
