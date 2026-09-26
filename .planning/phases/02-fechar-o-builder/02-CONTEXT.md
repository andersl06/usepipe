# Phase 2: Fechar o Builder - Context

**Gathered:** 2026-09-26
**Status:** Ready for planning
**Base:** `02-RESEARCH.md` (24/09, estado atual do código com file:line), `01-CONTEXT.md` da Phase 1 (nomes em inglês, STD-06, D-43/D-49), respostas do dono nesta sessão

<domain>
## Phase Boundary

O Builder deixa de ser a maior lacuna conhecida do produto: o atendente monta e publica um fluxo completo sem esbarrar em tipo de bloco, ligação ou pesquisa de satisfação sem editor. Cobre o editor visual (`apps/gestao-vite/src/paginas/builder`, renomeado pela Phase 1), os contratos (`packages/contracts/src/gestao-fluxo.ts`), a API do Builder (`apps/api/src/controladores/gestao-builder.ts`, `apps/api/src/dominio/gestao/builder-do-fluxo.ts`, `apps/api/src/dominio/fluxo.ts`), o motor de conversa (`packages/core/src/fluxo`) e a adaptação de canal necessária para que tudo que o Builder oferece seja executado de verdade.

Requisitos: BUILDER-01..05 (`.planning/REQUIREMENTS.md`). Dois todos pendentes entram como wave técnica do motor (ver Folded Todos).

**Princípio que governa a fase (dono, 2026-09-26):** a Phase 2 fecha a funcionalidade de ponta a ponta, Builder + contrato + API + motor + canal. A UI nunca é limitada para contornar uma limitação atual do motor. Se o Builder de referência permite criar e usar, o Pipe executa; a única saída aceitável diferente disso é uma dependência externa impossível de reproduzir, registrada explicitamente.

Fora do escopo: tela/dashboard de relatório de satisfação (Analytics, fase futura; a Phase 2 só entrega o schema capaz de alimentá-lo), mudanças que a Blip lançar depois do congelamento do snapshot de referência (delta para fase futura), validação visual das demais superfícies (Phase 3), destino do `apps/crm` (Phase 4).

</domain>

<decisions>
## Implementation Decisions

### Estrutura da fase: investigar, congelar, aprovar, implementar
- **D-01:** A fase começa por uma wave de investigação da referência que complementa o `02-RESEARCH.md` (que cobre o estado do código do Pipe, não o comportamento detalhado da Blip). Nenhum catálogo, schema ou regra de ramificação é fixado antes dessa investigação terminar. As perguntas de investigação obrigatórias estão em D-08, D-12, D-14, D-16, D-18, D-19, D-20, D-25 e D-27.
- **D-02:** Alvo da paridade: a Blip ao vivo no início da investigação, congelada em um snapshot de referência datado antes da implementação. Processo: (1) `referencias-blip/builder/zip19` e demais capturas existentes são a baseline histórica (23/09); (2) comparar com o Builder da Blip ao vivo; (3) cruzar com Help Center, documentação, SDK/bundles e novas capturas; (4) listar as diferenças entre 23/09 e a versão atual; (5) produzir um inventário/snapshot final da referência da Phase 2 com data explícita; (6) congelar esse inventário como source of truth de implementação e testes. Funcionalidades novas (ações, biblioteca de funções, recursos de IA) entram se fizerem parte do Builder alvo no momento do congelamento. Lançamentos posteriores da Blip não aumentam o escopo: viram delta para fase futura. A paridade cobre UI, comportamento, contratos e execução observáveis do snapshot.
- **D-03:** Quando a investigação não encontrar evidência suficiente na referência (exemplo: o painel de Teste não aparece nos bundles), o planner não decide por conta própria nem pergunta caso a caso: ele lista o que falta capturar (telas, bundles, network da Blip) e o dono captura antes da execução daquele item. Itens sem captura ficam bloqueados, não improvisados.
- **D-04:** Portão do dono antes da implementação: a investigação entrega o inventário congelado (D-02) e, para cada ação/conteúdo, a classificação proposta entre "reproduzível no Pipe" e "dependência externa impossível de reproduzir" (D-20). O dono aprova essa lista num portão; só depois começam as waves de implementação.
- **D-05:** Os arquivos abaixo são citados pelo nome atual (português). A Phase 1 está aplicando o mapa old→new aprovado (D-49) e ainda pode corrigir linhas semanticamente erradas (ex.: `modelo.ts` → `template.ts`, Pitfall 4 do RESEARCH). O planner resolve cada caminho no mapa aprovado/aplicado no momento do planejamento; nunca hardcoda o nome proposto.

