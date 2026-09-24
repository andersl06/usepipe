# Rascunho do runbook de cutover em produção (fase 01)

**Status: RASCUNHO, escrito antes das fatias 1-5 rodarem.** Nesta data
(2026-09-24) nenhuma tag `std-slice-*-end` existe, `std/queue-rename.md` (plano
01-16) e `apps/api/src/drain-legacy-queues.ts` (plano 01-33 Task 1) ainda não
existem, e os nomes de fila/rota/cookie citados abaixo ainda são os atuais em
PT. Este documento antecipa o roteiro real a partir do que já está decidido
(01-CONTEXT.md) e do código hoje, para revisão do dono e para comparação
quando o plano 01-33 escrever o `STD/CUTOVER-RUNBOOK.md` de verdade. **Não
substitui aquele arquivo** — quando ele existir, ele é a fonte de execução;
este rascunho não é commitado por ninguém além do orquestrador.

Sem SSH, sem chamada de rede para a VPS e sem deploy foram feitos para montar
este rascunho — tudo abaixo vem da leitura do repositório.

---

## 1. Pré-condições (checklist antes de abrir a janela)

- [ ] **Gates verdes**: `bash tools/std/gate.sh final` sai 0 (script já existe
  em `tools/std/gate.sh`; hoje cobre baseline/slice-N, o estágio `final` é
  escrito pelo plano 01-32 Task 1). `FINAL-REVIEW.md` com as 15 linhas de
  invariante marcadas e a caminhada de smoke local (01-32 Task 2) aprovada
  pelo dono, incluindo o ack de toda linha `post-gate2-derived` em
  `STD/reports/final-post-gate2-derived-ack.csv`.
- [ ] **Tag**: `std-slice-5-end` existe e é o HEAD da branch de trabalho
  `std/english-rename` (01-CONTEXT.md D-22). Escolher e anotar a tag/versão de
  imagem do cutover (ex.: `v-std-cutover-1`) — vira `PIPE_VERSAO`.
- [ ] **Backup do Postgres**: stanza `pipe` do pgBackRest com `archive_mode=on`
  (`infra/compose/docker-compose.prod.yml:281`, `PG_ARCHIVE_MODE`) e teste de
  restauração recente com `pipe_restauracao_ok=1`
  (`infra/compose/backup/restaurar-teste.sh:40-66`). Tirar um full manual
  antes de cortar:
  `docker compose -f docker-compose.prod.yml --env-file /opt/pipe-dados/.env --profile tarefa run --rm backup -c 'pgbackrest --stanza=pipe --type=full backup'`
  (perfil `tarefa` e imagem em `infra/compose/docker-compose.prod.yml:350-361`;
  o comando de backup diário está em `infra/compose/backup/backup.sh:15`).
- [ ] **Backup do Redis**: **não há script no repositório** para isto — ver
  item aberto §7. Antes da janela, no mínimo `docker compose -f
  docker-compose.prod.yml exec redis redis-cli BGSAVE` e cópia manual do
  volume `redisdados` (`infra/compose/docker-compose.prod.yml:337,519`) para
  fora da VPS. É defesa contra falha de disco, não faz parte da drenagem —
  a fila em si é esvaziada no runbook (§3), não restaurada.
- [ ] **Variável `GOOGLE_URL_RETORNO`**: valor novo
  (`.../v1/auth/google/callback`) já escrito e commitado nas quatro cópias
  antes do deploy (D-06/D-36, 01-CONTEXT.md:75): `.env`, `.env.example`,
  `infra/compose/env.prod.exemplo:64` e o segredo cifrado da VPS
  (`infra/compose/segredos/producao.enc.env`, editado com `sops` — ver
  `infra/compose/implantar.sh:72-85`). **Nome** da variável não muda.
- [ ] **Google Cloud Console**: nenhuma ação ainda — feita no passo 8. Mas
  confirmar de antemão que o dono tem acesso ao projeto certo (PROJECT-HANDOFF
  linha 303-308: o redirect da VPS para `/retorno` nunca foi cadastrado, então
  não há URI antiga para remover lá — só para o `localhost` de
  desenvolvimento).
- [ ] **Convites pendentes**: listar antes da janela para reenviar depois
  (D-14, corte seco sem redirect PT→EN em `/convite/:token` →
  `/invite/:token`):
  `select id, email, tenant_id, expira_em from convite where aceito_em is null and expira_em > now();`
  (schema em `packages/db/src/schema/identidade.ts:539-561`; a URL nasce em
  `urlDoConvite()`, `apps/api/src/dominio/convites.ts:70-73`).
