# Pipe

## What This Is

Pipe é uma plataforma de atendimento no WhatsApp (API oficial da Meta) com CRM alimentado pelas conversas e monitoria por IA, vendida a empresas (B2B). A relação com a Blip é de régua de medida, não de base de código: a forma das telas (disposição, textos, estados, navegação) é copiada da Blip quando ela mostra a regra; a tinta (cor, ícone, marca) é sempre da Pipe. Nenhum código, CSS, classe ou ícone da Blip entra no repositório.

## Core Value

Atendimento multi-canal (WhatsApp/Instagram/Messenger) confiável e auditável, com CRM espelhado automaticamente e sem fricção para o atendente.

## Business Context

- **Customer**: Empresas que compram atendimento via WhatsApp
- **Revenue model**: Por atendente + IA (assistente + monitoria) como itens à parte. Entrada do cliente por enquanto é venda assistida (self-service existe no código, desligado).
- **Success metric**: TBD — não definida nas fontes; a decidir pelo dono junto com o nicho de mercado (ver REQ-nicho em REQUIREMENTS.md)
- **Strategy notes**: `docs/specs/2026-09-05-comercial.md` (mentoria comercial, estrutura de contrato, matriz de RFP)

## Requirements

### Status vocabulary (revisado 24/09/2026)

Uma área só é **VALIDATED** quando, quando aplicável: (1) implementada, (2) funciona de ponta a ponta, (3) foi comparada visual/comportamentalmente com a referência (Blip), (4) foi aprovada pelo dono. Código ou teste isolado existindo NÃO basta sozinho. Eixos rastreados por área: **IMPLEMENTED** · **FUNCTIONALLY VERIFIED** · **VISUALLY VERIFIED** (N/A quando não há superfície visual própria) · **OWNER APPROVED**. `VALIDATED` = todos os eixos aplicáveis confirmados; falta qualquer um → `NEEDS VALIDATION`, com nota indicando qual eixo falta. Substitui o critério do ingest inicial, que marcava área como pronta só por existir implementação/teste.

### Validated

<!-- Todos os eixos aplicáveis confirmados por evidência documentada -->

- ✓ Fluxo/roteador nunca apagado de verdade — "excluir" arquiva (`estado='arquivado'`, `execucao_fluxo.fluxo_versao_id` é `ON DELETE RESTRICT`, verificável no schema). Decisão estrutural de dado, não superfície de UI — VISUALLY VERIFIED é N/A aqui.

### Needs Validation

<!-- IMPLEMENTED e/ou FUNCTIONALLY VERIFIED confirmados, mas falta VISUALLY VERIFIED e/ou OWNER APPROVED explícito. Não é "não existe" — código/teste existem; falta a prova que o dono pede. Inventário completo e classificação final: VALSURF-01..05, Phase 3. -->

- **Desk (app de atendimento)** — IMPLEMENTED, FUNCTIONALLY VERIFIED (testes unitários existem). Confirmado pelo dono (24/09/2026): ainda NÃO aprovado visualmente → falta VISUALLY VERIFIED + OWNER APPROVED
- **Atendimento** (Monitoramento, Histórico, Encerramento de ticket, Filas/Atendentes/Pausas, Regras) — IMPLEMENTED, FUNCTIONALLY VERIFIED. Monitoramento teve rodadas rejeitadas até um commit final (`3343530`/`8f47a5f`), mas o dono confirmou (24/09/2026) que Atendimento como um todo NÃO está aprovado → falta OWNER APPROVED confirmado; Encerramento de ticket especificamente nunca teve foto lado a lado do modal comparada (só CSS/marcação capturados, per PROJECT-HANDOFF.md) → falta VISUALLY VERIFIED também
- **Conexão de canal WhatsApp** — IMPLEMENTED, FUNCTIONALLY VERIFIED (conecta e recebe mensagem). Comparação visual não confirmada pelo dono (24/09/2026) → falta VISUALLY VERIFIED + OWNER APPROVED
- **Conexões Instagram e Messenger** — IMPLEMENTED (mesmo padrão de conexão do WhatsApp). Validação funcional real não confirmada (24/09/2026) → falta FUNCTIONALLY VERIFIED + VISUALLY VERIFIED + OWNER APPROVED
- **Equipe/permissões, Filas/atendentes/pausas (fora do módulo Atendimento), mTLS, Chamada externa (ProcessHttp)** — IMPLEMENTED; evidência parcial de FUNCTIONALLY VERIFIED (comportamento descrito em detalhe em PROJECT-HANDOFF.md) e possível VISUALLY VERIFIED (nota do Builder em PROJECT-HANDOFF.md sugere que "as outras telas... têm foto real", mas nenhuma aprovação explícita do dono está documentada para estas em particular) → falta OWNER APPROVED confirmado; reclassificar caso a caso na Phase 3
- **Mecanismo de espelho Pipe→Twenty** — IMPLEMENTED, FUNCTIONALLY VERIFIED (teste de integração `apps/api/tests/twenty.test.ts`). Sem superfície visual própria (VISUALLY VERIFIED N/A); sem confirmação explícita de aprovação do dono → falta OWNER APPROVED
- **Builder (núcleo)** — IMPLEMENTED, FUNCTIONALLY VERIFIED. Explicitamente NÃO comparado por foto lado a lado (só CSS/DOM extraído, per PROJECT-HANDOFF.md) → falta VISUALLY VERIFIED + OWNER APPROVED
- **Front migrado de Next.js para Vite (Desk, Gestão)** — fato de engenharia, IMPLEMENTED e verificável no código; não é, por si, uma "superfície a aprovar visualmente" — é a arquitetura por trás das telas que ainda precisam da aprovação listada acima

