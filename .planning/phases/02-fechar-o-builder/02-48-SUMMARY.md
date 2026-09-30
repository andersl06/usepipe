---
phase: 02-fechar-o-builder
plan: 48
status: complete
migration: 0055_variavel_secreta_do_fluxo
---

# 02-48 — P11: Variáveis sensíveis (`secret.*`)

## Escopo escolhido: por fluxo

Na Blip a seção "Variáveis sensíveis" fica em Builder › Configurações do bot, ao lado de
"Variáveis de configuração" (`configuration-sections.ts`; `blip-api-schemas.md` §5.1.2: "Suprimido
depois de salvo; para trocar o nome é preciso reinserir o valor"). Um bot da Blip é um fluxo do
Pipe, então o segredo pertence ao fluxo, como `recurso_do_fluxo` (0052). Um serviço de roteador lê
os segredos do próprio fluxo, nunca os do roteador.

## Cifragem (reusa a gestão de chaves existente)

- `packages/db/src/secret.ts`: AES-256-GCM, envelope `pipev1.<idChave>.<iv>.<tag>.<dado>`, chaves
  de `PIPE_CHAVES_SEGREDO` / `PIPE_CHAVE_SEGREDO_ATUAL` (o mesmo chaveiro que cifra tokens de canal
  e senhas mTLS, lido por `keyring()` em `apps/api/src/database.ts`).
- **A VPS não precisa de variável nova**: a API já exige `PIPE_CHAVES_SEGREDO` para os canais.
- Nenhum pacote novo.

## O que foi construído

1. **Core** (`packages/core/src/flow/context.ts`, `manager.ts`, `actions.ts`, `editor.ts`)
   - `secret` entra em `FONTES_SUPORTADAS`. `ServicosDoMotor.resolveSecret(name)` (opcional).
   - `ACTIONS_WITH_SECRETS = {'ProcessHttp'}`: só ao substituir as settings dessa ação
     (`uri`, `headers`, `body`) o `secret.*` resolve; fora dela lê vazio (sem exceção, sem chamar a
     API), como na Blip ("disponível para uso apenas em ações HTTP").
   - Cada valor lido é guardado num `Set` da ação; `maskSecrets` troca por `********` as formas
     crua, escapada para JSON e URL-encoded (valores com menos de 4 caracteres não são mascarados).
     Mascarado: erro do passo (`execucao_passo`/debug do teste), mensagem e `cause` do
     `ProcessingActionError`, corpo da resposta gravado em `responseBodyVariable` (inclusive na
     retomada do ProcessHttp suspenso).
   - `PedidoDeHttp.sensivel = true` quando o pedido carrega segredo.
   - Relatório de importação: `variavel:secret` só conta referências fora de ações HTTP.
2. **DB** — migração `0055_variavel_secreta_do_fluxo.sql` (journal idx 55, when 1790120000000):
   `id, tenant_id, fluxo_id, nome, valor_cifrado, criado_em, atualizado_em`; único
   `(tenant_id, fluxo_id, nome)`; `CHECK valor_cifrado LIKE 'pipev1.%'`; RLS `tenant_isolado`;
   grant a `pipe_app`. SQL cru, sem mexer no schema Drizzle compartilhado.
3. **API** (`apps/api/src/domain/management/flow-secrets.ts`, rotas em `management-flow.ts`)
   - `GET/POST/PUT/DELETE /v1/management/flows/:id/secrets[/:secretId]`, permissão de fluxo
     `builder.ler`/`builder.escrever`. Só escrita: nenhuma resposta, lista ou auditoria traz o valor
     (nem cifrado). `PUT` exige nome + valor. Auditoria grava só o nome.
   - `loadFlowSecret` decifra para o motor; `engineServices` ganhou `flowId?` e expõe
     `resolveSecret` com cache por entrada (só memória). Produção (`flow.ts`) e teste do Builder
     (`builder-test-run.ts`) passam o `flowId`.
   - ProcessHttp suspenso: `sealHttpRequest` grava `process_http_execucao.pedido` como
     `{cifrado: <envelope>}` quando `sensivel`; `openHttpRequest` decifra só em
     `executarProcessHttp`. A mensagem sintética de erro de rede é mascarada (URL e cabeçalhos).
     O job BullMQ só leva ids.
4. **Gestão** — Configuração › Variáveis › "Variáveis sensíveis" agora funciona
   (`secret-vars-control.tsx`): linhas nome + valor (`type=password`), cada linha salva direto na
   API; salva, mostra máscara `••••••••`; editar (inclusive renomear) exige reinserir o valor.
   `secret.?` marcado como suportado na biblioteca de variáveis.

## Verificação

- core: `npx vitest run` 557/557; `tsc --noEmit` limpo (novo `secret-variables.test.ts`, 10 testes).
- API: `tsc -p tsconfig.test.json --noEmit` limpo; eslint só com os 2 erros antigos (`sla.ts`,
  `channel-of-flow.test.ts`).
- Gestão: `tsc` limpo, `eslint .` limpo, `pnpm test` 412/412 (novo `builder-secrets.test.ts`),
  `vite build` ok.

## Testes de banco para o orquestrador

- `apps/api/tests/flow-secrets.test.ts` (aplicar a migração 0055 antes): CRUD só-escrita, envelope
  no banco e na auditoria sem texto claro, 400/409/403/404, `loadFlowSecret`, teste do Builder
  sem vazamento, `sealHttpRequest`/`openHttpRequest`.
- Regressão recomendada: `builder-test-run.test.ts`, `process-http-retomada.test.ts`,
  `flow-resources.test.ts`.

## Limites conhecidos

- `SendMessageFromHttp` não resolve `secret.*` (o plano restringe a `ProcessHttp`); basta
  acrescentar o tipo em `ACTIONS_WITH_SECRETS`.
- `process_http_execucao.resposta` guarda o corpo real da resposta; se o serviço externo ecoar o
  segredo, ele fica ali (no contexto do fluxo vai mascarado).
- Segredos com menos de 4 caracteres não são mascarados.
