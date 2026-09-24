# Roadmap: Pipe

## Overview

Pipe já tem um núcleo grande construído, testado e commitado (canais, monitoramento, encerramento de ticket, equipe/permissões, filas, mTLS, chamada externa, espelho Pipe→Twenty, front migrado para Vite em Desk/Gestão) — esse trabalho está registrado como Validated em PROJECT.md e não é replanejado aqui. Este roadmap cobre o que PROJECT-HANDOFF.md (24/09/2026) e o PRD de gap (`o-que-falta.md`) marcam como genuinamente em aberto: fechar o Builder, decidir o destino do CRM Next.js e consolidar o repositório, validar o produto de ponta a ponta em produção, e então preparar, vender e operar o primeiro cliente pago — terminando em documentação e no requisito de crescimento (PWA). Servidor MCP, tempo real por WebSocket e monitoria por IA são fases futuras já reconhecidas nas specs (fase 5/6) e ficam fora deste roadmap (ver PROJECT.md Out of Scope e REQUIREMENTS.md v2).

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [ ] **Phase 1: Fechar o Builder** - Editor atinge paridade funcional suficiente para publicar fluxos completos sem depender de decisões pendentes no motor
- [ ] **Phase 2: Resolver o CRM e consolidar o repositório** - `apps/crm` tem destino decidido, `limpeza` mesclado em `master`, `apps/site`/branches soltas resolvidas
- [ ] **Phase 3: Validar ponta a ponta em produção** - Atendimento real funciona na VPS com WhatsApp e login Google, coberto por teste e2e
- [ ] **Phase 4: Preparar a primeira venda** - Cobrança, preço, onboarding, domínio, jurídico, segurança e nicho resolvidos para vender ao primeiro cliente
- [ ] **Phase 5: Operar depois de vender** - Suporte, notificação externa, migração de dados de outra plataforma e papéis customizados existem
- [ ] **Phase 6: Documentar e crescer** - Documentação de desenvolvedor/usuário e Desk como PWA instalável

## Phase Details

### Phase 1: Fechar o Builder
**Goal**: O Builder deixa de ser a maior lacuna conhecida do produto — atendente consegue montar e publicar um fluxo completo sem esbarrar em tipo de bloco, ligação ou pesquisa de satisfação sem editor.
**Depends on**: Nothing (first phase)
**Requirements**: BUILDER-01, BUILDER-02, BUILDER-03, BUILDER-04, BUILDER-05
**Success Criteria** (what must be TRUE):
  1. Atendente pode criar bloco de qualquer tipo de conteúdo/ação previsto, não só texto/menu/quick-reply/ProcessHttp
  2. Atendente pode buscar variável e função da biblioteca de contrato, e selecionar destino de ligação por pesquisa
  3. Atendente pode configurar pesquisa de satisfação e usar a paleta de tags completa nas saídas de atendimento humano
  4. Atendente tem painéis de Gerenciamento de Filas e de Teste com paridade funcional, além de copiar/colar bloco e exportar versão antiga
  5. As setas do canvas do Builder representam corretamente toda ligação salva, com teste cobrindo `arestasDe()`
**Plans**: TBD
**UI hint**: yes

### Phase 2: Resolver o CRM e consolidar o repositório
**Goal**: A convivência não decidida entre `apps/crm` (Next.js) e a integração real com o Twenty termina, e o repositório fica num estado único e publicável.
**Depends on**: Nothing (independente da Phase 1, pode rodar em paralelo)
**Requirements**: CRM-01, OPS-01, OPS-02, OPS-03
**Success Criteria** (what must be TRUE):
  1. Existe uma decisão registrada e implementada sobre o destino de `apps/crm` frente à integração confirmada com o Twenty
  2. `limpeza` está mesclado em `master` sem regressão de teste
  3. `apps/site` e as branches soltas sem uso recente têm destino decidido (mantidas, arquivadas ou removidas)
  4. A publicação do repositório no GitHub está decidida e, se aplicável, executada
