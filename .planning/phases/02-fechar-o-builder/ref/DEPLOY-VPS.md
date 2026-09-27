# Deploy da Fase 2 na VPS

**Data:** 2026-09-27, a partir da branch `limpeza` no commit `0b63398e`, na VPS OVH (`pipe.144-217-164-204.sslip.io`).
**Executado por:** o dono, com o script `deploy-fase2.sh` preparado nesta sessão (pacote `git archive`, mesmo caminho do gate 4 da Fase 1). Imagens construídas na própria VPS, uma por vez.

## O que mudou

| Serviço | Antes | Depois | Tamanho |
|---|---|---|---|
| api | `pipe-api:en` | `pipe-api:fase2` | 350 MB |
| workers | `pipe-workers:en` | `pipe-workers:fase2` | 281 MB |
| management | `pipe-management:en` | `pipe-management:fase2` | 79,8 MB |
| desk | `pipe-desk:en` | sem mudança | — |

- Migrações 0047 a 0050 aplicadas com a imagem nova antes de subir o código ("migrations aplicadas e partições garantidas").
- A API sobe com `node --no-node-snapshot dist/main.js`.

## Verificação

| Checagem | Resultado |
|---|---|
| `isolated-vm` na imagem nova (Alpine, Node 22) | 6.2.0 carrega, executa e corta laço infinito ("Script execution timed out.") |
| Contêineres | api, workers e management `healthy`; desk, redis e postgres inalterados |
| `GET /` | 200 |
| `GET /login` | 200 |
| `GET /desk/login` | 200 |
| `GET /v1/conversations` | 401 |
| `GET /v1/management/flows` | 401 |
| Logs da API nos 2 minutos seguintes | sem erro |

## Volta

`~/pipe/docker-compose.yml.antes-fase2-*` guarda o compose anterior. As imagens `:en` continuam no disco. As migrações 0047 a 0050 só criam tabelas e políticas novas, que o código `:en` ignora.

## Pendências do dono

- Cadastrar `https://pipe.144-217-164-204.sslip.io/v1/auth/google/callback` no console do Google (herdado da Fase 1).
- `git push origin limpeza` (o GitHub ainda não tem os commits da Fase 2; o deploy usou o pacote local).
