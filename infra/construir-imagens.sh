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

# Os links ENTRE os módulos são assados no pacote do navegador durante a build:
# `NEXT_PUBLIC_*` não é lida em tempo de execução, e por isso não adianta pô-la no
# `.env` da VPS. Sem estas duas linhas a imagem sai apontando para `localhost` e o
# botão que leva do Desk à Gestão não sai do lugar em produção.
#
# O padrão é o domínio de produção, e não o de desenvolvimento: quem constrói
# imagem está publicando. Para uma imagem local, passe as três por ambiente.
DOMINIO="${PIPE_DOMINIO:-usepipe.com.br}"
URL_DESK="${PIPE_URL_DESK:-https://app.${DOMINIO}}"
URL_GESTAO="${PIPE_URL_GESTAO:-https://gestao.${DOMINIO}}"
URL_CRM="${PIPE_URL_CRM:-https://crm.${DOMINIO}}"

for app in "${APPS[@]}"; do
  # O site é estático e mora no próprio diretório, sem workspace pnpm nenhum.
  if [[ "$app" == "site" ]]; then
    contexto="apps/site"
  else
    contexto="."
  fi

  ARGS=()
  case "$app" in
    desk)
      ARGS=(--build-arg "NEXT_PUBLIC_PIPE_GESTAO_URL=${URL_GESTAO}"
            --build-arg "NEXT_PUBLIC_PIPE_CRM_URL=${URL_CRM}") ;;
    gestao)
      ARGS=(--build-arg "NEXT_PUBLIC_PIPE_DESK_URL=${URL_DESK}") ;;
  esac

  echo "==> ${REGISTRO}/${app}:${VERSAO}"
  docker build \
    --file "apps/${app}/Dockerfile" \
    --tag "${REGISTRO}/${app}:${VERSAO}" \
    --tag "${REGISTRO}/${app}:latest" \
    --provenance=false \
    "${ARGS[@]}" \
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
