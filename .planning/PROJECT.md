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

### Validated

<!-- Shipped e confirmado por teste local e/ou verificação de agente — ver "Áreas prontas" em PROJECT-HANDOFF.md (24/09/2026) -->

- ✓ Canais WhatsApp, Instagram e Messenger — conexão manual (WABA ID, Phone Number ID, token, App Secret), webhook por canal assinado, preferências, modelos de mensagem direto na Meta
- ✓ Reconexão de canal (troca de credencial em vez de apagar/recriar)
- ✓ Canal dentro do bot/roteador (conectar/reconectar na página do canal dentro do fluxo)
- ✓ Monitoramento em tempo real — cartões, filtros rápidos, painel de filtros no formato Blip, prévia de conversa, ações por ticket (commit `3343530`/`8f47a5f`)
- ✓ Encerramento de ticket — cartão único (Desk + Monitoramento), regra "só exige tag quando existe tag obrigatória"
- ✓ Equipe/permissões — papel na "barra de permissão", acessos detalhados em página própria, permissão por atendente (migração 0046)
- ✓ Filas, atendentes e pausas na forma da Blip
- ✓ mTLS — Pipe apresenta certificado do cliente ao chamar hosts dele
- ✓ Chamada externa (ProcessHttp) — cursor e fila própria, fora da transação do fluxo
- ✓ Front migrado de Next.js para Vite em Desk e Gestão (`apps/desk-vite`, `apps/gestao-vite`)
- ✓ Mecanismo de espelho Pipe→Twenty — `apps/api/src/dominio/twenty.ts`, `dominio/espelho-crm.ts`, schema, testado (`apps/api/tests/twenty.test.ts`); Pipe é fonte da verdade, Twenty só exibe
- ✓ Fluxo/roteador nunca apagado de verdade — "excluir" arquiva (`estado='arquivado'`)
- ✓ Builder — núcleo funcional (criar/mover/ligar/editar bloco, rascunho e publicação com histórico, painéis de Biblioteca de variáveis e Configuração). Ressalva: paridade visual medida por CSS/DOM extraído, não por foto lado a lado — mais fraca que as outras telas. Gaps restantes em Active.

### Active

<!-- Escopo atual — ver REQUIREMENTS.md para a lista completa com IDs e mapeamento de fase -->

- [ ] Fechar as lacunas conhecidas do Builder (catálogo de conteúdos/ações, biblioteca de funções, seletor de destino, pesquisa de satisfação, paleta de tags, painéis de Filas/Teste, bug suspeito em `arestasDe()`)
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
- **Idioma**: Todo o código em português (tabela, coluna, função, variável, comentário) — convenção do projeto, não negociável.
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

---
*Last updated: 2026-09-24 after ingest do PROJECT-HANDOFF.md e specs/ADRs sintetizados (primeira geração de `.planning/` para este repositório brownfield)*
