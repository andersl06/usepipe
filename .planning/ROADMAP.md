# Roadmap: Pipe

## Overview

Pipe já tem um núcleo grande construído e commitado (canais, monitoramento, encerramento de ticket, equipe/permissões, filas, mTLS, chamada externa, espelho Pipe→Twenty, front migrado para Vite em Desk/Gestão) — mas "construído" não é o mesmo que "validado" neste projeto (ver PROJECT.md, Status vocabulary, 24/09/2026): a maior parte está em Needs Validation, não Validated, até passar por comparação com a referência e aprovação do dono. Este roadmap cobre o que PROJECT-HANDOFF.md (24/09/2026) e o PRD de gap (`o-que-falta.md`) marcam como genuinamente em aberto, nesta ordem: padronizar a linguagem técnica do projeto para inglês (decisão de 24/09/2026, tratada primeiro para não acumular mais superfície em português), fechar o Builder, levar as superfícies já implementadas ao estado realmente validado, decidir o destino do CRM Next.js e consolidar o repositório, validar o produto de ponta a ponta em produção, e então preparar, vender e operar o primeiro cliente pago — terminando em documentação e no requisito de crescimento (PWA). Servidor MCP, tempo real por WebSocket e monitoria por IA são fases futuras já reconhecidas nas specs (fase 5/6) e ficam fora deste roadmap (ver PROJECT.md Out of Scope e REQUIREMENTS.md v2).

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [ ] **Phase 1: Padronizar linguagem técnica, navegação e renderização** - Rotas, endpoints, arquivos, pastas, funções, variáveis, types e testes deixam de ser em português na base técnica; contrato de navegação/renderização documentado; dados persistidos ficam fora do rename mecânico
- [ ] **Phase 2: Fechar o Builder** - Editor atinge paridade funcional suficiente para publicar fluxos completos sem depender de decisões pendentes no motor
- [ ] **Phase 3: Validar e fechar superfícies atuais** - Desk, Atendimento, conexões de canal e demais superfícies já implementadas chegam ao estado VALIDATED (visual + aprovação do dono) antes do CRM/Twenty
- [ ] **Phase 4: Resolver o CRM e consolidar o repositório** - `apps/crm` tem destino decidido, `limpeza` mesclado em `master`, `apps/site`/branches soltas resolvidas
- [ ] **Phase 5: Validar ponta a ponta em produção** - Atendimento real funciona na VPS com WhatsApp e login Google, coberto por teste e2e
- [ ] **Phase 6: Preparar a primeira venda** - Cobrança, preço, onboarding, domínio, jurídico, segurança e nicho resolvidos para vender ao primeiro cliente
- [ ] **Phase 7: Operar depois de vender** - Suporte, notificação externa, migração de dados de outra plataforma e papéis customizados existem
- [ ] **Phase 8: Documentar e crescer** - Documentação de desenvolvedor/usuário e Desk como PWA instalável

## Phase Details

### Phase 1: Padronizar linguagem técnica, navegação e renderização
**Goal**: Toda a linguagem técnica do projeto (rotas/endpoints, arquivos, pastas, funções, variáveis, types/interfaces/classes, controllers/services, nomes de teste, comentários técnicos, novos contratos técnicos) passa a ser em inglês, com convenção canônica definida e aplicada de forma consistente nos 3 fronts (`gestao-vite`, `desk-vite`, `apps/crm`), na API, em `apps/workers` e nos testes — com um contrato de navegação/renderização documentado (path params vs query params vs React state vs SSR) — sem tocar dados/contratos já persistidos sem uma estratégia própria de migração, e sem decidir o destino arquitetural de `apps/crm` (CRM-01 continua em aberto, tratada na Phase 4).
**Depends on**: Nothing (first phase)
**Requirements**: STD-01, STD-02, STD-03, STD-04, STD-05, STD-06, STD-07, STD-08, STD-09, STD-10, STD-11, STD-12
**Success Criteria** (what must be TRUE):
  1. Existe uma convenção técnica em inglês (nomenclatura de arquivos, funções, rotas, endpoints) aprovada e registrada em PROJECT.md
  2. Existe um inventário completo e aprovado (mapa old→new) de toda rota/endpoint técnico em português nos 3 fronts, API e workers, antes de qualquer rename ser executado
  3. Todo identificador técnico não persistido (arquivos, funções, types, rotas, endpoints, testes, comentários técnicos) está em inglês ao final da fase, seguindo o mapa aprovado, com testes/links/redirects/guards atualizados e sem regressão
  4. Existe um contrato de navegação/renderização documentado (quando usar path param, query param, React state, deep link, SSR), incluindo a forma canônica decidida para o `selectedConversationId` do Desk
  5. Nenhum dado ou contrato persistido foi renomeado mecanicamente — cada caso está listado com decisão própria, pendente ou já resolvida separadamente
  6. `apps/crm` segue a mesma convenção técnica sem que isso tenha antecipado ou contaminado a decisão de CRM-01
  7. Validação final não encontra nomenclatura técnica portuguesa remanescente não classificada (texto de produto, contrato persistido adiado, ou exceção documentada são as únicas categorias aceitas)
