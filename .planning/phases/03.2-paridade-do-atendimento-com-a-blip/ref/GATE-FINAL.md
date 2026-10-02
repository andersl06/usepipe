# Portão final da Fase 03.2: paridade visual da tela Atendimento com a Blip

**Data de preparação:** 2026-10-02. **Preparado por:** executor do plano 03.2-25 (Tarefa 1). Nada abaixo foi aprovado pelo dono: os portões das Ondas 2 (plano 19) e 3 (plano 22) não foram aprovados; o orquestrador seguiu adiante pelo "continua" do dono. Este portão traz tudo o que ainda está aberto.

**Leia primeiro (verdade curta):** nenhuma linha visual das Ondas 2, 3 e 4 foi verificada com o Pipe renderizado lado a lado com a Blip. O que existe é leitura de código, tipos, testes automáticos (API com banco real) e medidas da Blip feitas ao vivo em 2026-10-01 (Ondas 2 e 3) e em 2026-09-30 e 2026-10-01 (Ondas 0 e 1). Na Onda 4 a captura ao vivo falhou (sessão da Blip expirada): nenhuma medida nova.

## 1. Critérios de sucesso do ROADMAP (Fase 03.2)

| # | Critério | Evidência | Status |
|---|---|---|---|
| 1 | Cada estado da tela (lista, vazio, carregando, erro) tem captura Pipe lado a lado com a referência Blip, com medidas conferidas | `inventario-visual.md`: lista capturada na Blip para quase todas as telas, mas vazio, carregando e erro estão `pendente` em quase todas (C-17 em diante, opcionais); Onda 0 tem medidas Blip x Pipe (13 linhas VISUALLY VERIFIED na casca, paginação e tblwrap); Ondas 1 a 4 sem render do Pipe (tenant sem dados; navegador não usado), então a geometria é NEEDS VALIDATION. Nenhuma captura Pipe lado a lado foi produzida nas Ondas 2 a 4 | **NÃO ATENDIDO** |
| 2 | Menus e modais abertos foram capturados na Blip (com data e estado de interface) e replicados no Pipe | Capturados na Blip: Monitoramento C-01 a C-07 (2026-09-30), Histórico C-09, C-10 e parte de C-11 a C-14, Filas C-15 parcial, Atendentes C-16; Ondas 2 e 3 medidas ao vivo em 2026-10-01 (formulários e modais de Regras, SLA criar, Horários, Pausas criar, Respostas, Modelos, Canais, Configurações gerais). Replicados no Pipe por código (modais Transferir, Finalizar, e-mail, criar fila, etc.). Faltam: C-08 (menu do ticket aguardando e modal Finalizar), C-12 a C-14 (etapas, termo, confirmação, erro do e-mail) e C-15 completo, lista de SLA com regras, lista e exclusão de Pausas, excluir em Regras, Conectar em Canais, opções do filtro e Status em Modelos. Replicação sem conferência visual | **PARCIALMENTE ATENDIDO** |
| 3 | Tipografia e espaçamentos dentro da tolerância medida (1px, Q1), sem nenhum ativo da Blip no repositório | Tolerância medida só na Onda 0 (casca, paginação, tblwrap) e em linhas isoladas. Tipografia: IBM Plex Sans mantida por decisão do dono (Q5, L-05). Ativos: sem imagem, SVG, fonte ou HTML da Blip em `apps`, `packages`, `docs` (auditoria da seção 4); 2 menções literais a `bds-` em comentário e em documentação (não é uso de classe nem de marcação); 2 caminhos SVG de ícone desenhados no Pipe | **PARCIALMENTE ATENDIDO** (parte "sem ativo da Blip": atendida, com 2 menções de texto a corrigir se o dono quiser; parte "dentro da tolerância medida": só Onda 0) |
| 4 | O dono aprova a comparação visual | Onda 0: decisões Q1 a Q6, R-01 a R-08 e lacunas L-01 a L-05 aprovadas em 2026-09-30. Onda 1: "aprovado" em 2026-10-01 (D-P16), após as correções A a C4, aprovando as propostas L-11 a L-34. Onda 2: NÃO aprovada (D-P19). Onda 3: NÃO aprovada (plano 22 parcial). Onda 4: sem portão próprio, vem aqui | **NÃO ATENDIDO** (resta aprovar Ondas 2, 3 e 4) |

## 2. Resumo por onda

Contagens copiadas dos resumos de `VERIFICACAO-VISUAL.md` (linhas de tabela dos arquivos de origem; incluem as tabelas "antes" e "depois", por isso não são telas). Lacunas: 73 no total (L-01 a L-73); 34 com resposta do dono (L-01 a L-34); 39 abertas (L-35 a L-73).

| Onda | Telas | VISUALLY VERIFIED | NEEDS VALIDATION | Lacunas | Portão do dono |
|---|---|---|---|---|---|
| 0 | Casca, paginação, tblwrap | 13 linhas (medidas Blip x Pipe) | 7 linhas | L-01 a L-05 aprovadas; 4 linhas DIVERGE corrigidas em 03.2-07 e 03.2-08 | Aprovada (propostas); NEEDS VALIDATION restantes abaixo |
| 1 | Monitoramento, Histórico, Filas, Atendentes (+ paginação, tblwrap) | Por resumo de tela: Monitoramento 4 (código e teste), Histórico 3 (texto e navegação), Filas 0, Atendentes 0, paginação 16, tblwrap 9 | Histórico 34, Filas 21, Atendentes 21, paginação 24, tblwrap 16; Monitoramento: ver o resumo da tela | L-11 a L-34 aprovadas (propostas) | Aprovada em 2026-10-01 (D-P16) |
| 2 | Regras, SLA, Horários, Pausas, integração Builder | 0 | 90 linhas (25 + 21 + 22 + 22) | L-35 a L-54 abertas (L-45 a L-48 implementadas, aguardando validação visual) | NÃO aprovada |
| 3 | Respostas, Modelos, Canais, Configurações gerais | 0 | 43 linhas (15 + 7 + 11 + 10) | L-55 a L-66 abertas | NÃO aprovada |
| 4 | Relatório de atendimento, Esforço, Satisfação; dashboards de ligações e vendas (dependência) | 0 | 35 linhas (8 + 11 + 16) | L-67 a L-73 abertas | Aqui |

