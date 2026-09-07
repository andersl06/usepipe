#!/usr/bin/env bash
# Publicação de uma versão nova. Roda na VPS, como root, a partir de /opt/pipe.
#
# Este script é para a SEGUNDA publicação em diante. A primeira, do zero, é
# `implantar.sh` — ela tem passos que só acontecem uma vez (papel do banco,
# stanza do backup, tenant, canal) e paradas para o que só o dono pode fazer.
#
# A ordem não é gosto: migration antes do código novo (§9 da spec), porque só
# assim dá para voltar a versão anterior sem perder dado. Toda migration precisa
# ser compatível com o código antigo — este script não tem como verificar isso, e
# é a única regra aqui que depende de disciplina humana.
set -euo pipefail

VERSAO="${1:?uso: deploy.sh <tag da imagem>}"
cd "$(dirname "$0")"

# Segredo nunca fica em disco versionado. O arquivo cifrado vive no repositório;
# a chave age vive só na máquina, com dono root e modo 600.
export SOPS_AGE_KEY_FILE=/opt/pipe-dados/age.key
umask 077
sops --decrypt segredos/producao.enc.env > /opt/pipe-dados/.env
# Depois do arquivo cifrado, de propósito: em `--env-file` vale a última
# definição, então esta linha sobrescreve o PIPE_VERSAO que veio do SOPS.
echo "PIPE_VERSAO=${VERSAO}" >> /opt/pipe-dados/.env

COMPOSE="docker compose -f docker-compose.prod.yml --env-file /opt/pipe-dados/.env"

# `postgres` e `backup` são construídos aqui, não puxados: a imagem é o Postgres
# com pgbackrest ao lado, e ela não está em registro nenhum. `--ignore-buildable`
# impede que o `pull` pare a publicação tentando baixar justamente essas duas.
$COMPOSE build postgres
$COMPOSE pull --ignore-buildable

$COMPOSE --profile tarefa run --rm migrar

# `--wait` faz o compose esperar o healthcheck ficar verde antes de dar por feito;
# sem ele, "deploy ok" significa apenas "o contêiner iniciou", que é diferente de
# "o contêiner responde".
$COMPOSE up -d --wait --wait-timeout 180

# Registro de publicação que o suporte consiga consultar às duas da manhã.
printf '%s\t%s\t%s\n' "$(date -Is)" "${VERSAO}" "${SUDO_USER:-root}" >> /opt/pipe-dados/publicacoes.tsv

docker image prune -f