**Plans**: TBD
**UI hint**: yes

**Decisões em aberto para `/gsd-discuss-phase 1`** (não resolvidas por este roadmap, precisam de investigação/decisão do dono antes do plano):
  - Vocabulário canônico exato por domínio (ex.: `atendimento`→`conversation` ou `attendance`? `fluxo`→`flow`? `roteador`→`router`?) — decisão semântica, feita por Sonnet durante o discuss/planning, não herdada automaticamente da nomenclatura já parcialmente inglesa em `desk-vite`/Blip.
  - Forma canônica do `selectedConversationId` no Desk — hoje representado de duas formas diferentes no mesmo app (path param em `/chat/:id`, query param em `/contacts/:id?ticket=`); precisa de investigação específica contra o comportamento real da Blip antes de escolher uma. Não assumir que uma URL estável da Blip implica SSR — tradução de rota e decisão de onde o estado mora são problemas diferentes (STD-12).
  - Estratégia de compatibilidade (cut coordenado vs redirects/aliases temporários vs versionamento de API) — só decidível depois do inventário de consumidores (STD-02/STD-03); não criar `/v2` por padrão; avaliar cut coordenado se todos os consumidores forem internos.
  - Cada item do inventário de dados persistidos (STD-06) que usa nomenclatura em português vira uma decisão própria — pode virar uma fase/plano separado com estratégia de migration, não é resolvido nesta fase.

**Notas para o planejamento (roteamento de modelo)**: uso intencional de modelos diferentes por tipo de tarefa, conforme decisão do dono (24/09/2026). **Sonnet**: inventário e dependency analysis, definição da convenção canônica, mapa old→new, decisões semânticas de nomenclatura, classificação URL vs React state, análise de breaking changes, estratégia de compatibilidade, revisão final e validação de regressão. **Haiku** (só depois do mapa old→new aprovado): rename de arquivos/diretórios, imports, referências, links, navigate/redirect, endpoints já mapeados, testes, fixtures, funções/variáveis quando o nome novo já estiver definido, busca por referências antigas remanescentes. Haiku não inventa nomenclatura, não traduz semanticamente por conta própria, não decide arquitetura, URL vs React state, breaking changes, nem altera contrato persistido sem plano.

### Phase 2: Fechar o Builder
**Goal**: O Builder deixa de ser a maior lacuna conhecida do produto — atendente consegue montar e publicar um fluxo completo sem esbarrar em tipo de bloco, ligação ou pesquisa de satisfação sem editor.
**Depends on**: Phase 1
**Requirements**: BUILDER-01, BUILDER-02, BUILDER-03, BUILDER-04, BUILDER-05
**Success Criteria** (what must be TRUE):
  1. Atendente pode criar bloco de qualquer tipo de conteúdo/ação previsto, não só texto/menu/quick-reply/ProcessHttp
  2. Atendente pode buscar variável e função da biblioteca de contrato, e selecionar destino de ligação por pesquisa
  3. Atendente pode configurar pesquisa de satisfação e usar a paleta de tags completa nas saídas de atendimento humano
  4. Atendente tem painéis de Gerenciamento de Filas e de Teste com paridade funcional, além de copiar/colar bloco e exportar versão antiga
  5. As setas do canvas do Builder representam corretamente toda ligação salva, com teste cobrindo `arestasDe()`
**Plans**: TBD
**UI hint**: yes

### Phase 3: Validar e fechar superfícies atuais
**Goal**: Tudo que já foi implementado, mas ainda não aprovado, chega ao estado realmente VALIDATED (implementado + funciona ponta a ponta + comparado com a referência + aprovado pelo dono) antes de iniciar CRM/Twenty — sem assumir que código ou teste isolado já bastam.
**Depends on**: Phase 1 (independente da Phase 2, pode rodar em paralelo)
**Requirements**: VALSURF-01, VALSURF-02, VALSURF-03, VALSURF-04, VALSURF-05
**Success Criteria** (what must be TRUE):
  1. Desk está visualmente aprovado pelo dono, comparado com a referência real da Blip
  2. Atendimento (Monitoramento, Histórico, Encerramento de ticket, Filas/Atendentes/Pausas, Regras) está funcional e visualmente verificado e aprovado pelo dono
  3. Conexão de canal WhatsApp está visualmente aprovada
  4. Conexões Instagram e Messenger estão funcionalmente validadas de ponta a ponta
  5. Existe um inventário completo das demais superfícies implementadas, cada uma classificada em IMPLEMENTED / FUNCTIONALLY VERIFIED / VISUALLY VERIFIED / OWNER APPROVED / VALIDATED / NEEDS VALIDATION — sem assumir que a lista de superfícies conhecidas hoje é exaustiva
