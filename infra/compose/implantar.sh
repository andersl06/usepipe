#!/usr/bin/env bash
# Primeira implantação do Pipe numa VPS limpa. Roda na máquina, como root, a
# partir de /opt/pipe/infra/compose.
#
#   ./implantar.sh v1.0.0
#
# O que ele faz: tudo que é automatizável, na ordem em que precisa acontecer.
# O que ele NÃO faz: comprar domínio, apontar DNS, criar aplicativo no Google, criar
# aplicativo na Meta, gerar chave de cifra. Nesses ele PARA e diz exatamente o que
# falta — de propósito. Script que "dá um jeito" no que é decisão do dono é como se
# sobe produção com segredo de exemplo.
#
# É idempotente: rodar de novo depois de corrigir alguma coisa retoma de onde dá.
set -euo pipefail

VERSAO="${1:?uso: implantar.sh <tag da imagem>   (ex.: implantar.sh v1.0.0)}"
cd "$(dirname "$0")"

DADOS=/opt/pipe-dados
ENV="${DADOS}/.env"
DOMINIO="${PIPE_DOMINIO:-usepipe.com.br}"
HOSTS=("${DOMINIO}" "app.${DOMINIO}" "gestao.${DOMINIO}" "crm.${DOMINIO}" "api.${DOMINIO}")

vermelho() { printf '\033[31m%s\033[0m\n' "$*" >&2; }
verde() { printf '\033[32m%s\033[0m\n' "$*"; }
passo() { printf '\n\033[1m== %s\033[0m\n' "$*"; }

parar() {
  vermelho ""
  vermelho "PARADO: $1"
  vermelho ""
  shift
  for linha in "$@"; do vermelho "  $linha"; done
  vermelho ""
  vermelho "Corrija e rode ./implantar.sh ${VERSAO} de novo."
  exit 1
}

# ---------------------------------------------------------------------------
passo "1/9  Ferramentas e permissão"

[ "$(id -u)" = "0" ] || parar "isto precisa rodar como root." \
  "O compose publica nas portas 80 e 443 e escreve em ${DADOS}."

for prog in docker sops age; do
  command -v "$prog" > /dev/null || parar "\`${prog}\` não está instalado." \
    "docker: curl -fsSL https://get.docker.com | sh" \
    "age:    apt-get install -y age" \
    "sops:   NÃO está no apt do Ubuntu. Baixe o binário da release:" \
    "        curl -fsSLo /usr/local/bin/sops https://github.com/getsops/sops/releases/latest/download/sops-v3.9.4.linux.amd64" \
    "        chmod +x /usr/local/bin/sops"
done
docker compose version > /dev/null 2>&1 || parar "o plugin \`docker compose\` não está disponível." \
  "Instale o docker pelo get.docker.com, que já traz o plugin v2."

