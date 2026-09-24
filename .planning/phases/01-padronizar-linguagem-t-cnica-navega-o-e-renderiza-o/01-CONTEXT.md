# Phase 1: Padronizar linguagem técnica, navegação e renderização - Context

**Gathered:** 2026-09-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Todo identificador técnico não persistido (arquivos, diretórios, funções, variáveis, classes, interfaces, types, enums, constants, controllers, services, helpers, hooks, rotas frontend, endpoints da API, nomes de teste, nomes técnicos internos, comentários técnicos) termina a fase em inglês, nos 3 fronts (`apps/desk-vite`, `apps/gestao-vite`, `apps/crm` no limite de CRM-01), na API, em `apps/workers`, nos pacotes `packages/*`, testes, scripts e docs técnicas. A fase também entrega o contrato de navegação/renderização dos fronts (STD-12).

Fora do escopo: texto visível ao usuário (continua PT), nomes SQL de tabela/coluna, valores/eventos/contratos persistidos (só inventário, STD-06), destino arquitetural do `apps/crm` (CRM-01, Phase 4), migração de renderização do CRM.

Requisitos: STD-01..STD-12 (ver `.planning/REQUIREMENTS.md`).

</domain>

<decisions>
## Implementation Decisions

### Vocabulário canônico
- **D-01:** Um glossário único. Fonte: termo em inglês da Blip quando a Blip tem nome para o mesmo conceito (attendance, queue, ticket, router, builder, bulk-ticket, activeMessage...); senão, inglês idiomático de atendimento.
- **D-02:** O significado de "atendimento" (módulo / sessão humana / conversa no canal) é decidido no inventário, a partir do schema e dos usos reais — não pré-fixado aqui. A API já separa `conversas/:id` de `tickets/:id`; a Blip usa attendance (módulo) e ticket (sessão).
- **D-03:** Aprovação em dois portões antes de qualquer rename mecânico: (1) glossário de domínio com os termos ambíguos destacados; (2) mapa old→new por app, derivado do glossário. Haiku só começa depois do portão 2.
- **D-04:** Pastas internas (`controladores`, `dominio`, `paginas`, `componentes`, `contexto`...), pacotes `@pipe/*` com nome PT (`autenticacao`, `armazenamento`, `tempo-real`...) e apps com nome PT (`gestao-vite`, `ponte`) entram. Apps com checagem explícita de Dockerfile/compose/deploy/turbo/scripts no mapa (o build do Desk já quebrou por caminho na VPS).
- **D-05:** Classes/tipos usam sufixo idiomático Nest/TS: `ControladorAnexos` → `AttachmentsController`, `GuardaSessao` → `SessionGuard`, `ErroPipe` → `PipeError`, `FiltroDeErro` → `ErrorFilter`.
- **D-06:** Variáveis de ambiente `PIPE_*` (67 no `.env.example`) ficam em PT — exceção documentada, categoria C do STD-11. Não renomear nome nem valor (`memoria`/`bullmq`).
- **D-07:** Scripts do `package.json` raiz (`banco:migrar`, `banco:semente`, `desk`, `ponte`...) e nomes de teste/`describe`/`it` renomeiam. PROJECT-HANDOFF.md e docs técnicas que citam esses comandos atualizam no mesmo corte.

### Fronteira código ↔ banco
- **D-08:** Schema Drizzle: nomes TS (propriedades, exports de tabela) em inglês; nomes SQL de tabela/coluna intocados, sem migration. Padrão já existente: `twentyEmpresaId: text('twenty_empresa_id')` em `packages/db/src/schema/identidade.ts`.
- **D-09:** Chaves JSON de contratos front↔API e de colunas jsonb: sem regra geral — classificadas endpoint por endpoint no inventário (wire interno pode renomear; qualquer chave gravada/lida de jsonb é candidata a persistido/STD-06).
- **D-10:** Nomes de fila BullMQ, payloads de job, eventos WebSocket e códigos de erro (`arquivo_vazio`) renomeiam para inglês, com drenagem no deploy: parar produtores, esvaziar filas antigas (o `outbox_mensagem` é a fonte de verdade e a varredura recupera o que sobrar), subir com nomes novos; fronts e API sobem juntos.
- **D-11:** Valores persistidos usados no código (`estado = 'arquivado'`, status de ticket, tipo de bloco): tratamento decidido no inventário (literal PT como dado sob nome inglês vs. camada de tradução na borda).