**Plans**: TBD
**UI hint**: yes

### Phase 4: Resolver o CRM e consolidar o repositório
**Goal**: A convivência não decidida entre `apps/crm` (Next.js) e a integração real com o Twenty termina, e o repositório fica num estado único e publicável.
**Depends on**: Phase 2, Phase 3
**Requirements**: CRM-01, OPS-01, OPS-02, OPS-03
**Success Criteria** (what must be TRUE):
  1. Existe uma decisão registrada e implementada sobre o destino de `apps/crm` frente à integração confirmada com o Twenty
  2. `limpeza` está mesclado em `master` sem regressão de teste
  3. `apps/site` e as branches soltas sem uso recente têm destino decidido (mantidas, arquivadas ou removidas)
  4. A publicação do repositório no GitHub está decidida e, se aplicável, executada
**Plans**: TBD
**UI hint**: yes

### Phase 5: Validar ponta a ponta em produção
**Goal**: Alguém de fora consegue confirmar que a Pipe atende uma conversa real de WhatsApp do início ao fim, rodando na VPS, não só em ambiente local.
**Depends on**: Phase 2, Phase 3, Phase 4
**Requirements**: VAL-01, VAL-02
**Success Criteria** (what must be TRUE):
  1. Login Google funciona na VPS de demonstração (redirect cadastrado no Google Cloud Console)
  2. Uma mensagem de WhatsApp real chega, é atendida por um atendente e o ticket é encerrado na VPS
  3. Existe teste automatizado que percorre o caminho do atendente na tela (e2e), além dos testes de unidade e integração já existentes
  4. Um ambiente de homologação está disponível para validar antes de produção
**Plans**: TBD

### Phase 6: Preparar a primeira venda
**Goal**: A Pipe pode ser vendida e cobrada de um primeiro cliente real, com contrato, domínio e segurança validados.
**Depends on**: Phase 5
**Requirements**: COBR-01, COBR-02, ONB-01, ONB-02, JUR-01, SEC-01, COM-01
**Success Criteria** (what must be TRUE):
  1. O dono decidiu o nicho de mercado inicial, o formulário de avaliação padrão e o argumento de venda
  2. Os domínios `usepipe.com.br` e `usepipe.app` estão registrados e em uso
  3. Um cliente consegue se cadastrar, criar tenant, conectar WhatsApp, convidar equipe e chegar na primeira conversa atendida
  4. Um cliente consegue assinar um plano, ter consumo de IA medido e ser cobrado de forma recorrente (com retentativa e tratamento de inadimplência)
  5. Termos de uso, política de privacidade e contrato de tratamento de dados (LGPD) estão publicados
  6. Um relatório de teste de invasão de terceiro existe e está disponível como anexo de RFP
**Plans**: TBD

### Phase 7: Operar depois de vender
**Goal**: Depois de fechar o primeiro cliente, ele consegue ser suportado, notificado fora do app, migrar dados de outra plataforma, e configurar acesso sob medida para sua equipe.
**Depends on**: Phase 6
**Requirements**: SUP-01, NOT-01, MIG-01, PAP-01
**Success Criteria** (what must be TRUE):
  1. O cliente final tem canal de suporte, central de ajuda ou base de conhecimento para dúvidas do produto
  2. O usuário recebe e-mail transacional (convite, recuperação de senha, alerta de SLA, relatório semanal)
  3. Um administrador consegue importar contatos, conversas e histórico de Blip, Digisac, Chatwoot ou Zenvia
  4. Um administrador consegue criar papel customizado e supervisor restrito à própria equipe
**Plans**: TBD
**UI hint**: yes

### Phase 8: Documentar e crescer
**Goal**: O produto tem documentação suficiente para operar sem depender de handoff pessoal, e o atendente/supervisor pode usar o Desk pelo celular.
**Depends on**: Phase 7
**Requirements**: MOB-01, DOC-01, DOC-02
**Success Criteria** (what must be TRUE):
  1. Existe documentação de desenvolvedor (subir ambiente, comportamento da API, registro de decisões de arquitetura)
  2. Existe documentação de usuário (como usar o Desk, montar formulário de avaliação, ler cada métrica)
  3. Um atendente/supervisor pode instalar o Desk como PWA no celular e receber notificação
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Padronizar linguagem técnica, navegação e renderização | 0/TBD | Not started | - |
| 2. Fechar o Builder | 0/TBD | Not started | - |
| 3. Validar e fechar superfícies atuais | 0/TBD | Not started | - |
| 4. Resolver o CRM e consolidar o repositório | 0/TBD | Not started | - |
| 5. Validar ponta a ponta em produção | 0/TBD | Not started | - |
| 6. Preparar a primeira venda | 0/TBD | Not started | - |
| 7. Operar depois de vender | 0/TBD | Not started | - |
| 8. Documentar e crescer | 0/TBD | Not started | - |
