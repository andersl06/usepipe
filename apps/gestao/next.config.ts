import path from 'node:path';
import type { NextConfig } from 'next';

/**
 * `pg` e `drizzle-orm` só rodam no servidor: fora do bundle do Next, senão o
 * webpack tenta empacotar o driver nativo do Postgres.
 *
 * `@pipe/ui` é consumido como fonte (não tem passo de build), então o Next
 * precisa transpilá-lo junto com o aplicativo.
 */
const config: NextConfig = {
  // Servidor autocontido em `.next/standalone`: é o que deixa a imagem final
  // rodar sem devDependencies e sem o Next instalado ao lado.
  output: 'standalone',
  // Sem isto o Next enraíza o rastreamento em `apps/gestao` e deixa de fora
  // `packages/*` e o store do pnpm, que vivem acima — o servidor sobe e quebra
  // no primeiro import de `@pipe/db`.
  outputFileTracingRoot: path.join(import.meta.dirname, '..', '..'),
  serverExternalPackages: ['pg', 'drizzle-orm', '@pipe/db'],
  // A importação de contatos sobe o CSV por Server Action, e o teto padrão é 1 MB.
  // 20 MB é o mesmo teto da rota da `api` que recebe o arquivo.
  experimental: { serverActions: { bodySizeLimit: '20mb' } },
  transpilePackages: ['@pipe/ui'],
};

export default config;
