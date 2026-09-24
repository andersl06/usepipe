# Context (DOCs)

## PROJECT-HANDOFF.md — precedence override
- source: PROJECT-HANDOFF.md
- note: Classified DOC, but carries an explicit **per-doc precedence override of 0 (highest)** — outranks the default ADR>SPEC>PRD>DOC ordering for this ingest. Written 24/09/2026 on branch `limpeza` (commit `a6f2742`), cross-referencing current code, git log, specs, older handoff docs in `docs/`, and mining of ~200 agent sessions. Explicit reliability warning in the source: "pelo menos 11 sessões da conta 2 foram cortadas por limite de sessão NO MEIO do trabalho... o texto de 'concluído' de um agente, sozinho, não é prova" — prioritizes what is in `git log` and passed tests over session self-reports. Where an old conversation contradicts the code, the code won.

### Project identity
- source: PROJECT-HANDOFF.md
- Pipe é uma plataforma de atendimento no WhatsApp (API oficial da Meta) com CRM alimentado pelas conversas e monitoria por IA, vendida a empresas.
- Relação com a Blip: **"a Blip é régua de medida, não base de código."** Forma das telas (disposição, textos, estados, navegação) é copiada da Blip quando ela mostra a regra; a tinta (cor, ícone, marca) é sempre da Pipe. Nenhum código, CSS, classe ou ícone da Blip entra no repositório — só marcação/CSS capturados ficam como referência de medida, fora do git. Regra vale desde 12/09/2026 (reversão de uma tentativa da manhã do mesmo dia — ver "Decisões importantes recuperadas" abaixo e INGEST-CONFLICTS.md).

### Current state
- source: PROJECT-HANDOFF.md
- Monorepo pnpm + turbo, todo em português (tabela, coluna, função, variável, comentário). `apps/api` (NestJS) é a ÚNICA porta para o Postgres; `apps/workers` é a exceção (fila e agregação).
- Front reescrito de Next.js para Vite (decisão de 07/09/2026): hoje só existem `apps/gestao-vite` e `apps/desk-vite` — não há mais `apps/gestao` nem `apps/desk` no código (o `README.md` da raiz ainda cita os nomes antigos, desatualizado). `apps/crm` é Next.js próprio, porta 3300, rotas próprias (leads, oportunidades, contas). Convive com a integração real com o Twenty; o papel de `apps/crm` diante disso nunca foi decidido.
- Testado e commitado no ramo `limpeza` (ainda não mesclado em `master`): canais (WhatsApp/Instagram/Messenger), monitoramento, equipe/permissões, encerramento de ticket, Builder (parcial), limpeza grande do repositório. Local funciona; VPS de demonstração publicada, pendente configuração de Google OAuth pelo dono.

### Architecture
- source: PROJECT-HANDOFF.md
- Isolamento entre clientes: um banco, `tenant_id` em toda tabela, RLS ligada, toda consulta via `comTenant(db, tenantId, tx => …)`. **Nunca `Promise.all` dentro dessa transação** — derruba `set_config` do tenant, consulta roda sem isolamento silenciosamente.
- Regra de negócio pura em `packages/core` (métrica, esforço, score, SLA, distribuição, janela 24h). Contratos front↔API em `packages/contracts`.
- **CRM em espelho — correção de versão anterior deste mesmo documento**: não é sincronização dentro do próprio banco; é espelho de verdade para uma instância EXTERNA do Twenty via GraphQL/`/metadata`, implementado em `apps/api/src/dominio/twenty.ts` (644 linhas) e `dominio/espelho-crm.ts`, testado em `apps/api/tests/twenty.test.ts`. `contato`/`conta` → `person`/`company`; campos `tenant.twenty_url`, `tenant.twenty_chave` (cifrada), `contato.twenty_pessoa_id`, `conta.twenty_empresa_id` já existem no schema. Fila `apps/workers` + varredura de segurança a cada 5 min. **Pipe é a fonte da verdade; o Twenty só exibe (escrita é só de ida)**. Spec completa `docs/specs/2026-09-07-integracao-twenty.md` — não superada, o código bate com ela.
- **PRECISA VALIDAR** (não inventar resposta): se o repositório `../pipe-crm-fork` ainda existe (não está presente nesta máquina); qual o papel de `apps/crm` diante da integração com o Twenty (nunca decidido, nem na spec original).
- Canais Meta: conexão manual (WABA ID, Phone Number ID, token, App Secret) por enquanto — Embedded Signup exige app aprovado e CNPJ, ainda não resolvido. Webhook por canal, assinado (`X-Hub-Signature-256`), verificado em tempo constante.
- Filas: BullMQ; entrega de resposta do bot só acontece no `apps/workers` — sem ele de pé, a Pipe recebe mensagem e nunca responde.
- Migrations manuais em `packages/db/drizzle`, geradas pelo drizzle-kit mas revisadas à mão (há FKs que um `generate` novo tentaria remover por não entender o ciclo de import entre módulos — não aceitar).
- Fluxo/roteador nunca é apagado de verdade — "excluir" arquiva (`estado='arquivado'`), porque `execucao_fluxo.fluxo_versao_id` é `ON DELETE RESTRICT`. Diferente da Blip e do Chatwoot (decisão própria da Pipe).