Nota sobre a Onda 1: as contagens por tela (Monitoramento 78, Histórico 66, Filas 29, Atendentes 35, paginação 54, tblwrap 31) estão em `VERIFICACAO-VISUAL.md` `## Onda 1` com a composição de cada uma; as linhas VISUALLY VERIFIED dessa onda valem para texto, estrutura, código e testes, não para geometria renderizada.

### NEEDS VALIDATION com captura pendente (C-NN)

- C-08 (menu do ticket aguardando e modal Finalizar), C-12, C-13 e C-14 (etapas, termo, confirmação e erro do Enviar por e-mail e dos modais CSV e PDF): o dono envia depois (`CAPTURAS-PENDENTES.md`).
- C-15 (restante da gestão da fila): parcial.
- C-02 e C-03 (filtros de Atendentes e Contato do Monitoramento): parciais; C-11 (Histórico): só IDs e Tags.
- C-17 a C-57 (vazio, carregando e erro das demais telas): opcionais, sem captura.
- Onda 0: cor da barra do Portal, cinzas das barras, item ativo (borda e hover), grupo Comunicação (captura pendente), paginação da grade sem render, linhas de tabela com dados.
- Ondas 2 e 3: lista de SLA com regras, lista e exclusão de Pausas, excluir em Regras, Conectar em Canais, renomear e excluir categoria de Respostas, opções de Status em Modelos.
- Onda 4: toda a captura ao vivo (aguardando login na Blip).

### Dependências da 03.1 e Fase 3 (`DEPENDENCIAS-03.1.md`, resumo)

Sem regra de negócio por trás (mostram "Este recurso será liberado em breve para este fluxo."): Falar com atendente; status Invisível; Pipe Calls; disponibilidade de atendente por fila; Atendente inativo e Tempo máximo de resposta; mensagens ativas (roteadores, prioridade máxima, limite por cliente, contato em atendimento); "Permitir atendimentos sem primeira resposta"; "Bloquear arquivos externos"; categoria de resposta e 13 tipos além de Texto; Canais Salesforce, MIAW e Personalizado; dashboards de ligações e vendas (Q6). Funcionam mas com efeito não conferido: SLA como regra (indicadores). Feitas nesta fase e já consumidas: preferências globais do Desk (0090), fluxo de retorno e Ativo do modelo (0089, o motor ainda não consome o vínculo), horário regular (0088), encerramento automático e alerta (0086, 0087).

### Conflitos de rota (`CONFLITOS-ROTA.md`, `DECISOES-DONO.md`)

Decididos: R-01, R-02 (2026-10-01), R-03, R-05, R-06, R-08. **R-07** (`attendants`, `sla`, `blip-copilot`) segue "adiado". **R-04 x Q6 (T-01)** aberto: ver pergunta T-01 abaixo.

## 3. Inventário tela x estado x situação

Fonte: `inventario-visual.md` (congelado em 2026-09-30, atualizado até 2026-10-02). "Cap." = captura da Blip; "Pipe" = verificação do Pipe. O inventário tem a casca e 17 telas (D-01 lista 14 grupos de tela; as 4 de relatórios e a de esforço somam as demais).

| Tela | Onda | lista | vazio | carregando | erro | abertos (menus e modais) | Situação |
|---|---|---|---|---|---|---|---|
| Casca | 0 | cap. Blip; medido | pendente | pendente | pendente | n/a | Aprovada; 7 linhas NEEDS VALIDATION |
| Monitoramento | 1 | cap. 2026-09-07 | pendente | pendente | pendente | C-01, C-04 a C-07 capturados; C-02, C-03, C-08 parciais | Aprovada (D-P16); geometria sem render; tabela `mon-tabela-atribuidas` ainda "totalmente diferente" (D-T01 h) |
| Histórico | 1 | cap. 2026-09-30 | cap. 2026-09-07 | pendente | pendente | C-09, C-10 capturados; C-11 a C-14 parciais | Aprovada (D-P16); multisseleção (D-C11) pendente de contrato de API |
| Filas | 1 | cap. | pendente | pendente | pendente | C-15 parcial | Aprovada (D-P16); regras de encerramento automático feitas |
| Atendentes | 1 | cap. | pendente | cap. (spinner, 2026-09-30) | pendente | C-16 parcial; Adicionar sem captura | Aprovada (D-P16) |
| Regras | 2 | cap. + ao vivo 2026-10-01 | só texto do pacote | rotação 64px medida | pendente | formulário medido; excluir só por texto | NÃO aprovada |
| SLA | 2 | lista com regras não vista | cap. ao vivo | pendente | pendente | criar medido; editar e excluir só por ficha | NÃO aprovada |
| Horários | 2 | cap. + ao vivo | pendente | cap. ao vivo | pendente | formulário e exclusão medidos | NÃO aprovada; 0088 aplicada só no banco local |
| Pausas | 2 | pendente (bot sem pausas) | cap. ao vivo | pendente | pendente | modal criar medido; exclusão não capturada | NÃO aprovada |
| Respostas | 3 | cap. + ao vivo | só texto da ficha | pendente | pendente | criar categoria, detalhe e menu medidos | NÃO aprovada |
| Templates | 3 | cap. + ao vivo | só texto da ficha | pendente | pendente | modal "abrir" medido | NÃO aprovada; 0089 aplicada só no banco local |
| Canais | 3 | cap. + ao vivo | pendente (catálogo fixo) | pendente | pendente | Conectar não aberto | NÃO aprovada |
| Configurações gerais | 3 | cap. + ao vivo | pendente | pendente | pendente | cartões medidos sem clicar | NÃO aprovada; 0090 aplicada só no banco local |
| Relatório de atendimento | 4 | cap. 2026-09-07 | pendente | pendente | pendente | sem item aberto conhecido | Sem medida ao vivo; Pipe ganhou permissão e teto de 90 dias |
| Esforço | 4 | sem captura Blip | pendente | pendente | pendente | n/a | Não se sabe se a tela existe na Blip |
| Satisfação | 4 | cap. 2026-09-07 | pendente | pendente | pendente | n/a | Sem gráficos nem filtros da Blip |
| Dashboard de ligações | 4 | cap. 2026-09-07 | pendente | pendente | pendente | n/a | Não entregue (Q6); sem rota (T-01) |
| Dashboard de vendas | 4 | cap. 2026-09-07 | pendente | pendente | pendente | n/a | Não entregue (Q6); sem rota (T-01) |

