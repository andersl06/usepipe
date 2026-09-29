# Passagem para a sessão 2 (2026-09-29)

Leia este arquivo inteiro antes de agir. Ele cobre o que a sessão 1 fez, o que parou pela metade e como retomar.

## Onde estamos

- **Repositório:** `C:\Users\anderson.linhares\pipe`, branch `limpeza`. A `main` é a base de PR. Não há push feito; o remoto é `https://github.com/andersl06/usepipe.git`, e só se faz push com ordem do dono.
- **Último commit em `limpeza`:** `dc260abe` (planos 02-43..02-45). Tudo até ele passou nos testes: core 523, gestão 411, API 789 com banco local.
- **Fase ativa:** `.planning/phases/02-fechar-o-builder/`. Decisões do dono em `02-CONTEXT.md` (D-55..D-58).
- **Objetivo corrente (D-57):** o Pipe roda tudo o que o Builder da Blip roda, para fluxos importados da Blip funcionarem sem mudança. Inventário e ordem dos planos em `ref/INVENTARIO-RUNTIME-BLIP.md` §5.3 (P1..P16). Auditoria de ligações e duplicação em `ref/AUDITORIA-LIGACOES.md`.

## Já no código principal

| Plano | O que entregou |
|---|---|
| 02-36 | Chips globais (`components/selection-chips.tsx`) e regra de fila editada inline no Builder |
| 02-37 | Busca do Builder fiel à Blip |
| Recursos | Tabela `recurso_do_fluxo` (migração 0052), CRUD, fonte `resource.*`; a tela fica em Conteúdos → Recursos (`/contents/resources`) |
| 02-38 (P1) | Fontes `calendar`, `random`, `application`, `tunnel`, `bucket` |
| 02-39 (P2) | Ações `ForwardMessageToDesk` e `SurveyMessage`, `SendRawMessage` de qualquer tipo, expiração de variável (chave interna `'#expirations'`), `stateExpiration`, `actionExecutionTimeout`, `ticket.*`, fuso do bot |
| 02-40 (P3) | Roteador de comandos por `to` (`packages/core/src/flow/commands.ts`) e leituras do Desk (`apps/api/src/domain/desk-commands.ts`) |
| 02-41 | Regras de fila avaliadas de verdade (`packages/core/src/distribution/queue-rule.ts`); entrada única na fila (`apps/api/src/domain/queue-entry.ts`, `enterQueue`); serviços do motor compartilhados entre produção e Testar (`apps/api/src/domain/engine-services.ts`); `closeInTransaction(closedBy)` |
| Avulsos | Desk ao vivo por WebSocket (`apps/desk-vite/src/lib/live-events.ts`); correção do balão `dk-grupo-entrada`; bloqueio do redirecionamento `/\` no login do Desk |

**Na VPS:** está no ar o `d25b9315`, que ainda não tem o 02-41. Suba quando o dono pedir.

## Parado pela metade: os 4 agentes interrompidos pelo dono

Cada um tem branch e pasta temporária próprias, e o trabalho foi salvo em commit (inclusive os WIP). Para retomar, rode um executor `gsd:gsd-executor` **na pasta existente**, ou crie um novo worktree a partir da branch, pedindo para continuar o plano do ponto em que parou (ler o `git log` da branch primeiro).

| Plano | Branch | Pasta | Estado |
|---|---|---|---|
| 02-42 front: código ocioso e componentes globais | `worktree-agent-ad2956a077e2b7f05` | `.claude/worktrees/agent-ad2956a077e2b7f05` | 4 commits: exports/CSS ociosos removidos, `icones-portal` único em `@pipe/ui`, cliente de API único em `@pipe/ui/api`, controles globais em `@pipe/ui`. Estava corrigindo crases quebradas por um script em dois arquivos. Falta conferir `tsc`, lint, testes e `vite build` das duas apps e escrever o `02-42-SUMMARY.md`. |
| 02-43 P4 comandos de escrita do Desk | `worktree-agent-a988bbfae729a3e7b` | `.claude/worktrees/agent-a988bbfae729a3e7b` | 1 commit (rotas de escrita do Desk no vocabulário da Blip). Faltam o teste com fixture do export, os testes com banco e o SUMMARY. |
| 02-44 P5 comandos do Builder/núcleo | `worktree-agent-a62308d742487d061` | `.claude/worktrees/agent-a62308d742487d061` | Só WIP (`e5fe8aa0`): `builder-commands.ts` começado, mais edições em `actions.ts`, `commands.ts` e `context.ts`. Maior parte por fazer. Critério principal: os 10 pares `get /flow-id?shortname=X` → `set /contexts/{contato}/stateid@{{flowIdX@resource}}` do export. |
| 02-45 P6 atendimento humano completo | `worktree-agent-a778b4c1c552bdef2` | `.claude/worktrees/agent-a778b4c1c552bdef2` | 1 commit (ForwardToDesk gera NoAgentAvailable e OutOfAttendanceHour) mais WIP (`2975644a`) que estava ligando o Testar do Builder. Faltam testes e SUMMARY. |

Os planos estão em `.planning/phases/02-fechar-o-builder/02-4{2,3,4,5}-PLAN.md`.

**Depois deles**, na ordem do inventário: P7 (agendamento e broadcast), P8 (expiração da entrada), P9 (script V2 e templates Handlebars; pacote novo exige o checkpoint de pacote), P10 (biblioteca de funções da conta, D-57), P11 (segredos), P12–P13 (subfluxos), P14 (Agente de IA com Anthropic e OpenAI por agente, D-58), P15 (base de conhecimento e MCP), P16 (NLP e AI Answers).

**Também pendentes da auditoria, no front:** a regex de comandos em `actions-of-block.ts`, e o Desk mostra toda conversa encerrada como "Finalizado pelo atendente".

## Rotina de trabalho (siga à risca)

1. **Executores:** usar `gsd:gsd-executor` com `isolation: worktree`, até 3 em paralelo, divididos por área para não colidir.
   - A pasta nova nasce num commit antigo e sem relação (`33435301`). No prompt: "rode `git reset --hard <base>` na SUA branch, depois confira; só pare se continuar errado". Nunca rode reset em `limpeza`.
   - O hook do RTK bloqueia `git` puro dentro do worktree. O executor usa `/mingw64/bin/git`.
   - A pasta `referencias-blip` fica fora do git; passe o caminho absoluto `C:/Users/anderson.linhares/pipe/referencias-blip/`. D-33: nunca copiar código, CSS ou SVG da Blip.
   - Antes do typecheck, construir as dependências: `pnpm --filter @pipe/contracts --filter @pipe/core --filter @pipe/ui --filter @pipe/db --filter @pipe/authentication --filter @pipe/workers --filter @pipe/storage --filter @pipe/ai run build`.
   - Executores não mexem em REQUIREMENTS, ROADMAP nem STATE, nem em Docker ou banco. Testes com banco quem roda é o orquestrador depois do merge.
2. **Merge:** na pasta principal, `git merge --no-ff -q <branch> -m "chore: merge executor worktree (<plano>)"`. Depois:
   - `pnpm --filter @pipe/core run build`;
   - core: `npx vitest run`;
   - gestão: `npx tsc --noEmit -p .` e `pnpm test`;
   - API: `npx tsc -p tsconfig.test.json --noEmit` e `npx vitest run`.
   - Os testes da API usam o Postgres local `localhost:5433` (container `pipe-postgres`). Migração: `DATABASE_URL=postgres://pipe:pipe@localhost:5433/pipe pnpm --filter @pipe/db migrate`.
   - O lint da API tem 2 erros antigos (`sla.ts`, `channel-of-flow.test.ts`); o do desk-vite tem 1 antigo (`desk-selection.tsx`).
