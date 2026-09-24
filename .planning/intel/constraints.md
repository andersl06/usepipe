# Constraints (SPECs)

## Mensagem ativa, as duas janelas e o quadro
- source: docs/specs/2026-09-06-mensagem-ativa-e-janelas.md
- type: schema
- content: Especificação técnica de mensagem ativa com duas janelas de tempo em paralelo (24h e 90d), modelo de dados de `contato`/`conversa`, transições de estado, e implementação em quadro (Kanban). Cross-refs: `referencias-blip/pesquisa/blip-desk-dom.md`, `packages/core/src/janela/`.

## O webhook do WhatsApp, com um cliente por número
- source: docs/specs/2026-09-07-webhook-por-cliente.md
- type: api-contract
- content: Roteamento de webhook do WhatsApp com duas rotas: por-canal (aceita `override_callback_uri`) e guarda-chuva/nível de conta (sem suporte a override). Modelo de dados (`canal`, `phone_number_id`, WABA), endpoints de API, restrições de segurança (assinatura, verificação). Cross-refs: docs oficiais da Meta (business-messaging webhooks/overview e /override).

## Pipe — infraestrutura e modelo de entrega
- source: docs/specs/2026-09-05-infraestrutura.md
- type: nfr
- content: Infraestrutura SaaS multi-tenant: topologia Docker Compose, Postgres 16, Redis/BullMQ, isolamento de tenant via políticas RLS, gestão de storage, integração WhatsApp, conformidade LGPD, observabilidade, estratégia de backup, procedimentos de deploy.

## Integração do Pipe com o Twenty
- source: docs/specs/2026-09-07-integracao-twenty.md
- type: api-contract
- content: Contrato de integração Pipe↔Twenty: endpoints GraphQL/`/metadata`, mapeamento de campos contato/conta ↔ `person`/`company`, fluxo de autenticação, regras de isolamento multi-tenant. Implementado em `apps/api/src/dominio/twenty.ts` e `dominio/espelho-crm.ts` (confirmado no código por PROJECT-HANDOFF.md — ver context.md). Cross-refs: `docs/specs/2026-09-07-fork-do-twenty.md`, `apps/api/tests/twenty.test.ts`, `apps/api/tests/prova-e2e-twenty.ts`, `packages/db/src/segredo.ts`, `packages/autenticacao/src/google.ts`.

## Ponte LIME — a cópia da Blip falando com o Pipe
- source: docs/specs/2026-09-12-ponte-lime.md
- type: protocol
- content: Especificação técnica da ponte que traduz o protocolo de comandos LIME (usado pelo bundle compilado/cópia do Desk e Gestão da Blip) para o domínio do Pipe. Define `apps/ponte` como app próprio, autenticação por chave de laboratório resolvendo `(tenant, usuário)` sob RLS, mapa de 34 comandos do Desk e 73 da Gestão, e ordem de construção em 6 etapas. **Documenta a decisão do dono tomada na manhã de 12/09/2026 de que "a tela que o cliente abre é a cópia [da Blip], e o Pipe responde por trás."** Essa decisão foi revertida no fim do mesmo dia — ver INGEST-CONFLICTS.md (auto-resolvido via PROJECT-HANDOFF.md, que tem precedência explícita 0). A ponte em si continua existindo como código, mas deixou de ser o caminho do produto.

## Storage de anexo e áudio
- source: docs/specs/2026-09-07-storage-de-anexos.md
- type: api-contract
- content: Storage de anexo e áudio em disco, isolamento por tenant, URLs assinadas, validação de tipo MIME, endpoints de arquivo, compatibilidade de interface S3. Cross-refs: `2026-09-07-integracao-twenty.md`, `referencias-blip/pesquisa/regras-blip.md`, `packages/armazenamento/src/porta.ts`.

## Pipe — desenho do produto
- source: docs/specs/2026-09-05-pipe-design.md
- type: nfr
- content: Desenho de produto e arquitetura geral (05/09/2026, "aprovado verbalmente, pendente de revisão escrita"): monorepo com 5 apps (`desk`, `gestao`, `crm`, `api`, `workers`) + 1 banco; 6 módulos com fronteira própria (Identidade/Tenancy, CRM, Conversas, Gestão, Monitoria com IA, Automação/Extração); Postgres com RLS, Redis/BullMQ, WebSocket por tenant/conversa; base visual `twenty-ui` com tokens Pipe por cima (densidade 13px herdada do Twenty); roadmap em 6 fases. **Duas partes deste documento foram superadas por decisões posteriores — ver INGEST-CONFLICTS.md**: (1) §2, regra de licença que proibia copiar `twenty-server`/`twenty-front` ("não pode copiar — ler e reimplementar"), superada pela ADR `fork-do-twenty` (LOCKED, 07/09); (2) §3, arquitetura com os três fronts em Next.js, superada por `arquitetura-de-front.md` (07/09, vinculante, "substitui o Next.js App Router").

## Desk Pipe - identidade visual sobre layout Blip
- source: docs/specs/2026-09-09-desk-visual-pipe-design.md
- type: nfr
- content: Especificação de design visual aplicando a marca Pipe sobre a interface do Desk medida da Blip: tokens de cor, cor Moss, troca de logo. Cross-ref: `apps/desk` (nome de app pré-migração para Vite — ver context.md, hoje é `apps/desk-vite`).