## 4. Auditoria de ativos da Blip (D-05, D-33, T-03.2-50)

Primeiro commit da fase: `cc23f2da` (`docs(03.2): capture phase context`). 152 commits com `03.2` no assunto desde `6c775b8e`.

| Verificação | Comando (resumo) | Resultado |
|---|---|---|
| `bds-` ou `shadowRoot` em linhas adicionadas | `git diff cc23f2da^ HEAD -- apps packages docs` filtrando `^+` e contando `bds-\|shadowRoot` | **2** (não é 0): ver achados |
| Mesma busca por commit 03.2 (fora de `.planning` e `referencias-blip`) | `git show <h> -- . ':!.planning' ':!referencias-blip'` | 5 commits com ocorrência (6409e6a7, a377f59a, 3d67c9df, 16e294c0, 7621a7d0); no estado atual restam 2 linhas |
| Imagens, SVG, fontes adicionados ou alterados | `git diff --name-only --diff-filter=A` e `=M` em `apps packages docs` filtrando `png\|jpe?g\|gif\|webp\|ico\|svg\|woff2?\|ttf\|otf\|eot` | **0 arquivos** (nada adicionado nem alterado) |
| `blip` em nomes de arquivos adicionados por commits 03.2 fora de `.planning` e `referencias-blip` | `git log 6c775b8e..HEAD --grep='03.2' --diff-filter=A --name-only` | **0** (os arquivos com "blip" no nome estão só em `.planning/`, pasta da própria fase) |
| `referencias-blip/` no Git | `git ls-files referencias-blip`; `git check-ignore -v` | 0 arquivos rastreados; ignorada por `.gitignore:16` |
| Caminhos SVG copiados (`<path d="M...`) em linhas adicionadas | `git diff ... \| grep '<path[^>]* d="[Mm][0-9.-]'` | 2 linhas, ambas em `apps/management-vite/src/components/monitoring-detailed.tsx` (ícone Transferir `M4 8h16M16 4l4 4-4 4M20 16H4M8 12l-4 4 4 4` e um visto duplo `M8 12.5l2.7 2.7L16 9.5`), desenhadas pelo plano 03.2-09 dentro do componente de ícones de traço do Pipe (`IconeTraco`). A Blip usa fonte de ícones do próprio design system (`bds-icon`), não caminhos; não consegui comparar com o conteúdo de `referencias-blip/` porque a busca recursiva expirou (pasta grande). Nenhum indício de cópia |
| Menções a "Blip" em linhas adicionadas (código e comentários) | `grep -i blip` em linhas `^+` | 118 menções em comentários, nomes de teste e `importFlowOfBlip` (função do Pipe que importa fluxos exportados da Blip); nenhuma é texto de interface copiado além de rótulos de UI; sem marcação, CSS ou SVG |

### Achados da auditoria (precisos)

1. `apps/management-vite/src/components/panel-filters.tsx`, comentário do `FieldContact`: "reference `bds-autocomplete` server-side, `ref/verificacao/filtro-contato.md`". É uma referência de texto ao nome de um componente da Blip, num comentário; não há classe, marcação nem CSS. Recomendação (a decidir): reescrever o comentário sem o prefixo (por exemplo "autocompletar no servidor, como na Blip").
2. `docs/marca/MARCA.md`, linha do token `--p-atend-equipe-cartao-raio`: coluna de origem cita "`atendentes-medidas-blip.md` ([M], `bds-paper`)". Referência documental à origem da medida; nenhum valor de CSS foi copiado além da medida de 16px. Recomendação (a decidir): trocar `bds-paper` por "medida da página de atendentes".

Conclusão: **nenhum ativo da Blip entrou no repositório** (sem imagem, fonte, SVG da Blip, HTML ou CSS copiados); a contagem `bds-|shadowRoot` é 2, não 0, por duas citações em texto (um comentário e uma tabela de documentação). Eu não alterei esses arquivos.

## 5. Suíte completa (saídas reais desta execução, 2026-10-02)

