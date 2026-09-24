---
last_mapped_commit: a6f27429c7ea9be3bff55dc212d1534c3ec90a21
last_mapped_at: 2026-09-24
---
# Codebase Concerns

**Analysis Date:** 2026-09-24

Fonte primária: exploração do repo + `PROJECT-HANDOFF.md` (24/09/2026, ramo `limpeza`), que já consolida achados de ~200 sessões de agente anteriores. Onde o handoff e o código concordam, cito os dois.

## Tech Debt

**Typecheck da raiz quebrado silenciosamente:**

- Issue: `pnpm typecheck` (turbo, todos os pacotes) falha por `packages/core/src/fluxo/gerenciador.teste.ts:140` — `variaveis.status` não existe no tipo inferido.
- Files: `packages/core/src/fluxo/gerenciador.teste.ts`
- Impact: os typechecks por app (`pnpm -F @pipe/api typecheck`, `@pipe/gestao-vite`, `@pipe/desk-vite`) não cobrem `packages/core` isolado, então isso vinha passando "verde" em CI/local sem pegar o erro. Regressões em `packages/core` podem passar despercebidas.
- Fix approach: rodar `pnpm -F @pipe/core typecheck` para confirmar o erro, corrigir a inferência de tipo de `variaveis.status`, e considerar adicionar esse comando ao pipeline de CI/turbo para não repetir o ponto cego.

**BullMQ jobId com `:` falha silenciosamente (já corrigido, documentar como armadilha):**

- Issue: BullMQ 5 recusa job id customizado contendo `:` (só aceita o formato de três partes dos jobs repetidos antigos); como o `catch` do enfileiramento engole o erro, um `jobId` como `espelho:<uuid>` fazia TODO enfileiramento de espelho CRM falhar em silêncio, sem log visível de causa.
- Files: `apps/api/src/filas.ts` (função `enfileirarEspelhoCrm`, hoje usa `espelho-${job.contatoId}` com hífen)
- Impact: qualquer novo `jobId` customizado adicionado a essa ou outras filas do BullMQ pode reintroduzir a mesma falha silenciosa, já que o padrão do código é engolir o erro (por design: "uma mensagem que chegou vale mais que o espelho dela no CRM").
- Fix approach: ao adicionar filas novas, nunca usar `:` em `jobId` customizado; considerar logar em nível mais visível (não só `console.error`) quando o enfileiramento falha, para não mascarar uma regressão futura do mesmo tipo.

**Builder incompleto — múltiplas lacunas conhecidas:**

- Issue: catálogo de conteúdos/ações do Builder cobre só texto/menu/quick reply e ProcessHttp; falta biblioteca de funções do contrato, seletor de destino com pesquisa, pesquisa de satisfação nas saídas de atendimento humano, paleta de tags igual à origem, comparação visual completa de todos os estados, copiar/colar bloco, ícone `user-engaged`, exportar versão antiga.
- Files: `apps/gestao-vite/src/paginas/builder/**`; lista detalhada em `docs/builder-cards-pendencias.md` (23/09)
- Impact: Builder não tem paridade funcional com a Blip (régua de medida do produto); painéis de Gerenciamento de Filas e de Teste também sem paridade real.
- Fix approach: seguir a lista priorizada em `docs/builder-cards-pendencias.md`; decidir primeiro o que entra no motor (`packages/core`) antes de desenhar mais tela (recomendação do próprio handoff).

**Fases planejadas mas não iniciadas ainda no repo:**

- Issue: `packages/mcp` (servidor MCP) e `packages/tempo-real` (cliente WebSocket) existem como esqueleto/implementação parcial sem consumidor; hoje as telas atualizam por polling, não tempo real.
- Files: `packages/mcp/**`, `packages/tempo-real/**`
- Impact: nenhum ainda — são fases 5/6 do roadmap de produto (`docs/specs/2026-09-05-pipe-design.md`, `docs/specs/2026-09-07-arquitetura-de-front.md`), não código órfão. Risco real é alguém confundir com código morto e apagar (já aconteceu uma vez, corrigido no handoff).
- Fix approach: não mexer sem reabrir a decisão com o dono; ver "Áreas ainda não implementadas" no `PROJECT-HANDOFF.md`.

**`apps/ponte` (LIME) órfão de arquitetura:**

