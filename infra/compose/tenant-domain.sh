#!/usr/bin/env bash
# Shared preflight for the first and subsequent deployments.
pipe_domain_preflight() {
  local domain="${PIPE_DOMINIO_CONTAS:-}"
  [[ -n "$domain" ]] || { echo 'PIPE_DOMINIO_CONTAS vazio.' >&2; return 1; }
  [[ "$domain" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$ ]] || {
    echo 'PIPE_DOMINIO_CONTAS invalido: use apenas labels DNS em minusculas.' >&2; return 1;
  }
  [[ "${PIPE_COOKIE_DOMINIO:-}" == ".${domain}" ]] || {
    echo "PIPE_COOKIE_DOMINIO deve ser exatamente .${domain}." >&2; return 1;
  }
  [[ "${PIPE_ORIGENS:-}" != *'*'* ]] || {
    echo 'PIPE_ORIGENS nao pode conter curinga.' >&2; return 1;
  }
  [[ "${GOOGLE_URL_RETORNO:-}" == "https://login.${domain}/"* ]] || {
    echo "GOOGLE_URL_RETORNO deve comecar com https://login.${domain}/." >&2; return 1;
  }
  if [[ "$domain" == *.sslip.io ]]; then
    PIPE_TLS_MODE=http
  else
    PIPE_TLS_MODE=dns
    [[ -n "${CF_DNS_API_TOKEN:-}" ]] || {
      echo 'CF_DNS_API_TOKEN obrigatorio para DNS-01.' >&2; return 1;
    }
  fi
  export PIPE_TLS_MODE
}
