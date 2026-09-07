# Imagem da API (NestJS). Construir a partir da RAIZ do monorepo:
#   docker build -f apps/api/Dockerfile -t ghcr.io/pipe/api:<versao> .
#
# node:22-alpine, não 20: o `engines` da raiz exige `>=22` (o README ainda diz 20,
# está desatualizado) e o pnpm recusa instalar fora do intervalo. Alpine porque
# nenhuma dependência daqui é nativa — `pg` é JavaScript puro e o `pg-native`
# opcional não está instalado —, então musl não custa nada e corta ~130 MB.

FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

# --- manifestos -------------------------------------------------------------
# Só os `package.json` primeiro: enquanto nenhum mudar, esta camada e o
# `pnpm install` inteiro vêm do cache, mesmo que todo o código-fonte tenha
# mudado. Os manifestos dos aplicativos que a API não usa entram do mesmo jeito
# porque `--frozen-lockfile` confere o lockfile contra o workspace COMPLETO: se
# faltar um, o pnpm diz que o lockfile está desatualizado e para.
FROM base AS manifestos
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/workers/package.json apps/workers/
COPY apps/desk/package.json apps/desk/
COPY apps/gestao/package.json apps/gestao/
COPY apps/crm/package.json apps/crm/
COPY packages/ai/package.json packages/ai/
COPY packages/autenticacao/package.json packages/autenticacao/
COPY packages/contracts/package.json packages/contracts/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/mcp/package.json packages/mcp/
COPY packages/ui/package.json packages/ui/

# --- build ------------------------------------------------------------------
# `@pipe/api...` = a API e as dependências dela no workspace, e nada mais: o Next
# e o React dos três front-ends nem chegam a ser baixados.
FROM manifestos AS build
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "@pipe/api..."
COPY tsconfig.base.json ./
# `packages` inteiro em vez dos três ou quatro que a API usa hoje: o grafo muda
# (o `@pipe/contracts` entrou nele nesta semana) e uma lista aqui envelhece em
# silêncio. Os aplicativos irmãos, que são o peso de verdade, continuam de fora.
COPY packages packages
COPY apps/workers apps/workers
COPY apps/api apps/api
RUN pnpm --filter "@pipe/api..." build \
 # `migrar.ts` importa `dotenv/config`, e `dotenv` é devDependency do @pipe/db.
 # Sem esta cópia o serviço `migrar` do compose morre no primeiro import — e ele
 # roda ANTES do código novo subir, então a publicação inteira para.
 && cp -RL packages/db/node_modules/dotenv /dotenv \
 # Fica só o que a imagem final precisa: `dist/`, `package.json` e as migrations
 # do @pipe/db. Código-fonte, teste e config de build não entram em imagem.
 && find apps packages -mindepth 2 -maxdepth 2 \
      \( -name src -o -name tests -o -name semente -o -name node_modules \
         -o -name 'tsconfig*.json' -o -name 'vitest.config.ts' \
         -o -name '*.tsbuildinfo' -o -name 'drizzle.config.ts' \) \
      -exec rm -rf {} +

# --- node_modules de produção ----------------------------------------------
# Instalação separada, em árvore limpa e sem código-fonte nenhum. É mais barata
# do que parece: a store em cache resolve quase tudo por hardlink.
#
# `pnpm deploy` seria o caminho óbvio e NÃO serve aqui: ele empacota os pacotes
# do workspace com as regras do `npm pack`, que respeitam o `.gitignore` da raiz
# — e lá `dist/` está ignorado. O resultado é uma imagem que carrega o `src/` de
# cada pacote e nenhum `dist/`, quebrando no primeiro import. Custou uma build
# para descobrir; está escrito aqui para não custar uma segunda.
FROM manifestos AS prod-deps
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter "@pipe/api..."

# --- imagem final -----------------------------------------------------------
# Sem pnpm, sem corepack, sem código-fonte, sem devDependencies.
FROM node:22-alpine AS runtime
ENV NODE_ENV=production PORT=3100
WORKDIR /app
# O layout do workspace é preservado de propósito: o pnpm liga
# `apps/api/node_modules/@pipe/core` por symlink relativo até `packages/core`, e
# achatar os diretórios quebraria essa resolução.
COPY --from=prod-deps --chown=node:node /app ./
COPY --from=build --chown=node:node /app/packages ./packages
COPY --from=build --chown=node:node /app/apps ./apps
COPY --from=build --chown=node:node /dotenv ./packages/db/node_modules/dotenv

# `node` (uid 1000) já vem na imagem oficial; criar outro usuário seria trabalho à toa.
USER node
WORKDIR /app/apps/api
EXPOSE 3100

# A API ainda não expõe `/saude` (pendência 1 do infra/README) e este arquivo não
# pode inventá-la. Até lá o teste é "o servidor HTTP responde alguma coisa":
# aceita o 404 do Nest na raiz e reprova 5xx e conexão recusada. É menos do que
# um /saude de verdade, e é honesto sobre isso.
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=4 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3100)+'/',r=>process.exit(r.statusCode<500?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "dist/main.js"]