### Pesquisa de satisfação (BUILDER-03)
- **D-06:** Modelo: o nativo da Blip, escala 1-5, com bloco de pesquisa dedicado ligado ao bloco de Atendimento Humano (BAH 3.0) pela condição de saída "Exibir apenas blocos de pesquisa de satisfação". O NPS 0-10 artesanal (bloco de nota + script + evento) não é replicado como modelo próprio; se `ExecuteScript`/`TrackEvent` entrarem pelo catálogo (D-19), o gestor pode montá-lo à mão como na Blip, sem tela dedicada.
- **D-07:** Satisfação é funcionalidade integrada de Builder + Atendimento + Relatórios/Analytics, não só uma variável de fluxo. A documentação oficial já confirma que a pesquisa nativa captura nota + comentário e que a análise detalhada trabalha com ID do ticket, data, fila, atendente, ID do cliente, nota, avaliação e comentário.
- **D-08:** Persistência e ramificação NÃO são decididas agora. Antes, investigar e documentar a pesquisa nativa da referência de ponta a ponta:
  1. Builder: como o bloco de pesquisa é criado a partir do bloco de atendimento humano; todos os campos/configurações do bloco e das condições de saída; como nota e comentário entram no fluxo e se ficam acessíveis como variáveis; comportamento para `ClosedAttendant`, `ClosedClient` e `ClosedClientInactivity`; se cada encerramento tem destino configurável individualmente; se "Exibir apenas blocos de pesquisa de satisfação" é filtro do seletor de destino ou altera a lógica da saída; estrutura real do bloco nativo de pesquisa; se ramifica por nota individual 1-5, por classificação (1-2 / 3 / 4-5), por conclusão/timeout ou de outra forma; só nota vs nota + comentário vs sem resposta; timeout e destino após timeout; variáveis/valores disponíveis depois da pesquisa.
  2. Atendimento: como a resposta fica associada a ticket, contato, atendente e fila; o que acontece em resposta completa, só nota, sem resposta, abandono.
  3. Relatórios/Analytics: reproduzir a estrutura da Análise de Satisfação da referência (métricas, filtros, agrupamentos, tabela detalhada, busca de comentários); exportação/extração dos dados e relação com o gerenciador de relatórios.
  4. API: documentação oficial, Help Center e referências para identificar endpoints de consulta de respostas e relatórios (request, response, campos, filtros, paginação, identificadores); sem documentação pública suficiente, investigar bundles/network capturados antes de definir o contrato do Pipe.
  5. Persistência: só depois disso definir o modelo do Pipe. O schema deve ser capaz de reproduzir o comportamento observável e as consultas/relatórios da referência; não é escolhido antecipadamente entre "tabela", "variável" ou "TrackEvent".
- **D-09:** Não inferir as saídas do bloco de pesquisa a partir das categorias do relatório. O Analytics agrupar 1-2 como insatisfeito, 3 como neutro e 4-5 como satisfeito não demonstra que o Builder ramifique por essas categorias. Depois de documentar o comportamento real, implementar a mesma lógica no Pipe.
- **D-10:** Limitações da Blip que são limitação e não recurso (dados por até 3 meses, só PT-BR) não são copiadas; a decisão fica no desenho do schema (D-08.5).

### Tags (BUILDER-03)
- **D-11:** "Paleta de tags completa" cobre os dois sistemas: (a) os `$tags` do bloco (rótulos com cor, `etiquetas-do-bloco.ts`) ganham paleta de cores e sugestões iguais à referência; (b) as etiquetas de encerramento do ticket (tabela `etiqueta`, mesma do Desk) ficam disponíveis ao fluxo depois do atendimento humano.
- **D-12:** Etiquetas de encerramento seguem a paridade documentada da Blip, sem ramificação especial por etiqueta e sem UI nova de "ramificar por etiqueta". As etiquetas pertencem ao ticket. Depois do encerramento, os dados do ticket ficam disponíveis ao bloco seguinte via `input.content` (ex.: `input.content@tags`, `input.content@sequentialId`), podem ser salvos em variável e usados pelas condições normais do fluxo. Reproduzir as diferenças por tipo de encerramento: fechado pelo atendente e fechado por inatividade disponibilizam os dados do ticket (incluindo tags) em `input.content`; fechado pelo cliente, segundo a documentação do BAH 3.0, não gera o mesmo `input.content` com o ticket. Investigar e reproduzir o mecanismo da referência para recuperar esses dados quando necessário (inclusive command/API, se for o comportamento atual). Verificar se versões mais novas do Builder alteraram esse comportamento antes de fechar a implementação.
- **D-13:** Na paleta de cores dos `$tags`, o azul também vira o verde correspondente do Pipe (a regra azul→verde do D-29 vale para as cores de tag).