- Issue: `apps/ponte` foi construído para rodar a cópia compilada da Blip como produto (decisão da manhã de 12/09/2026), depois revertida no mesmo dia — o produto passou a ser o app próprio (`apps/gestao-vite`/`apps/desk-vite`).
- Files: `apps/ponte/src/**`
- Impact: código continua existindo mas não é mais o caminho do produto; risco de confusão sobre seu papel atual, ou de investimento futuro em cima de uma peça que não é mais central.
- Fix approach: decisão do dono sobre manter, arquivar ou formalizar seu escopo residual.

**`apps/crm` e `apps/site` fora de escopo recente:**

- Issue: existem com histórico de commits mas ficaram fora do escopo das últimas sessões (todas em Gestão/Desk/API); não verificados na rodada mais recente do handoff.
- Files: `apps/crm/**`, `apps/site/**`
- Impact: podem estar desatualizados em relação ao restante do monorepo (dependências, convenções, padrão visual) sem que ninguém tenha confirmado isso recentemente.
- Fix approach: decisão do dono — manter, apagar ou retomar.

## Known Bugs

**Possível bug não confirmado no Builder — setas do canvas:**

- Symptoms: `arestasDe()` só lê `bloco.$conditionOutputs` para desenhar as setas de conexão do canvas visual; se uma ligação real do fluxo estiver guardada em outro campo (ação de redirecionamento, saída padrão), a seta pode não aparecer mesmo com os dados corretos.
- Files: `apps/gestao-vite/src/paginas/builder/modelo.ts:421`
- Trigger: fluxo com conexões vindas de ação de redirecionamento ou saída padrão em vez de `$conditionOutputs`.
- Workaround: nenhum; diagnosticado por mineração de sessão (23/09) mas não corrigido nem coberto por teste. Não confiar no canvas visualmente até verificar.

**Suite de testes da API instável sob carga:**

- Symptoms: `apps/api/tests/instagram.test.ts`, `apps/api/tests/fluxo.test.ts` e `apps/api/tests/messenger.test.ts` falham quando rodam junto com a bateria inteira, mas passam isolados.
- Files: os três arquivos acima
- Trigger: rodar `pnpm -F @pipe/api test` completo (todos os arquivos em paralelo/sequência sob carga de banco).
- Workaround: rodar os arquivos isolados quando precisar confirmar que a lógica está correta; não é regressão de código, é timing/concorrência de banco entre arquivos de teste (verificado 24/09) — root cause de infraestrutura de teste, não do domínio.

## Security Considerations

**Regra de ouro: nunca `Promise.all` dentro de transação `comTenant`:**

- Risk: `comTenant` implementa isolamento multi-tenant via `set_config('pipe.tenant_id')` numa conexão Postgres compartilhada durante a transação. Rodar consultas em paralelo (`Promise.all`) dentro dela derruba essa configuração de sessão — risco de vazamento cross-tenant ou erro de contexto de tenant.
- Files: documentado (comentários) em `apps/api/src/banco.ts:39`, `apps/api/src/controladores/desk.ts:76`, `apps/api/src/controladores/entrar.ts:399`, `apps/api/src/dominio/convites.ts:354`, `apps/api/src/dominio/espelho-crm.ts:33`, `apps/api/src/dominio/gestao/acoes/comunicacao.ts:19`, `apps/api/src/dominio/gestao/acoes/regras.ts:19`, `apps/api/src/dominio/gestao/cadastros.ts:62`, `apps/api/src/dominio/gestao/configuracoes.ts:207`, `apps/api/src/dominio/gestao/implantacao.ts:12`
- Current mitigation: convenção de código (consultas sempre em série dentro de `comTenant`), reforçada por comentários extensos em ~10 arquivos diferentes e reiterada em "O que NÃO fazer" no `PROJECT-HANDOFF.md`.
- Recommendation: esta é a garantia central de isolamento entre clientes (um banco, `tenant_id` em toda tabela, RLS) — qualquer PR/plano que toque código dentro de um bloco `comTenant` deve ser revisado para paralelismo acidental. Vale considerar um lint custom ou teste estático que detecte `Promise.all` dentro do escopo de `comTenant`, já que hoje a única defesa é comentário e disciplina humana.

**`pg_dump` exporia credencial de todos os clientes de uma vez:**

