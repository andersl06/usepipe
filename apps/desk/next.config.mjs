import path from 'node:path';

/** @type {import('next').NextConfig} */
const config = {
  // Servidor autocontido em `.next/standalone`: é o que deixa a imagem final
  // rodar sem devDependencies e sem o Next instalado ao lado.
  output: 'standalone',
  // Sem isto o Next enraíza o rastreamento em `apps/desk` e deixa de fora
  // `packages/*` e o store do pnpm, que vivem acima — o servidor sobe e quebra
  // no primeiro import de `@pipe/db`.
  outputFileTracingRoot: path.join(import.meta.dirname, '..', '..'),
  // `pg` abre socket e carrega binding nativo opcional: não pode ser empacotado.
  serverExternalPackages: ['pg', 'drizzle-orm'],
  // O design system é consumido como fonte, sem etapa de build própria.
  transpilePackages: ['@pipe/ui'],
  experimental: {
    // Server Actions do Desk mandam texto de mensagem, nada de arquivo grande ainda.
    serverActions: { bodySizeLimit: '1mb' },
  },
};

export default config;