### Painéis de Teste, Filas e Versões (BUILDER-04)
- **D-14:** Painel de Teste: investigar a referência antes de decidir entre simulação local (rascunho executado com `packages/core` em memória) e canal de teste real ligado ao motor. Documentar UI e mecanismo reais do teste da Blip (bundles, Help Center, usuário "Tester", variáveis de teste, reset de contato, o que aparece no Debug). Sem evidência suficiente, aplica-se D-03.
- **D-15:** Painel de Filas: investigar a referência antes de decidir entre manter o atalho (`painel-filas.tsx`) e CRUD embutido reaproveitando `PaginaFilas`. Os bundles listam "Skills e filas" mas o painel não foi encontrado; documentar o que existe antes de desenhar.
- **D-16:** Exportar versão antiga: investigar como a Blip lista e exporta versões publicadas (`PAINEL-Configuracoes.md`, bundles) antes de desenhar a UI. Do lado do Pipe, `GET :id/builder/versoes` já existe sem consumidor e o formato de exportação continua o mesmo `{flow, globalActions}` do rascunho atual (nunca um segundo formato).
- **D-17:** Copiar/colar bloco já está implementado (`modelo.ts:342-388`, teste de colagem com limite de 15); a fase só confirma cobertura e paridade visual do menu de contexto.