| Comando | Resultado |
|---|---|
| `pnpm --filter @pipe/management-vite test` | `pass 528`, `fail 0` |
| `pnpm --filter @pipe/management-vite typecheck` | exit 0 |
| `pnpm --filter @pipe/management-vite lint` | exit 0 |
| `pnpm --filter @pipe/ui test` | ok: 130 tokens, 84 em uso, claro e escuro em paridade |
| `pnpm --filter @pipe/ui typecheck` | exit 0 |
| `pnpm --filter @pipe/api typecheck` | exit 0 |
| `pnpm --filter @pipe/desk-vite typecheck` | exit 0 |
| `pnpm --filter @pipe/api test` | **VERMELHO nesta execução (737 s, exit 1):** `Test Files 41 failed, 65 passed (106)`; `Tests 212 failed, 926 passed, 61 skipped (1199)`. Causa atribuída ao trabalho concorrente da 03.1.1, não à 03.2: 123 dos erros são `new row for relation "conversa" violates check constraint "conversa_estado_ck"` e 14 são `status_atendente_estado_ck` (em `inbound.ts` `openTicketAtEntry` e `message-active.ts`), logo depois de a migração `0091_status_blip_e_ids_do_ticket.sql` ser reescrita e aplicada pelo outro agente (commits 9e948ad0 às 08:06 e 86347281 às 08:12; a execução dos testes começou antes e terminou depois) enquanto `inbound.ts`, `message-active.ts`, `envio.ts`, `assumir.ts` e `engine-services.ts` tinham alterações não commitadas dele. As rodadas anteriores desta fase (planos 22 e 23, antes da 0091) tinham `1 failed, 1148 passed`. Reexecutando só os arquivos tocados pela 03.2 (`management-reports-period`, `history`, `registrations-attendance`, `horarios`, `modelo-fluxo-retorno`): `5 passed, 139 tests passed`. A suíte completa precisa ser repetida quando a 03.1.1 terminar e o banco de teste estiver consistente com o código |
| `pnpm --filter @pipe/api lint` (fora do verify do plano) | 2 erros herdados, exit 1 |

Falhas herdadas da 03.1 (não tocadas, não atribuíveis à 03.2; evidência nos resumos 03.2-19 e 03.2-22):
- `tests/flow-actions.test.ts` > "fills application, bucket, calendar and random; tunnel stays empty without a router" (linha 276, `short_name`): falha também nesta execução (7 falhas no arquivo, entre elas a conhecida; as demais vêm da 0091 em curso). Não reavaliada isoladamente porque o arquivo depende do código da 03.1 em alteração.
- Lint `apps/api/src/domain/management/sla.ts:61` (`_alvo` sem uso; origem `296b7bfd`/`592fc669`, fase 01) e `apps/api/src/domain/flow.ts:841` (`_expiracao` sem uso; última alteração `c8362b20`, 03.1-19). Confirmados nesta execução na saída do ESLint.

O encadeamento `&&` do verify do plano não imprime OK enquanto a falha herdada existir; os `grep` finais (`## Onda 4` em `VERIFICACAO-VISUAL.md`, `PENDENTE DE OWNER APPROVED` neste arquivo) foram conferidos à parte.

## 6. Perguntas e decisões em aberto para o dono

Cada item vem dos resumos, de `VERIFICACAO-VISUAL.md`, `LACUNAS-APROVADAS.md` e `DECISOES-DONO.md`. "Recomendada" é a proposta já escrita nesses documentos; onde não há, está dito. Nada foi inventado aqui. Responda "aprovada", "corrigir" ou a opção escolhida.

### Transversais

| # | Pergunta | Recomendada | Consequência |
|---|---|---|---|
| X1 | Aprovar visualmente as Ondas 2 e 3 (lacunas L-35 a L-66 e as perguntas abaixo), que o dono não testou | Percorrer as telas pela lista da seção 7 | Sem isso o critério 4 do ROADMAP não fecha e as 133 linhas NEEDS VALIDATION (90 + 43) seguem abertas |
| X2 | Aprovar a Onda 4 (L-67 a L-73) | idem | idem |
| X3 | Relógio de SLA: contar só dentro do expediente (usando o horário da fila, com fallback no horário regular)? Hoje corre 24 horas para todas as filas (D-H02 aplicou o regular só à entrada na fila) | Sem recomendação registrada; `scheduleOfQueue` já está pronta para uso | Mudar o cálculo de SLA de todas as filas; texto "Sem horário, o relógio corre sempre" em `settings-rules.tsx` precisa de revisão junto |
| X4 | Horário regular por fluxo ou por tenant? O Pipe fez por tenant (a tabela não tem `fluxo_id`); filas são por fluxo desde a 03.1 | Sem recomendação registrada | Por fluxo exige nova coluna e migração |
| X5 | Atalho `/` x `#` do compositor do Desk para respostas prontas (L-59) | Sem recomendação registrada; a tela mostra `#atalho`, como o Pipe usa hoje | Mudar o compositor do Desk (03.1) |
| X6 | Ilustrações próprias do Pipe para vazios e modais (L-13, L-21, L-25, L-44, L-57) | Desenhar arte própria, se o dono quiser (proposta de L-13, L-25, L-44, L-57); nunca copiar a da Blip | Sem arte, os vazios e modais ficam sem ilustração (divergência registrada) |
| X7 | Seleções ainda nativas fora do escopo (`<select>`): `communication-templates-formulario`, `regras-horarios-formulario`, `regras-sla-formulario`, `rules-attendance-formulario`, `settings-general`, `deployment/formularios`, `flow/analytics/pecas`, `flow/channels/conexao`, `flow/channels/whatsapp/perfil` e `<select>` do Builder (`knowledge-tools-ui`, `panel-actions`, `panel-ai-agent`) | Converter para o `Select` global quando o dono mandar (regra global D-C4-01); parte já convertida nas Ondas 2 e 3 | Telas fora de padrão visual até serem convertidas |
| X8 | Cartão `#f6f6f6` da Blip x token de cartão do Pipe (L-53, Regras, SLA, Filas, Respostas) | Manter o token do Pipe (decisão já registrada em `MARCA.md`) | Diferença de tom de fundo permanece |

