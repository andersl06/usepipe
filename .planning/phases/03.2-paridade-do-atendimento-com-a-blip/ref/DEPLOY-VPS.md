# Deploy da 03.1 e da 03.2 na VPS de demonstração

**Data:** 2026-10-03 (UTC), a partir da branch `limpeza`, commit **`e29ac54c`**, na VPS OVH (`pipe.144-217-164-204.sslip.io`, usuário `ubuntu`).
**Pedido do dono:** publicar até o último commit antes da 03.1.1. O plano da fase 03.2 NÃO foi aprovado pelo dono; o deploy é de demonstração.
**Executado por:** o Claude, a pedido do dono, pelo mesmo caminho do deploy da Fase 2 (pacote `git archive`, imagens construídas na própria VPS, uma por vez).

## O que foi publicado

| Serviço | Antes | Depois |
|---|---|---|
| api | `pipe-api:048612e3` | `pipe-api:e29ac54c` (422 MB) |
| workers | `pipe-workers:048612e3` | `pipe-workers:e29ac54c` (282 MB) |
| management | `pipe-management:048612e3` | `pipe-management:e29ac54c` (80,1 MB) |
| desk | `pipe-desk:048612e3` | `pipe-desk:e29ac54c` (74,5 MB) |

- O pacote saiu de `git archive e29ac54c` sem `.planning`, `docs`, `.claude` e `.codex` (hash sha256 `7c23690dde72e359...`); só tem `.env.example`, nenhum segredo.
- **Fora desta publicação:** a 03.1.1 (migração 0091 em diante, vocabulário de estados Blip) e qualquer arquivo não commitado do outro agente.

## Migrações

- Banco de produção: **54 para 63** (as 9 novas: 0082, 0083, 0084, 0085, 0086, 0087, 0088, 0089, 0090). Aplicadas com a imagem nova (`node /app/packages/db/dist/migrate.js` na rede `pipe_interno`) antes de subir o código; saída: "migrations aplicadas e partições garantidas".
- A 0088 troca o índice único por data de exceção de horário por um índice parcial; as demais são aditivas.
- **A 0084 é uma migração de DADOS, não só de estrutura:** conversas que eram só do bot (estado `na_fila` ou `com_bot`, sem fila, sem atendente, com execução e sem evento de entrada em fila) deixam de ser conversa e passam a viver como mensagem/execução sem conversa (D-15, o ticket nasce no transbordo). Isso alterou linhas existentes na produção. O código antigo (`048612e3`) NÃO é compatível com o banco novo: voltar só a imagem não basta (ver Volta).
- Quem usa a demonstração e tinha conversa só-do-bot em aberto vai vê-la sumir das listas do Desk (ela continua como histórico do bot).

## Verificação

| Checagem | Resultado |
|---|---|
| Contêineres api, workers, desk, management | `healthy` depois de 15 s |
| `GET /` | 200 |
| `GET /login` | 200 |
| `GET /desk/login` | 200 |
| `GET /v1/conversations` | 401 |
| `GET /v1/management/flows` | 401 |
| `GET /v1/management/history` | 401 |
| Logs de api e workers nos 2 primeiros minutos | sem erro |

Não testado: conversa real pelo Builder até o Desk, login Google pela tela, envio de mensagem, o worker de encerramento automático em filas com a opção ativa.

## Mudanças de comportamento que entraram

- Worker de encerramento automático por inatividade roda sempre, só nas filas com a opção ativa (e no padrão global do tenant quando houver).
- Relatórios (`attendance`, `effort`, `satisfaction`) exigem a permissão `relatorio.ver` e têm teto de 90 dias.
- Configurações gerais do atendimento passam a valer no Desk (mídia, espera, distribuição, transferência).
- Fila sem horário usa o horário regular do tenant; sem regular, continua 24 horas.

## Volta

- **Backup antes de migrar:** `~ubuntu/backups/pipe-pre-e29ac54c-20261002-2031.dump` (formato custom do `pg_dump`, 695 KB, 1259 entradas).
- **Compose anterior:** `~/pipe/docker-compose.yml.antes-e29ac54c-*`. As imagens `:048612e3` continuam no disco.
- Voltar as imagens sem restaurar o banco QUEBRA o código antigo (a 0084 removeu o estado `com_bot`). Para voltar de verdade: parar api/workers/desk/management, restaurar o dump (`pg_restore --clean --if-exists`), trocar o compose pelo backup e subir. Dados criados depois do deploy se perdem.

## Pendências do dono

- Cadastrar o callback do Google no console (herdado: `https://pipe.144-217-164-204.sslip.io/v1/auth/google/callback`) se o login ainda não funciona.
- Testar de ponta a ponta com um bot real; aprovar (ou não) os portões das Ondas 2 a 4 da 03.2.
- `git push origin limpeza` (o GitHub não tem os commits desta branch; o deploy usou o pacote local).

## Correção do login (2026-10-03): 404 em `login.144-217-164-204.sslip.io`

**Sintoma:** abrir `https://pipe.144-217-164-204.sslip.io/` sem sessão levava a `https://login.144-217-164-204.sslip.io/?returnTo=...`, que responde "404 page not found" (página padrão do Traefik: nenhum roteador atende esse host).

**Causa:** o front calculava o domínio base pelo endereço do navegador, tirando o primeiro rótulo (`deriveBaseDomain`). Com a base real do servidor tendo um rótulo a mais (`PIPE_DOMINIO_CONTAS=pipe.144-217-164-204.sslip.io`), o apex era lido como o inquilino `pipe` de `144-217-164-204.sslip.io`, e o login central saía em `login.144-217-164-204.sslip.io`. O servidor e o Traefik usam `login.pipe.144-217-164-204.sslip.io`. O erro veio com a funcionalidade de subdomínio por inquilino (spec de 2026-09-29), já presente na imagem `048612e3`.

**Correção** (commit `5789a7bb`): `deriveBaseDomain(hostname, configuredBase?)`. O front recebe `VITE_PIPE_DOMINIO_CONTAS` em tempo de build (mesmo valor de `PIPE_DOMINIO_CONTAS`). O próprio domínio base passa a ser o apex (sem inquilino, modo comum do front, com o login da página `/login`); hosts sob a base resolvem para ela. Teste novo em `packages/contracts/tests/tenant-host.test.ts`.

**Publicação:** só management e desk foram reconstruídos, com `--build-arg VITE_PIPE_DOMINIO_CONTAS=pipe.144-217-164-204.sslip.io` e a tag `e29ac54c-login`; api e workers ficaram em `e29ac54c`. Compose anterior guardado em `~/pipe/docker-compose.yml.antes-login-*`. Para voltar: trocar as duas tags para `e29ac54c` (as imagens continuam no disco).

**Verificado sem navegador:** a base está embutida nos bundles novos (e ausente no antigo); o cálculo devolve `null` para o apex e a base para `login.*` e `<slug>.*`; `GET /v1/auth/google/start` no apex responde 302 para `login.pipe.144-217-164-204.sslip.io`; esse host responde 200.
**Não verificado:** o redirecionamento no navegador (a extensão do Chrome não estava conectada) e o login Google completo.

**Pendência do dono:** `GOOGLE_URL_RETORNO` aponta para `https://login.pipe.144-217-164-204.sslip.io/v1/auth/google/callback`. Esse endereço (com `login.pipe.`) precisa estar cadastrado no console do Google; o cadastro herdado do handoff era `pipe.144-217-164-204.sslip.io/v1/auth/google/callback`, sem `login.`. Sem isso o Google responde `redirect_uri_mismatch`.