- Risk: comentário em teste indica que um `pg_dump` da base entregaria a credencial de todos os tenants simultaneamente (banco único multi-tenant).
- Files: `apps/api/tests/sso.test.ts:112`, `packages/db/src/segredo.ts:15`
- Current mitigation: não detalhado no código explorado — aparenta ser um risco reconhecido mas não com um controle técnico específico documentado (ex.: criptografia de segredos por tenant, ver `packages/db/src/segredo.ts`).
- Recommendation: confirmar se `packages/db/src/segredo.ts` já criptografa segredos por tenant em repouso; se não, priorizar isso antes de qualquer exposição fora do ambiente local (backup terceirizado, replica de leitura, etc.).

**Captura de tela/DOM da Blip pode conter dado sensível embutido:**

- Risk: já aconteceu (13/09) de uma captura de DOM da Blip trazer token de sessão real, telefone e flags de conta dentro de `blip-footer-with-blip-status-mfe`.
- Files: material de referência fica em `referencias-blip/` (fora do git, ~3,1 GB movidos para lá em 24/09)
- Current mitigation: regra permanente de nunca colar/reusar captura de DOM sem checar dado sensível embutido; material de captura mantido fora do git.
- Recommendation: manter a disciplina — qualquer nova captura da Blip (screenshot, HAR, bundle) deve ser varrida antes de virar referência de medida, mesmo fora do git.

**Conta `@auvp` da Blip é somente leitura:**

- Risk: qualquer ação de salvar/conectar na conta `@auvp` pode alterar produção de terceiro sem intenção.
- Files: N/A (regra operacional)
- Current mitigation: regra explícita em "O que NÃO fazer" — nunca clicar em salvar/conectar nessa conta.
- Recommendation: manter como regra hard-coded no processo, não só na memória do operador.

## Performance Bottlenecks

**Sem tempo real — todas as telas usam polling:**

- Problem: `packages/tempo-real` (cliente WebSocket) existe mas nenhum front consome; hoje as telas atualizam por consulta periódica.
- Files: `packages/tempo-real/**`, consumidores esperados em `apps/gestao-vite`, `apps/desk-vite`
- Cause: fase de roadmap ainda não iniciada, não limitação técnica.
- Improvement path: ligar o cliente de tempo real existente às telas de Desk/Gestão que mais dependem de atualização (ex.: fila de atendimento, status de conversa) quando essa fase entrar no roadmap.

## Fragile Areas

**Ambiente de desenvolvimento local:**

- Files: N/A (ambiente, não código)
- Why fragile: um processo de API/Vite deixado em segundo plano é encerrado sozinho quando a máquina fica com pouca memória, e a API sobe de novo sem o `.env` da raiz — login com Google quebra com `falha_no_provedor` nesse caso. Vite nesta máquina escuta em `[::1]`, não `127.0.0.1` (testes com `curl 127.0.0.1:PORTA` dão "connection refused" com o processo rodando normalmente). Docker Desktop precisa ser iniciado manualmente após reiniciar o PC, senão `pnpm -F @pipe/api test` falha por falta de Postgres/Redis.
- Safe modification: subir API/Vite numa janela própria de PowerShell carregando o `.env` manualmente, nunca em processo de fundo de um agente; usar `http://[::1]:PORTA/` para checagens locais; garantir Docker Desktop ativo antes de rodar a suite da API.
- Test coverage: não aplicável — é infraestrutura local, não código testável.

**Build do Desk quebra silenciosamente no Git Bash:**

- Files: pipeline Docker do Desk (`docker build`)
- Why fragile: sem `MSYS_NO_PATHCONV=1`, o Git Bash reescreve `/desk/` como caminho do Windows e a imagem sobe com `<script src>` apontando para um caminho inexistente — resultado é tela em branco sem erro óbvio. Já aconteceu uma vez em produção.
- Safe modification: sempre exportar `MSYS_NO_PATHCONV=1` antes de qualquer `docker build` do Desk feito a partir de Git Bash no Windows.
- Test coverage: nenhuma automatizada; é uma armadilha de ambiente, não coberta por teste de CI.

**`packages/core/src/fluxo/gerenciador.teste.ts` — ponto cego de tipos:**

- Files: `packages/core/src/fluxo/gerenciador.teste.ts:140`
- Why fragile: erro de tipo não pego porque nenhum typecheck por app cobre `packages/core` isolado (ver Tech Debt acima).
- Safe modification: rodar `pnpm -F @pipe/core typecheck` sempre que mexer em `packages/core/src/fluxo/**`, não confiar só nos typechecks por app.
- Test coverage: existe teste (`gerenciador.teste.ts`) mas o erro é de tipo, não de comportamento — passaria em runtime mesmo com o typecheck quebrado.