### Onda 0

| # | Pergunta | Recomendada | Consequência |
|---|---|---|---|
| O0-1 | R-07: segmentos `attendants`, `sla` e `blip-copilot` sem rota | Adiado desde 2026-09-30; sem recomendação registrada | Segue sem rota nem redirecionamento |
| O0-2 | Confirmar as linhas NEEDS VALIDATION da casca: cor da barra do Portal (azulada da Blip x branco 64%), cinzas das barras, item ativo (borda e hover), grupo Comunicação (165px x 144px; captura pendente) | Conferir lado a lado | Mudar token ou aceitar |

### Onda 1 (14 perguntas do portão, L-11 a L-34; a proposta foi aprovada em D-P16, as respostas abaixo seguem abertas nos resumos de correção)

| # | Pergunta | Recomendada | Consequência |
|---|---|---|---|
| O1-1 | Filas: manter o cartão "Dados da fila" (cor, capacidade, ordem, horário, "Ativa"), que não existe na Blip? Onde editar cor, capacidade padrão, ordem e horário da fila (C1)? (L-23) | Manter, ou mover a configuração (proposta de L-23) | Sem lugar para editar, esses campos ficam sem edição |
| O1-2 | Filas e Atendentes: que ação a seleção em lote de atendentes da fila habilita? (L-24) | Capturar a ação na Blip e implementar | Seleção segue sem ação |
| O1-3 | Histórico: algum item retirado do cartão deve voltar (Encerrada, Fila, selo de status, destaque de "Perdida", etiquetas)? (L-17) | Manter fora do cartão (continuam no CSV) | Cartão segue como a Blip |
| O1-4 | Histórico: e-mail de destinatário fora do tenant; permissão para exportar por e-mail (L-19); registrar a exportação por e-mail na auditoria (L-20) | Manter o filtro conservador até haver evidência (L-19); auditoria sem recomendação registrada | Só usuários do tenant recebem |
| O1-5 | API: confirmar `@types/pdfkit@^0.17.6` como devDependency; aparência do PDF e texto do e-mail (L-20). `pdfkit@0.20.2` já aprovado (Q4-pkg) | Confirmar o pacote de tipos | Tipos de pdfkit sem checkpoint próprio |
| O1-6 | Atendentes: e-mail sem conta no Pipe ao adicionar (L-28) | Manter a recusa com orientação ("Convide a pessoa em Contrato") ou criar o convite na tela (as duas na proposta; sem preferência registrada) | Fluxo de convite continua em Contrato |
| O1-7 | Permissões: catálogo do Pipe x as 10 da Blip. A tela já mostra as 10 (D-T01 f); achados da auditoria `permissoes-auditoria.md` (mensagem ativa e histórico dos contatos sem checagem; transferir ticket próprio sem checagem) e funções que faltam (pagamento, Kanban, lote, voz) (L-30) | Sem recomendação registrada | 5 linhas desabilitadas e 2 sem checagem no servidor seguem assim |
| O1-8 | Histórico: aceitar exceção a `apis.md` §5.3 (paginação por offset, decidida em Q2); rota própria de leitura do Histórico (hoje o detalhe exige `monitoramento.tempo_real.ver`); detalhe com ou sem barra lateral (L-22) | Aceitar a exceção; decidir rota própria e casca do detalhe | Permissão de leitura segue acoplada ao Monitoramento |
| O1-9 | Monitoramento: busca de contato por e-mail e telefone (L-15); identificador do filtro de Contato (a Blip mostra o id do túnel; o Pipe, telefone, e-mail ou id curto); o filtro grava o nome, e dois contatos com o mesmo nome se confundem (C1 item 2) | L-15: depende de dado na linha da lista | Filtrar por id exige mudar Monitoramento e Histórico |
| O1-10 | Monitoramento: qual pílula recebe o foco no painel de filtros da Blip (L-16); "fundo" dos filtros (pílulas, campos ou painel inteiro; C1 item 1) | Conferir na Blip e igualar | Diferença de foco e fundo permanece |
| O1-11 | Filtro de Período: atalhos 120 e 180 dias x regra de 90 dias; hora e minuto (o servidor filtra por dias inteiros e os seletores aparecem desabilitados); calendário flutuante da Blip (Redefinir e Concluir) não replicado (B2 itens 1, 2, 5) | Mantida a lista medida e limitado só o Personalizado a 90 dias; decisão aberta: remover 120 e 180 ou aceitá-los como atalhos fora da regra | Atalhos de 120 e 180 dias levam a erro 400 ou ficam fora da regra |
| O1-12 | Aba Aguardando: a Blip mostra "assumir" e "Transferência direta" na coluna Atendente; o Pipe mantém finalizar (B2 item 3). Tempo de atendimento sem primeira resposta (B2 item 4, medir na Blip) | Sem recomendação registrada; item 4: medir na Blip | Funções ficam fora |
| O1-13 | Tags da fila e Encerramento automático (L-26): ver itens de encerramento automático abaixo | Construída em 03.2 (0086, 0087); ver O1-16 | n/a |
| O1-14 | Tabela `mon-tabela-atribuidas` "continua totalmente diferente da Blip" (D-T01 h) e página de editar fila "muito diferente" (D-T01 g: faltam Preferências, Comunicação e Regras) | Sem recomendação registrada | Itens do teste do dono sem fechamento registrado |
| O1-15 | Filas: a fila padrão perdeu a opção na tela, mas existe no banco e na entrada (`inbox.fila_padrao_id`, rota `PUT agents/queues/default` mantida); sair a rota e a coluna? (A item 6). Limite padrão de tickets simultâneos do tenant (o "200" é só texto; o padrão real é por fila) (A item 4) | Sem recomendação registrada | Sem a opção, não há como trocar a fila padrão pela tela |
| O1-16 | Encerramento automático por inatividade (C3, C4): `removerDaTela` (o que significa; hoje só guardado); mensagem de encerramento enviada ao cliente (ver Builder abaixo); alerta com janela de 24 horas do WhatsApp fechada (hoje recusado e só registrado: enviar template aprovado?); variáveis na mensagem do alerta; conversa em espera conta inatividade (confirmar se espera deve pausar; com D-M04 o Modo de Espera desligado passa a contar); valores padrão (60 minutos), limites (30 dias, 30 tags de até 40 caracteres); tag sem etiqueta correspondente é ignorada (criar automaticamente?); texto no campo de chips sem Enter é descartado | Sem recomendação registrada nos resumos | Cada item mantém o comportamento atual até a decisão |
| O1-17 | Histórico: multisseleção de Atendentes, Tags e Filas no visual do Monitoramento (D-C11, resposta do dono já dada) | Implementar; depende de contrato de API (a API aceita um id) | Selects de escolha única continuam |
| O1-18 | Geometria sem render e vazio, carregando, erro (L-27, L-31, L-34) | Medir por CDP com dados de teste | Linhas seguem NEEDS VALIDATION |

