# Requirements: Pipe

**Defined:** 2026-09-24
**Core Value:** Atendimento multi-canal (WhatsApp/Instagram/Messenger) confiável e auditável, com CRM espelhado automaticamente e sem fricção para o atendente.

Este é um projeto brownfield. O que já está construído, testado e confirmado (canais, monitoramento, encerramento de ticket, equipe/permissões, filas, mTLS, chamada externa, núcleo do Builder, espelho Pipe→Twenty) está registrado como **Validated** em PROJECT.md e não é repetido aqui. Os requisitos abaixo são o trabalho genuinamente em aberto: os 14 itens do PRD de gap (`docs/specs/2026-09-05-o-que-falta.md`) e os itens levantados como "Próximas frentes"/"Áreas parcialmente prontas" em PROJECT-HANDOFF.md (24/09/2026).

## v1 Requirements

Requisitos do próximo ciclo de entrega. Cada um mapeia para uma fase do roadmap.

### Builder

- [ ] **BUILDER-01**: Atendente pode criar bloco de todos os tipos de conteúdo e ação previstos (hoje só texto/menu/quick-reply e ProcessHttp têm editor) — ver `docs/builder-cards-pendencias.md`
- [ ] **BUILDER-02**: Atendente pode buscar variável e função da biblioteca de contrato, e selecionar o destino de uma ligação por pesquisa (não só clique manual)
- [ ] **BUILDER-03**: Atendente pode configurar pesquisa de satisfação nas saídas de atendimento humano, com a paleta de tags completa (decisão pendente sobre replicar o modelo nativo do Portal Blip, um alternativo, ou unificar — levantada em 15/09, nunca fechada)
- [ ] **BUILDER-04**: Atendente tem paridade nos painéis de Gerenciamento de Filas e de Teste (canal de teste ligado ao motor, hoje inexistente), além de copiar/colar bloco, ícone `user-engaged` e exportar versão antiga
- [ ] **BUILDER-05**: Setas do canvas do Builder refletem corretamente toda ligação salva, mesmo quando guardada fora de `bloco.$conditionOutputs` (bug suspeito em `arestasDe()`, `apps/gestao-vite/src/paginas/builder/modelo.ts:421`, diagnosticado mas não corrigido nem coberto por teste)

### CRM

- [ ] **CRM-01**: `apps/crm` tem um destino decidido e implementado frente à integração confirmada com o Twenty (24/09/2026) — descontinuar, migrar customizações para dentro do fork, ou conviver com função própria; inclui validar se `../pipe-crm-fork` existe e por que `apps/api/tests/prova-e2e-twenty.ts` saiu do repositório

### Operação e Repositório

- [ ] **OPS-01**: Branch `limpeza` mesclado em `master` sem regressão de teste
- [ ] **OPS-02**: `apps/site` e as branches soltas sem uso recente (`codex/atendimento-blip`, `desk-visual-pipe`, `integracao`, `worktree-agent-*`) têm destino decidido (manter, arquivar ou remover)
- [ ] **OPS-03**: Publicação do repositório no GitHub decidida (histórico novo ou reescrito, público ou privado) e, se aplicável, executada

### Validação

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
| BUILDER-01 | Phase 1 | Pending |
| BUILDER-02 | Phase 1 | Pending |
| BUILDER-03 | Phase 1 | Pending |
| BUILDER-04 | Phase 1 | Pending |
| BUILDER-05 | Phase 1 | Pending |
| CRM-01 | Phase 2 | Pending |
| OPS-01 | Phase 2 | Pending |
| OPS-02 | Phase 2 | Pending |
| OPS-03 | Phase 2 | Pending |
| VAL-01 | Phase 3 | Pending |
| VAL-02 | Phase 3 | Pending |
| COBR-01 | Phase 4 | Pending |
| COBR-02 | Phase 4 | Pending |
| ONB-01 | Phase 4 | Pending |
| ONB-02 | Phase 4 | Pending |
| JUR-01 | Phase 4 | Pending |
| SEC-01 | Phase 4 | Pending |
| COM-01 | Phase 4 | Pending |
| SUP-01 | Phase 5 | Pending |
| NOT-01 | Phase 5 | Pending |
| MIG-01 | Phase 5 | Pending |
| PAP-01 | Phase 5 | Pending |
| MOB-01 | Phase 6 | Pending |
| DOC-01 | Phase 6 | Pending |
| DOC-02 | Phase 6 | Pending |

**Coverage:**
- v1 requirements: 25 total
- Mapped to phases: 25
- Unmapped: 0 ✓

---
*Requirements defined: 2026-09-24*
*Last updated: 2026-09-24 after ingest e criação do roadmap inicial*