## Scaling Limits

Nenhum limite de escala quantificado foi encontrado na exploração (sem métricas de carga, sem documentação de capacidade). Único dado relevante: banco único multi-tenant com isolamento por `tenant_id` + RLS — qualquer crescimento de tenants compartilha a mesma instância Postgres/Redis, sem sharding documentado.

## Dependencies at Risk

**Número de teste da Meta (WhatsApp Business API):**

- Risk: token do número de teste expira em 24h e não gera versão permanente.
- Impact: reconectar o canal WhatsApp é rotina diária enquanto não houver número próprio com usuário de sistema configurado.
- Migration plan: migrar para número de produção com usuário de sistema da Meta assim que CNPJ/app estiver aprovado (também desbloqueia o Cadastro Embutido/Embedded Signup, hoje bloqueado pela mesma pendência).

**Google OAuth na VPS de demonstração:**

- Risk: login Google na VPS (`https://pipe.144-217-164-204.sslip.io`) depende do dono cadastrar a URL de retorno (`/v1/auth/google/retorno`) no Google Cloud Console e estar na lista de usuários de teste se o app estiver em modo Teste.
- Impact: bloqueia teste ponta a ponta na VPS até essa configuração externa ser feita pelo dono.
- Migration plan: nenhuma migração de código necessária — é pendência de configuração externa (Google Cloud Console).

## Missing Critical Features

**Módulo de Análise / monitoria por IA:**

- Problem: decidido que entra depois; base de implementação (resumo, classificação, avaliação, bancada de prompt) já existe em `packages/ai`, mas não está ligada a nenhuma tela de produto ainda.
- Blocks: monitoria de atendimento por IA, que é parte do pitch de produto (preço cobra IA/assistente e monitoria como itens à parte).

**Base de conhecimento com citação, SSO em três degraus:**

- Problem: citados em `docs/specs/2026-09-05-o-que-falta.md` como não planejados ainda — nem esqueleto de código.
- Blocks: funcionalidades de suporte avançado e autenticação corporativa multi-nível.

**Canal de teste do Builder ligado ao motor:**

- Problem: a Blip usa um widget de chat real (SDK BlipChat) ligado ao bot publicado para testar fluxos; o Pipe não tem canal de teste equivalente no motor, só simulação local limitada.
- Blocks: validar um fluxo do Builder de ponta a ponta sem publicar de verdade no canal real.

## Test Coverage Gaps

**Setas do canvas do Builder (`arestasDe()`):**

- What's not tested: nenhuma função de teste cobre o caso de ligação vinda de ação de redirecionamento ou saída padrão em vez de `$conditionOutputs`.
- Files: `apps/gestao-vite/src/paginas/builder/modelo.ts:421`
- Risk: falso-negativo visual no canvas (seta ausente com dado correto) pode levar a decisões erradas sobre o fluxo sem qualquer erro no console.
- Priority: Medium — bug não confirmado, mas em área central do produto (Builder).

**Encerramento de ticket — comparação visual incompleta:**

- What's not tested: não há captura local do modal real do Desk (`close-ticket-modal`) para comparação pixel-a-pixel; a paridade visual foi feita via CSS/marcação capturados, não uma foto do modal aberto.
- Files: componente de encerramento de ticket em `apps/desk-vite` (modal `close-ticket-modal`, achado só no bundle compilado da Blip)
- Risk: medida de 656×432px encontrada em sessão anterior é do modal LEGADO do portal, não do Desk — usar por engano essa medida antiga leva a um layout errado sem teste que pegue a diferença.
- Priority: Low — funcional e testado no que importa (comportamento), gap é só de paridade visual fina.

**`packages/core` sem typecheck próprio no pipeline agregado:**

- What's not tested: erros de tipo específicos de `packages/core` não aparecem em nenhum comando de typecheck por app.
- Files: `packages/core/src/fluxo/gerenciador.teste.ts` e potencialmente outros arquivos do pacote
- Risk: regressões de tipo em `packages/core` (motor de fluxo, usado por Builder e execução) passam despercebidas até alguém rodar `pnpm typecheck` na raiz ou `pnpm -F @pipe/core typecheck` manualmente.
- Priority: High — `packages/core` é o motor de fluxo, componente central; ponto cego de tipo nele é mais grave que em uma tela isolada.

---

*Concerns audit: 2026-09-24*