- [ ] **Janela**: fora de 02:50-03:30 horário da VPS (evita o cron
  `pipe-agregacao` de `10 3 * * *`, 01-RESEARCH.md linha 360) e curta (Meta
  webhook retry é suposição A5, não confirmada — 01-RESEARCH.md linha 466).
- [ ] **Acesso**: dono com root na VPS e acesso ao Google Cloud Console — Claude
  não tem nenhum dos dois (01-33-PLAN.md Task 2).
- [ ] **Imagens**: `infra/construir-imagens.sh` já builda as 6 apps
  (`api workers desk-vite gestao-vite crm site`, linha 19) com a tag da
  versão escolhida; decidir se o build roda local (com `PUBLICAR=1` e
  `docker login ghcr.io` já feito) ou é delegado ao dono.

## 2. Passos ordenados

Numeração alinhada à ação do plano 01-33 Task 1 (`01-33-PLAN.md:66`), com a
fonte real de cada comando.

1. **Build + push das imagens**, da máquina com credencial no registro:
   `PUBLICAR=1 MSYS_NO_PATHCONV=1 bash infra/construir-imagens.sh <versao>`
   (`infra/construir-imagens.sh:1-11,92-97`; `MSYS_NO_PATHCONV=1` é obrigatório
   no Git Bash/Windows — PROJECT-HANDOFF linha 288-291, já quebrou a build do
   Desk em produção uma vez).
2. **Na VPS, cortar a entrada externa (manutenção)**: parar só o Traefik, sem
   tocar api/workers antigos —
   `docker compose -f docker-compose.prod.yml --env-file /opt/pipe-dados/.env stop traefik`
   (compose e variáveis de ambiente em `infra/compose/docker-compose.prod.yml:8,60-105`;
   a ordem "cortar por fora, manter consumidor antigo de pé" é a do runbook de
   drenagem, `01-RESEARCH.md:365-367`). Webhooks Meta passam a falhar e
   dependem do retry do próprio Meta (T-01-33-02, aceito).
3. **Manter os containers antigos `api`/`workers` no ar** — não parar ainda;
   é o consumidor antigo que continua drenando as filas.
4. **Drenar as filas legadas** com a imagem NOVA da api contra o MESMO Redis
   (script ainda não existe — sai do plano 01-33 Task 1,
   `apps/api/src/drain-legacy-queues.ts`):
   ```
   docker compose -f docker-compose.prod.yml --env-file /opt/pipe-dados/.env \
     run --rm --no-deps api node dist/drain-legacy-queues.js --wait --timeout-seconds 900
   ```
   e, se algo não zerar, exportar antes de decidir:
   ```
   docker compose -f docker-compose.prod.yml --env-file /opt/pipe-dados/.env \
     run --rm --no-deps api node dist/drain-legacy-queues.js --export-failed /opt/pipe-dados/drain-<data>
   ```
   As 10 filas de hoje (`apps/workers/src/filas.ts:11-101`,
   `apps/api/src/filas.ts:475`) e os 7 scheduler ids
   (`apps/api/src/filas.ts:206,305,401,464,491`; `apps/workers/src/main.ts:68,75`)
   — `varredura-outbox`, `metrica-diaria`, `varredura-espelho-crm`,
   `varredura-midia`, `varredura-sla`, `varredura-dicionario-crm`,
   `renovacao-token-instagram` — têm de zerar. `pipe-entrada`,
   `pipe-process-http` e `pipe-importacao` não têm varredura de recuperação
   (01-RESEARCH.md:352-363); qualquer job preso nelas ao obliterar é perda
   real, não atraso.
5. **Parar os containers antigos `api`/`workers`** só depois de "todas as
   filas em zero" impresso pelo passo 4.
6. **Obliterar as filas antigas**, e só se o último drenar deu `ok=true`
   (recusa do próprio CLI, `01-33-PLAN.md:63`):
   ```
   docker compose -f docker-compose.prod.yml --env-file /opt/pipe-dados/.env \
     run --rm --no-deps api node dist/drain-legacy-queues.js --obliterate
   ```
7. **Trocar o valor de `GOOGLE_URL_RETORNO` no segredo da VPS** (nome igual,
   valor novo — D-06/D-36): editar `infra/compose/segredos/producao.enc.env`
   com `sops` na máquina do dono e dar `git push`/`git pull` na VPS antes do
   deploy do passo 9, porque `deploy.sh` decifra esse arquivo a cada
   publicação (`infra/compose/deploy.sh:19-24`).
