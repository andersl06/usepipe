#!/bin/bash
# Cria o papel da aplicação. Roda UMA vez, na inicialização de um PGDATA vazio,
# antes de qualquer migration.
#
# Por que aqui e não numa migration: as migrations de packages/db concedem
# privilégio a `pipe_app` sempre sob `IF EXISTS (SELECT 1 FROM pg_roles ...)`.
# Se o papel nascer DEPOIS delas, os grants já foram pulados, a migration consta
# como aplicada e ninguém roda de novo — a API conecta e não enxerga tabela
# nenhuma. Ordem errada aqui é defeito silencioso, e o mais caro de achar.
#
# O papel não é dono de nada e não tem `bypassrls`: é isso que faz a política
# `tenant_isolado` valer de verdade (§4 da spec de infraestrutura).
# Sem `-u`: quando o bit de execução não sobrevive ao clone, o entrypoint do
# Postgres SOURCEIA este arquivo em vez de executá-lo, e `set -u` passaria a
# valer para o resto do entrypoint. `-e` e a checagem explícita abaixo bastam.
set -eo pipefail

if [ -z "${POSTGRES_APP_SENHA:-}" ]; then
  echo "FALHA: POSTGRES_APP_SENHA não está definida." >&2
  echo "É a senha de pipe_app e precisa bater com a de DATABASE_URL_APP." >&2
  exit 1
fi

# `:'senha'` é substituição do psql, que escapa o valor como literal — senha com
# aspas ou barra invertida não vira injeção nem erro de sintaxe. Dentro de bloco
# `do $$ ... $$` a substituição NÃO acontece, por isso o comando é direto.
# O papel não pode existir aqui: este diretório só roda com PGDATA vazio.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set senha="$POSTGRES_APP_SENHA" <<'SQL'
create role pipe_app login password :'senha';
grant connect on database :"DBNAME" to pipe_app;
grant usage on schema public to pipe_app;
SQL

echo "papel pipe_app criado"