### Active

<!-- Escopo atual — ver REQUIREMENTS.md para a lista completa com IDs e mapeamento de fase -->

- [ ] Padronizar a linguagem técnica do projeto para inglês (rotas, endpoints, arquivos, pastas, funções, variáveis, types, testes, contrato de navegação/renderização) nos 3 fronts, API e workers — antes do Builder; dados persistidos ficam fora do rename mecânico
- [ ] Fechar as lacunas conhecidas do Builder (catálogo de conteúdos/ações, biblioteca de funções, seletor de destino, pesquisa de satisfação, paleta de tags, painéis de Filas/Teste, bug suspeito em `arestasDe()`)
- [ ] Levar Desk, Atendimento, conexões de canal e demais superfícies já implementadas ao estado VALIDATED (visual + aprovação do dono) antes de iniciar CRM/Twenty
- [ ] Decidir e implementar o destino de `apps/crm` agora que a integração com o Twenty está confirmada como decisão de CRM (24/09)
- [ ] Mesclar `limpeza` em `master`, decidir destino de `apps/site` e das branches soltas
- [ ] Decidir publicação do repositório no GitHub
- [ ] Validar atendimento de ponta a ponta na VPS com número de WhatsApp real (depende do dono cadastrar redirect Google)
- [ ] Preparar a primeira venda: cobrança, preço, onboarding de cliente, domínio, documentos legais (LGPD), teste de invasão, nicho de mercado
- [ ] Operar depois de vender: suporte ao cliente, notificação externa (e-mail), migração de atendimento de outras plataformas, papéis customizados
- [ ] Documentação (desenvolvedor e usuário) e Desk como PWA instalável

### Out of Scope

<!-- Fronteiras explícitas — inclui itens deferidos para depois (fases já planejadas nas specs, não cortados) e itens realmente excluídos -->

- Servidor MCP — fase 5/6 do roadmap de produto (`pipe-design.md`), ainda não iniciada; só o esqueleto do pacote existe. Deferido, não cortado — não apagar `packages/mcp`.
- Tempo real por WebSocket — cliente já escrito em `packages/tempo-real`, nenhum front consome ainda; telas hoje atualizam por consulta periódica. Deferido, não cortado.
- Monitoria por IA / módulo de Análise — decidido que entra depois; `packages/ai` já tem implementação real (resumo, classificação, avaliação, bancada de prompt). Deferido, não cortado.
- Base de conhecimento com citação — citada em `o-que-falta.md` como não planejada ainda.
- SSO em três degraus — citado em `o-que-falta.md` como não planejado ainda.
- Cadastro embutido (Embedded Signup) da Meta — bloqueado por falta de CNPJ/app aprovado; caminho atual é conexão manual.
- App mobile nativo — Desk é web responsivo; nativo está explicitamente fora de escopo (o requisito real é PWA instalável, ver REQ-mobile).
- Ponte LIME (`apps/ponte`) como caminho principal da interface — decisão do dono revertida no fim do dia 12/09/2026; o código continua existindo (ferramenta de laboratório), mas rodar a cópia compilada da Blip por trás de uma ponte deixou de ser o caminho do produto.
- Canal de teste do Builder ligado ao motor — a Blip usa um bot real via SDK BlipChat; o Pipe não tem canal de teste no motor e não há spec detalhada ainda.
- Qualquer código, CSS, classe, ícone, som ou imagem da Blip dentro do repositório — regra permanente de licença; só comportamento e texto medidos ficam como referência, fora do git (`referencias-blip/`).

