#!/usr/bin/env bash
# Constrói as imagens do Pipe. Roda da raiz do repositório ou de qualquer lugar.
#
#   ./infra/construir-imagens.sh v1.4.2          # tudo
#   ./infra/construir-imagens.sh v1.4.2 api      # só a API
#   PUBLICAR=1 ./infra/construir-imagens.sh v1.4.2
#
# A versão é obrigatória e vira a tag que o docker-compose.prod.yml consome em
# `${PIPE_VERSAO}`. `latest` sai junto, e só ela: um deploy nunca deve apontar
# para `latest`, porque então "voltar a versão anterior" deixa de ter sentido.
set -euo pipefail

VERSAO="${1:?uso: construir-imagens.sh <versao> [app ...]}"
shift || true

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REGISTRO="${REGISTRO:-ghcr.io/pipe}"
APPS=("$@")
[[ ${#APPS[@]} -eq 0 ]] && APPS=(api workers desk gestao crm site)

cd "$RAIZ"

# BuildKit explícito: é ele que honra o `apps/<app>/Dockerfile.dockerignore` e o
# cache de store do pnpm. No builder clássico a build funciona, só fica lenta e
# manda um contexto muito maior.
export DOCKER_BUILDKIT=1

# Mesmo com a base já em cache, o BuildKit consulta o registro para resolver o
# manifesto do `node:22-alpine` — e para a build inteira se a rede oscilar.
# `SEM_PULL=1` usa o que já está em cache. Não use em CI: lá interessa a base
# atualizada, com as correções de segurança do alpine.
PULL=()
[[ "${SEM_PULL:-0}" == "1" ]] && PULL=(--pull=false)

for app in "${APPS[@]}"; do
  # O site é estático e mora no próprio diretório, sem workspace pnpm nenhum.
  if [[ "$app" == "site" ]]; then
    contexto="apps/site"
  else
    contexto="."
  fi

  echo "==> ${REGISTRO}/${app}:${VERSAO}"
  docker build \
    --file "apps/${app}/Dockerfile" \
    --tag "${REGISTRO}/${app}:${VERSAO}" \
    --tag "${REGISTRO}/${app}:latest" \
    --provenance=false \
    "${PULL[@]}" \
    "$contexto"
done

echo
echo "imagem                                          tamanho"
for app in "${APPS[@]}"; do
  docker image ls "${REGISTRO}/${app}:${VERSAO}" --format '{{.Repository}}:{{.Tag}}|{{.Size}}' \
    | awk -F'|' '{printf "%-48s%s\n", $1, $2}'
done
echo
# Tamanho de disco descomprimido. O que trafega no `docker pull` é bem menor —
# a camada base do node:22-alpine, que responde por ~240 MB de cada linha acima,
# é a MESMA em todas: baixa uma vez e as seis imagens a compartilham.
echo "(tamanho descomprimido; a camada base node:22-alpine é compartilhada pelas cinco imagens de aplicação)"

if [[ "${PUBLICAR:-0}" == "1" ]]; then
  for app in "${APPS[@]}"; do
    docker push "${REGISTRO}/${app}:${VERSAO}"
    docker push "${REGISTRO}/${app}:latest"
  done
fi