### Onda 2

| # | Pergunta | Recomendada | Consequência |
|---|---|---|---|
| O2-1 | **SLA contando só no expediente** (X3 acima) | Sem recomendação registrada | idem X3 |
| O2-2 | **Horário regular por fluxo** (X4 acima) e, com o regular ligado, a Blip esconde o seletor de filas e o Pipe mantém as filas já vinculadas ao salvar: confirmar ou desvincular | Sem recomendação registrada | Comportamento de filas vinculadas |
| O2-3 | Horários: exibir na edição da fila "Usa o horário regular: {nome}" | Sem recomendação registrada | A página da fila não mostra horário hoje |
| O2-4 | Horários: texto do alerta de exclusão, do Pipe (honesto) ou da Blip (L-47) | Implementado com o texto da Blip quando há regular e o do Pipe quando não há (D-H01/D-H02); aguarda validação visual | Texto pode divergir da Blip |
| O2-5 | SLA: política como linhas de mesmo nome (sem migração) ou tabela própria (exige migração, não autorizada) (L-40) | Manter ou evoluir com migração | Renomear segue renomeando todas as linhas |
| O2-6 | SLA: "Padrão" e filas ao mesmo tempo; duas políticas na mesma meta e escopo (L-41) | Decidir e validar | Servidor recusa o segundo caso |
| O2-7 | Regras: valor em chips por condição e conector E/OU por grupo (L-35, L-36); "Extras Contato" com vários valores; urgência "Máxima" (C2 item 3) | Decidir modelo de dados e motor | Motor e modelo seguem com um valor e um combinador por regra |
| O2-8 | Regras: manter as setas de ordem e o rodapé do cartão, que a Blip não tem (a ordem decide qual regra casa primeiro) (L-37) | Manter ou retirar | Sem as setas, a ordem teria de vir de outro controle |
| O2-9 | Pausas: "Conta como produtivo" (L-49); pausa sem edição na tela (L-50); duração mínima 0 x 1 (L-51) | Manter ou retirar (L-49); manter ou oferecer edição (L-50); confirmar na Blip e igualar (L-51) | O relatório de esforço usa o campo produtivo |
| O2-10 | **Integração com o Builder** (L-54): tela de CRUD de etiquetas; seletores de fila e etiqueta no Builder; futuro do painel de filas do Builder (`queues-panel.ts`); mensagem de encerramento no encerramento automático | Decidir cada um; sem recomendação registrada | Sem seletor, o bloco usa nome digitado de fila e tag (o servidor recusa renomear fila em uso); sem mensagem de encerramento, o cliente não recebe aviso ao encerrar por inatividade |
| O2-11 | Regras: mensagem "Ops! Este campo precisa ser preenchido" (L-38); "(desativada)" na seleção (L-39) | Igualar; conferir na Blip | Diferença de validação |
| O2-12 | Capturas pendentes: lista de SLA com regras (L-42), lista e exclusão de Pausas (L-52), geometria sem render (L-53) | Validar com bot que tenha regras de SLA; capturar com pausa de teste; medir por CDP | Linhas seguem NEEDS VALIDATION |

### Onda 3

