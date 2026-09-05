import type { NextConfig } from 'next';

/**
 * `pg` e `drizzle-orm` só rodam no servidor: fora do bundle do Next, senão o
 * webpack tenta empacotar o driver nativo do Postgres.
 */
const config: NextConfig = {
  serverExternalPackages: ['pg', 'drizzle-orm', '@pipe/db'],
};

export default config;
