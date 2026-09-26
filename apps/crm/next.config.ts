import path from 'node:path';
import type { NextConfig } from 'next';

/**
 * `pg` and `drizzle-orm` only run on the server: outside the Next bundle, otherwise
 * webpack tries to bundle the native Postgres driver.
 *
 * `@pipe/ui` is consumed as source (no build step), so Next
 * needs to transpile it together with the app.
 */
const config: NextConfig = {
  // Self-contained server in `.next/standalone`: this is what lets the final image
  // run without devDependencies and without Next installed alongside it.
  output: 'standalone',
  // Without this, Next roots the tracing at `apps/crm` and leaves out
  // `packages/*` e o store do pnpm, que vivem acima — o servidor sobe e quebra
  // no primeiro import de `@pipe/db`.
  outputFileTracingRoot: path.join(import.meta.dirname, '..', '..'),
  serverExternalPackages: ['pg', 'drizzle-orm', '@pipe/db'],
  transpilePackages: ['@pipe/ui'],
};

export default config;