### URLs registradas fora do código
- **D-12:** Google OAuth `v1/auth/google/retorno` → `v1/auth/google/callback`, corte seco. O dono recadastra no Google Cloud Console no deploy (inclusive o redirect da VPS, ainda não cadastrado).
- **D-13:** SSO `v1/auth/sso/retorno` → `v1/auth/sso/callback`, corte seco (não há cliente real com SSO).
- **D-14:** Links de convite `/convite/:token` e bookmarks de telas: corte seco em tudo, sem redirect PT→EN. Convites pendentes são reenviados. Remover `ROTAS_ANTIGAS_SEM_CONTATO` e `ParaOCanalDoBot` (redirects legados da migração Next.js→Vite) em `apps/gestao-vite/src/App.tsx`.
- **D-15:** Webhooks Meta já são inglês (`webhooks/whatsapp`, `webhooks/instagram`, `webhooks/messenger`) — não mexer.

### Comentários
- **D-16:** STD-10 cumprido integralmente, sem tradução cega. Cada comentário PT existente cai em uma de 3 categorias: (1) necessário e atual → traduzir para inglês preservando exatamente o sentido técnico; (2) redundante, óbvio ou que só descreve o código → remover; (3) desatualizado ou contraditório com a implementação → remover ou atualizar só depois de validar o comportamento real.
- **D-17:** Comentários de porquê, segurança, arquitetura, Meta, Blip e integrações recebem atenção semântica. Citações literais, nomes oficiais, payloads, mensagens externas e texto capturado da Blip/Meta ficam no idioma original quando são evidência literal. Não alterar o sentido de decisões históricas para simplificar; nada palavra por palavra.
- **D-18:** Objetivo final: nenhum comentário técnico PT sem justificativa documentada; o STD-11 procura e classifica os remanescentes.

### Execução e fatiamento
- **D-19:** Sem big bang. Bottom-up, cada fatia atomicamente consistente e incluindo todos os consumidores necessários para manter o monorepo verde (se renomear API pública de um pacote quebra consumidores, eles entram na mesma fatia):
  1. Packages/fundação compartilhada: nomes TS do db, `contracts`, `core`, `ui`, demais pacotes.
  2. API + workers: controllers/services/rotas, consumers internos, filas/jobs/eventos conforme mapa, compat quando necessária.
  3. Fronts: `desk-vite`, `gestao-vite`, e `crm` por último e só no limite de CRM-01.
  4. Infra e nomes de apps/pacotes: Dockerfile, compose, turbo, scripts, deploy/VPS, CI/CD, aliases/configs. Apps de alto risco renomeados um por vez, validando build/deploy após cada um.
  5. Testes, scripts e docs residuais: varredura final, referências antigas, comentários, exemplos, docs técnicas.
- **D-20:** Depois de cada fatia: typecheck + testes relevantes + build quando aplicável. Não avançar para a próxima fatia com regressão conhecida. Deploy é um único corte no final.
- **D-21:** Primeira tarefa da fase, antes da fatia 1: consertar o `pnpm typecheck` da raiz (quebrado em `packages/core/src/fluxo/gerenciador.teste.ts:140`, `variaveis.status` fora do tipo inferido) e registrar a linha de base verde (typecheck, testes, builds). `tests/instagram.test.ts`, `tests/fluxo.test.ts`, `tests/messenger.test.ts` (oscilam sob carga) rodam isolados e ficam listados como conhecidos.
- **D-22:** Trabalho em branch nova a partir de `limpeza` (ex.: `std/english-rename`), um commit por fatia, trabalho paralelo congelado durante a fase, merge de volta em `limpeza` no fim.

### Roteamento de modelos e contas
- **D-23:** Trabalho semântico (inventário, glossário, mapa old→new, tradução de comentários, classificações) pode ser distribuído entre Codex conta 1 (`CODEX_HOME=~/.codex`) e Codex conta 2 (`CODEX_HOME=~/.codex-conta2`), modelo "sol" com esforço medium, e Sonnet — a divisão é do Claude/planner, dimensionada pela cota de tokens de cada conta (o dono avalia que uma conta só não basta). Codex CLI 0.156.1 instalado localmente. Isso amplia o roteamento anterior (inventário = Sonnet).
- **D-24:** Sonnet revisa: amostras do trabalho Codex, e obrigatoriamente comentários de segurança, arquitetura e integrações críticas; revisão final e validação de regressão continuam com Sonnet.
- **D-25:** Haiku (ou modelo leve) só para mudanças repetitivas e inequívocas, depois do mapa aprovado — nunca inventa nome, traduz semanticamente, decide arquitetura, URL vs state, breaking change, nem mexe em persistido sem plano (STD-07).