### Catálogo de conteúdo e ação, biblioteca de funções (BUILDER-01, BUILDER-02)
- **D-18:** Conteúdo: investigar cada tipo da referência antes de fechar a lista e a regra de disponibilidade. Objetivo final: todos os tipos de conteúdo expostos pelo Builder de referência, com editor + contrato + persistência + motor + adaptação de canal, não um subconjunto conveniente. Para cada tipo documentar: nome, ícone e posição exata no menu de conteúdo; campos e layout do editor; valores padrão; obrigatórios/opcionais; limites de tamanho/quantidade; MIME e formato serializado; validações e mensagens de erro; preview no Builder; suporte a variáveis; import/export; execução no motor; comportamento por canal (WhatsApp, Instagram, Messenger); o que a referência faz quando o canal não suporta o conteúdo (oculta, desabilita, avisa, permite salvar e bloqueia depois, ou faz fallback); comportamento no painel de Teste/Debug. Mínimo a investigar: texto, quick reply, imagem, carrossel, menu, digitando/chat state, áudio, vídeo, documento, enviar localização, solicitar localização, web link, conteúdo HTTP, Conteúdo Dinâmico e outros presentes nas capturas. Não usar a limitação atual do motor para decidir quais opções aparecem: primeiro reproduzir a regra da referência, depois implementar o suporte no motor/canais. Tipo novo criável não pode terminar como "Não executada no Pipe": ou a execução fecha, ou fica documentada uma incompatibilidade real de canal.
- **D-19:** Ações: investigar a referência atual antes de fechar o catálogo. Objetivo final: todas as ações que o Builder de referência oferece, com editor + contrato + persistência + API/motor + Teste/Debug. Não assumir as 19 do SDK como catálogo final; cruzar Builder/DOM/bundles capturados, documentação e Help Center atuais, SDK/repositórios públicos, payload `{flow, globalActions}` e Logs/Debug da plataforma. Para cada ação documentar: nome exibido e ícone; entrada vs saída e se pode ser global; todos os campos do editor; valores padrão; validações; condições de execução; variáveis de entrada/saída; formato serializado; comportamento no motor; dependências de serviços da plataforma; erros/timeouts/retries; comportamento no Teste/Debug; import/export; comportamento quando uma dependência não existe ou não está configurada. Investigar explicitamente: `ExecuteScript`, `ExecuteScriptV2`, `SendMessage`, `SendMessageFromHttp`, `SendRawMessage`, `SendCommand`, `ProcessCommand`, `TrackEvent`, `ProcessHttp`, `ManageList`, `MergeContact`, `SetVariable`, `SetBucket`, `Redirect`, `CreateTicket`, `DeleteVariable`, `ProcessContentAssistant`, `TrackContactsJourney`, `ExecuteTemplate`; também `ExecuteBlipFunction` e ações ligadas a agentes/IA, para determinar se pertencem ao Builder copiado ou a outra superfície. Resultado final aceitável por ação: suporte ponta a ponta, ou dependência externa impossível de reproduzir registrada explicitamente.
- **D-20:** Ações que dependem de serviço da plataforma Blip (`SetBucket`, `ManageList`, `SendCommand`/`ProcessCommand`, `ProcessContentAssistant`, `TrackContactsJourney` e outras que surgirem): a decisão entre construir o equivalente nativo no Pipe e registrar como dependência externa é tomada ação por ação, depois da investigação, no portão do dono (D-04).
- **D-21:** Scripts: não decidir previamente o mecanismo de sandbox. Antes, documentar o comportamento da referência para `ExecuteScript` legado e `ExecuteScriptV2`: versão ECMAScript suportada, limites de execução/operações/tempo, APIs expostas ao script, acesso a variáveis/contexto, HTTP/fetch, tratamento de erros, timezone, retorno.
- **D-22:** Biblioteca de funções (BUILDER-02) é investigada como funcionalidade própria da referência: criação, persistência, versionamento/edição, parâmetros, retorno, escopo e forma como é chamada pelo Builder. Ela pertence ao motor de conversa; não presumir reaproveitamento da `funcao` do motor de workflow (`packages/db/src/schema/automacao.ts`), que é outra máquina.
- **D-23:** Seletor de destino de ligação com busca (BUILDER-02) reaproveita o padrão de filtro sem acento/caixa já usado em `variaveis.ts`/`painel-variaveis.tsx`, substituindo o `<Selecao>` de `painel-saidas.tsx`; forma e comportamento do seletor seguem o inventário congelado (D-02).
- **D-24:** A whitelist dupla motor + tela (`packages/core/src/fluxo/{acoes,editor}.ts` vs `acoes-do-bloco.ts`/`conteudo.ts`) continua existindo como mecanismo, mas os dois lados são estendidos juntos para todo item aprovado no portão (D-04). O marcador "Não executada no Pipe" fica só para fluxos importados com item classificado como dependência externa.

### Wave técnica do motor: ProcessHttp (todos dobrados + Pitfall 1)
- **D-25:** Retomada de `ProcessHttp` em `$enteringCustomActions`: o motor passa a suportar a retomada corretamente (`packages/core/src/fluxo/gerenciador.ts`), suspendendo e retomando sem pular as ações seguintes. Não proibir a combinação no Builder.
- **D-26:** Varredura de recuperação também em modo BullMQ: execuções de `process_http_execucao` presas em `chamando` recebem recuperação com timeout e alerta em produção, não só no modo memória (`apps/api/src/filas.ts`).
- **D-27:** Duplicate-key na retomada (Pitfall 1, `.planning/debug/process-http-auto-resume.md`): entra com a opção A do diagnóstico (tratar `idProvedorUsado` como `true` também na retomada).
- **D-28:** Os três itens formam uma wave técnica do motor dentro da Phase 2, independente das waves de UI. Cada fix nasce com um teste que reproduz o bug antes da correção e fica como regressão.

### Canvas e setas (BUILDER-05)
- **D-29 (numeração mantida por ordem de discussão; ver também D-33 para o visual):** Fechar BUILDER-05 com teste de caracterização + investigação da referência + validação com fluxos reais:
  1. Testes de caracterização de `arestasDe()` (`modelo.ts:421`) cobrindo `$conditionOutputs` válidos, destinos inexistentes, múltiplas saídas, saídas de atendimento humano, `$defaultOutput` sem seta (preservando a referência), `$isDeskDefaultOutput` e todos os demais campos de destino interno conhecidos.
  2. Investigar na referência quais relações geram seta no canvas: condições de saída, saídas do atendimento humano, saída padrão, `Redirect`, ações que contenham destino, qualquer outro mecanismo encontrado.
  3. Validar com exports reais do projeto (inclusive fluxos complexos como o AUVP Capital): abrir o mesmo fluxo na referência e no Pipe e comparar quantidade, origem, destino e ausência/presença das setas, com casos de atendimento humano, condições múltiplas, `Redirect`, `ProcessHttp` e outros blocos relevantes.
  4. Se testes e fluxos reais mostrarem que `arestasDe()` já corresponde à referência, BUILDER-05 fecha como validado, sem alteração artificial de código.
  5. Divergência reproduzível: registrar primeiro o caso mínimo, depois corrigir com teste de regressão.
  `$defaultOutput` sem seta não é bug: é intencional na referência (`PAINEL-Saidas.md`).