## Context

- Monorepo pnpm + turbo, todo em português no código (tabela, coluna, função, variável, comentário).
- `apps/api` (NestJS) é a única porta para o Postgres; `apps/workers` roda filas BullMQ (exceção: fila e agregação). Fronts nunca abrem conexão direta com o banco.
- Fronts: `apps/gestao-vite` e `apps/desk-vite` (Vite, migrados de Next.js em 07/09/2026). `apps/crm` ainda é Next.js próprio (porta 3300) — papel final não decidido, convive com a integração real com o Twenty.
- Isolamento multi-tenant: um banco, `tenant_id` em toda tabela, RLS ligada, toda consulta via `comTenant(db, tenantId, tx => …)`. Nunca `Promise.all` dentro dessa transação — derruba `set_config` do tenant e a consulta roda sem isolamento, silenciosamente.
- CRM em espelho: Pipe é fonte da verdade, espelha para uma instância externa do Twenty (fork AGPL, repositório próprio fora do monorepo, integração só por rede/GraphQL). Escrita é só de ida (Pipe → Twenty).
- Regra de negócio pura em `packages/core`. Contratos front↔API em `packages/contracts`. Migrations manuais em `packages/db/drizzle` (geradas por drizzle-kit, revisadas à mão — há FKs que um `generate` novo tentaria apagar por não entender o ciclo de import entre módulos).
- Testado e commitado no ramo `limpeza` (ainda não mesclado em `master`): canais, monitoramento, equipe/permissões, encerramento de ticket, Builder (parcial), limpeza grande do repositório (~120 arquivos de código morto removidos, ~3,1 GB de material da Blip movido para `referencias-blip/`, fora do git).
- VPS de demonstração publicada (`144.217.164.204`), pendente configuração de Google OAuth pelo dono no Google Cloud Console.
- Known issues acumulados (ver STATE.md para a lista completa): ambiente local frágil, `pnpm typecheck` da raiz quebrado, testes de canal oscilando sob carga, particularidades de rede desta máquina (Vite em `[::1]`, Git Bash exige `MSYS_NO_PATHCONV=1`).
- Fontes de verdade: `referencias-blip/` (medidas Blip, fora do git), `packages/ui` (design system), `docs/specs/*.md` (specs vinculantes onde dizem "vinculante"), `packages/db/src/schema` + `packages/db/drizzle` (banco, até migration 0046), `apps/api/src/controladores` + `packages/contracts/src` (API), `.env.example` (67 variáveis), `docs/builder-cards-pendencias.md` (lista mais atual de pendências do Builder, 23/09).

## Constraints