### Contrato de navegação e renderização
- **D-26:** Tradução/padronização de rota e decisão de onde o estado mora são tratadas separadamente (STD-12).
- **D-27:** Conversa aberta no Desk: paridade com a Blip — ID fora da URL, conversa em state; F5 volta para a lista. Hoje é `/chat/:id` (`apps/desk-vite/src/App.tsx:38`, `paginas/atendimentos/page.tsx:28`). Conversa no Desk não é compartilhável: está na fila de quem atende; passar para outra pessoa é transferir.
- **D-28:** Gestão não abre conversa específica no Desk. Remover o link Gestão→Desk com ID (construtor coberto por `apps/gestao-vite/tests/desk-url.test.ts`). A Gestão mostra conversa só na própria prévia, como o Monitoramento já faz.
- **D-29:** Ticket histórico dentro de contato: paridade com o Desk da Blip — no Desk, seleção de contato e de ticket vai para state (URL só na tela de contatos); hoje é `/contacts/:id?ticket=` (`apps/desk-vite/src/paginas/contatos/page.tsx:33-48`). A decisão foi tomada para o Desk; o caso equivalente da Gestão (`contatos/:contatoId?ticketId=`, `apps/gestao-vite/src/paginas/fluxo/contatos/detalhe/detalhe.tsx:27-29`) é classificado no inventário com evidência Blip Portal (que usa path + `?ticketId=`).
- **D-30:** Filtros aplicados (monitoramento fila/atendente, log, período de análise, busca de novidades): paridade com a Blip nova — filtro em state, último filtro lembrado em `localStorage` por tela; sai da query string.
- **D-31:** Passo de wizard (criar fluxo/roteador usa `?passo=`, certificados usa `useState`): decidido no inventário, checando como a Blip faz a criação (`/application/create/{router|name|marketplace}` sugere passo no path).
- **D-32:** Back/forward no Desk igual à Blip: voltar fecha painel/conversa e mostra a lista sem sair do Desk; entre telas (/chat, /contacts, /analytics) histórico normal. Marcado NEEDS VALIDATION até teste ao vivo na Blip — a evidência vem da leitura do código capturado, não de teste.
- **D-33:** Renderização: Desk e Gestão são SPA client-side; SSR não entra só porque a URL da Blip é estável. CRM mantém seus Server Components até CRM-01; nada de migrar renderização do CRM nesta fase.
- **D-34:** Quais telas exigem deep link e sobrevivem a F5: decidido tela a tela no inventário, com evidência Blip por tela; sem evidência → NEEDS VALIDATION.

### Decisões pós-pesquisa (2026-09-24, após 01-RESEARCH.md)
- **D-35:** Nomes de classe CSS e custom properties (~3.000 seletores, 482 variáveis CSS) entram no STD-10, com mapa old→new próprio aprovado no mesmo portão 2 do D-03.
- **D-36:** D-06 vale para toda variável de ambiente, não só `PIPE_*` (`GOOGLE_CLIENTE_*`, `WHATSAPP_TOKEN_ACESSO`, `*_API_VERSAO`, `VITE_PORTA`, `VITE_URL_API` também ficam). Única mudança: o VALOR de `GOOGLE_URL_RETORNO` passa a apontar para `/v1/auth/google/callback` em `.env`, `.env.example`, `env.prod.exemplo` e no env da VPS (o nome da variável fica).
- **D-37:** Modelo Codex: `gpt-5.6-sol`, `model_reasoning_effort="medium"`. Toda chamada passa `-m gpt-5.6-sol` e `-s read-only` explicitamente (a conta 1 tem padrão `danger-full-access` e as duas contas têm modelo padrão diferente).
- **D-38:** Cookie `pipe_sessao` e nomes de métricas Prometheus renomeiam. Aceitos: logout geral no deploy e quebra de continuidade do histórico de métricas (não há cliente real).
- **D-39:** `apps/site` e `apps/ponte` entram na padronização.
- **D-40 (execução, 2026-09-24, exceção ao D-37 aprovada pelo dono):** Na execução da fase, os planos podem ser distribuídos entre 5 executores: Codex conta 1 (`~/.codex`), conta 2 (`~/.codex-conta2`), conta 3 (`~/.codex-conta3`), Sonnet e Haiku; até 3 Codex rodam em paralelo, todos em `gpt-5.6-sol` medium. O Codex pode executar planos inteiros com `-s danger-full-access` (o `workspace-write` é recusado pelo sandbox do Windows), sempre num git worktree isolado próprio, sem push, deploy, alteração de banco ou escrita fora do worktree. O Sonnet revisa 100% do diff do Codex antes do merge em `std/english-rename` (D-24). Planos que tocam dados reais (ex.: 01-34) continuam sem Codex. Propostas semânticas via `codex-run.sh` continuam `read-only`.
- **D-41 (execução, 2026-09-24, altera D-24 por decisão do dono):** A revisão Sonnet de trabalho do Codex só é obrigatória nos planos 01-04 (ferramentas de rename) e 01-25 (CSS). Nos demais planos executados pelo Codex, o orquestrador roda os `<verify>` e critérios de aceite do plano e faz o merge sem revisão Sonnet. Gates de fatia e a revisão final (01-32) continuam.
- **D-40:** Escopos de chave de API guardados no banco (ex.: `conversas:ler`) e códigos de erro persistidos são persistidos: vão para o inventário STD-06, não renomeiam nesta fase.

