# Postgres 16 com pgvector (exigido por trecho_conhecimento.embedding) e pgbackrest.
#
# O pgbackrest precisa estar NESTE contêiner porque o archive_command do Postgres
# o executa a cada segmento de WAL. Deixá-lo só no contêiner de backup dá um banco
# que arquiva WAL para lugar nenhum — e a descoberta vem no dia da restauração.
FROM pgvector/pgvector:pg16

RUN apt-get update \
  && apt-get install -y --no-install-recommends pgbackrest \
  && rm -rf /var/lib/apt/lists/*

# O repositório fica em storage de objetos; o diretório local guarda só o spool
# do archive-push assíncrono.
RUN mkdir -p /var/spool/pgbackrest /var/log/pgbackrest \
  && chown -R postgres:postgres /var/spool/pgbackrest /var/log/pgbackrest