### Paridade visual e identidade do Pipe
- **D-30:** O Builder reproduz a referência com máxima fidelidade visual e comportamental: layout, dimensões, espaçamentos, tipografia, componentes, estados e comportamento preservados. Única adaptação deliberada: todo azul usado como cor de marca/ênfase vira o verde correspondente do Pipe, inclusive hover, focus, glow, sombras, bordas ativas, estados selecionados, highlights, gradientes e efeitos/animações.
- **D-31:** O Builder da referência é escuro, não claro. O Pipe reproduz o tema escuro da referência (com azul→verde). Não há tema claro do Builder nesta fase.
- **D-32:** Mecanismo: tokens semânticos `--p-*` por papel visual (brand, hover, active, focus ring, border active, selected, highlight, glow, shadow, overlay, gradiente). Para cada azul da referência, identificar a função visual e mapear ao token equivalente do Pipe (`packages/ui/src/estilos/tokens.css`, espelho em `tema.ts`). Não substituir todos os azuis por um único verde; não manter hex de marca solto no CSS do Builder. Se não existir token equivalente, criar token semântico novo em `tokens.css` e documentá-lo em `docs/marca/MARCA.md`. Preservar contraste, opacidade, intensidade, blur e demais propriedades do efeito. Remover gradualmente `#4a5d23`, `--bl-verde` e outros valores locais de `editor.css`/`painel-bloco.css` quando houver token correspondente.
- **D-33:** Ícones, sons e imagens da Blip nunca entram (regra permanente). O Pipe desenha ícones próprios com o mesmo significado (ex.: equivalente do `user-engaged` citado em BUILDER-04) em `packages/ui/src/icones.tsx`.

### Folded Todos
- `.planning/todos/pending/process-http-entering-actions.md` → D-25.
- `.planning/todos/pending/process-http-bullmq-sweep.md` → D-26.

### Claude's Discretion
- **Critério de aceite visual desta fase (dono: "você decide"):** foto lado a lado por tela/estado do inventário congelado, com captura da Blip (fornecida pelo dono) e do Pipe, medidas comparadas por `getBoundingClientRect`/`getComputedStyle` e diferenças restritas a azul→verde. O Builder sai da Phase 2 como VISUALLY VERIFIED; OWNER APPROVED fica no portão final da fase e na Phase 3 (VALSURF-05). Se a captura de algum estado ficar impossível, o estado fica NEEDS VALIDATION com nota do que faltou.
- Formato e local do inventário/snapshot congelado (D-02) e da lista de capturas pendentes (D-03), desde que datados, versionados no repositório e referenciados pelos planos.
- Ordem das investigações e divisão em waves/planos, respeitando: investigação → portão do dono (D-04) → implementação; wave do motor (D-28) pode correr em paralelo desde o início.
- Desenho dos testes de caracterização e da comparação de setas com fluxos reais (D-29), desde que cubram os casos listados.
- Mecanismo de sandbox de scripts, depois da investigação do D-21.
- Cobertura de teste do copiar/colar (D-17).

</decisions>

<specifics>
## Specific Ideas

