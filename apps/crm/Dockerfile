# Imagem do CRM (Next 15). Construir a partir da RAIZ do monorepo:
#   docker build -f apps/crm/Dockerfile -t ghcr.io/pipe/crm:<versao> .
#
# node:22-alpine pelo mesmo motivo da API: o `engines` da raiz exige `>=22` e o
# pnpm recusa instalar fora do intervalo. Alpine porque o SWC do Next publica
# binário musl — não há compilação nativa aqui, e são ~130 MB a menos.

FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

# --- manifestos -------------------------------------------------------------
# `package.json` antes do código-fonte: enquanto nenhum manifesto mudar, o
# `pnpm install` inteiro sai do cache de camada. Entram todos, inclusive os dos
# aplicativos irmãos, porque `--frozen-lockfile` confere o lockfile contra o
# workspace COMPLETO e para se faltar um manifesto.
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
FROM manifestos AS build
# `@pipe/crm...` = o aplicativo e as dependências dele no workspace. Os outros
# dois front-ends e a API nem chegam a ser baixados.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store     pnpm install --frozen-lockfile --filter "@pipe/crm..."
COPY tsconfig.base.json ./
# `packages` inteiro em vez de listar core/db/ui: o grafo de dependência muda
# (`@pipe/contracts` entrou nele nesta semana) e uma lista aqui envelheceria em
# silêncio. O peso de verdade — os aplicativos irmãos — segue de fora.
COPY packages packages
COPY apps/crm apps/crm
# A telemetria do Next tenta sair para a rede a cada build e polui o log de CI.
ENV NEXT_TELEMETRY_DISABLED=1 NODE_ENV=production
RUN pnpm --filter "@pipe/crm..." build

# --- imagem final -----------------------------------------------------------
# Só a saída `standalone`: o Next rastreia os arquivos que o servidor de fato
# importa e copia apenas esses. Não há pnpm, devDependencies, `.ts` nem o pacote
# `next` instalado aqui dentro.
FROM node:22-alpine AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
# 3000, e não a 3300 do `pnpm dev`: dentro do contêiner todo front escuta na
# 3000, que é a porta que as labels do Traefik em docker-compose.prod.yml pedem.
ENV PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
# O `standalone` já reproduz o layout do monorepo (apps/ e packages/), por isso o
# destino é a raiz do WORKDIR e o `server.js` fica em apps/crm/.
COPY --from=build --chown=node:node /app/apps/crm/.next/standalone ./
# O `standalone` NÃO inclui os estáticos. Sem esta linha o servidor sobe e a
# página vem sem CSS nem JS, com 404 em tudo sob /_next/static.
COPY --from=build --chown=node:node /app/apps/crm/.next/static ./apps/crm/.next/static

# `node` (uid 1000) já vem na imagem oficial; criar outro usuário seria trabalho à toa.
USER node
EXPOSE 3000

# Este front não tem rota de saúde (o compose de produção aponta para
# `/api/saude`, que não existe — pendência 1 do infra/README). O que dá para
# afirmar sem inventar é: o processo aceitou a conexão e devolveu uma resposta
# HTTP. Não vale como readiness, e de propósito NÃO reprova 5xx: a raiz depende
# de banco e de tenant semeado, e um 500 de dado faltando derrubaria toda
# publicação no `--wait` do deploy.sh.
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=4   CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/',()=>process.exit(0)).on('error',()=>process.exit(1))"

CMD ["node", "apps/crm/server.js"]
