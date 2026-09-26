# Requirements: Pipe

**Defined:** 2026-09-24
**Core Value:** Atendimento multi-canal (WhatsApp/Instagram/Messenger) confiável e auditável, com CRM espelhado automaticamente e sem fricção para o atendente.

Este é um projeto brownfield. O que já está construído (canais, monitoramento, encerramento de ticket, equipe/permissões, filas, mTLS, chamada externa, núcleo do Builder, espelho Pipe→Twenty) tem código e, em vários casos, teste — mas isso não basta para ser **Validated** neste projeto (ver "Status vocabulary" em PROJECT.md, revisado 24/09/2026: implementado + funciona ponta a ponta + comparado com a referência + aprovado pelo dono). A maior parte está hoje em **Needs Validation** em PROJECT.md, e sua verificação formal é o objeto da Phase 3 (VALSURF-01..05) abaixo. Os requisitos abaixo são o trabalho genuinamente em aberto: os 14 itens do PRD de gap (`docs/specs/2026-09-05-o-que-falta.md`) e os itens levantados como "Próximas frentes"/"Áreas parcialmente prontas" em PROJECT-HANDOFF.md (24/09/2026).

## v1 Requirements

Requisitos do próximo ciclo de entrega. Cada um mapeia para uma fase do roadmap.

### Padronização Técnica

Iniciativa transversal decidida em 24/09/2026: eliminar linguagem técnica em português (rotas, endpoints, arquivos, pastas, funções, variáveis, types/interfaces/classes, controllers/services, nomes de teste, comentários técnicos) em favor de inglês, em toda a base — 3 fronts, API, workers, testes. Texto visível ao usuário (produto) continua em português/localizado e não entra nessa regra. Dados e contratos persistidos (tabelas, colunas, payloads, eventos) ficam fora do rename mecânico — cada caso recebe estratégia própria de migração. Substitui a regra anterior "todo código em português" (ver PROJECT.md Constraints e Key Decisions).

- [ ] **STD-01**: Convenção canônica de nomenclatura técnica em inglês definida e documentada (arquivos/pastas, funções/variáveis, types/interfaces/classes, controllers/services, testes, comentários técnicos, rotas/endpoints) — decisão semântica, não mecânica
- [ ] **STD-02**: Inventário completo de rotas/endpoints técnicos em português nos 3 fronts (`gestao-vite`, `desk-vite`, `apps/crm`), na API (`apps/api/src/controladores`) e em `apps/workers`, com mapa old→new aprovado antes de qualquer rename mecânico
- [ ] **STD-03**: Inventário de dependentes de rota por app — guards, redirects, callbacks, testes, links, documentação técnica — como dependency analysis antes do rename
- [ ] **STD-04**: Classificação aplicada e documentada de estado de URL vs estado efêmero de UI por caso (path param / query param / React state) — alimenta o contrato completo de STD-12, incluindo investigação específica do `selectedConversationId` do Desk contra o comportamento real da Blip antes de decidir sua forma canônica
- [ ] **STD-05**: Estratégia de compatibilidade definida (cut coordenado vs redirects/aliases temporários vs versionamento) com base em inventário de consumidores internos — sem criar `/v2` por padrão; se todos os consumidores forem controlados pelo Pipe e puderem migrar juntos, avaliar cut coordenado da v1
- [ ] **STD-06**: Inventário de dados/contratos persistidos (tabelas, colunas, payloads, eventos) com nomenclatura em português — sem rename mecânico; cada caso registrado com decisão própria de migration/compatibilidade, fora do escopo de execução desta fase
- [ ] **STD-07**: Rename mecânico aplicado (arquivos, diretórios, imports, referências, links, navigate/redirect, endpoints já mapeados, testes, fixtures, funções/variáveis quando o nome novo já estiver definido, busca por referências antigas remanescentes) nos 3 fronts + API + workers, seguindo o mapa old→new aprovado, sem regressão. **Só executa depois do mapa old→new estar aprovado.** Não inclui: inventar nomenclatura, traduzir semanticamente por conta própria, decidir arquitetura, decidir URL vs React state, decidir breaking changes, ou alterar contrato persistido sem plano — essas ficam com STD-01/02/04/05/06/12
- [ ] **STD-08**: PROJECT.md atualizado com a nova regra de idioma técnico, substituindo "todo código em português", com ressalva explícita de que texto visível ao usuário continua em português/localizado
- [ ] **STD-09**: `apps/crm` recebe a convenção técnica desta fase sem que isso decida seu destino arquitetural (CRM-01 continua aberta) — nenhuma mudança descartável frente aos desfechos possíveis de CRM-01
- [ ] **STD-10**: Todo identificador técnico não persistido do código em escopo está em inglês ao final da fase — arquivos, diretórios, funções, variáveis, classes, interfaces, types, enums, constants, controllers, services, helpers, hooks, rotas frontend, endpoints de API, nomes de teste, nomes técnicos internos, comentários técnicos. Não inclui automaticamente: textos exibidos ao usuário, conteúdo localizado/traduzido, tabelas/colunas/valores/eventos/contratos persistidos existentes (seguem STD-06, só mudam com estratégia explícita de migration)
- [ ] **STD-11**: Validação final da fase cobre regressão completa (typecheck, testes, builds, navegação dos 3 fronts, API, workers, autenticação, callbacks, redirects, deep links, refresh, back/forward) e busca automatizada por identificadores/paths/endpoints técnicos remanescentes em português. Toda ocorrência restante em português é classificada como (A) texto de produto/localização, (B) contrato persistido explicitamente adiado, ou (C) exceção documentada — a fase não é considerada concluída enquanto existir ocorrência técnica não classificada
- [ ] **STD-12**: Contrato de navegação/renderização dos fronts definido e documentado — quando usar path params, query params, React state, router state, store global, deep link, refresh persistence, back/forward, seleção temporária de UI, e client/server rendering (só quando arquiteturalmente relevante; não assumir que URL estável da Blip implica SSR). Classificação: recurso navegável/deep-linkável → URL; busca/filtro/paginação compartilhável → URL quando apropriado; estado efêmero de UI → React/store quando apropriado; comportamento Blip sem evidência suficiente → NEEDS VALIDATION. Tradução/padronização da rota e decisão de onde o estado mora são problemas diferentes, tratados separadamente

