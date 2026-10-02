# Lacunas da Onda 0 (casca, paginação, tblwrap)

**Origem:** `ref/verificacao/casca.md`, `paginacao.md` e `tblwrap.md`, consolidadas em `VERIFICACAO-VISUAL.md` (`## Onda 0`).
**Aprovação:** a coluna "Aprovada pelo dono" fica vazia até o portão visual (Tarefa 3 do plano 03.2-05). Exceção: Q5, decidida em 2026-09-30.

| ID | Lacuna | Origem | Proposta | Aprovada pelo dono |
|---|---|---|---|---|
| L-01 | Avatar do contrato 40x40 contra 32x32 na barra do Portal (nome 8px à direita) | casca.md | Corrigir junto com a verificação do Portal (barra compartilhada) | 2026-09-30 (portão Onda 0: aprovada a proposta) |
| L-02 | Nome do bot 8px à direita na barra do contato | casca.md | `margin-left` de 15px menos o padding, verificando o Builder junto | 2026-09-30 (portão Onda 0: aprovada a proposta) |
| L-03 | Largura útil da lateral 19px maior (a Blip tem barra de rolagem própria de 20px) | casca.md | Mudaria a arquitetura de rolagem da casca; manter como diferença | 2026-09-30 (portão Onda 0: aprovada a proposta) |
| L-04 | Item "Dados" extra em Preferências | casca.md | Divergência deliberada, mantida | 2026-09-30 (portão Onda 0: aprovada a proposta) |
| L-05 | Família tipográfica: IBM Plex Sans no Pipe, Nunito Sans na Blip | Q5 | Manter IBM Plex Sans | 2026-09-30 (Q5) |
| L-06 | Neutros quentes da marca no lugar dos cinzas da Blip (N1) e cores azuladas do plano e do módulo inativo | casca.md, tblwrap.md, paginacao.md | Manter neutros da marca, se o dono aceitar como troca de paleta | 2026-09-30 (portão Onda 0: aprovada a proposta) |
| L-07 | Grupo Comunicação: 144px no Pipe contra 165px na captura da Blip | casca.md | Nova captura da Blip para conferir o elemento a mais | 2026-09-30 (portão Onda 0: aprovada a proposta) |
| L-08 | Paginação da grade sem render com dados | paginacao.md | Medir quando houver ticket no Monitoramento ou membro na Equipe | n/a (correção ou medição futura, não é lacuna aceita) |
| L-09 | Divergências da paginação da lista (seletor 50,4px, contador no meio, ícone 16px, botão desabilitado) | paginacao.md | Correção em 03.2-07 (não é lacuna aceita) | n/a (correção ou medição futura, não é lacuna aceita) |
| L-10 | Raio, borda e fundo do cabeçalho da tabela `tblwrap` | tblwrap.md | Correção em 03.2-08 (não é lacuna aceita) | n/a (correção ou medição futura, não é lacuna aceita) |

# Lacunas da Onda 1 (Monitoramento, Histórico, Filas, Atendentes)

**Origem:** `ref/verificacao/monitoring.md`, `history.md`, `queue-management.md` e `team.md`, e os itens "Pendentes para o dono" de `03.2-09-SUMMARY.md` a `03.2-15-SUMMARY.md`. Consolidadas em `VERIFICACAO-VISUAL.md` (`## Onda 1`, com as perguntas ao dono). A coluna "Aprovada pelo dono" fica vazia até o portão da Onda 1 (Tarefa 2 do plano 03.2-16).