### Claude's Discretion
- Divisão concreta de tarefas entre Codex 1, Codex 2, Sonnet e Haiku (D-23), respeitando as proibições do D-25.
- Formato e local dos artefatos de glossário e mapa (desde que existam os dois portões de aprovação do D-03).
- Mecanismo técnico de drenagem de filas no deploy (D-10), desde que nenhum job se perca.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Escopo e requisitos
- `.planning/ROADMAP.md` §Phase 1 — objetivo, critérios de sucesso, decisões em aberto, notas de roteamento de modelo
- `.planning/REQUIREMENTS.md` §Padronização Técnica — STD-01..STD-12 (STD-07 = regras do Haiku, STD-10 = inclusões/exclusões, STD-11 = validação final e categorias A/B/C, STD-12 = contrato de navegação)
- `.planning/PROJECT.md` §Constraints (Idioma revisado), §Key Decisions
- `PROJECT-HANDOFF.md` — estado atual verificado, problemas conhecidos (typecheck, testes oscilantes, ambiente, build do Desk com `MSYS_NO_PATHCONV=1`)

### Código e convenções atuais
- `.planning/codebase/CONVENTIONS.md` — convenções PT atuais (serão substituídas; útil para o mapa)
- `.planning/codebase/STRUCTURE.md` — pastas, pacotes, onde cada coisa mora
- `.planning/codebase/ARCHITECTURE.md` — camadas, filas/outbox, guards, WebSocket, restrições
- `docs/specs/2026-09-07-arquitetura-de-front.md` — decisão Vite/React Router 6 nos fronts