### Builder

- [x] **BUILDER-01**: Atendente pode criar bloco de todos os tipos de conteúdo e ação previstos (hoje só texto/menu/quick-reply e ProcessHttp têm editor) — ver `docs/builder-cards-pendencias.md`
- [x] **BUILDER-02**: Atendente pode buscar variável e função da biblioteca de contrato, e selecionar o destino de uma ligação por pesquisa (não só clique manual)
- [x] **BUILDER-03**: Atendente pode configurar pesquisa de satisfação nas saídas de atendimento humano, com a paleta de tags completa (decisão pendente sobre replicar o modelo nativo do Portal Blip, um alternativo, ou unificar — levantada em 15/09, nunca fechada)
- [x] **BUILDER-04**: Atendente tem paridade nos painéis de Gerenciamento de Filas e de Teste (canal de teste ligado ao motor, hoje inexistente), além de copiar/colar bloco, ícone `user-engaged` e exportar versão antiga
- [x] **BUILDER-05**: Setas do canvas do Builder refletem corretamente toda ligação salva, mesmo quando guardada fora de `bloco.$conditionOutputs` (bug suspeito em `arestasDe()`, `apps/gestao-vite/src/paginas/builder/modelo.ts:421`, diagnosticado mas não corrigido nem coberto por teste)

### Validação de Superfícies Existentes

Decidido em 24/09/2026: nada do que já está implementado é considerado concluído só por existir código/teste — precisa passar pelo critério VALIDATED completo (ver "Status vocabulary" em PROJECT.md). Esta fase roda depois do Builder e antes de CRM/Twenty, para não empilhar mais trabalho não aprovado em cima de superfícies ainda não confirmadas.

- [ ] **VALSURF-01**: Desk (app de atendimento) visualmente aprovado pelo dono, comparado com a referência real da Blip
- [ ] **VALSURF-02**: Atendimento (Monitoramento, Histórico, Encerramento de ticket, Filas/Atendentes/Pausas, Regras) funcionalmente e visualmente verificado e aprovado pelo dono
- [ ] **VALSURF-03**: Conexão de canal WhatsApp visualmente aprovada (hoje comparação documentada só por CSS/DOM extraído em partes, sem confirmação de foto lado a lado onde falta)
- [ ] **VALSURF-04**: Conexões Instagram e Messenger funcionalmente validadas de ponta a ponta (hoje sem evidência documentada de teste funcional real, além do padrão de conexão compartilhado com WhatsApp)
- [ ] **VALSURF-05**: Inventário completo de superfícies já implementadas roda antes desta fase fechar, classificando cada uma em IMPLEMENTED / FUNCTIONALLY VERIFIED / VISUALLY VERIFIED / OWNER APPROVED / VALIDATED / NEEDS VALIDATION — cobre áreas não listadas explicitamente acima (ex.: Equipe/permissões, Filas/atendentes/pausas, mTLS, Chamada externa/ProcessHttp, Builder) que hoje carecem de evidência documentada de aprovação; a lista de VALSURF-01..04 não é considerada exaustiva