8. **Google Cloud Console** (só o dono, Claude não tem acesso): cadastrar o
   redirect novo `.../v1/auth/google/callback` para a VPS e para
   `localhost` de desenvolvimento; remover o `/retorno` só depois do login
   novo funcionar (D-12, `01-CONTEXT.md:36`). Na VPS não existe hoje um
   `/retorno` cadastrado para remover (PROJECT-HANDOFF:303-308) — só o de
   desenvolvimento local, se houver.
9. **Deploy da versão nova**: `bash infra/compose/deploy.sh <versao>`
   (`infra/compose/deploy.sh:1-44`: decifra o `.env`, builda `postgres`, `pull
   --ignore-buildable`, roda a migration, `up -d --wait --wait-timeout 180`).
   **Atenção**: o script hoje NÃO passa `--remove-orphans`
   (`infra/compose/deploy.sh:39`); se algum serviço/imagem foi renomeado nas
   fatias de infra (D-19 fatia 4), rodar manualmente depois:
   `docker compose -f docker-compose.prod.yml --env-file /opt/pipe-dados/.env up -d --wait --wait-timeout 180 --remove-orphans`
   — ou emendar essa linha no `deploy.sh` durante a fatia de infra, para não
   depender de lembrar disso na madrugada do corte.
10. **Voltar o Traefik**:
    `docker compose -f docker-compose.prod.yml --env-file /opt/pipe-dados/.env start traefik`.
11. **Smoke `env=vps`** — ver §5.
12. **Reenviar os convites pendentes** listados na pré-condição (D-14; sem
    redirect automático, quem não reenviar fica com link morto).
13. **Aviso final**: todo usuário foi deslogado (cookie `pipe_sessao`
    renomeado, D-38 — referências em `apps/api/src/eventos-ws.ts:22,84` e
    `apps/api/src/sessao.ts:19`), URLs de anexo assinadas emitidas há mais de
    15 min quebraram, e as séries do Prometheus recomeçam do zero sob os
    nomes novos (D-38; métricas hoje em
    `01-RESEARCH.md:347`: `pipe_fila_profundidade`,
    `pipe_fila_idade_item_mais_velho_segundos`, `pipe_http_requisicoes_total`,
    `pipe_mensagem_entrega_total`, `pipe_migration_pendente`; regras em
    `infra/observabilidade/alertas.yml`).

## 3. Drenagem BullMQ — condição de corte

Nenhum worker com nome novo sobe antes das 10 filas antigas chegarem a zero
(D-10). A sequência do passo 4-6 é a única ordem aceita:

1. Consumidores antigos ficam de pé enquanto o Redis é o mesmo (mesma
   instância/URL — não há migração de dados do Redis, só de nomes).
2. `removeJobScheduler()` roda para os 7 ids antes de contar, senão o próximo
   job atrasado do scheduler nunca deixa a fila zerar
   (`01-RESEARCH.md:368`).
3. `getJobCounts('waiting','active','delayed','prioritized','waiting-children')`
   é avaliado nas 10 filas; só `ok=true` (todas zero dentro do timeout)
   libera o passo 6. Um `delayed` pendente após o timeout retorna `ok=false`
   e a CLI se recusa a obliterar (comportamento exigido em
   `01-33-PLAN.md:59-63`).
4. `failed` de `pipe-entrada`/`pipe-process-http`/`pipe-importacao` é
   exportado para arquivo antes de qualquer obliteração — são as três sem
   varredura de recuperação.
5. Só depois disso: parar containers antigos → obliterar → subir imagens
   novas (schedulers voltam a existir nos nomes novos via
   `upsertJobScheduler` no boot).

Recuperabilidade por fila (fonte: `01-RESEARCH.md:352-363`):

| Fila | Consumidor | Rede de segurança | Perda se falhar |
|---|---|---|---|
| pipe-entrega | workers | `outbox_mensagem` + varredura 15 s | nenhuma |
| pipe-espelho-crm | api | varredura 5 min | nenhuma |
| pipe-midia | api | varredura | nenhuma |
| pipe-sla | api | varredura 60 s | nenhuma |
| pipe-dicionario-crm | api | varredura horária | nenhuma |
| pipe-instagram-token | api | scheduler diário | nenhuma |
| pipe-agregacao | workers | cron `10 3 * * *` | 1 dia de agregado se cruzar a janela |
| **pipe-entrada** | api | **nenhuma** | **mensagem recebida perdida** |
| **pipe-process-http** | api | nenhuma | fluxo preso no passo HTTP |
| **pipe-importacao** | workers | nenhuma (linha fica em `importacao_arquivo`) | importação presa |