mkdir -p "${DADOS}/acme"
touch "${DADOS}/acme/acme.json"
chmod 600 "${DADOS}/acme/acme.json"
# O bit de execução costuma não sobreviver ao clone em máquina Windows.
chmod +x postgres/init/*.sh backup/*.sh 2>/dev/null || true
verde "ok"

# ---------------------------------------------------------------------------
passo "2/9  Segredos"

[ -f "${DADOS}/age.key" ] || parar "não achei ${DADOS}/age.key." \
  "É a chave privada \`age\` de deploy, e SÓ VOCÊ pode colocá-la aqui." \
  "Na sua máquina:  age-keygen -o deploy.key   (guarde a pública no infra/.sops.yaml)" \
  "Na VPS:          instale o conteúdo em ${DADOS}/age.key e rode chmod 600 nele."
chmod 600 "${DADOS}/age.key"

[ -f segredos/producao.enc.env ] || parar "não existe segredos/producao.enc.env." \
  "Na sua máquina, a partir de infra/:" \
  "  cp compose/env.prod.exemplo /tmp/producao.env   # preencha os valores" \
  "  sops --encrypt /tmp/producao.env > compose/segredos/producao.enc.env" \
  "  shred -u /tmp/producao.env" \
  "Depois commite o .enc.env e dê git pull aqui."

export SOPS_AGE_KEY_FILE="${DADOS}/age.key"
umask 077
sops --decrypt segredos/producao.enc.env > "${ENV}" \
  || parar "o SOPS não conseguiu decifrar segredos/producao.enc.env." \
    "A chave em ${DADOS}/age.key não é destinatária desse arquivo." \
    "Na sua máquina: acrescente a pública em infra/.sops.yaml e rode" \
    "  sops updatekeys compose/segredos/producao.enc.env"
echo "PIPE_VERSAO=${VERSAO}" >> "${ENV}"
chmod 600 "${ENV}"
verde "ok — ${ENV} escrito com modo 600"

# ---------------------------------------------------------------------------
passo "3/9  Conferência do .env"
# Ler o .env aqui é seguro: `set -a` + `source` num arquivo que acabamos de
# escrever, com modo 600, e o processo morre no fim do script.
set -a
# shellcheck disable=SC1090
source "${ENV}"
set +a

faltando=()
for chave in POSTGRES_SENHA POSTGRES_APP_SENHA DATABASE_URL DATABASE_URL_APP REDIS_URL \
  PIPE_CHAVES_SEGREDO GOOGLE_CLIENTE_ID GOOGLE_CLIENTE_SEGREDO GOOGLE_URL_RETORNO \
  PIPE_ORIGENS PIPE_URL_APP PIPE_URL_API PIPE_COOKIE_DOMINIO ACME_EMAIL; do
  [ -n "${!chave:-}" ] || faltando+=("$chave")
done
[ ${#faltando[@]} -eq 0 ] || parar "faltam valores no arquivo de segredos: ${faltando[*]}" \
  "Cada um está descrito em docs/specs/2026-09-07-implantacao.md §3 — o que é," \
  "onde nasce e como gerar. Edite com:  cd ../..  &&  sops infra/compose/segredos/producao.enc.env"

# PIPE_CHAVES_SEGREDO é a que a API deixa passar em silêncio: sem ela `/saude`
# responde 200 e TODO webhook do WhatsApp devolve 500. A conferência é aqui
# porque depois dela ninguém mais olha.
IFS=',' read -ra chaves <<< "${PIPE_CHAVES_SEGREDO}"
for item in "${chaves[@]}"; do
  item="$(echo "$item" | tr -d '[:space:]')"
  [ -n "$item" ] || continue
  id="${item%%:*}"
  material="${item#*:}"
  [ -n "$id" ] && [ "$id" != "$item" ] || parar "PIPE_CHAVES_SEGREDO fora do formato." \
    "Cada chave é \`<id>:<32 bytes em base64>\`, separadas por vírgula." \
    "Gerar:  node -e \"console.log('k1:'+require('crypto').randomBytes(32).toString('base64'))\""
  # `wc -c` sempre imprime um número, inclusive quando o base64 recusa a entrada —
  # e é isso que faz "0 bytes" ser a mensagem para material inválido.
  bytes=$(echo -n "$material" | base64 -d 2> /dev/null | wc -c)
  [ "$bytes" = "32" ] || parar "a chave \"${id}\" tem ${bytes} bytes, não 32." \
    "AES-256 exige exatamente 32. Gere de novo com randomBytes(32)."
done

case "${PIPE_COOKIE_DOMINIO}" in
  .*) ;;
  *) parar "PIPE_COOKIE_DOMINIO precisa começar com ponto: \`.${DOMINIO}\`." \
    "Sem o ponto o cookie emitido por api.${DOMINIO} não vale em app.${DOMINIO}," \
    "e o sintoma é login que redireciona certo e volta deslogado." ;;
esac

case "${PIPE_ORIGENS}" in
  *'*'*) parar "PIPE_ORIGENS contém curinga." \
    "Com credencial o navegador recusa \`*\`. Liste as três origens inteiras." ;;
esac

# A senha do papel da aplicação precisa ser a MESMA nos dois lugares, senão o
# banco nasce com uma e a API tenta entrar com outra.
case "${DATABASE_URL_APP}" in
  *":${POSTGRES_APP_SENHA}@"*) ;;
  *) parar "POSTGRES_APP_SENHA não é a senha que está em DATABASE_URL_APP." \
    "A primeira cria o papel pipe_app na inicialização do banco; a segunda é a" \
    "que a API usa para entrar. Divergiram = API que sobe e não conecta." ;;
esac
verde "ok — ${#chaves[@]} chave(s) de cifra, formato conferido"

# ---------------------------------------------------------------------------
passo "4/9  DNS"
# Certificado não emite se o nome não aponta para cá. Conferir agora custa
# segundos; descobrir depois custa uma hora de log do Traefik.
meu_ip="$(curl -fsS -m 10 https://api.ipify.org || true)"
[ -n "$meu_ip" ] || parar "não consegui descobrir o IP público desta máquina." \
  "Sem internet de saída o ACME também não funciona. Confira a rede da VPS."

erradas=()
for host in "${HOSTS[@]}"; do
  resolvido="$(getent ahostsv4 "$host" 2> /dev/null | awk 'NR==1{print $1}')"
  [ "$resolvido" = "$meu_ip" ] || erradas+=("${host} → ${resolvido:-nada} (esperado ${meu_ip})")
done
[ ${#erradas[@]} -eq 0 ] || parar "o DNS ainda não aponta para esta máquina." \
  "${erradas[@]}" \
  "" \
  "SÓ VOCÊ pode resolver isto. No painel de DNS de ${DOMINIO}, crie registros A:" \
  "  @        A   ${meu_ip}" \
  "  www      A   ${meu_ip}" \
  "  app      A   ${meu_ip}" \
  "  gestao   A   ${meu_ip}" \
  "  crm      A   ${meu_ip}" \
  "  api      A   ${meu_ip}" \
  "TTL de 300 enquanto estiver mexendo. Espere propagar e rode de novo."
verde "ok — os ${#HOSTS[@]} nomes apontam para ${meu_ip}"

# ---------------------------------------------------------------------------
passo "5/9  Portas 80 e 443"
for porta in 80 443; do
  if ss -ltn "sport = :${porta}" 2> /dev/null | grep -q LISTEN; then
    dono="$(ss -ltnp "sport = :${porta}" 2> /dev/null | awk 'NR==2{print $NF}')"
    parar "a porta ${porta} já está ocupada por ${dono:-alguém}." \
      "O desafio HTTP do Let's Encrypt precisa da 80 livre para o Traefik." \
      "Se for outro serviço desta máquina, ele não deveria estar aqui: a §2 da spec" \
      "de infraestrutura diz que produção do Pipe não divide máquina com experimento."
  fi
done
verde "ok"

# ---------------------------------------------------------------------------
passo "6/9  Imagens"
COMPOSE=(docker compose -f docker-compose.prod.yml --env-file "${ENV}")
"${COMPOSE[@]}" config -q || parar "o docker-compose.prod.yml não valida com este .env." \
  "A mensagem do compose, logo acima, diz qual variável está faltando."
"${COMPOSE[@]}" build postgres
"${COMPOSE[@]}" pull --ignore-buildable \
  || parar "não consegui baixar as imagens da tag ${VERSAO}." \
    "Confira se elas foram publicadas:  PUBLICAR=1 ./infra/construir-imagens.sh ${VERSAO}" \
    "e se esta máquina tem login no registro:  docker login ghcr.io"
verde "ok"

# ---------------------------------------------------------------------------
passo "7/9  Banco, e só ele"
# O Postgres precisa terminar a inicialização — incluindo criar o papel pipe_app —
# ANTES da migration. Se os dois subirem juntos, a migration pega o banco em pé
# mas sem o papel, e todo `grant` dela é pulado em silêncio.
"${COMPOSE[@]}" up -d --wait --wait-timeout 180 postgres redis \
  || parar "o Postgres ou o Redis não ficaram saudáveis em 3 minutos." \
    "Veja:  docker compose -f docker-compose.prod.yml logs postgres" \
    "Se a queixa for POSTGRES_APP_SENHA, é o init em postgres/init/10-papel-app.sh."

"${COMPOSE[@]}" exec -T postgres psql -U pipe -d pipe -tAc \
  "select 1 from pg_roles where rolname='pipe_app'" | grep -q 1 \
  || parar "o papel pipe_app não existe no banco." \
    "Ele nasce em postgres/init/10-papel-app.sh, que só roda quando o volume está" \
    "vazio. Se este banco já tinha dado, crie o papel à mão ANTES de migrar:" \
    "  docker compose -f docker-compose.prod.yml exec postgres psql -U pipe -d pipe \\" \
    "    -c \"create role pipe_app login password 'SENHA'\" \\" \
    "    -c 'grant connect on database pipe to pipe_app' \\" \
    "    -c 'grant usage on schema public to pipe_app'"
verde "ok — pipe_app existe"

# ---------------------------------------------------------------------------
passo "8/9  Migration"
"${COMPOSE[@]}" --profile tarefa run --rm migrar \
  || parar "a migration falhou." \
    "NADA foi publicado — é o ponto do script rodá-la antes de subir o resto." \
    "O drizzle aplica uma migration por transação: as anteriores à que falhou estão" \
    "aplicadas e valem, e a que falhou não deixou meia tabela." \
    "Veja qual parou, corrija o .sql em packages/db/drizzle, gere imagem nova e volte." \
    "Para saber onde parou:  docker compose -f docker-compose.prod.yml exec postgres \\" \
    "  psql -U pipe -d pipe -c 'select * from drizzle.__drizzle_migrations order by 1'"
verde "ok"

# ---------------------------------------------------------------------------
passo "9/9  Tudo no ar"
"${COMPOSE[@]}" up -d --wait --wait-timeout 300 \
  || parar "algum serviço não ficou saudável em 5 minutos." \
    "  docker compose -f docker-compose.prod.yml ps" \
    "  docker compose -f docker-compose.prod.yml logs --tail=100 api" \
    "Se a api estiver unhealthy, o /saude dela diz o que caiu:" \
    "  docker compose -f docker-compose.prod.yml exec api node -e \\" \
    "    \"require('http').get('http://127.0.0.1:3100/saude',r=>r.pipe(process.stdout))\""

printf '%s\t%s\t%s\n' "$(date -Is)" "${VERSAO}" "${SUDO_USER:-root}" >> "${DADOS}/publicacoes.tsv"

verde ""
verde "A pilha está no ar na versão ${VERSAO}."
cat <<FALTA

Falta o que só você pode fazer. Nesta ordem:

  1. TLS — confira que o certificado emitiu (pode levar até 2 min):
       curl -sSI https://api.${DOMINIO}/saude | head -1
     Se der erro de certificado:
       docker compose -f docker-compose.prod.yml logs traefik | grep -i acme

  2. BACKUP — a stanza do pgBackRest ainda não existe, e por isso o
     arquivamento de WAL está DESLIGADO (PG_ARCHIVE_MODE=off):
       docker compose -f docker-compose.prod.yml --profile tarefa run --rm \\
         backup -c 'pgbackrest --stanza=pipe stanza-create'
     Depois troque PG_ARCHIVE_MODE para on no segredo SOPS e rode ./deploy.sh ${VERSAO}.
     Confirme com:  docker ... run --rm backup -c 'pgbackrest --stanza=pipe check'

  3. PRIMEIRO CLIENTE — tenant, catálogo e administrador:
       docker compose -f docker-compose.prod.yml --profile tarefa run --rm provisionar \\
         --nome "Sua Empresa" --slug sua-empresa --plano operacao \\
         --admin voce@seudominio.com.br
     O comando imprime o registro TXT do domínio. Publique-o no DNS e rode de novo
     com --verificar. Só então o Google login encontra o tenant.

  4. WHATSAPP — o WABA é do cliente e a ligação é feita no Business Manager dele.
     O passo a passo está em docs/specs/2026-09-07-implantacao.md §6.

FALTA
