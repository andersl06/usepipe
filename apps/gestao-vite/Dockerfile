# Imagem do Gestão (Vite + React, SPA estática). Construir a partir da RAIZ do monorepo:
#   docker build -f apps/gestao-vite/Dockerfile -t ghcr.io/pipe/gestao-vite:<versao> .
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
COPY apps/gestao/package.json apps/gestao/
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
# `@pipe/gestao-vite...` = o aplicativo e as dependências dele no workspace. Os
# outros front-ends, a API e o Next da Gestão nem chegam a ser baixados.
FROM manifestos AS build
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "@pipe/gestao-vite..."
COPY tsconfig.base.json ./
# `packages` inteiro em vez de listar contracts/core/ui: o grafo de dependência
# muda e uma lista aqui envelheceria em silêncio. O peso de verdade — os
# aplicativos irmãos — segue de fora.
COPY packages packages
COPY apps/gestao-vite apps/gestao-vite
# As URLs para o Desk e para a `api` são ASSADAS no pacote do navegador: o Vite
# só expõe em `import.meta.env` o que existir no ambiente NA HORA do build, e
# nunca lê variável de execução depois — sem estes dois `ARG` a imagem de
# produção sai apontando para `localhost` e o front chama a própria origem
# (que não tem `/v1`) em vez da `api`. Os padrões continuam sendo os de
# desenvolvimento, para `docker build` sem argumento continuar servindo.
ARG VITE_PIPE_DESK_URL=http://localhost:3200
ARG VITE_URL_API=http://localhost:3010
ENV VITE_PIPE_DESK_URL=$VITE_PIPE_DESK_URL
ENV VITE_URL_API=$VITE_URL_API
RUN pnpm --filter "@pipe/gestao-vite..." build

# --- imagem final -----------------------------------------------------------
# Só o `dist/`: o `vite build` já deixa em disco exatamente o que o navegador
# precisa — HTML, JS e CSS com hash — e nada do resto (pnpm, TypeScript, `src/`)
# entra na imagem.
FROM nginx:1.27-alpine AS runtime
COPY apps/gestao-vite/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/gestao-vite/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=4 \
  CMD wget -q --spider http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
