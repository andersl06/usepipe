# Requirements (PRD)

Source PRD: `docs/specs/2026-09-05-o-que-falta.md` ("Pipe — o que ainda falta"), 05/09/2026 gap analysis, ordered by business impact ("quanto dói descobrir tarde"). Cross-ref: `docs/specs/2026-09-05-comercial.md`.

## REQ-cobranca
- source: docs/specs/2026-09-05-o-que-falta.md
- description: Não existe módulo de faturamento. Falta: assinatura, plano, medição de consumo, emissão de fatura, cobrança recorrente, retentativa, inadimplência, suspensão e reativação. `consumo_ia` mede tokens mas nada converte isso em cobrança.
- acceptance: absent (gateway — Stripe/Asaas/Pagar.me —, emissão de nota fiscal de serviço, e tratamento de dado do cliente inadimplente ficam como decisões embutidas, não especificadas)
- scope: billing, bloqueia a primeira venda

## REQ-preco
- source: docs/specs/2026-09-05-o-que-falta.md
- description: Unidade de cobrança em aberto desde a primeira versão da spec — por atendente, por conversa, por avaliação, ou híbrido. Define o que `consumo_ia` precisa medir e como a tela de consumo é desenhada.
- acceptance: absent
- scope: pricing, bloqueia módulo de faturamento

## REQ-onboarding-cliente
- source: docs/specs/2026-09-05-o-que-falta.md
- description: Não há cadastro de cliente. Hoje um tenant nasce por semente no banco. Falta o fluxo completo: criar conta, criar tenant, conectar WhatsApp pelo fluxo da Meta, convidar equipe, importar contatos/histórico, chegar na primeira conversa atendida.
- acceptance: absent
- scope: customer onboarding, bloqueia a primeira venda

## REQ-dominio
- source: docs/specs/2026-09-05-o-que-falta.md
- description: Domínio do produto — marcado RESOLVIDO em 07/09/2026: `usepipe.com.br` escolhido (junto com `usepipe.app` disponível). Falta apenas o registro (ato do dono). Nome antigo `pipe.com.br` já saiu de toda configuração.
- acceptance: registrar `usepipe.com.br` e `usepipe.app` no mesmo dia
- scope: domain registration, bloqueia publicação do site

## REQ-documentos-legais
- source: docs/specs/2026-09-05-o-que-falta.md
- description: Faltam termos de uso, política de privacidade e contrato de tratamento de dados (LGPD, papel de operador). Estrutura de contrato comercial e matriz de resposta a RFP já desenhadas em `comercial.md`; falta escrever os documentos em si.
- acceptance: absent
- scope: legal documents, LGPD, bloqueia venda para empresa com jurídico

## REQ-teste-invasao
- source: docs/specs/2026-09-05-o-que-falta.md
- description: Teste de invasão por terceiro não foi feito. Necessário antes da primeira venda (plataforma guarda conversa de cliente final e token da Meta); o relatório vira anexo de RFP.
- acceptance: absent
- scope: security testing, bloqueia a primeira venda

## REQ-nicho
- source: docs/specs/2026-09-05-o-que-falta.md
- description: Nicho de mercado continua indefinido — ponto mais insistido na mentoria comercial. Define o formulário de avaliação padrão da monitoria, os modelos de resposta pronta de fábrica, e o argumento de venda inteiro.
- acceptance: absent
- scope: market niche, decisão do dono, bloqueia a primeira venda

## REQ-suporte-cliente
- source: docs/specs/2026-09-05-o-que-falta.md
- description: Não existe canal de suporte no produto, central de ajuda, nem base de conhecimento para o usuário final.
- acceptance: absent (caminho sugerido no doc: usar o próprio Pipe para atender o cliente do Pipe)
- scope: customer support, bloqueia a operação depois de vender

## REQ-notificacao-externa
- source: docs/specs/2026-09-05-o-que-falta.md
- description: Falta notificação fora do aplicativo: e-mail transacional (convite, recuperação de senha, alerta de SLA, relatório semanal), push do navegador e resumo diário. A spec de produto só cobre notificação dentro do Desk.
- acceptance: absent
- scope: email notifications, bloqueia a operação depois de vender

## REQ-migracao-atendimento
- source: docs/specs/2026-09-05-o-que-falta.md
- description: A spec cobre importar CRM (Salesforce, HubSpot, RD Station, CSV) mas não cobre importar **atendimento**: contatos, conversas e histórico de Blip, Digisac, Chatwoot ou Zenvia.
- acceptance: absent
- scope: data migration, bloqueia a operação depois de vender

## REQ-mobile
- source: docs/specs/2026-09-05-o-que-falta.md
- description: Desk é web responsivo; app nativo está fora de escopo. Não planejado: aplicativo web instalável (PWA) com notificação, para atendente/supervisor em celular.
- acceptance: absent
- scope: mobile support, bloqueia crescer

## REQ-papeis-customizados
- source: docs/specs/2026-09-05-o-que-falta.md
- description: Hoje só cinco papéis fixos. Falta papel customizado e supervisor restrito à própria equipe — pedido comum, é o que o Chatwoot reserva para versão paga.
- acceptance: absent
- scope: custom roles, bloqueia crescer

## REQ-e2e-homologacao
- source: docs/specs/2026-09-05-o-que-falta.md
- description: Existe teste de unidade (`packages/core`) e de integração (`packages/db`), mas não existe teste que percorra o caminho do atendente na tela, nem ambiente de homologação (previsto na spec de infraestrutura, não construído).
- acceptance: absent
- scope: end-to-end testing, homologação, bloqueia crescer

## REQ-documentacao
- source: docs/specs/2026-09-05-o-que-falta.md
- description: Specs existentes são de produto (servem a quem constrói). Falta documentação de desenvolvedor (subir ambiente, comportamento da API, registro de decisões de arquitetura) e documentação de usuário (como usar o Desk, montar formulário de avaliação, ler cada métrica).
- acceptance: absent
- scope: documentation, bloqueia crescer

## Already-designed, not-yet-built (explicitly out of gap-analysis scope per source)
- source: docs/specs/2026-09-05-o-que-falta.md
- note: O documento lista como "já desenhado, só não construído" (tem spec e caminho claro, não é lacuna): Desk/Gestão/CRM/Monitoria como aplicações; canal WhatsApp oficial e Instagram; entrega de mensagem com outbox e retry; realtime por WebSocket; motor de workflow; construtor de fluxo; ações no chat; linguagem de consulta e dicionário de dados; servidor MCP; SSO em três degraus; resumo e avaliação por IA; base de conhecimento com citação. Marcado absent de acceptance criteria — é inventário, não requisito individual.