### Evidência Blip (navegação e estado)
- `referencias-blip/portal/INDICE.md` — tabela tela → caminho na Blip
- `referencias-blip/pesquisa/blip-telas-atendimento.md` §53-56, §311-313 — rotas descobertas; rotas do Desk novo não abrem por URL direta
- `referencias-blip/pesquisa/blip-portal-telas.md` §341-342 — router aceita URL mas painel fica em branco
- `referencias-blip/pesquisa/blip-desk-regras-tecnicas.md` — Desk em iframe, postMessage, `router.go(0)`
- `referencias-blip/pesquisa/blip-contato-detalhe.md` §7 — Portal usa `/users/:id?ticketId`
- `referencias-blip/pesquisa/blip-schema-real.md` §72 — identidade do contato `<uuid>@tunnel.msging.net`
- `referencias-blip/portal/index/supernova.desk.blip.ai/static/js/app.3c3152c5f2e5a8ff5376.js` — Desk Blip: Vue Router history (:83556-83643), seleção de ticket via store + `pushState('/chat')` (:21028, :31923, :33466-33470), guard pós-login para `/` (:83664-83667), `popstate` (:110825-110828), `openTicket` via postMessage (:79609)
- `referencias-blip/atendimento/attendance-history-40967cbb-061c-40ba-877e/supernova.blip.ai/portal.js` — `attendance.history.detail` com `url: "/:id?ticketId"` (:247682-247683), filtros legados na URL (:247623-247625, :247670-247671), abertura em nova aba (:88088-88092)
- `referencias-blip/atendimento/contacts/deskmfe.blip.ai/beagle/desk-contact-history/latest/main.js` :25625, :25639-25640 — seleção de contato/ticket em React state
- `referencias-blip/atendimento/attendance-desk-monitoring/portalmfe.blip.ai/beagle/portal-fragment-desk-mfe/latest/main.js` :23750, :23763, :44194, :46034, :6002-6008 — presets de filtro e item de menu em `localStorage`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/db/src/schema/identidade.ts:39-40` — exemplo do padrão nome TS ≠ nome SQL (`twentyEmpresaId: text('twenty_empresa_id')`), base de D-08.
- `apps/desk-vite/src/lib/consulta.ts:11-20` (`useLeitura`) — polling liga/desliga pela presença do ID (`caminho !== null`); ao tirar o ID da URL (D-27), a chave passa a vir de state, mesmo mecanismo.
- `apps/*/src/lib/navegacao.ts` (`irPara`) — helper de redirect fora de componente, existe em desk e gestão.

### Established Patterns
- Rotas centralizadas em um arquivo por app: `apps/desk-vite/src/App.tsx:30-48`, `apps/gestao-vite/src/App.tsx:254-311` (árvore `rotasDoContato` montada duas vezes, em `/fluxo/:id` e `/roteador/:id`).
- CRM: rotas por pasta em `apps/crm/src/app/**`, guard em `apps/crm/src/middleware.ts:15-29`, `searchParams` de Server Component (não `useSearchParams`).
- Construtores de caminho duplicados na Gestão (já divergiram uma vez): `paginas/fluxo/contato.tsx:16-22`, `paginas/operacao/casca.tsx:36-99`, `paginas/fluxo/itens.ts:67-167`, `paginas/fluxo/configuracoes/navegacao.tsx:23-69`, `paginas/fluxo/growth/navegacao.tsx` — rename de segmento precisa tocar todos na mesma fatia.
- Regex de rota pública duplicada: `apps/crm/src/middleware.ts:15` e `apps/crm/src/componentes/estrutura-crm.tsx:69`; onboarding em `apps/gestao-vite/src/componentes/exigir-sessao.tsx:13`.
- API: ~29 controllers em `apps/api/src/controladores/*.ts`, quase todos com segmentos PT (`v1/conversas`, `v1/gestao/*`, `v1/atendentes`, `v1/filas`, `v1/canais`...); `v1/auth` e webhooks já em inglês.
- Redirect pós-login com `?destino=` em `apps/*/src/componentes/exigir-sessao.tsx` e `middleware.ts` do CRM.

### Integration Points
- `apps/api/src/controladores/entrar.ts:267,289` e `sso.ts:136` — callbacks OAuth/SSO (D-12, D-13).
- `apps/api/src/dominio/convites.ts:72` — monta `${base}/convite/${token}` (D-14).
- `apps/gestao-vite/src/App.tsx:86-90, 222-244` — redirects legados a remover (D-14).
- `apps/gestao-vite/tests/desk-url.test.ts:6-9` — link Gestão→Desk a remover (D-28).
- Filas: nomes em `apps/workers/src/filas.ts`, produtores em `apps/api/src/filas.ts` (D-10).
- Testes com caminho literal na Gestão: `fluxo-detalhe.test.ts`, `canal-do-fluxo.test.ts`, `equipe.test.ts`, `atendentes.test.ts`.

</code_context>

<specifics>
## Specific Ideas

- "No Desk você não consegue compartilhar uma conversa com outra pessoa, fica na sua fila... só transferir o atendimento." Na Gestão a Blip carrega a conversa de outra forma (prévia própria).
- Na evidência Blip, Portal e Desk divergem: o Portal usa URL com `?ticketId=` e abre em nova aba; o Desk guarda tudo em store/state. As decisões do Desk seguem o Desk da Blip, não o Portal.
- A evidência Blip sobre F5 e back/forward vem de leitura do código capturado; nada foi testado ao vivo.

</specifics>

<deferred>
## Deferred Ideas

- Presets de filtro salvos pelo usuário (Blip nova tem) — fora desta fase; D-30 só lembra o último filtro.
- Migração de valores/colunas persistidos para inglês — cada item do inventário STD-06 vira decisão própria, possivelmente fase futura.
- Renomear variáveis de ambiente `PIPE_*` — exceção nesta fase (D-06); revisitar junto com a próxima mexida de infra.

</deferred>

---

*Phase: 01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o*
*Context gathered: 2026-09-24*