- **Tech stack**: Monorepo pnpm + turbo; `apps/api` (NestJS) único ponto de acesso ao Postgres; `apps/workers` roda filas BullMQ; fronts `apps/gestao-vite`/`apps/desk-vite` em Vite (React Router 6, CSS com tokens, TanStack Query sobre REST); `apps/crm` ainda em Next.js (papel final não decidido).
- **Idioma (revisado 24/09/2026)**: Linguagem técnica (arquivos, pastas, funções, variáveis, types/interfaces/classes, controllers/services, rotas/endpoints, nomes de teste, comentários técnicos, novos contratos técnicos) em **inglês** — substitui a regra anterior de "tudo em português". Texto visível ao usuário (produto, UI, mensagens) continua em português/localizado e não entra nessa regra. Dados e contratos já persistidos (tabelas, colunas, payloads, eventos) **não** são renomeados mecanicamente — cada caso recebe estratégia própria de migração (ver Phase 1, STD-06, em REQUIREMENTS.md). Inclui rotas/endpoints da API (não só front), e um contrato de navegação/renderização documentado (STD-12) — path params vs query params vs React state, não assumir SSR pela URL estável da Blip. Convenção canônica exata ainda em definição na Phase 1.
- **Multi-tenancy**: Isolamento via `tenant_id` + RLS + `comTenant()`; nunca `Promise.all` dentro dessa transação (derruba isolamento silenciosamente).
- **Licenciamento**: Twenty é AGPLv3 — fork vive em repositório próprio fora do monorepo, integração só por rede, nenhuma linha do fork entra em `packages/core`, `packages/db`, `packages/ui` ou nos apps Desk/Gestão; Chatwoot é MIT fora de `enterprise/`; Take.Blip.Builder é Apache-2.0 (com atribuição). Romper a fronteira de isolamento estende a obrigação AGPL ao produto inteiro.
- **Migrations**: Manuais em `packages/db/drizzle` — revisão humana obrigatória, `drizzle-kit generate` pode propor apagar FKs de `0003_chaves_cruzadas` (não aceitar).
- **Referência Blip**: Só forma (medida via `getBoundingClientRect`/`getComputedStyle`) e comportamento — nunca código, CSS, classe, ícone, som ou imagem da Blip no repositório.
- **Ambiente de desenvolvimento**: Docker Desktop precisa ser iniciado manualmente; Vite nesta máquina escuta em `[::1]`; build do Desk no Git Bash exige `MSYS_NO_PATHCONV=1`.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Fork do Twenty como base do CRM (AGPL, fronteira de isolamento) | Aceita conscientemente a obrigação de código-fonte aberto da AGPLv3 sobre o CRM, contida por uma fronteira técnica: repo próprio, integração só por rede, nenhuma linha do fork em `apps/*`/`packages/*` | ⚠️ Revisit — papel de `apps/crm` diante disso ainda não decidido |
| Blip é régua de medida, não base de código | Reverte tentativa da manhã de 12/09/2026 de rodar a cópia compilada da Blip como produto, com a ponte LIME por trás | ✓ Good — vale desde 12/09/2026 |
| Front migrado para Vite (Desk, Gestão) | Substitui Next.js App Router; segue o padrão Twenty/Chatwoot (front estático, API separada) | ✓ Good — implementado para Desk/Gestão; ⚠️ Revisit — `apps/crm` continua Next.js |
| Fluxos são arquivados, nunca apagados de verdade | `execucao_fluxo.fluxo_versao_id` é `ON DELETE RESTRICT`; histórico não pode ficar órfão — diferente de Blip e Chatwoot | ✓ Good |
| CRM "tinta nossa" (tema sobre o fork do Twenty) | Mesmo método já usado no Desk/Gestão frente à Blip: disposição/objetos/GraphQL vêm do Twenty, cor/tipografia/marca são da Pipe; reafirma que a fronteira de licença não afrouxa | ✓ Good |
| Pipe é fonte da verdade, Twenty é espelho de exibição | Escrita é só de ida (Pipe → Twenty); isolamento físico, uma instância do Twenty por cliente | ✓ Good — implementado e testado (`twenty.test.ts`) |
| Preço por atendente + IA (assistente/monitoria) como itens à parte | Modelo recomendado pela mentoria comercial; unidade de cobrança exata ainda em aberto | — Pending (ver REQ-preco) |
| Linguagem técnica do projeto migra de português para inglês (rotas, endpoints, arquivos, funções, variáveis, types, testes, contrato de navegação/renderização); dados persistidos ficam fora do rename mecânico | Substitui a regra anterior "tudo em português"; texto visível ao usuário não muda. Tratado antes do Builder para não acumular mais superfície em português (Phase 1, STD-01..12) | — Pending (Phase 1) |
| Critério de VALIDATED redefinido: implementado + funciona ponta a ponta + comparado com a referência (quando aplicável) + aprovado pelo dono — código ou teste isolado não basta | Corrige o critério do ingest inicial, que marcava área como pronta só por existir implementação; nenhuma superfície de produto é considerada aprovada sem confirmação explícita do dono (Phase 3, VALSURF-01..05) | — Pending (Phase 3) |

---
*Last updated: 2026-09-24 after ingest do PROJECT-HANDOFF.md e specs/ADRs sintetizados (primeira geração de `.planning/` para este repositório brownfield)*
