#!/usr/bin/env bash
# Teste semanal de restauração. Backup que nunca foi restaurado é fé, não backup.
#
# O que ele faz: restaura o último backup num diretório descartável, sobe um
# Postgres temporário em cima dele, roda consultas que só passam se o dado estiver
# lá de verdade, mede quanto tempo levou e publica isso como métrica. O número
# medido aqui é o RTO real — o do documento é promessa até este script confirmar.
set -euo pipefail

ALVO=/tmp/restauracao-teste
PORTA=5499
INICIO=$(date +%s)
OK=0

limpar() {
  pg_ctl -D "${ALVO}" -m immediate stop || true
  rm -rf "${ALVO}"
}
trap limpar EXIT

rm -rf "${ALVO}"
mkdir -p "${ALVO}"

# --delta não vale aqui: o diretório está vazio e queremos exercitar a cópia
# inteira, que é o que aconteceria num desastre de verdade.
pgbackrest --stanza=pipe --pg1-path="${ALVO}" --type=default restore

# `archive_mode=off` no clone: sem isso o Postgres temporário começa a empurrar
# WAL para o repositório de produção e contamina a linha do tempo.
pg_ctl -D "${ALVO}" -o "-p ${PORTA} -c archive_mode=off -c unix_socket_directories=${ALVO}" -w -t 300 start

# As três perguntas que separam "o processo terminou" de "o dado está lá".
# 1) as tabelas existem; 2) há atendimento gravado; 3) o dado mais novo é recente
#    — um backup que restaura dados de três semanas atrás passou nas duas
#    primeiras e ainda assim é um desastre.
LINHAS=$(psql -h "${ALVO}" -p "${PORTA}" -U pipe -d pipe -tAc "select count(*) from atendimento")
IDADE=$(psql -h "${ALVO}" -p "${PORTA}" -U pipe -d pipe -tAc \
  "select extract(epoch from now() - max(criada_em))::int from mensagem")

if [ "${LINHAS}" -gt 0 ] && [ "${IDADE}" -lt 86400 ]; then
  OK=1
fi

DURACAO=$(( $(date +%s) - INICIO ))

cat > /metricas/pipe_restauracao.prom.tmp <<METRICA
# HELP pipe_restauracao_ok 1 quando o último teste de restauração validou o dado.
# TYPE pipe_restauracao_ok gauge
pipe_restauracao_ok ${OK}
# HELP pipe_restauracao_segundos RTO medido: quanto levou restaurar e validar.
# TYPE pipe_restauracao_segundos gauge
pipe_restauracao_segundos ${DURACAO}
# HELP pipe_restauracao_fim_timestamp Momento do último teste.
# TYPE pipe_restauracao_fim_timestamp gauge
pipe_restauracao_fim_timestamp $(date +%s)
# HELP pipe_restauracao_atraso_dado_segundos RPO medido: idade da mensagem mais nova restaurada.
# TYPE pipe_restauracao_atraso_dado_segundos gauge
pipe_restauracao_atraso_dado_segundos ${IDADE}
METRICA
mv /metricas/pipe_restauracao.prom.tmp /metricas/pipe_restauracao.prom

if [ -n "${HEALTHCHECK_URL_RESTAURACAO:-}" ] && [ "${OK}" -eq 1 ]; then
  curl -fsS -m 10 --retry 3 "${HEALTHCHECK_URL_RESTAURACAO}" > /dev/null || true
fi

[ "${OK}" -eq 1 ]