3. **Limpar a pasta temporária logo depois do merge** (regra do dono: nada de pastas sobrando). Em comandos separados:
   - PowerShell `robocopy "$env:TEMP\vazio" <pasta> /MIR /NFL /NDL /NJH /NJS` (código de saída 2 é sucesso);
   - `Remove-Item -Recurse -Force <pasta>`;
   - `git worktree prune`;
   - `git branch -D <branch>`.
4. **Commits:** terminar com `Co-Authored-By: ...`. Nomes no código e comentários em inglês; texto que o usuário vê em português.

## Deploy na VPS (o dono autorizou fazer sozinho, no modo que preserva os dados)

- **VPS:** `ubuntu@144.217.164.204`, chave `~/.ssh/codex_barboo_vps_ed25519`. Use o IP, não o nome. Site: `https://pipe.144-217-164-204.sslip.io`.
- **Pacote**, sempre com o prefixo `pipe/`:
  `git archive --format=tar.gz --prefix=pipe/ -o /c/Users/anderson.linhares/pipe-deploy/pipe-src-<sha8>.tar.gz HEAD`
  Depois `scp` para `~/` na VPS e `ssh ... "bash deploy.sh pipe-src-<sha8>.tar.gz"` em segundo plano, com log em `$TEMP/deploy-<sha>.log`. Espere "Pronto." no log.
- **Nunca** use `--zerar` sem ordem do dono. Nunca faça seed, reset ou drop de `pipe-postgres-1` ou `pipe-redis-1`. O Chatwoot foi removido a pedido do dono.

## Pendências com o dono

- **Fluxo importado da Blip** (`C:\Users\anderson.linhares\Downloads\desk180326kgc0psrfuschzbsnvea (1).json`, fluxo "fluxoanderson" no roteador "routeranderson"): falha no onboarding com `Cannot read properties of null (reading 'commandUrl')` porque os recursos não estão cadastrados.
  - Faltam `simpleResources` (JSON com `commandUrl`, `research`, `preQueueMessage`, `shouldOverflow`, `isNotifyNextService`, …), `TimeZoneAttendance`, `objectResources`, `createMenuFunction` e `urlFuzzyMatch`.
  - O dono viu só uma chave em Conteúdos → Recursos na Blip. Pergunte o nome e o tipo dela; os recursos podem estar em outro bot do roteador.
- **Desk ao vivo:** o dono disse que não funcionou.
  - Já confirmado: a VPS aceita o WebSocket (401 sem sessão, 403 com origem errada), o bundle do Desk tem o código novo e existe inscrição no canal `pipe:eventos:<tenant>` no Redis.
  - Falta ver se o evento é publicado quando chega mensagem. Com o dono mandando mensagem, observe `docker exec pipe-redis-1 redis-cli MONITOR | grep -i publish` na VPS.
- **Claude na VPS:** o Claude Code 2.1.284 está instalado em `~/.local/bin/claude` e o dono criou `~/.claude-env` (`ANTHROPIC_BASE_URL=https://agentrouter.org/` mais a chave).
  - `claude -p` fica pendurado sem resposta.
  - Um `curl` direto em `/v1/messages` do agentrouter deu `400 content-blocked`: a chave foi aceita, mas o conteúdo foi bloqueado, possivelmente porque o agentrouter só aceita o cliente oficial. Havia log de debug em `~/.claude/debug/latest`.
  - Nunca repita a chave no chat e não grave segredo em arquivo por conta própria.
- **Checkpoints visuais do dono ainda abertos:** 01-45, 02-27, 02-28, 02-30..02-37 e o portão final 02-35.

## Memória

Há memórias úteis em `C:\Users\anderson.linhares\.claude\projects\C--Users-anderson-linhares-pipe\memory\` (índice `MEMORY.md`).