### CRM

- [ ] **CRM-01**: `apps/crm` tem um destino decidido e implementado frente à integração confirmada com o Twenty (24/09/2026) — descontinuar, migrar customizações para dentro do fork, ou conviver com função própria; inclui validar se `../pipe-crm-fork` existe e por que `apps/api/tests/prova-e2e-twenty.ts` saiu do repositório

### Operação e Repositório

- [ ] **OPS-01**: Branch `limpeza` mesclado em `master` sem regressão de teste
- [ ] **OPS-02**: `apps/site` e as branches soltas sem uso recente (`codex/atendimento-blip`, `desk-visual-pipe`, `integracao`, `worktree-agent-*`) têm destino decidido (manter, arquivar ou remover)
- [ ] **OPS-03**: Publicação do repositório no GitHub decidida (histórico novo ou reescrito, público ou privado) e, se aplicável, executada

### Validação de Produção (E2E)

- [ ] **VAL-01**: Atendimento de ponta a ponta validado na VPS de demonstração com número de WhatsApp real, incluindo login Google funcionando (depende do dono cadastrar o redirect no Google Cloud Console)
- [ ] **VAL-02**: Existe teste automatizado que percorre o caminho do atendente na tela (e2e) e ambiente de homologação disponível, além dos testes de unidade (`packages/core`) e integração (`packages/db`) já existentes

### Cobrança e Comercial

- [ ] **COBR-01**: Módulo de faturamento existe — assinatura, plano, medição de consumo, emissão de fatura, cobrança recorrente, retentativa, inadimplência, suspensão e reativação (`consumo_ia` mede tokens hoje, mas nada converte isso em cobrança)
- [ ] **COBR-02**: Unidade de cobrança definida (por atendente, por conversa, por avaliação, ou híbrido) — decisão do dono, define o que `consumo_ia` precisa medir e como a tela de consumo é desenhada

### Onboarding de Cliente

- [ ] **ONB-01**: Fluxo completo de onboarding de cliente existe — criar conta, criar tenant, conectar WhatsApp pelo fluxo da Meta, convidar equipe, importar contatos/histórico, chegar na primeira conversa atendida (hoje um tenant nasce por semente no banco)
- [ ] **ONB-02**: Domínios `usepipe.com.br` e `usepipe.app` registrados (nome já escolhido em 07/09/2026; falta só o registro, ato do dono)

### Jurídico e Segurança

- [ ] **JUR-01**: Termos de uso, política de privacidade e contrato de tratamento de dados (LGPD, papel de operador) escritos e publicados
- [ ] **SEC-01**: Teste de invasão por terceiro realizado, com relatório disponível como anexo de RFP

### Estratégia Comercial

- [ ] **COM-01**: Nicho de mercado inicial decidido pelo dono — define o formulário de avaliação padrão da monitoria, os modelos de resposta pronta de fábrica, e o argumento de venda

### Suporte e Notificação

- [ ] **SUP-01**: Canal de suporte, central de ajuda ou base de conhecimento existe para o cliente final do Pipe
- [ ] **NOT-01**: Notificação fora do aplicativo existe — e-mail transacional (convite, recuperação de senha, alerta de SLA, relatório semanal); push do navegador e resumo diário

### Migração de Dados

- [ ] **MIG-01**: Importação de atendimento (contatos, conversas, histórico) de Blip, Digisac, Chatwoot ou Zenvia existe

### Crescimento

- [ ] **MOB-01**: Desk existe como aplicativo web instalável (PWA) com notificação, para atendente/supervisor em celular (app nativo permanece fora de escopo)
- [ ] **PAP-01**: Papel customizado e supervisor restrito à própria equipe existem (hoje só cinco papéis fixos)

### Documentação

- [ ] **DOC-01**: Documentação de desenvolvedor existe (subir ambiente, comportamento da API, registro de decisões de arquitetura)
- [ ] **DOC-02**: Documentação de usuário existe (como usar o Desk, montar formulário de avaliação, ler cada métrica)

## v2 Requirements

Reconhecidos e adiados — fases já planejadas nas specs vinculantes, não cortadas. Não fazem parte do roadmap atual.