| ID | Lacuna | Origem | Proposta | Aprovada pelo dono |
|---|---|---|---|---|
| L-11 | Botões de ação do Monitoramento com alvo de 24x24 (a Blip tem ícone nu de 20x20, sem caixa) | monitoring.md | Manter o alvo mínimo de 24x24 (aprovado pelo plano) | 2026-10-01 (portão da Onda 1: aprovada a proposta, após correções A a C4) |
| L-12 | Sublinhas de disponibilidade nas opções do modal Transferir e campo Chatbot em Informações do ticket | monitoring.md | Depende da 03.1 (API não define "disponível" nem devolve o chatbot) | 2026-10-01 (portão da Onda 1: aprovada a proposta, após correções A a C4) |
| L-13 | Ilustração do modal Transferir (arte da Blip, não copiada) | monitoring.md, 03.2-09 | Desenhar arte própria do Pipe, se o dono quiser | 2026-10-01 (portão da Onda 1: aprovada a proposta, após correções A a C4) |
| L-14 | Falar com atendente não envia mensagem; opção de status Invisível sem regra | monitoring.md, 03.2-10 | Depende da 03.1 (presença e sessão do atendente); aviso "Este recurso será liberado em breve para este fluxo." mantido | 2026-10-01 (portão da Onda 1: aprovada a proposta, após correções A a C4) |
| L-15 | Filtro Contato do Monitoramento busca só por nome; a Blip busca por nome, e-mail e telefone | monitoring.md, 03.2-10 | Depende de dado na linha da lista (e-mail e telefone) | 2026-10-01 (portão da Onda 1: aprovada a proposta, após correções A a C4) |
| L-16 | Qual pílula (Atendentes, Contato ou Status) recebe o foco no painel de filtros da Blip | 03.2-10 | Conferir na Blip e igualar | 2026-10-01 (portão da Onda 1: aprovada a proposta, após correções A a C4) |
| L-17 | Itens retirados do cartão do Histórico por não existirem na Blip: Encerrada, Fila, selo de status (e destaque de "Perdida"), etiquetas | history.md, 03.2-11 | Manter fora do cartão (continuam no CSV) ou devolver algum | 2026-10-01 (portão da Onda 1: aprovada a proposta, após correções A a C4) |
| L-18 | Item extra "Baixar planilha (.csv)" no menu "Enviar por e-mail" (não existe na Blip) | history.md, 03.2-13 | Manter ou retirar | 2026-10-01 (portão da Onda 1: aprovada a proposta, após correções A a C4) |
| L-19 | A Blip aceita destinatário fora do tenant? Permissão para exportar por e-mail. Hoje só usuários do tenant | history.md, 03.2-12, 03.2-13 | Manter o filtro conservador até haver evidência | 2026-10-01 (portão da Onda 1: aprovada a proposta, após correções A a C4) |
| L-20 | `@types/pdfkit@^0.17.6` como devDependency (sem checkpoint próprio); aparência do PDF e texto do e-mail não decididos; sem auditoria da exportação | 03.2-12 | Confirmar o pacote de tipos; decidir aparência, texto e auditoria | 2026-10-01 (portão da Onda 1: aprovada a proposta, após correções A a C4) |
| L-21 | Ilustrações e ícones do menu e dos modais de e-mail (CSV e PDF); rótulo flutuante do campo Email; caixa de 520px contra ~690px [A] | history.md, 03.2-13 | Arte própria do Pipe; medir antes de mexer na largura | 2026-10-01 (portão da Onda 1: aprovada a proposta, após correções A a C4) |
| L-22 | Histórico: exceção a `apis.md` §5.3 (offset em vez de cursor); leitura do detalhe depende da permissão `monitoramento.tempo_real.ver` (a rota `GET history` não pede permissão); detalhe dentro da casca, não sem a barra lateral | 03.2-11 | Aceitar a exceção; decidir rota própria do Histórico e a casca do detalhe | 2026-10-01 (portão da Onda 1: aprovada a proposta, após correções A a C4) |
| L-23 | Cartão "Dados da fila" (cor, capacidade padrão, ordem, horário, "Ativa") existe só no Pipe | queue-management.md, 03.2-14 | Manter, ou mover a configuração para outro lugar | 2026-10-01 (portão da Onda 1: aprovada a proposta, após correções A a C4) |
| L-24 | Seleção em lote de atendentes da fila (caixas e "Selecionar todos") sem ação, porque a captura não mostra qual ação habilita | queue-management.md, 03.2-14 | Capturar a ação na Blip e implementar | 2026-10-01 (portão da Onda 1: aprovada a proposta, após correções A a C4) |
| L-25 | Ilustração do modal "Criar nova fila" (arte própria) | queue-management.md, 03.2-14 | Desenhar arte própria, se o dono quiser | 2026-10-01 (portão da Onda 1: aprovada a proposta, após correções A a C4) |
| L-26 | Tags da fila e Encerramento automático por inatividade desabilitados | queue-management.md, 03.2-14 | Construir a regra na 03.1 e capturar a parte inferior da gestão | 2026-10-01 (portão da Onda 1: aprovada a proposta, após correções A a C4) |
| L-27 | Lista de Atendentes sem medida da Blip (spinner em três tentativas) e sem spinner no Pipe; vazio e erro sem captura | team.md, 03.2-15 | Medir com a lista carregada; capturar vazio e erro | 2026-10-01 (portão da Onda 1: aprovada a proposta, após correções A a C4) |
| L-28 | E-mail de pessoa sem conta no Pipe ao adicionar atendente é recusado ("Sem cadastro neste Pipe: ... Convide a pessoa em Contrato antes de adicionar.") | team.md, 03.2-15 | Manter a recusa com orientação, ou criar o convite nesta tela | 2026-10-01 (portão da Onda 1: aprovada a proposta, após correções A a C4) |
| L-29 | Tickets simultâneos em Adicionar: a Blip cita "Blip Desk" e 200 por padrão; o Pipe usa "padrão" sem número | team.md | Manter a copy sem o nome Blip | 2026-10-01 (portão da Onda 1: aprovada a proposta, após correções A a C4) |
| L-30 | Permissões: a Blip lista dez próprias (ligações, links de pagamento, pastas etc.); o Pipe mostra o catálogo que as rotas checam | team.md, 03.2-15 | Manter o catálogo do Pipe, ou ampliar com as da Blip | 2026-10-01 (portão da Onda 1: aprovada a proposta, após correções A a C4) |
| L-31 | Clique na linha do atendente (fora dos ícones) e confirmação de remover da Blip não capturados; validação do e-mail, Salvar sem fila e destino pós-salvar não medidos | team.md, 03.2-15 | Capturar e igualar | 2026-10-01 (portão da Onda 1: aprovada a proposta, após correções A a C4) |
| L-32 | Detalhe do ticket do Histórico sem dados do contato, lista de tickets do contato e eventos | history.md, 03.2-11 | Depende da 03.1 (API de contato) | 2026-10-01 (portão da Onda 1: aprovada a proposta, após correções A a C4) |
| L-33 | Filtros do Histórico sem chips e multisseleção, sem e-mail e telefone no Contato e sem filtros salvos | history.md | Depende de contrato de API novo | 2026-10-01 (portão da Onda 1: aprovada a proposta, após correções A a C4) |
| L-34 | Geometria sem render nas telas da Onda 1 (tenant local sem tickets, conversas encerradas e atendentes carregados) | monitoring.md, history.md, queue-management.md, team.md | Medir por CDP com dados de teste | 2026-10-01 (portão da Onda 1: aprovada a proposta, após correções A a C4) |