**Plans**: TBD
**UI hint**: yes

### Phase 3: Validar ponta a ponta em produção
**Goal**: Alguém de fora consegue confirmar que a Pipe atende uma conversa real de WhatsApp do início ao fim, rodando na VPS, não só em ambiente local.
**Depends on**: Phase 1, Phase 2
**Requirements**: VAL-01, VAL-02
**Success Criteria** (what must be TRUE):
  1. Login Google funciona na VPS de demonstração (redirect cadastrado no Google Cloud Console)
  2. Uma mensagem de WhatsApp real chega, é atendida por um atendente e o ticket é encerrado na VPS
  3. Existe teste automatizado que percorre o caminho do atendente na tela (e2e), além dos testes de unidade e integração já existentes
  4. Um ambiente de homologação está disponível para validar antes de produção
**Plans**: TBD

### Phase 4: Preparar a primeira venda
**Goal**: A Pipe pode ser vendida e cobrada de um primeiro cliente real, com contrato, domínio e segurança validados.
**Depends on**: Phase 3
**Requirements**: COBR-01, COBR-02, ONB-01, ONB-02, JUR-01, SEC-01, COM-01
**Success Criteria** (what must be TRUE):
  1. O dono decidiu o nicho de mercado inicial, o formulário de avaliação padrão e o argumento de venda
  2. Os domínios `usepipe.com.br` e `usepipe.app` estão registrados e em uso
  3. Um cliente consegue se cadastrar, criar tenant, conectar WhatsApp, convidar equipe e chegar na primeira conversa atendida
  4. Um cliente consegue assinar um plano, ter consumo de IA medido e ser cobrado de forma recorrente (com retentativa e tratamento de inadimplência)
  5. Termos de uso, política de privacidade e contrato de tratamento de dados (LGPD) estão publicados
  6. Um relatório de teste de invasão de terceiro existe e está disponível como anexo de RFP
**Plans**: TBD

### Phase 5: Operar depois de vender
**Goal**: Depois de fechar o primeiro cliente, ele consegue ser suportado, notificado fora do app, migrar dados de outra plataforma, e configurar acesso sob medida para sua equipe.
**Depends on**: Phase 4
**Requirements**: SUP-01, NOT-01, MIG-01, PAP-01
**Success Criteria** (what must be TRUE):
  1. O cliente final tem canal de suporte, central de ajuda ou base de conhecimento para dúvidas do produto
  2. O usuário recebe e-mail transacional (convite, recuperação de senha, alerta de SLA, relatório semanal)
  3. Um administrador consegue importar contatos, conversas e histórico de Blip, Digisac, Chatwoot ou Zenvia
  4. Um administrador consegue criar papel customizado e supervisor restrito à própria equipe
**Plans**: TBD
**UI hint**: yes

### Phase 6: Documentar e crescer
**Goal**: O produto tem documentação suficiente para operar sem depender de handoff pessoal, e o atendente/supervisor pode usar o Desk pelo celular.
**Depends on**: Phase 5
**Requirements**: MOB-01, DOC-01, DOC-02
**Success Criteria** (what must be TRUE):
  1. Existe documentação de desenvolvedor (subir ambiente, comportamento da API, registro de decisões de arquitetura)
  2. Existe documentação de usuário (como usar o Desk, montar formulário de avaliação, ler cada métrica)
  3. Um atendente/supervisor pode instalar o Desk como PWA no celular e receber notificação
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Fechar o Builder | 0/TBD | Not started | - |
| 2. Resolver o CRM e consolidar o repositório | 0/TBD | Not started | - |
| 3. Validar ponta a ponta em produção | 0/TBD | Not started | - |
| 4. Preparar a primeira venda | 0/TBD | Not started | - |
| 5. Operar depois de vender | 0/TBD | Not started | - |
| 6. Documentar e crescer | 0/TBD | Not started | - |