### Fases futuras (5/6)

- **MCP-01**: Servidor MCP (fase 5/6 de `pipe-design.md`) — hoje só o esqueleto do pacote existe
- **RT-01**: Tempo real por WebSocket — cliente já escrito em `packages/tempo-real`, sem front consumindo; telas atualizam por consulta periódica
- **IA-01**: Monitoria por IA / módulo de Análise — `packages/ai` já tem implementação real (resumo, classificação, avaliação, bancada de prompt); decidido que entra depois

### Não planejadas ainda

- **CONH-01**: Base de conhecimento com citação
- **SSO-01**: SSO em três degraus (SAML, provisionamento automático, diretório/Active Directory)
- **META-01**: Cadastro embutido (Embedded Signup) da Meta — bloqueado por falta de CNPJ/app aprovado

## Out of Scope

Explicitamente excluído. Documentado para prevenir scope creep.

| Feature | Reason |
|---------|--------|
| App mobile nativo | Desk é web responsivo; o requisito real é PWA instalável (MOB-01), não app nativo |
| Ponte LIME (`apps/ponte`) como caminho principal da interface | Decisão do dono revertida no fim do dia 12/09/2026 — rodar a cópia compilada da Blip por trás de uma ponte deixou de ser o caminho do produto; código permanece como ferramenta de laboratório |
| Qualquer código, CSS, classe, ícone, som ou imagem da Blip no repositório | Regra permanente de licença/medida — só comportamento e texto capturados ficam como referência, fora do git |
| Login de teste "atalho" | Dono rejeitou explicitamente; quer testar desde o login real do Google |
| Migração automática de `drizzle-kit generate` que apague FKs de `0003_chaves_cruzadas` | Migrations manuais, revisão humana obrigatória — regra permanente |

## Traceability

Quais fases cobrem quais requisitos. Atualizado durante a criação do roadmap.

| Requirement | Phase | Status |
|-------------|-------|--------|
| STD-01 | Phase 1 | Pending |
| STD-02 | Phase 1 | Pending |
| STD-03 | Phase 1 | Pending |
| STD-04 | Phase 1 | Pending |
| STD-05 | Phase 1 | Pending |
| STD-06 | Phase 1 | Pending |
| STD-07 | Phase 1 | Pending |
| STD-08 | Phase 1 | Pending |
| STD-09 | Phase 1 | Pending |
| STD-10 | Phase 1 | Pending |
| STD-11 | Phase 1 | Pending |
| STD-12 | Phase 1 | Pending |
| BUILDER-01 | Phase 2 | Complete |
| BUILDER-02 | Phase 2 | Complete |
| BUILDER-03 | Phase 2 | Complete |
| BUILDER-04 | Phase 2 | Complete |
| BUILDER-05 | Phase 2 | Complete |
| VALSURF-01 | Phase 3 | Pending |
| VALSURF-02 | Phase 3 | Pending |
| VALSURF-03 | Phase 3 | Pending |
| VALSURF-04 | Phase 3 | Pending |
| VALSURF-05 | Phase 3 | Pending |
| CRM-01 | Phase 4 | Pending |
| OPS-01 | Phase 4 | Pending |
| OPS-02 | Phase 4 | Pending |
| OPS-03 | Phase 4 | Pending |
| VAL-01 | Phase 5 | Pending |
| VAL-02 | Phase 5 | Pending |
| COBR-01 | Phase 6 | Pending |
| COBR-02 | Phase 6 | Pending |
| ONB-01 | Phase 6 | Pending |
| ONB-02 | Phase 6 | Pending |
| JUR-01 | Phase 6 | Pending |
| SEC-01 | Phase 6 | Pending |
| COM-01 | Phase 6 | Pending |
| SUP-01 | Phase 7 | Pending |
| NOT-01 | Phase 7 | Pending |
| MIG-01 | Phase 7 | Pending |
| PAP-01 | Phase 7 | Pending |
| MOB-01 | Phase 8 | Pending |
| DOC-01 | Phase 8 | Pending |
| DOC-02 | Phase 8 | Pending |

**Coverage:**
- v1 requirements: 42 total
- Mapped to phases: 42
- Unmapped: 0 ✓

---
*Requirements defined: 2026-09-24*
*Last updated: 2026-09-24 — roadmap revisado: escopo de padronização técnica ampliado (STD-10/11/12), nova Phase 3 de validação de superfícies (VALSURF-01..05), 8 fases no total*