### Fontes de verdade (source-of-truth index per PROJECT-HANDOFF)
- source: PROJECT-HANDOFF.md
- Referência da Blip (medidas, textos, DOM, CSS/JS extraído, capturas): `referencias-blip/` (fora do git, ~3,1 GB).
- Design system/UI: `packages/ui` (`@pipe/ui`); regra em `docs/specs/2026-09-05-design-system.md`; identidade em `docs/marca/MARCA.md`.
- Specs de produto (vinculantes onde dizem "vinculante"): `docs/specs/*.md`.
- Banco: `packages/db/src/schema/*.ts` + `packages/db/drizzle/*.sql` (migrations até `0046`).
- APIs: `apps/api/src/controladores/*.ts`; contratos em `packages/contracts/src`.
- Variáveis de ambiente: `.env.example` na raiz (67 variáveis).
- Testes: `apps/api/tests`, `apps/gestao-vite/tests`, `apps/desk-vite/tests`.
- Pendências do Builder (23/09, levantadas pelo dono): `docs/builder-cards-pendencias.md` — lista mais atual do que falta ali.

### Permanent rules
- source: PROJECT-HANDOFF.md
- A forma segue a Blip; a tinta é da Pipe. Nunca "aproximado": medir no original (`getBoundingClientRect`/`getComputedStyle`).
- "Tudo é copiado de algo — Blip ou open source —, nunca desenhado do zero" (palavra do dono, 11/09). Regra de licença por fonte: Chatwoot MIT fora de `enterprise/`; Take.Blip.Builder Apache-2.0 (com atribuição); Twenty AGPL só como padrão/formato — nunca o código dentro de `apps/*` ou `packages/*`.
- Nenhum código/CSS/classe/ícone/som/imagem da Blip entra no repositório. Só comportamento e texto. Ícone vem de conjunto livre (Lucide/Phosphor/Tabler) ou próprio.
- `apps/api` é o único que fala com o Postgres. Front nunca abre conexão direta.
- Nunca `Promise.all` dentro de `comTenant`.
- Nunca inventar comportamento que a Blip não mostra.
- Sem `window.confirm`/`alert` nas telas — usar modais próprios.
- Conta `@auvp` da Blip (referência) é só leitura — nunca salvar/conectar por lá.
- Nunca conectar ao Pipe o número de WhatsApp que o Chatwoot do Barboo usa.
- Delegação de tela a agente: pedido precisa citar fontes exatas, medidas px origem×nossa, exigir foto comparando.

### Áreas prontas (confirmado por teste local e/ou agente)
- source: PROJECT-HANDOFF.md
- Canais WhatsApp, Instagram e Messenger (conexão manual, webhook por canal, preferências, modelos direto na Meta); reconexão de canal (troca credencial em vez de apagar/recriar); canal dentro do bot (conectar/reconectar na página do canal dentro do roteador/fluxo).
- Monitoramento — cartões em tempo real, filtros rápidos, painel de filtros no formato Blip, prévia da conversa, ações por ticket. Várias rodadas reprovadas (dono rejeitou 1ª entrega em 22/09) até commit `3343530`/`8f47a5f`.
- Encerramento de ticket — cartão único (Desk + Monitoramento), tags com regra "só exige tag quando existe tag obrigatória".
- Equipe/permissões — papel na "barra de permissão"; acessos detalhados em página própria; permissão por atendente (migração 0046), restrita a capacidades de conversa/contato.
- Filas, atendentes, pausas — telas na forma da Blip.
- mTLS — Pipe apresenta certificado do cliente ao chamar hosts dele.
- Chamada externa (ProcessHttp) — cursor e fila própria, fora da transação do fluxo.
- Builder — editor funcional (criar/mover/ligar/editar bloco), rascunho e publicação com histórico, painéis de Biblioteca de variáveis e Configuração. **Ressalva de confiança**: duas tentativas (23/09) de fotografar o Builder REAL da Blip falharam; o que existe foi medido por CSS/DOM extraído dos bundles, não por foto lado a lado — paridade visual do Builder é mais fraca que as outras telas.