## 4. Impacto de cookie/sessão e webhooks

- **Cookie**: `pipe_sessao` é renomeado (D-38) — todo usuário logado é
  deslogado no deploy, sem excecão; login novo funciona com o cookie novo.
  Upgrade de WebSocket (`/v1/eventos`) usa o mesmo cookie
  (`apps/api/src/eventos-ws.ts:22,84`), então a conexão em tempo real também
  cai e reabre só depois do novo login.
- **Webhooks Meta**: `webhooks/whatsapp`, `webhooks/instagram`,
  `webhooks/messenger` **não mudam de caminho** (D-15) — nenhuma reconfiguração
  no Business Manager/Meta é necessária neste corte. O único efeito é a
  janela de manutenção (passo 2): entregas que chegarem enquanto o Traefik
  está parado dependem do retry do próprio Meta (A5, não verificado).
- **Google/SSO callback**: só esses dois mudam de caminho
  (`/v1/auth/google/retorno` → `/v1/auth/google/callback`, D-12;
  `/v1/auth/sso/retorno` → `/v1/auth/sso/callback`, D-13 — sem cliente real
  hoje). Corte seco, sem redirect de compatibilidade.
- **Convites e bookmarks**: `/convite/:token` → `/invite/:token`, corte seco,
  sem redirect (D-14). Links antigos enviados por e-mail quebram; reenviar os
  pendentes é o único remédio (passo 12).

## 5. Checklist de smoke pós-deploy

Reusar `STD/smoke-checklist.md` (mesma pasta), preenchendo `result`/`date` de
cada linha `env=vps` só depois da janela. Hoje só duas linhas já têm
`env=vps`: `SM-02` (Google OAuth) e `SM-21` (filas). As demais áreas que o
plano 01-33 Task 2 pede para reportar (convite, Desk F5/back, filtros da
Gestão, redirect do CRM, upload, métricas Prometheus + `alertas.yml`, conexão
WS) **ainda não têm linha `env=vps` equivalente** — ver item aberto §7.

## 6. Rollback

**Ponto de decisão**: depois do passo 6 (obliterar), rollback de fila não
existe mais — as filas antigas estão vazias de propósito. Até o passo 5
(containers antigos ainda de pé, filas ainda não obliteradas), rollback é
trivial: religar o Traefik, deixar os containers antigos como estavam, sem
reimplantar nada.

- **Antes do passo 6 (obliterar)**: abortar = religar Traefik (passo 10),
  manter `api`/`workers` antigos no ar, não subir a imagem nova. Nenhum dado
  em risco; o corte simplesmente não aconteceu ainda.
- **Depois do passo 6, antes do passo 9 (deploy)**: as filas antigas já estão
  vazias; a única rota de volta é terminar o cutover (subir a imagem nova),
  não voltar para a antiga — a antiga não tem mais fila para consumir.
- **Depois do passo 9 (deploy da imagem nova)**: se o smoke (passo 11) falhar,
  voltar `PIPE_VERSAO` para a tag anterior e rodar
  `bash infra/compose/deploy.sh <versao-anterior>` de novo (o script sempre
  roda a migration primeiro — por isso toda migration deste corte precisa ser
  compatível com o código antigo, regra já em vigor em `deploy.sh:9-11`).
  Como as filas legadas já foram obliteradas, o rollback de código **não**
  restaura o consumo pelos nomes antigos — o outbox (`outbox_mensagem`) e a
  varredura cobrem o que sobrar nas filas com rede de segurança; `pipe-entrada`
  /`pipe-process-http`/`pipe-importacao` não têm essa rede, então um rollback
  tardio não recupera o que se perdeu ali, só os arquivos de `failed`
  exportados no passo 4.
- **Orçamento de tempo**: decidir GO/NO-GO do passo 11 (smoke) em até 15 min
  depois do deploy — health checks da api levam até 40 s de `start_period`
  mais até 4 tentativas de 15 s (`infra/compose/docker-compose.prod.yml:116-127`),
  então 15 min já sobra folga para o smoke manual rodar depois disso. Se o
  smoke reprovar, rollback de código é o caminho (parágrafo anterior) — não
  há caminho de rollback de fila depois do passo 6.

## 7. Comunicação