## Pipe Desk — requisitos funcionais
- source: docs/specs/2026-09-05-desk-requisitos.md
- type: nfr
- content: Requisitos funcionais do Desk: estados do atendente, capacidade e prioridade de conversa, transferência, encerramento, respostas rápidas, janela de 24h, mídia, indicadores de presença, mensagem ativa, painel de contato, copiloto de IA, notificações, atalhos de teclado, visão em lista e quadro. Cross-refs: `2026-09-05-pipe-design.md`, `referencias-blip/pesquisa/blip-desk-funcoes.md`.

## Preço do Pipe — proposta com as contas na mesa
- source: docs/specs/2026-09-07-preco.md
- type: nfr
- content: Modelo de precificação com planos Essencial, Operação e Escala: custo por atendente, limites de franquia de IA, níveis de funcionalidade, base de custo de infraestrutura (Hetzner, Anthropic, Mercado Pago). Cross-refs: `2026-09-05-o-que-falta.md` (REQ-preco continua em aberto — ver requirements.md), `2026-09-05-infraestrutura.md`.

## Pipe — definições de métricas de atendimento
- source: docs/specs/2026-09-05-metricas-atendimento.md
- type: schema
- content: Define métricas de atendimento — timestamps, cálculos, status de encerramento, modelos de satisfação, regras de fila, SLA. Documento vinculante: "todo número em tela obedece àquele documento e tem teste correspondente em `packages/core`" (citado por `pipe-design.md` §4.4). Cross-refs: `2026-09-05-pipe-design.md`, `referencias-blip/pesquisa/blip-gestao-funcoes.md`, `packages/core`.

## Design system do Pipe
- source: docs/specs/2026-09-05-design-system.md
- type: nfr
- content: Sistema de design: tokens, tipografia, regras de paleta de cor, estrutura de componente, padrões de implementação em CSS. Cross-refs: `docs/marca/MARCA.md`, `packages/ui`, `apps/desk`, `apps/gestao`, `apps/crm` (nomes de app pré-Vite — ver context.md).

## Arquitetura de front: Vite, uma URL por aplicativo, e tempo real por WebSocket
- source: docs/specs/2026-09-07-arquitetura-de-front.md
- type: nfr
- content: Vinculante (07/09/2026), **substitui explicitamente o Next.js App Router nas três telas**. Decide Vite + `@vitejs/plugin-react-swc`, React Router 6, CSS com tokens (zero-runtime, sem Linaria/Tailwind), REST na API NestJS + TanStack Query (não GraphQL — schema fixo), Context em vez de Jotai, WebSocket por app (`Desk`, `Gestão`, `CRM`) autenticado pelo cookie de sessão. Define esquema de subdomínio por app (`app.`, `gestao.`, `crm.`, `api.usepipe.com.br`), cookie `Domain=.usepipe.com.br` + `SameSite=Lax`, CORS com lista fechada de origens. **Nota de estado (ver context.md/PROJECT-HANDOFF)**: a migração para Vite foi concluída para Desk e Gestão (`apps/desk-vite`, `apps/gestao-vite`); `apps/crm` continua Next.js — a decisão de arquitetura previa Vite para os três, o estado atual ainda não cobre o CRM.

## Pipe — modelo de dados
- source: docs/specs/2026-09-05-modelo-de-dados.md
- type: schema
- content: Definições de schema de banco de dados, máquinas de estado, catálogo de eventos e regras de isolamento para os seis módulos do produto. Cross-refs: `2026-09-05-pipe-design.md`, `packages/db`.

## Implantação: do zero ao WhatsApp respondendo
- source: docs/specs/2026-09-07-implantacao.md
- type: nfr
- content: Documento marcado "Vinculante" — guia procedural (runbook) de implantação em produção: provisionamento de VPS, Docker Compose, Traefik, Google OAuth, WhatsApp Business API, configuração de DNS, cifragem SOPS/chave age, ACME/Let's Encrypt, backup pgBackRest, monitoramento Prometheus, variáveis de ambiente. Cross-refs: `docs/specs/2026-09-05-infraestrutura.md`, `docs/specs/2026-09-07-webhook-por-cliente.md`, `infra/compose/docker-compose.prod.yml`, `infra/terraform/`, `infra/.sops.yaml`, `packages/db/drizzle`.

## Atendimento Blip Fidelity Implementation Plan
- source: docs/superpowers/plans/2026-09-23-atendimento-blip-fidelity.md
- type: nfr
- content: Especificação de implementação (plano) para fidelidade visual/funcional do módulo de Atendimento em relação à Blip: filtros de monitoramento, reconciliação de histórico, validação visual, três tarefas rastreadas (React/TypeScript, TanStack Query, `atendimento.css`). Cross-refs: `referencias-blip/pesquisa/blip-medidas-monitoramento.md`, `referencias-blip/pesquisa/blip-telas-atendimento.md`, `docs/capturas/comparacao/*-original.png`, `referencias-blip/pesquisa/pendencias-referencia-atendimento.md`. Nota: PROJECT-HANDOFF.md confirma este trabalho como concluído (commits `3343530`/`8f47a5f`) — ver context.md.