### Áreas parcialmente prontas
- source: PROJECT-HANDOFF.md
- Builder — lista mais precisa: `docs/builder-cards-pendencias.md` (23/09). Falta catálogo completo de conteúdos/ações, biblioteca de funções do contrato, seletor de destino com pesquisa, pesquisa de satisfação nas saídas de atendimento humano, paleta de tags, comparação visual completa. Painéis de Gerenciamento de Filas e de Teste (Blip usa widget de chat real via SDK BlipChat; Pipe não tem canal de teste no motor) sem paridade. Copiar/colar bloco, ícone `user-engaged`, exportar versão antiga também faltam.
- Possível bug não confirmado: `arestasDe()` (`apps/gestao-vite/src/paginas/builder/modelo.ts:421`) só lê `bloco.$conditionOutputs` para desenhar setas — ligação guardada em outro campo pode não aparecer sem que os dados estejam errados. Diagnosticado, não corrigido, sem teste que cubra.
- Encerramento de ticket — funcional e testado, mas comparação visual feita por CSS/marcação capturados, não por foto do modal aberto (não encontrada em 22 zips + `desk-clone` + `blip-portal-uniao`). Cuidado: medida 656×432px era do modal LEGADO do portal, não do Desk — o modal real (`close-ticket-modal`) tem ~600px de largura de container.
- **CRM/Twenty — decisão de produto confirmada em 24/09 pelo dono: "Pipe será integrado ao Twenty como CRM."** O que já está implementado (verificado no código): mecanismo de espelho Pipe→Twenty (`dominio/twenty.ts`, `espelho-crm.ts`, schema, `tests/twenty.test.ts`). Arquitetura já decidida por `docs/specs/2026-09-07-integracao-twenty.md` (não superada): uma instância do Twenty **por cliente** (isolamento físico, não multi-workspace); login pelo mesmo Google dos dois lados, sem senha-sombra guardada pelo Pipe; Pipe é dono do dado, Twenty é espelho de exibição; fila com varredura de segurança; chave de API por tenant, cifrada. **Precisa validar**: (1) se existe hoje uma instância Twenty/fork rodando em algum lugar (diretório do fork não está nesta máquina); (2) papel de `apps/crm` — descontinuar, virar customização dentro do fork, ou conviver — pergunta em aberto desde a spec original, nunca respondida; (3) por que `apps/api/tests/prova-e2e-twenty.ts` (prova e2e de 07/09) não está mais no repositório; (4) status de `apps/site` (assunto à parte, sem relação com Twenty).
- `packages/mcp`, `packages/tempo-real`, `packages/ai` — CORREÇÃO explícita no documento: uma resposta anterior da mesma sessão chamou `mcp` de "casca vazia" e sugeriu apagar — estava errado. São fases planejadas nas specs vinculantes `pipe-design.md` (servidor MCP, fase 5/6) e `arquitetura-de-front.md` (tempo real por WebSocket) — não código órfão. `packages/ai` já tem implementação real (resumo, classificação, avaliação, bancada de prompt) para a fase de Monitoria com IA ("Análise"), ainda não construída. Não apagar sem reabrir decisão com o dono.

### Áreas ainda não implementadas
- source: PROJECT-HANDOFF.md
- Servidor MCP (fase 5/6); Tempo real por WebSocket (cliente escrito em `packages/tempo-real`, sem front consumindo — telas hoje atualizam por consulta periódica); Monitoria por IA/módulo de Análise (decidido que entra depois, base em `packages/ai` já existe); Base de conhecimento com citação e SSO em três degraus (citados em `o-que-falta.md` como não planejados ainda); Cadastro embutido (Embedded Signup) da Meta (bloqueado por falta de CNPJ/app aprovado); Canal de teste do Builder ligado ao motor.