# Lacunas da Onda 2 (Regras, SLA, Horários, Pausas)

**Origem:** `ref/verificacao/rules.md`, `sla-policy.md`, `attendance-hours.md` e `personalizedbreaks.md`, os itens "Decisões do dono pendentes" de `03.2-17-SUMMARY.md` e `03.2-18-SUMMARY.md` e os "Pendentes" de `03.2-16-CORRECOES-C5-SUMMARY.md`. Consolidadas em `VERIFICACAO-VISUAL.md` (`## Onda 2`, com as perguntas ao dono). A coluna "Aprovada pelo dono" fica vazia até o portão da Onda 2 (Tarefa 2 do plano 03.2-19).

| ID | Lacuna | Origem | Proposta | Aprovada pelo dono |
|---|---|---|---|---|
| L-35 | Regras: valor em chips (vários valores por condição); o Pipe grava um texto por condição | rules.md, 03.2-17 | Decidir modelo de dados e motor | |
| L-36 | Regras: conector E/OU por grupo adicional; o Pipe grava um combinador por regra | rules.md, 03.2-17 | Decidir modelo e motor | |
| L-37 | Regras: setas de ordem e rodapé do cartão não existem na Blip; a ordem decide qual regra casa primeiro | rules.md, 03.2-17 | Manter ou retirar | |
| L-38 | Regras: mensagem "Ops! Este campo precisa ser preenchido" no nome; o Pipe só desabilita Salvar | rules.md | Igualar | |
| L-39 | Regras: fila desativada aparece como "(desativada)" na seleção; a Blip não foi observada nesse caso | rules.md | Conferir na Blip | |
| L-40 | SLA: política guardada como linhas `regra_sla` com o mesmo nome (renomear renomeia todas); alternativa é tabela própria (migração não autorizada) | sla-policy.md, 03.2-17 | Manter ou evoluir com migração | |
| L-41 | SLA: "Padrão" e filas ao mesmo tempo (o Pipe aceita as duas); duas políticas na mesma meta e escopo (o servidor recusa); a Blip não foi observada | sla-policy.md, 03.2-17 | Decidir e validar | |
| L-42 | SLA: lista com regras e edição não vistas na Blip (o bot de desenvolvimento não tinha regra); montadas pela ficha e pelo padrão de Regras | sla-policy.md | Validar com bot que tenha regras de SLA | |
| L-43 | SLA: alerta e ação de estouro por linha existem só no Pipe (linhas antigas continuam valendo); SLA como regra (indicadores e alerta) depende da 03.1 | sla-policy.md, DEPENDENCIAS-03.1.md | Manter; regra na 03.1 | |
| L-44 | Ilustrações do vazio de SLA, do vazio de Pausas e do modal de Pausas (arte própria; a lista compartilhada hoje não aceita ilustração) | sla-policy.md, personalizedbreaks.md, 03.2-17, 03.2-18 | Desenhar arte própria, se o dono quiser | |
| L-45 | Horários: descrição, interruptor e chip "Horário regular" (migração 0088 aplicada no banco local) | 03.2-18-CORRECOES-D-SUMMARY.md | Resolvida em 2026-10-01 (D-H01/D-H02): implementada, aguardando validação visual | |
| L-46 | Horários: período com data e hora de início e de fim, "Dia completo" (migração 0088) | 03.2-18-CORRECOES-D-SUMMARY.md | Resolvida em 2026-10-01 (D-H01/D-H02): implementada, aguardando validação visual | |
| L-47 | Horários: alerta de exclusão com o texto da Blip quando há horário regular; sem regular diz 24 horas | 03.2-18-CORRECOES-D-SUMMARY.md | Resolvida em 2026-10-01 (D-H01/D-H02): implementada, aguardando validação visual | |
| L-48 | Horários x Builder: fila sem horário usa o horário regular em `OutOfAttendanceHour`; sem regular, 24 horas. Pendente do dono: relógio de SLA (não usa horário hoje) | 03.2-18-CORRECOES-D-SUMMARY.md | Resolvida em 2026-10-01 (D-H01/D-H02): implementada, aguardando validação visual | |
| L-49 | Pausas: "Conta como produtivo" existe só no Pipe (grava e alimenta o relatório de esforço) | personalizedbreaks.md, 03.2-18 | Manter ou retirar | |
| L-50 | Pausas: sem edição na tela (a ficha não tem lápis); o servidor aceita PATCH (ativar, desativar, produtivo) | personalizedbreaks.md, 03.2-18 | Manter ou oferecer edição | |
| L-51 | Pausas: duração mínima (a Blip aceita 0 no campo; o Pipe exige 1) e mensagens de validação da Blip não observadas | personalizedbreaks.md, 03.2-18 | Confirmar na Blip e igualar | |
| L-52 | Pausas: lista com pausas, colunas reais, ordenação e confirmação de exclusão da Blip não capturadas (o bot não tem pausas; criar uma gravaria) | personalizedbreaks.md | Capturar quando houver pausa de teste | |
| L-53 | Regras, SLA, Horários e Pausas: geometria, tipografia, tema escuro e larguras medidas (Regras 300/298/684/1302; SLA cartão 1402, campo 671, unidade 155) sem render no Pipe; cartão `#f6f6f6` da Blip x token de cartão do Pipe | rules.md, sla-policy.md, attendance-hours.md, personalizedbreaks.md | Medir por CDP com dados de teste; token só se divergir além de 1px | |
| L-54 | Integração com o Builder: tela de CRUD de etiquetas; seletores de fila e etiqueta no Builder; futuro do painel de filas do Builder; mensagem de encerramento no encerramento automático | 03.2-16-CORRECOES-C5-SUMMARY.md, INTEGRACAO-BUILDER.md | Decidir cada um | |