- **Antes da janela**: avisar que todos serão deslogados e terão que entrar
  de novo (D-38) e que qualquer link de anexo copiado há mais de 15 min vai
  parar de funcionar.
- **Convites**: quem tem convite pendente recebe um novo (passo 12) — avisar
  que o link antigo não funciona mais (corte seco, D-14).
- **Depois do smoke aprovado**: liberar o aviso de "pode usar de novo";
  métricas históricas do Grafana/Prometheus reiniciam do zero sob os nomes
  novos, avisar quem acompanha painel para não estranhar o buraco na série.
- **Se abortar antes do passo 6**: nenhum aviso externo é necessário — nada
  mudou para o usuário.

## 8. Itens abertos (precisam do dono ou de acesso ao vivo)

1. **Backup do Redis não tem script no repositório.** Só existe
   `--appendonly yes` no volume `redisdados`
   (`infra/compose/docker-compose.prod.yml:324-337`); não há `pgbackrest`
   equivalente para Redis. Decidir se basta o AOF existente ou se entra um
   passo de `BGSAVE` + cópia de volume antes de cada corte.
2. **`docker-compose.prod.yml` assume os domínios `*.usepipe.com.br`**
   (`api.`, `app.`, `gestao.`, `crm.`, sem subdomínio para o site), mas a VPS
   de demonstração hoje serve em `https://pipe.144-217-164-204.sslip.io`
   (PROJECT-HANDOFF linha 303-308; `.planning/codebase/CONCERNS.md:147`) — um
   domínio/roteamento que não bate com o compose lido aqui. Preciso do dono
   para confirmar: a VPS de demonstração roda este mesmo
   `docker-compose.prod.yml` com outro `.env`/DNS, ou é uma topologia
   diferente (outro compose, outro roteador Traefik)? Isso muda os comandos
   exatos dos passos 2, 7, 9 e 10.
3. **`std/wire-contracts.csv` não existe neste repositório.** O pedido cita
   "24+ endpoints usados por chaves de API de cliente que podem manter nomes
   PT até o portão 2 do dono" — a evidência mais próxima hoje é a linha do
   inventário (`01-RESEARCH.md:341`, D-40 em `01-CONTEXT.md:82`): escopos de
   `chave_api.escopos` (ex. `conversas:ler`) e códigos de erro persistidos são
   tratados no `STD/persisted.csv` e não renomeiam nesta fase. Sem o CSV real
   de contratos de wire (produzido pelo inventário, plano ~01-02/01-03), não
   dá para confirmar a lista de 24+ endpoints nem se algum deles depende do
   corte de rota do passo 9 — revisar contra `STD/map/*.csv` quando existir.
4. **`std/queue-rename.md` e `apps/api/src/drain-legacy-queues.ts` ainda não
   existem** (planos 01-16 e 01-33 Task 1, respectivamente). Os nomes de fila
   e scheduler citados aqui vêm da leitura direta do código atual
   (`apps/workers/src/filas.ts`, `apps/api/src/filas.ts`,
   `apps/workers/src/main.ts`) e devem ser conferidos contra o mapa aprovado
   quando ele existir — nomes novos ainda não foram decididos no portão 2.
5. **`tools/std/gate.sh` ainda não tem o estágio `final`** nem
   `STD/smoke-checklist.md` tem todas as linhas `env=vps` que o cutover exige
   (só `SM-02` e `SM-21` hoje — ver §5). Preciso que o plano 01-32 rode antes
   deste corte para eu não estar assinando uma pré-condição que não existe.
6. **Nenhuma tag `std-slice-N-end` existe ainda** (git tag vazio nesta
   checkout) — a versão de imagem do cutover e a ordem exata dos passos 1-13
   só podem ser confirmadas depois que as fatias 1-5 tiverem rodado e as tags
   existirem.
7. **Acesso à VPS e ao Google Cloud Console**: Claude não tem SSH nem login
   no Console (regra desta tarefa e do plano 01-33). Os passos 2, 6-10 e a
   troca de redirect no Google (passo 8) só podem ser confirmados como
   executados pelo relato do dono — nenhum deles foi (nem pode ser) testado
   ao escrever este rascunho.
8. **Retenção do Prometheus é 15 dias**
   (`infra/compose/docker-compose.prod.yml:394`) — se o corte de nomes de
   métrica quebrar algum alerta configurado fora do `alertas.yml` do
   repositório (ex. regra criada manualmente no Grafana), não há como este
   rascunho detectar isso sem acesso ao painel ao vivo.