### Known issues
- source: PROJECT-HANDOFF.md
- Ambiente local frágil: processo de API/Vite em segundo plano é encerrado pelo Claude Code sob pouca memória; API sobe sem `.env` da raiz (login Google quebra). Solução: subir API em janela própria do PowerShell.
- Docker Desktop precisa ser iniciado manualmente após reiniciar o PC.
- Vite nesta máquina escuta em `[::1]`, não `127.0.0.1` — testes com `127.0.0.1:PORTA` podem dar "connection refused".
- Build do Desk no Git Bash: `MSYS_NO_PATHCONV=1` obrigatório no `docker build`, senão reescreve `/desk/` como caminho Windows (já aconteceu em produção).
- `tests/instagram.test.ts`, `tests/fluxo.test.ts`, `tests/messenger.test.ts` oscilam sob carga da bateria inteira (timing/concorrência de banco, não regressão de código, verificado 24/09).
- `pnpm typecheck` na raiz (turbo, todos os pacotes) está QUEBRADO por `packages/core/src/fluxo/gerenciador.teste.ts:140` (`variaveis.status` não existe no tipo inferido); typechecks por app não cobrem `packages/core` isoladamente. Não corrigido nesta sessão.
- VPS de demonstração (`144.217.164.204`, `https://pipe.144-217-164-204.sslip.io`) publicada, login Google depende do dono cadastrar o redirect no Google Cloud Console.
- Número de teste da Meta: token expira em 24h, sem versão permanente — reconexão é rotina diária.
- `master` está 2 commits atrás de `limpeza` — decidir quando mesclar.
- Branches soltas sem uso recente: `codex/atendimento-blip`, `desk-visual-pipe` (último commit 10/09), `integracao`, vários `worktree-agent-*` — candidatas a apagar.

### Decisões importantes recuperadas das conversas
- source: PROJECT-HANDOFF.md
- **12/09/2026, fim do dia**: o produto é o aplicativo próprio (`apps/gestao-vite` e irmãos), não a cópia compilada da Blip — reverteu a tentativa da manhã do mesmo dia de rodar a cópia com uma ponte (`apps/ponte`, LIME) por trás. A ponte continua existindo como código, mas não é mais o caminho do produto. (Ver INGEST-CONFLICTS.md — contradiz `docs/specs/2026-09-12-ponte-lime.md`, que documenta a decisão da manhã antes da reversão.)
- **07/09/2026**: front migra de Next.js (App Router) para Vite, copiando o padrão Twenty/Chatwoot. Supersede partes do `README.md` da raiz que ainda descrevem telas como Next.js.
- **07/09/2026**: decisão do dono de fazer o CRM como fork AGPL do Twenty, repositório próprio, integração de espelho desenhada e testada e2e no mesmo dia. **CORREÇÃO (24/09)**: uma versão anterior deste próprio documento (PROJECT-HANDOFF) afirmava que essa estratégia foi "superada" por `apps/crm` — sem evidência disso. Dono confirmou hoje (24/09) que o Twenty segue sendo a decisão de CRM; `apps/crm` existe em paralelo, papel final PRECISA VALIDAR.
- **11/09/2026**: "tudo copiado, nada inventado" (ver Permanent rules).
- **Preço**: por atendente, IA (assistente + monitoria) como itens à parte. Entrada do cliente: venda assistida por enquanto (self-service existe no código, desligado).

### O que NÃO fazer
- source: PROJECT-HANDOFF.md
- Não construir tela nova sem achar a fonte exata a copiar e medir contra ela. Não copiar código/CSS/ícone da Blip para o repositório. Não trazer código do fork do Twenty (nem de `chatwoot/enterprise/`) para dentro de `apps/*`/`packages/*`. Não usar `Promise.all` dentro de `comTenant`. Não aceitar `drizzle-kit generate` que apague as FKs de `0003_chaves_cruzadas`. Não deixar API/Vite em processo de fundo desacompanhado. Não apagar `packages/mcp`/`tempo-real`/`ai`. Não fazer login de teste "atalho". Não clicar em salvar/conectar na conta `@auvp` da Blip. Não colar/reusar captura de DOM da Blip sem checar dado sensível embutido (aconteceu: token de sessão real, telefone e flags de conta em `blip-footer-with-blip-status-mfe`, 13/09).

