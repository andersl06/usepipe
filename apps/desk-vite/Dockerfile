# Desk Vite estático. Construir da raiz: docker build -f apps/desk-vite/Dockerfile .
FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

FROM base AS manifestos
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/desk-vite/package.json apps/desk-vite/
COPY packages/contracts/package.json packages/contracts/
COPY packages/core/package.json packages/core/
COPY packages/ui/package.json packages/ui/

FROM manifestos AS build
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "@pipe/desk-vite..."
COPY tsconfig.base.json ./
COPY packages packages
COPY apps/desk-vite apps/desk-vite
ARG VITE_BASE=/
ARG VITE_URL_API=http://localhost:3010
ENV VITE_BASE=$VITE_BASE
ENV VITE_URL_API=$VITE_URL_API
RUN pnpm --filter "@pipe/desk-vite..." build

FROM nginx:1.27-alpine AS runtime
COPY apps/desk-vite/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/desk-vite/dist /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=4 \
  CMD wget -q --spider http://127.0.0.1/ || exit 1
CMD ["nginx", "-g", "daemon off;"]
