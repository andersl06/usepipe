/** @type {import('next').NextConfig} */
const config = {
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
