#!/usr/bin/env bash
# Backup diário do Postgres. Disparado pelo timer pipe-backup.timer.
#
# Full aos domingos, diferencial nos outros dias: full todo dia num banco de
# centenas de GB gasta banda e janela sem comprar nada — o WAL contínuo é quem
# garante o RPO, o full só encurta o tempo de restauração.
set -euo pipefail

TIPO=diff
[ "$(date +%u)" = "7" ] && TIPO=full

INICIO=$(date +%s)
STATUS=0

pgbackrest --stanza=pipe --type="${TIPO}" backup || STATUS=$?
# O expire aplica a retenção declarada no pgbackrest.conf. Roda mesmo se o backup
# falhou: bucket cheio é o segundo jeito mais comum de perder backup.
pgbackrest --stanza=pipe expire || true

# `verify` confere soma de verificação de backup e WAL no repositório. NÃO
# substitui restaurar — é a checagem barata que roda todo dia; a cara roda semanal.
pgbackrest --stanza=pipe verify || STATUS=$?

DURACAO=$(( $(date +%s) - INICIO ))

# Métrica em arquivo, lida pelo node-exporter/Prometheus. Um backup que falha em
# silêncio é indistinguível de um backup que nunca existiu.
cat > /metricas/pipe_backup.prom.tmp <<METRICA
# HELP pipe_backup_ok 1 quando o último backup terminou sem erro.
# TYPE pipe_backup_ok gauge
pipe_backup_ok $([ "${STATUS}" -eq 0 ] && echo 1 || echo 0)
# HELP pipe_backup_fim_timestamp Momento do fim do último backup.
# TYPE pipe_backup_fim_timestamp gauge
pipe_backup_fim_timestamp $(date +%s)
# HELP pipe_backup_duracao_segundos Duração do último backup.
# TYPE pipe_backup_duracao_segundos gauge
pipe_backup_duracao_segundos ${DURACAO}
METRICA
mv /metricas/pipe_backup.prom.tmp /metricas/pipe_backup.prom

# Interruptor de homem morto, num serviço externo gratuito: se a VPS inteira
# morrer, o Prometheus morre junto e não alerta ninguém. Quem alerta é o serviço
# de fora que parou de receber o ping.
if [ -n "${HEALTHCHECK_URL_BACKUP:-}" ] && [ "${STATUS}" -eq 0 ]; then
  curl -fsS -m 10 --retry 3 "${HEALTHCHECK_URL_BACKUP}" > /dev/null || true
fi

exit "${STATUS}"