# Lacunas da Onda 3 (Respostas, Modelos, Canais, Configurações gerais)

**Origem:** `ref/verificacao/replies.md`, `message-template.md`, `channels.md` e `general-settings.md`, os itens "Decisões do dono pendentes" de `03.2-20-SUMMARY.md` e "Itens pendentes do dono" de `03.2-21-SUMMARY.md`. Consolidadas em `VERIFICACAO-VISUAL.md` (`## Onda 3`, com as perguntas ao dono). A coluna "Aprovada pelo dono" fica vazia até o portão da Onda 3 (Tarefa 2 do plano 03.2-22).

| ID | Lacuna | Origem | Proposta | Aprovada pelo dono |
|---|---|---|---|---|
| L-55 | Modelos: "Fluxo de retorno" (coluna e filtro) e Status (interruptor) desabilitados; `template_mensagem` não tem `fluxo_retorno_bloco_id` nem `ativo` (migração não autorizada); impacto no Builder: listar blocos do fluxo do canal, validar fluxo e tenant, avisar bloco removido | message-template.md, 03.2-20 | Autorizar a migração (a) e implementar | |
| L-56 | Respostas: sem tabela de categoria (a nova e vazia só vive na tela até a primeira resposta); 13 dos 14 tipos de resposta desabilitados (sem modelo de conteúdo estruturado) | replies.md, 03.2-20 | Autorizar tabela de categoria e modelo de conteúdo | |
| L-57 | Ilustração do modal "Criar nova categoria" (arte própria) | replies.md, 03.2-20 | Desenhar arte própria, se o dono quiser | |
| L-58 | Modelos: formulário de criar modelo (cria na Meta) mantido abaixo da lista; a Blip cria modelos em Conteúdos | message-template.md, 03.2-20 | Manter ou mover | |
| L-59 | Respostas: atalho `#` na tela x `/` do compositor do Desk; interruptor Ativa e campo de atalho existem só no Pipe | replies.md, 03.2-20 | Decidir o atalho | |
| L-60 | Modelos: rodapé e botões do WhatsApp não aparecem na prévia (bug da 03.1) | message-template.md, DEPENDENCIAS-03.1.md | Corrigir na 03.1 | |
| L-61 | Canais: Salesforce, Salesforce MIAW e Canal Personalizado sem integração (botões desabilitados); "Pipe Desk" sem desconectar; fluxo de conexão da Blip não medido | channels.md, 03.2-21 | Decidir se o Pipe Desk desconecta; integrações ficam fora | |
| L-62 | Configurações gerais: 12 preferências globais, encerramento automático global e interruptor do Modo de Espera desabilitados; sem onde gravar (`tenant.configuracao_atendimento jsonb`, migração não autorizada); precedência prevista: a fila vence a global | general-settings.md, 03.2-21 | Autorizar a migração (b) e implementar leitura no motor, no Desk e no worker | |
| L-63 | Configurações gerais: lista de tags da fila (`fila.etiquetas`) à parte do catálogo global; obrigatoriedade global ("pelo menos uma tag") da Blip x tags obrigatórias específicas do Pipe | general-settings.md, 03.2-21 | Unificar e adotar a regra da Blip, ou manter | |
| L-64 | `etiqueta.exclusiva_por_fila` sem edição na tela; renomear tag é remover e criar (só sem conversa etiquetada) | general-settings.md, 03.2-21 | Decidir | |
| L-65 | Respostas, Modelos, Canais e Configurações gerais: geometria, tipografia, tema escuro e larguras medidas (cartão 1401,9 x 86; canais 343 x 270; interruptor 56 x 32 da Blip x 38 x 22 do Pipe; cartão `#f6f6f6` x fundo branco do Pipe) sem render no Pipe | replies.md, channels.md, general-settings.md | Medir por CDP com dados de teste; token só se divergir além de 1px | |
| L-66 | Configurações gerais: textos de cartões não capturados na íntegra (por exemplo Envio de áudios, Emojis) escritos de forma neutra; vazio, carregando e erro das quatro telas sem captura da Blip | general-settings.md, 03.2-21 | Conferir na Blip | |

