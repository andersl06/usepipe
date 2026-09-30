# Prompt de continuação para Codex — Fases 01.1 e 1

Continue o trabalho a partir do estado já commitado na worktree `C:\Users\anderson.linhares\pipe-codex`, branch `codex/fases-1-e-1.1`. Não recrie a worktree nem repita planos concluídos. Antes de cada plano novo, faça `git merge --no-ff limpeza` **somente nesta worktree**. Nunca faça checkout, reset, rebase, commit ou merge no repositório principal `C:\Users\anderson.linhares\pipe`, nem faça push ou merge na branch `limpeza`.

## Ordem de autoridade e objetivo

O prompt original continua em `C:\Users\anderson.linhares\pipe\.planning\PROMPT-CODEX-FASES-1-E-1.1.md`; leia-o e siga suas regras. Leia também `.planning/PROJECT.md`, planos/contexto/pesquisa relevantes antes de cada plano. Este handoff registra o que esta sessão já fez e duas atualizações posteriores do dono:

1. O domínio futuro pretendido agora é **`pipebr.ai`**. Ele ainda não foi comprado, registrado ou configurado. Use-o como valor de exemplo para o domínio futuro; não compre, consulte conta, crie DNS, publique, faça deploy nem afirme que existe. Esta decisão posterior substitui `usepipe.app` como nome futuro nas instruções de continuação e nos exemplos/runbook atualizados; os registros históricos `.planning/01.1-CONTEXT.md` e planos antigos ainda podem citar `usepipe.app`.
2. O dono respondeu **“não”** à mudança do link ativo “Entrar” do site. Preserve o destino atual em `apps/site/index.html`; não o redirecione para `login.<domínio>`. O scanner permite somente a linha exata do link via regra justificada em `tools/domain-literals-allow.txt`. Não amplie essa exceção.

## Restrições que continuam valendo

- Não execute Docker, testes que escrevem no banco, migrations, Terraform, ações na VPS, DNS, compras ou deploy. Testes de banco são escritos, não rodados. Nenhum pacote npm novo sem perguntar ao dono. Não altere `REQUIREMENTS.md`, `ROADMAP.md` ou `STATE.md`. Não copie código, CSS, SVG ou segredos de `referencias-blip/`.
- Antes de typecheck em um plano que altere TypeScript, rode `pnpm install` (já foi feito nesta worktree) e construa as dependências selecionadas no prompt original. Preserve commits pequenos com `Co-Authored-By: Codex <noreply@openai.com>` e escreva um SUMMARY por plano concluído.
- Não execute o plano 01.1-07: ele é checkpoint do dono na VPS. A sequência 01.1 concluída por código é 01–06 e 08, com pendências explícitas de validação. Depois, na Fase 1, execute 01–46, prepare a proposta completa e artefatos de 01–47 e pare pela aprovação do dono. Não comece 01–48…56; 01–57 é checkpoint do dono.

## Estado já realizado

Na fase 01.1, planos 01–05 foram implementados e têm summaries. Plano 08 está documentado/commitado. O plano 06 tem implementação, commits, testes unitários e typechecks indicados em `.planning/phases/01.1-subdominio-por-tenant/01.1-06-SUMMARY.md`; seu status e limites também foram acrescentados ao final de `01.1-06-PLAN.md`.

Principais commits recentes (todos nesta branch; consulte `git log` para a sequência completa):

- `6c5b372c`, `92d1e0ad`, `cb192e9c`: regras compartilhadas e validação HTTP/WebSocket por tenant (01.1-01/02).
- `47a5cea8`, `853259f4`: login central, convites/provisionamento (01.1-03).
- `ae6c8dbc`, `7c26a879`, `9d31950c`: links e fronts, build same-origin (01.1-04).
- `4c4315b6`, `cc5a5360`: Traefik, DNS IaC e correção para validar domínio antes de chamar Docker e limpar o token ACME dos processos de app (01.1-05).
- `197d10e9`: runbook de ativação e adendo datado (01.1-08).
- `46a7b546`, `1c6ca55c`, `e1fad2c8`: modos de desenvolvimento, scanner, suíte de isolamento e smoke local (01.1-06).

Na última verificação, contratos passaram (4 testes), API typecheck passou, 12 testes unitários da API passaram, 413 testes do Management passaram, lint focal passou e o script Bash passou em `bash -n`. O scanner detectou um probe negativo no código e saiu 1; depois da exceção exata e da atualização do comentário, a varredura saiu 0. A suíte de integração com banco e o smoke local com banco **não foram rodados**.

## Pendências antes do checkpoint 01.1-07

1. Revise as mudanças recentes de handoff e crie commits pequenos com coautoria. Verifique `git status` primeiro.
2. Termine os checks estáticos possíveis sem Docker/banco: `git diff --check`, scanner SUB-01 e typecheck/lint após a mudança de runbook/exemplos, conforme aplicável. Confirme o conteúdo e o caminho do link retido.
3. Feche `.planning/phases/01.1-subdominio-por-tenant/01.1-06-SUMMARY.md` com o estado final e confirme que a exceção do link ativo é estreita.
4. Antes de declarar 01.1-05 validado, registre como pendentes até uma janela autorizada: `docker compose config` dos overrides DNS/HTTP, inspeção do binário Traefik v3.7.13 para providers Cloudflare e Hostinger, `terraform fmt/init/validate` no módulo e ambientes. Terraform CLI não estava disponível na sessão anterior. Não execute estes comandos se a restrição de não usar Docker/Terraform continuar ativa.
5. Faça uma auditoria final dos summaries 01.1-01 a 06 e 08. Deixe claro que 01.1-07 é o checkpoint do dono; não use `pipebr.ai` em teste HTTP nem presuma que foi adquirido.

## Depois da Fase 01.1

Leia `.planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/01-CLOSURE.md`, `01-46-PLAN.md` e `01-47-PLAN.md`. A Fase 1 está fechada até 01–45 conforme o prompt original; execute 01–46. Em 01–47, produza proposta completa e artefatos para revisão, mas pare para aprovação do mapa. Não execute 01–48…56 enquanto a Fase 2 estiver ativa na branch `limpeza`, e não execute 01–57.

Ao parar no checkpoint, informe branch/último commit, summaries, testes executados e pendentes, migrations (nenhuma criada até aqui), limitações dos providers/Compose/Terraform, a decisão de preservar o link do site, domínio futuro `pipebr.ai` não comprado, pendências do dono e conflitos com `limpeza`.