| # | Pergunta | Recomendada | Consequência |
|---|---|---|---|
| O3-1 | **Envio do template e consumo do bloco de retorno pelo motor**: o vínculo `fluxo_retorno_bloco_id` (0089) é gravado e validado, mas nada o lê; quando o cliente responde ao modelo, a execução segue onde estava (`runFlowInInbound` em `flow.ts`, área da 03.1). Rotear exige mexer no cursor da execução e decidir a semântica (qual execução; conversa já com atendente). Bloco apagado de fato volta a "sem vínculo" sem marca (lembrar o código exige uma coluna a mais) | Sem recomendação registrada; implementar o gancho na 03.1 | O "Fluxo de retorno" da tela não tem efeito no motor; filtro "Fluxo de retorno" do topo desabilitado |
| O3-2 | Respostas: tabela de categoria e modelo de conteúdo estruturado para os 13 tipos (L-56) | Autorizar (proposta de L-56) | Categoria nova só existe na tela até a primeira resposta; 13 tipos desabilitados |
| O3-3 | Modelos: formulário de criar modelo (cria na Meta) deve continuar nesta tela? (L-58) | Manter ou mover | Divergência com a Blip, que cria em Conteúdos |
| O3-4 | Canais: o cartão "Pipe Desk" deve permitir desconectar? (L-61). Salesforce, MIAW e Personalizado ficam fora | Decidir; integrações ficam fora | Botão desabilitado |
| O3-5 | Configurações gerais: unificar `fila.etiquetas` com o catálogo global de tags (L-63) e adotar a obrigatoriedade global da Blip ("pelo menos uma tag") em vez de tags obrigatórias específicas | Unificar e adotar a regra da Blip, ou manter | Duas listas de tag e dois modelos de obrigatoriedade |
| O3-6 | `etiqueta.exclusiva_por_fila` deve ter edição nesta tela? (L-64) | Decidir | Renomear tag é remover e criar |
| O3-7 | Preferências globais ainda sem consumidor (desabilitadas): Pipe Calls; disponibilidade de atendente por fila; Atendente inativo e Tempo máximo de resposta do cliente; mensagens ativas (roteadores, prioridade máxima, limite por cliente, contato em atendimento); "Permitir atendimentos sem primeira resposta"; "Bloquear arquivos externos"; ocultar áudio, emoji e arquivo no compositor do Desk (hoje o servidor recusa com 409). Permissão própria para modelos de mensagem (hoje `resposta_pronta.gerenciar`) | Sem recomendação registrada | Cartões seguem desabilitados |
| O3-8 | Gate de entrada em espera com o Modo de Espera desligado (409 `hold_mode_disabled`): decisão do executor, derivada do texto da Blip, reversível | Confirmar | Reverter se o dono discordar |
| O3-9 | Modelos: rodapé e botões do WhatsApp na prévia (bug da 03.1, L-60) | Corrigir na 03.1 | Prévia incompleta |
| O3-10 | Textos de cartões não capturados na íntegra e vazio, carregando e erro (L-66); geometria, tipografia, tema escuro (L-65) | Conferir na Blip; medir por CDP | NEEDS VALIDATION |

### Onda 4

| # | Pergunta | Recomendada | Consequência |
|---|---|---|---|
| O4-1 | **T-01**: rotas dos dashboards de ligações e vendas. R-04 manda criar, Q6 manda não entregar a tela. Hoje as rotas não existem. (a) criar as duas rotas com um placeholder de dependência (mantém menu e links iguais aos da Blip) ou (b) não criar rota e registrar divergência deliberada | Sem recomendação registrada em `DECISOES-DONO.md` ou `03.2-24-SUMMARY.md` | (a) acrescenta rotas e texto de dependência; (b) o menu e os links diferem da Blip |
| O4-2 | Relatórios: **120/180 dias x regra de 90 dias** e o teto de 90 dias aplicado no servidor nos três relatórios (L-70) | Manter 90 dias; atalhos 120 e 180 sem decisão | Período maior que 90 dias retorna 400 `periodo_longo_demais` |
| O4-3 | **Captura ao vivo** de Relatórios, Esforço, Satisfação e dos dashboards (aguardando login na Blip) (L-67 a L-69, L-71, L-73) | Capturar ao vivo com sessão válida; se o dono decidir entregar os dashboards, a captura vem antes | Linhas seguem NEEDS VALIDATION |
| O4-4 | Esforço: a Blip tem essa tela? Manter ou remover (L-68) | Capturar; se não existir, o dono decide | Tela sem referência |
| O4-5 | Satisfação: gráficos, filtros e fórmulas (L-69); Relatório de atendimento: indicadores sem consulta (L-67) | Capturar ao vivo; construir só se o dono quiser | Vazio honesto permanece |
| O4-6 | Cartão único (D-06) (L-72); fallback de fila padrão no eixo "Filas" (L-73) | Unificar só com medida ao vivo | `Metrica` segue compartilhada |

### Capturas pendentes do dono

C-08, C-12, C-13, C-14 (e o restante de C-15): o dono enviou "depois" em 2026-10-01 (`CAPTURAS-PENDENTES.md`); sem elas essas linhas seguem NEEDS VALIDATION. Captura ao vivo da Onda 4: depende de login na Blip (a sessão do Chrome de automação expirou em 2026-10-02).

## 7. O que testar à mão, por tela

Subir o ambiente (o orquestrador mantém Vite e API de pé). Base: `http://localhost:3110/application/detail/anderson---teste/attendance/` (tenant slug `anderson---teste`; a Vite está em 3110, a API em 3010). Faça login com a sua própria conta; nada foi criado de credencial pelo executor.