# Lacunas da Onda 4 (Relatórios, Esforço, Satisfação, dashboards)

**Origem:** `ref/verificacao/report.md`, `effort.md`, `survey-dashboard.md`, `03.2-23-SUMMARY.md` e `03.2-24-SUMMARY.md`. A captura ao vivo da Blip falhou em 2026-10-02 (sessão expirada): nenhuma medida nova. Coluna do dono vazia.

| ID | Lacuna | Origem | Proposta | Aprovada pelo dono |
|---|---|---|---|---|
| L-67 | Relatório de atendimento: geometria, fórmulas dos indicadores, filtros Canal, Tag, Pesquisas, Tipos de avaliação e Contato, formato da exportação e paginação sem medida da Blip; sem consulta no Pipe para SLA agregado, tempo máximo, Abertos, série diária e Disponibilidade (vazio honesto) | report.md, 03.2-23 | Capturar ao vivo com sessão válida; construir as consultas só se o dono quiser | |
| L-68 | Esforço: não há captura de tela de esforço na Blip; não se sabe se a tela existe nem como ela é | effort.md, FICHA-relatorio-esforco | Capturar ao vivo; se não existir na Blip, o dono decide manter ou remover | |
| L-69 | Satisfação: sem gráficos (pizza, barras, série), sem os filtros Pesquisas, Tipos de avaliação, Atendentes, Filas e Contato; fórmulas de média, taxa de resposta, NPS e CSAT da Blip desconhecidas; exportar e configurar pesquisa não confirmados | survey-dashboard.md, 03.2-23 | Capturar ao vivo; aplicar `--p-grafico-*` e filtros depois | |
| L-70 | Teto de 90 dias nos três relatórios aplicado por regra do dono (Histórico), sem o limite da Blip observado; atalhos 120 e 180 dias do `FieldPeriod` x teto de 90 | report.md, effort.md, survey-dashboard.md, 03.2-16-CORRECOES-B2 | Manter 90 dias; decidir os atalhos 120 e 180 | |
| L-71 | Dashboards de ligações e vendas: sem rota e sem tela (Q6); R-04 manda criar as rotas; tensão T-01 | 03.2-24, DECISOES-DONO.md | (a) rotas com placeholder de dependência ou (b) sem rota, divergência deliberada | |
| L-72 | Cartão único (D-06): `Metrica` compartilhada, `CardConfig` e `pages/flow/cards.tsx` fora da unificação; nenhum token `--p-atend-*` novo (sem medida divergente) | report.md, 03.2-23 | Unificar só com medida ao vivo | |
| L-73 | Relatórios: vazio, carregando e erro das três telas sem captura da Blip; fila padrão no eixo "Filas" (conversa sem fila = "Sem fila"; ligação com o fallback do motor não verificada) | 03.2-23 | Capturar ao vivo; conferir o fallback | |