- "A regra da fase é não limitar a UI para contornar uma limitação atual do motor; se a ação é suportada pelo Builder, o motor deve executá-la corretamente."
- "Não usar a limitação atual do motor do Pipe para decidir quais opções aparecem. Primeiro reproduzir a regra da referência; depois implementar o suporte necessário no motor/canais."
- "Não inferir as saídas do bloco a partir das categorias do relatório."
- "A adaptação deve alterar a identidade azul → verde Pipe, não achatar todos os estados para a mesma cor."
- "O builder não é claro, é tudo escuro."
- Fluxo real de referência para comparar setas e blocos: o fluxo do AUVP Capital (dezenas de blocos, vários "Pesquisa de Satisfação" com ramificação Promotores/Neutros/Detratores, filas, horário, transbordo), descrito em `referencias-blip/pesquisa/blip-portal-telas.md` §58-64.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Escopo, requisitos e pesquisa já feita
- `.planning/ROADMAP.md` §Phase 2 — objetivo e critérios de sucesso
- `.planning/REQUIREMENTS.md` §Builder — BUILDER-01..05
- `.planning/PROJECT.md` §Constraints, §Key Decisions, §Out of Scope (Blip como régua, licença, canal de teste)
- `.planning/phases/02-fechar-o-builder/02-RESEARCH.md` — estado atual do código com file:line, whitelist dupla, pitfalls, waves sugeridas (válido até a Phase 1 renomear os arquivos; reconferir nomes)
- `docs/builder-cards-pendencias.md` — lista de pendências do Builder (23/09), dependências além do visual
- `PROJECT-HANDOFF.md` §"Próximas frentes" item 6 — decisão de satisfação nunca fechada; tentativas falhas de fotografar o Builder (23/09)

### Phase 1 (nomes e contratos)
- `.planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/01-CONTEXT.md` — D-08/D-09/D-11 (chaves de desenho persistido ficam), D-43 (sem dados reais em produção), D-49 (aplicação única do mapa)
- `.planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/GLOSSARY.md`, `std/CONVENTIONS-EN.md`, `std/map/*.csv` — nomes aprovados; resolver todo caminho citado aqui contra o mapa
- `.planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/persisted.csv` — o desenho `{flow, globalActions}` e suas chaves `$…` são contrato persistido (STD-06)

### Bugs do ProcessHttp (wave do motor)
- `.planning/debug/process-http-auto-resume.md` — diagnóstico do duplicate-key e opções de fix (opção A escolhida, D-27)
- `.planning/todos/pending/process-http-entering-actions.md` — resume em entering actions (D-25)
- `.planning/todos/pending/process-http-bullmq-sweep.md` — varredura em BullMQ (D-26)

### Design system do Pipe
- `packages/ui/src/estilos/tokens.css` e `packages/ui/src/tema.ts` — tokens `--p-*` (D-32)
- `docs/marca/MARCA.md` — valores de marca; onde tokens novos são documentados
- `docs/specs/2026-09-05-design-system.md`, `docs/specs/2026-09-05-pipe-design.md` — design system e roadmap de produto

### Evidência Blip já capturada (fora do git, `referencias-blip/`, só comportamento e texto)
- `referencias-blip/builder/zip19/supernova.blip.ai` — CSS/JS do Builder (baseline 23/09, D-02)
- `referencias-blip/builder/builder/PAINEIS.md`, `PAINEL-Blocos.md`, `PAINEL-Builder.md`, `PAINEL-Atendimento.md`, `PAINEL-Saidas.md` (linha 53: saída padrão sem seta), `PAINEL-Configuracoes.md`, `PAINEL-Variaveis.md`, `PAINEL-TestePublicar.md`, `PAINEL-ImportExport.md`, `PAINEL-Historico.md` — painéis extraídos dos bundles
- `referencias-blip/builder/builder-fluxo__pagina.html` — DOM capturado do Builder
- `referencias-blip/pesquisa/catalogo-gatilhos-acoes.md` §0 (dois motores), §2.2 (19 actions do SDK, ponto de partida do D-19)
- `referencias-blip/pesquisa/blip-gestao-funcoes.md` §10 — dois modelos de satisfação; métricas e filtros da Análise de Satisfação (D-08.3)
- `referencias-blip/pesquisa/blip-desk-funcoes.md` §4 — encerramento, tags, dados salvos ao final do atendimento (`input.content`), NPS artesanal (D-12)
- `referencias-blip/pesquisa/blip-gestao-regras-tecnicas.md` :219, :1427 — `AttendanceSatisfactionSurveyEnabled`, `desk-surveyDashboard`
- `referencias-blip/pesquisa/blip-portal-telas.md` §58-64 — fluxo AUVP Capital (D-29.3)
- Help Center (citado nas pesquisas acima): Satisfaction Analysis (`help.blip.ai/hc/en-us/articles/21974005289623`), NPS (`.../5423911157911`), Como salvar dados do atendimento humano (`.../5320362057751`), Fechamento automático por inatividade (`.../4474433590679`)