| Tela | URL (depois da base) | O que testar |
|---|---|---|
| Casca | qualquer rota abaixo | Barra do Portal, barra do contato, menu lateral (itens, subitens, grupos, rodapé), item ativo e hover; tema claro e escuro |
| Monitoramento | `monitoring` | Filtros rápidos, painel de filtros (Atendentes, Contato com autocompletar, Status, Período com Personalizado e 90 dias), tabela (ticket atribuído +5521999990001 e aguardando +5521999990002), abrir ticket (painel de detalhe), três pontos, Transferir (fila e atendente), Finalizar, Falar com atendente (deve mostrar o aviso padrão) |
| Histórico | `history` | Lista em cartões, filtros, paginação no servidor, abrir detalhe (rota com `@tunnel.msging.net?ticketId=`), Exportar CSV, Enviar por e-mail (lista e PDF de 1 a 20 tickets), seleção múltipla |
| Filas | `queue-management` e `queue-management?fila={id}` | Lista, criar fila, gestão da fila, tags, encerramento automático (interruptor, minutos, alerta, tags), renomear e desativar fila usada por bloco (deve recusar com 409) |
| Atendentes | `team`, `team/create`, `team/edit`, `team/permission` | Lista, Adicionar (seta de voltar sem fundo; "Usar configuração padrão (200 tickets simultâneos)"), Editar, as 10 permissões (3 funcionais, 5 desabilitadas, 2 sem checagem) |
| Regras | `rules` | Lista, criar regra (condições, conector, valor, urgência), editar, excluir, setas de ordem |
| SLA | `sla-policy` | Estado vazio, criar política (metas, filas, padrão), editar, excluir |
| Horários | `attendance-hours` | Lista, criar com descrição, horário regular, período com data e hora, "Dia completo", alerta de exclusão |
| Pausas | `personalizedbreaks` | Vazio, criar pausa (modal), conta como produtivo, excluir |
| Respostas | `replies` | Lista de categorias, criar categoria (modal), detalhe, adicionar resposta de Texto, gravação ao sair do campo, renomear e excluir categoria |
| Templates | `message-template` | Lista paginada, busca e Status, modal "abrir", Fluxo de retorno por linha (escolher bloco), interruptor Ativo |
| Canais | `channels` | Quatro cartões, "Pipe Desk" conectado, os outros desabilitados |
| Configurações gerais | `general-settings` | Gerenciar tags, obrigatoriedade de tags, 12 cartões de preferência (os consumidos habilitados, cada um com Salvar), Modo de Espera, encerramento automático global |
| Relatório de atendimento | `report` | Indicadores, abas Atendentes/Filas/Tags, período (90 dias; mais deve dar erro), baixar CSV; precisa da permissão `relatorio.ver` |
| Esforço | `effort` | Painel de período, tabela, estados de carregamento e erro |
| Satisfação | `survey-dashboard` | Dados gerais, abas, período |
| Dashboards de ligações e vendas | `calls-dashboard`, `sales-dashboard` | Não existem (T-01): confirmar que cai em "não encontrada" ou redireciona |

### Dados de teste no banco de desenvolvimento local

Semeados pelo orquestrador (não por este executor): 2 contatos (+5521999990001 atribuído e +5521999990002 aguardando), 1 canal widget com inbox e 4 mensagens. **Peça a remoção deles ao fim da fase.** Nada foi inserido por mim. Os testes de API criam e apagam os próprios tenants.

## 8. Limpeza e o que fazer antes de publicar

**Fim da fase (local):**
1. Parar a Vite (porta 3110) e a API (porta 3010) que o orquestrador deixou rodando.
2. Remover as linhas semeadas do banco de desenvolvimento (2 contatos, canal widget, inbox, 4 mensagens) e confirmar que não sobrou tenant de teste.
3. Apagar as capturas temporárias que não interessam (imagens brutas ficam fora do Git em `referencias-blip/atendimento/03.2-capturas/`, pasta ignorada pelo Git).
4. Migrações da 03.2 aplicadas só no banco LOCAL: **0086** (fila: etiquetas e encerramento automático), **0087** (alerta de inatividade da conversa), **0088** (horário regular e períodos), **0089** (modelo: bloco de retorno e ativo), **0090** (`tenant.configuracao_atendimento`). São 5, não 7: `0084` e `0085` (03.1) e `0091` (03.1.1, status Blip e ids do ticket) existem no diretório mas não são desta fase; o executor não consultou nem alterou o banco para saber o que está aplicado.

**Antes de publicar (homologação e produção):**
1. Aplicar as migrações 0086 a 0090 (aditivas) com o script de migração do repositório, na ordem, em cada ambiente.
2. Revisar o worker de encerramento automático: agora roda sempre (a variável `PIPE_ENCERRAMENTO_AUTOMATICO` foi retirada, D-C4-02) para filas com a opção ligada e para a configuração global do tenant (a fila vence a global; intervalo de 60 s). Conferir efeito em filas e tenants existentes e o alerta (janela de 24 horas do WhatsApp).
3. Novas checagens de permissão: `relatorio.ver` nos três relatórios (antes sem checagem; conceder aos perfis que já usam), `tenant.configurar` em `settings/attendance`, `resposta_pronta.gerenciar` no vínculo e Ativo do modelo.
4. Tetos de 90 dias: Histórico e os três relatórios recusam período maior (400 `periodo_longo_demais`); revisar integrações ou favoritos que usem períodos maiores.
5. Novas recusas do servidor: mídia (áudio, arquivos, emoji) e transferência conforme as preferências globais (409); `hold_mode_disabled`; modelo inativo recusado no envio, no disparo e no agendamento (409 `template_inativo`); mensagens ativas desligadas recusam o disparo por API.
6. Dependência nova: `pdfkit@0.20.2` (aprovada, Q4-pkg) e `@types/pdfkit` (devDependency, ainda a confirmar, O1-5).
7. Fila padrão: a tela perdeu a opção, a rota e a coluna continuam; horário regular é por tenant.
8. Conferir o lint herdado (`sla.ts:61`, `flow.ts:841`) e a falha `flow-actions.test.ts` com a 03.1 antes de exigir a pipeline verde.

## Resultado

Tarefa 1 do plano 03.2-25 concluída (consolidação da Onda 4, auditoria de ativos, GATE-FINAL.md, suíte completa). A Tarefa 2 (portão do dono) não foi executada.

Status: PENDENTE DE OWNER APPROVED
