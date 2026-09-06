import type { NextConfig } from 'next';

/**
 * `pg` e `drizzle-orm` só rodam no servidor: fora do bundle do Next, senão o
 * webpack tenta empacotar o driver nativo do Postgres.
 *
 * `@pipe/ui` é consumido como fonte (não tem passo de build), então o Next
 * precisa transpilá-lo junto com o aplicativo.
 */
const config: NextConfig = {
  serverExternalPackages: ['pg', 'drizzle-orm', '@pipe/db'],
  transpilePackages: ['@pipe/ui'],
};

export default config;