### A produzir nesta fase (referenciados pelos planos)
- Inventário/snapshot congelado da referência (D-02) com data
- Lista de capturas pendentes para o dono (D-03)
- Classificação ação por ação para o portão do dono (D-04, D-20)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/gestao-vite/src/paginas/builder/modelo.ts` — núcleo puro do editor (`Bloco`, `Mapa`, `Aresta`, `lerDesenho`/`montarDesenho`, `novoBloco`/`novoBlocoDeAtendimento`, `ligar`/`desligar`, copiar/colar, `arestasDe`).
- `estado.ts` — redutor puro com desfazer/refazer (limite 50); toda edição nova passa por ele.
- `variaveis.ts:76-97` + `painel-variaveis.tsx` — busca sem acento/caixa reutilizável no seletor de destino (D-23) e na biblioteca de funções.
- `importar-exportar.ts` (`textoDeExportacao`/`validarImportacao`) — mesmo formato para exportar versão antiga (D-16).
- `apps/api/src/controladores/gestao-builder.ts:79-90` — `GET :id/builder/versoes` sem consumidor no front.
- `packages/db/src/schema/conversas.ts:486` (`etiqueta`) e `packages/contracts/src/encerramento.ts` (`EncerrarConversaInput.etiqueta_ids`) — etiquetas de encerramento já existentes (D-12).
- `packages/ui/src/estilos/tokens.css`, `tema.ts`, `icones.tsx` — tokens e ícones do Pipe (D-32, D-33).
- `apps/api/src/filas.ts:111-131` — varredura só em modo memória, modelo para a versão BullMQ (D-26); outros jobs periódicos (espelho CRM, mídia, SLA) já usam `upsertJobScheduler`.

### Established Patterns
- Editor como funções puras sobre um mapa imutável; nada de estado mutável na camada de modelo.
- Whitelist dupla motor + tela (`packages/core/src/fluxo/editor.ts:152-153`, `acoes.ts:233`; `acoes-do-bloco.ts:57-126`, `conteudo.ts:1-27`) — estendida em conjunto (D-24).
- `DesenhoDoBuilder` = `{flow, globalActions}` da Blip com chaves `$…` literais; persistido, não renomeia (STD-06).
- Dois motores distintos: conversa (`fluxo`→`bloco`→`transicao`) e workflow (`gatilho`→`acao`); biblioteca de funções é do primeiro (D-22).
- CSS do Builder hoje com hex solto e `--bl-verde` avulso (`editor.css`, `painel-bloco.css`), fora do padrão `--p-*` do resto do produto.

### Integration Points
- `packages/core/src/fluxo/gerenciador.ts` — cursor de retomada do ProcessHttp (D-25).
- `apps/api/src/dominio/fluxo.ts:529-655` (`executarProcessHttp`) — duplicate-key na retomada (D-27).
- `painel-saidas.tsx:34-38, 57-73, 83-153` — saídas de atendimento, seletor de destino, saídas customizáveis (`OutOfAttendanceHour`, `NoAgentAvailable`).
- `painel-configuracao.tsx` — abas Ações Globais/Versões; aba Variáveis da Blip omitida por falta de motor (revisitar sob D-18/D-19 se o inventário a incluir).
- `painel-filas.tsx` — atalho atual (D-15).
- `canvas.tsx:274` — única chamada de `arestasDe()` (D-29).
- Adaptadores de canal (WhatsApp/Instagram/Messenger) em `apps/api` — recebem os tipos de conteúdo novos (D-18).

</code_context>

<deferred>
## Deferred Ideas

- Tela/dashboard de Relatório de Satisfação (Análise de Satisfação da Blip) — fase futura de Analytics; a Phase 2 entrega só o schema/consultas que a reproduzem (D-08.3, D-08.5).
- Mudanças que a Blip lançar após o congelamento do snapshot (D-02) — delta para fase futura.
- NPS 0-10 como modelo com tela própria — não replicado (D-06); montável à mão se o catálogo trouxer as ações.
- Aba "Variáveis" do painel de Configuração (expiração de estado, timeout de ação, score mínimo de IA) — entra só se o inventário congelado a incluir e o motor passar a implementar; senão, fase futura.

</deferred>

---

*Phase: 02-fechar-o-builder*
*Context gathered: 2026-09-26*