### Próximas frentes (sem ordem de prioridade fixa)
- source: PROJECT-HANDOFF.md
- 1. Fechar o Builder (mais lacuna conhecida, depende de decidir o que entra no motor `packages/core`).
- 2. Mesclar `limpeza` em `master` e decidir destino de `apps/crm` diante da integração Twenty, de `apps/site`, e das branches soltas.
- 3. Testar de ponta a ponta na VPS com número de WhatsApp real (depende do dono cadastrar redirect Google).
- 4. Decidir publicação no GitHub (histórico novo ou reescrito, público ou privado) — sem `git remote` configurado hoje.
- 5. Migrar para o fluxo GSD (motivo deste documento existir).
- 6. Decisão de produto nunca fechada: dois modelos de pesquisa de satisfação da Blip (nativo do Portal 1-5 PT-BR, retenção 3 meses; e um modelo alternativo) — falta decidir se o Pipe replica um, o outro, ou unifica. Levantado em pesquisa de 15/09, sem decisão até hoje.

---

## Pipe — modelo comercial
- source: docs/specs/2026-09-05-comercial.md
- note: Classificado DOC apesar do caminho `docs/specs/` — conteúdo é orientação comercial/de negócio (mentoria de 03/09/2026 com conselheiro), com requisitos de produto embutidos na seção 7, não em formato de especificação formal.
- Divergência registrada: o conselho foi escolher uma ferramenta open source (Chatwoot), provar estabilidade, só então vender serviço em cima; a decisão tomada foi construir o Pipe do zero (CRM + atendimento + monitoria no mesmo produto) — risco reconhecido como "de fôlego", não técnico. Monitoria com IA plugada na plataforma que o cliente já usa é o caminho mais curto até receita.
- Portfólio de prova: instalação de referência da PJ; operação comercial (fila única, foco em lead/score); operação de suporte (várias filas, SLA apertado); monitoria avulsa plugada em Chatwoot/Blip de terceiro.
- Argumentos de venda (em ordem de força): reduz custo de plataforma; reduz custo de qualidade (um analista avalia todas as conversas); aumenta produtividade (relatório de esforço); elimina risco (WABA no nome do cliente); descobre o que automatizar (demanda recorrente).
- Estrutura de contrato: ciclos de implantação de 30 dias; suporte de 180 dias incluído pós-implantação; fora de escopo inicial explícito (migração de dados de outra plataforma, integração sob medida, treinamento presencial, customização de tela, canal fora dos quatro do produto); "pedido novo é contrato novo"; matriz RACI; níveis de suporte L1/L2.
- RFP: matriz de requisitos própria (mandatório/desejado/informativo × atende total/parcial/não atende com evidência), em blocos Funcionais, Normativos (LGPD, ISO 27001, SOC 2, GDPR se cliente europeu), Engenharia, Segurança, Operação.
- Modelos de cobrança discutidos (não excludentes): camadas; por uso (consumo de IA e template, já em `consumo_ia`); suporte especializado à parte. Combinação recomendada para o Pipe: camada por atendente + consumo de IA/envio medido — preço em aberto (ver REQ-preco em requirements.md).
- **Requisitos de produto que não estavam nas specs originais** (citados pelo conselheiro, 03/09): observabilidade exportável (New Relic/DataDog/Grafana — Pipe precisa expor métrica em formato Prometheus e permitir envio a destino externo — já capturado depois em `2026-09-05-infraestrutura.md`); integração com diretório da empresa (Active Directory — já coberto pelo SSO em três degraus de `pipe-design.md` §4.1, com SAML e provisionamento automático); mineração das conversas como produto secundário vendável por si só (já é o módulo `insight`, mas vale a observação de que é produto, não só recurso de apoio).
- Decisões que travam trabalho (dono): preço/unidade de cobrança; nicho inicial; piloto gratuito vs. primeiro cliente pago.

## Desk Pipe Visual Pipe Implementation Plan
- source: docs/superpowers/plans/2026-09-09-desk-visual-pipe.md
- note: Classificado DOC (plano de implementação procedural, execução passo a passo) em vez de SPEC.
- Plano de implementação para entregar uma prévia visual do Desk com layout Blip validado e marca Pipe aplicada (tokens, CSS, branding). Cross-ref relacionado: `docs/specs/2026-09-09-desk-visual-pipe-design.md` (SPEC irmã, ver constraints.md).
