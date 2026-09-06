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
  webpack: (config) => {
    // `@pipe/ui` é ESM em TypeScript: os imports internos dele terminam em
    // `.js` apontando para arquivos `.ts`/`.tsx`. Sem este alias o webpack
    // procura o `.js` literal e não acha nada.
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
      '.jsx': ['.tsx', '.jsx'],
    };
    return config;
  },
};

export default config;
