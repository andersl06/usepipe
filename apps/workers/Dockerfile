# Imagem dos workers (BullMQ). Construir a partir da RAIZ do monorepo:
#   docker build -f apps/workers/Dockerfile -t ghcr.io/pipe/workers:<versao> .
#
# node:22-alpine, não 20: o `engines` da raiz exige `>=22` (o README ainda diz 20,
# está desatualizado) e o pnpm recusa instalar fora do intervalo. Alpine porque
# nada aqui é nativo — `pg` é JavaScript puro e o `pg-native` opcional não está
# instalado —, então musl não custa nada e corta ~130 MB.

FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

# --- manifestos -------------------------------------------------------------
# Só os `package.json` primeiro: enquanto nenhum mudar, esta camada e o
# `pnpm install` inteiro vêm do cache, mesmo que todo o código-fonte tenha
# mudado. Os manifestos dos aplicativos que os workers não usam entram do mesmo
# jeito porque `--frozen-lockfile` confere o lockfile contra o workspace
# COMPLETO: se faltar um, o pnpm diz que o lockfile está desatualizado e para.
FROM base AS manifestos
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/workers/package.json apps/workers/
COPY apps/gestao-vite/package.json apps/gestao-vite/
COPY apps/crm/package.json apps/crm/
COPY packages/ai/package.json packages/ai/
COPY packages/autenticacao/package.json packages/autenticacao/
COPY packages/contracts/package.json packages/contracts/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/mcp/package.json packages/mcp/
COPY packages/ui/package.json packages/ui/

# --- build ------------------------------------------------------------------
FROM manifestos AS build
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "@pipe/workers..."
COPY tsconfig.base.json ./
# `packages` inteiro em vez de listar core e db: o grafo muda e uma lista aqui
# envelheceria em silêncio. Os aplicativos irmãos, que são o peso, ficam fora.
COPY packages packages
COPY apps/workers apps/workers
RUN pnpm --filter "@pipe/workers..." build \
 # `packages/db/src/migrar.ts` importa `dotenv/config` e é alcançado a partir do
 # `index` do @pipe/db — mas `dotenv` está declarado como devDependency ali. Numa
 # instalação `--prod` o pacote some e o worker morre no primeiro import. O
 # conserto de verdade é mover `dotenv` para `dependencies` em packages/db.
 && cp -RL packages/db/node_modules/dotenv /dotenv \
 # Fica só o que a imagem final precisa: `dist/` e `package.json`. Código-fonte,
 # teste e configuração de build não entram em imagem.
 && find apps packages -mindepth 2 -maxdepth 2 \
      \( -name src -o -name tests -o -name semente -o -name node_modules \
         -o -name 'tsconfig*.json' -o -name 'vitest.config.ts' \
         -o -name '*.tsbuildinfo' -o -name 'drizzle.config.ts' -o -name drizzle \) \
      -exec rm -rf {} +

# --- node_modules de produção ----------------------------------------------
# Instalação separada, em árvore limpa e sem código-fonte nenhum. É mais barata
# do que parece: a store em cache resolve quase tudo por hardlink.
#
# `pnpm deploy` seria o caminho óbvio e NÃO serve aqui: ele empacota os pacotes
# do workspace com as regras do `npm pack`, que respeitam o `.gitignore` da raiz
# — e lá `dist/` está ignorado. Sai uma imagem carregando o `src/` de cada pacote
# e nenhum `dist/`, que quebra no primeiro import.
FROM manifestos AS prod-deps
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter "@pipe/workers..."

# --- imagem final -----------------------------------------------------------
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
# O layout do workspace é preservado de propósito: o pnpm liga
# `apps/workers/node_modules/@pipe/core` por symlink relativo até
# `packages/core`, e achatar os diretórios quebraria essa resolução.
COPY --from=prod-deps --chown=node:node /app ./
COPY --from=build --chown=node:node /app/packages ./packages
COPY --from=build --chown=node:node /app/apps ./apps
COPY --from=build --chown=node:node /dotenv ./packages/db/node_modules/dotenv

# `node` (uid 1000) já vem na imagem oficial; criar outro usuário seria trabalho à toa.
USER node
WORKDIR /app/apps/workers

# Os workers não escutam em porta nenhuma, então não há HTTP para checar. O que
# distingue "vivo" de "vivo e inútil" aqui é o Redis: sem ele o processo continua
# de pé consumindo fila nenhuma. O teto: isto prova a conexão, não que a fila
# esteja andando — para isso é preciso a métrica
# `pipe_fila_idade_item_mais_velho_segundos` (pendência 3 do infra/README).
HEALTHCHECK --interval=20s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "const R=require('ioredis');const c=new R(process.env.REDIS_URL||'redis://redis:6379',{maxRetriesPerRequest:1});c.ping().then(()=>process.exit(0)).catch(()=>process.exit(1))"

CMD ["node", "dist/main.js"]
