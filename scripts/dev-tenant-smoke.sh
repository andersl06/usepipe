#!/usr/bin/env bash
# Local-only integration smoke. Requires existing local DB/Redis and alfa/beta users.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -f .env ]]; then
  set -a
  # The example contains unquoted values with spaces; only source the keys needed here.
  source <(grep -E '^(DATABASE_URL|DATABASE_URL_APP|REDIS_URL|PIPE_DOMINIO_CONTAS|PIPE_COOKIE_DOMINIO|PIPE_COOKIE_SEGURO|PIPE_PORTA_PUBLICA|GOOGLE_URL_RETORNO|PIPE_ORIGENS|PIPE_CHAVES_SEGREDO|PIPE_CHAVE_SEGREDO_ATUAL|PORT|PIPE_URL_API)=' .env)
  set +a
fi
[[ "${PIPE_DOMINIO_CONTAS:-}" == lvh.me && "${PIPE_COOKIE_DOMINIO:-}" == .lvh.me && "${PIPE_PORTA_PUBLICA:-}" == 3110 ]] || {
  echo 'Configure .env para lvh.me conforme docs/tenant-subdomains-dev.md.' >&2; exit 1;
}

scratch="$(mktemp -d)"
api_pid= vite_pid= desk_pid=
cleanup() {
  for pid in "$api_pid" "$vite_pid" "$desk_pid"; do
    [[ -z "$pid" ]] || kill "$pid" 2>/dev/null || true
  done
  rm -f -- "$scratch/api.log" "$scratch/management.log" "$scratch/desk.log" \
    "$scratch/cookies" "$scratch/login.headers" "$scratch/login.body"
  rmdir -- "$scratch"
}
trap cleanup EXIT

pnpm --filter @pipe/api dev >"$scratch/api.log" 2>&1 & api_pid=$!
pnpm --filter @pipe/management-vite dev >"$scratch/management.log" 2>&1 & vite_pid=$!
pnpm --filter @pipe/desk-vite dev >"$scratch/desk.log" 2>&1 & desk_pid=$!

for _ in {1..80}; do
  if curl --noproxy '*' --silent --max-time 1 --resolve login.lvh.me:3110:127.0.0.1 \
    http://login.lvh.me:3110/v1/eu >/dev/null 2>&1; then break; fi
  sleep 0.25
done

email="${SMOKE_EMAIL_ALFA:-alfa@exemplo.test}"
curl --noproxy '*' --silent --show-error --max-time 10 \
  --resolve login.lvh.me:3110:127.0.0.1 \
  --cookie-jar "$scratch/cookies" --dump-header "$scratch/login.headers" \
  "http://login.lvh.me:3110/v1/auth/dev?email=${email}" -o "$scratch/login.body"
if grep -q '^HTTP/.* 404' "$scratch/login.headers"; then
  echo 'Usuário alfa ausente. Provisione alfa e beta conforme docs/tenant-subdomains-dev.md.' >&2
  exit 1
fi
grep -qi '^location: http://alfa.lvh.me:3110/application' "$scratch/login.headers" || {
  echo 'Login não redirecionou para alfa.' >&2; exit 1;
}
echo 'OK: login central redirecionou para alfa'

status="$(curl --noproxy '*' --silent --output /dev/null --write-out '%{http_code}' \
  --resolve alfa.lvh.me:3110:127.0.0.1 --cookie "$scratch/cookies" \
  http://alfa.lvh.me:3110/v1/eu)"
[[ "$status" == 200 ]] || { echo "Gestão alfa: esperado 200, veio $status" >&2; exit 1; }
echo 'OK: Gestão alfa pelo proxy Vite'

status="$(curl --noproxy '*' --silent --output /dev/null --write-out '%{http_code}' \
  --resolve alfa.desk.lvh.me:3210:127.0.0.1 --cookie "$scratch/cookies" \
  http://alfa.desk.lvh.me:3210/v1/eu)"
[[ "$status" == 200 ]] || { echo "Desk alfa: esperado 200, veio $status" >&2; exit 1; }
echo 'OK: Desk alfa pelo proxy Vite'

status="$(curl --noproxy '*' --silent --output /dev/null --write-out '%{http_code}' \
  --resolve beta.lvh.me:3110:127.0.0.1 --cookie "$scratch/cookies" \
  http://beta.lvh.me:3110/v1/eu)"
[[ "$status" == 403 ]] || { echo "Host beta: esperado 403, veio $status" >&2; exit 1; }
echo 'OK: host beta recusou cookie de alfa (403)'
