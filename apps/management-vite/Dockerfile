# Imagem do Gestão (Vite + React, SPA estática). Construir a partir da RAIZ do monorepo:
#   docker build -f apps/management-vite/Dockerfile -t ghcr.io/pipe/management-vite:<versao> .
#
# node:22-alpine só no estágio de build: o `engines` da raiz exige `>=22` e o
# pnpm recusa instalar fora do intervalo. A imagem final não tem Node nenhum —
# é `nginx:1.27-alpine` servindo os arquivos que o `vite build` gerou, o mesmo
# servidor que `apps/site/Dockerfile` usa para o site estático.

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
COPY apps/management-vite/package.json apps/management-vite/
COPY apps/crm/package.json apps/crm/
COPY packages/ai/package.json packages/ai/
COPY packages/authentication/package.json packages/authentication/
COPY packages/contracts/package.json packages/contracts/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/mcp/package.json packages/mcp/
COPY packages/ui/package.json packages/ui/

# --- build ------------------------------------------------------------------
# `@pipe/management-vite...` = o aplicativo e as dependências dele no workspace. Os
# outros front-ends, a API e o Next da Gestão nem chegam a ser baixados.
FROM manifestos AS build
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "@pipe/management-vite..."
COPY tsconfig.base.json ./
# `packages` inteiro em vez de listar contracts/core/ui: o grafo de dependência
# muda e uma lista aqui envelheceria em silêncio. O peso de verdade — os
# aplicativos irmãos — segue de fora.
COPY packages packages
COPY apps/management-vite apps/management-vite
# Tenant hosts route `/v1` on the same origin; Desk links are computed in the browser.
ARG VITE_URL_API=
ENV VITE_URL_API=$VITE_URL_API
RUN pnpm --filter "@pipe/management-vite..." build

# --- imagem final -----------------------------------------------------------
# Só o `dist/`: o `vite build` já deixa em disco exatamente o que o navegador
# precisa — HTML, JS e CSS com hash — e nada do resto (pnpm, TypeScript, `src/`)
# entra na imagem.
FROM nginx:1.27-alpine AS runtime
COPY apps/management-vite/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/management-vite/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=4 \
  CMD wget -q --spider http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
