# Capturas pendentes para o dono (D-09, D-10)

Itens pendentes não bloqueiam a onda: o estado fica NEEDS VALIDATION até a captura chegar (plano 03.2-04).

Tentativa de captura ao vivo em 2026-09-30: nenhuma ferramenta de navegador conectada a uma aba logada em `supernova.blip.ai` estava disponível para o executor; a automação de navegador já falhou duas vezes (D-09). Nada foi capturado; todos os itens abaixo seguem pendentes. Regra de leitura: só abrir popover, menu ou modal; nunca confirmar, salvar, transferir, finalizar, enviar e-mail nem exportar. Salvar em `C:/Users/anderson.linhares/pipe/referencias-blip/atendimento/03.2-capturas/{AAAA-MM-DD}-{tela}-{estado}.{png,html}` (fora do Git). Origem: `referencias-blip/pesquisa/pendencias-referencia-atendimento.md` (itens dos estados abertos) mais os estados vazio/carregando/erro das telas sem captura.

| ID | Tela | Estado | Passo a passo na Blip | Enviar | Bloqueia |
|---|---|---|---|---|---|
| C-01 | Monitoramento | Filtro rápido Filas aberto | Atendimento > Monitoramento > clicar em Filas (popover aberto, sem confirmar nada) | screenshot + HTML (Salvar página como, completa) | 09, 10 |
| C-02 | Monitoramento | Filtro rápido Atendentes aberto, antes e depois de marcar dois atendentes | Monitoramento > Atendentes; capturar aberto e com dois marcados | screenshot + HTML (Salvar página como, completa) | 10 |
| C-03 | Monitoramento | Filtro rápido Contato com resultados | Monitoramento > Contato; digitar parte de um nome e capturar os resultados (registrar se busca ao digitar ou ao confirmar) | screenshot + HTML (Salvar página como, completa) | 10 |
| C-04 | Monitoramento | Filtro rápido Status do atendente aberto (Online, Pausa, Invisível) | Monitoramento > Status do atendente; capturar com as opções abertas | screenshot + HTML (Salvar página como, completa) | 10 |
| C-05 | Monitoramento | Ticket aberto (barra do ticket/painel) | Monitoramento > clicar no número de um ticket | screenshot + HTML (Salvar página como, completa) | 09 |
| C-06 | Monitoramento | Falar com atendente | Com o ticket aberto, clicar em Falar com atendente (sem enviar mensagem) | screenshot + HTML (Salvar página como, completa) | 10 |
| C-07 | Monitoramento | Transferir (cada etapa: escolha de fila, escolha de atendente, estados desabilitados) | Clicar em Transferir num ticket; abrir as escolhas de fila e de atendente; capturar cada etapa; NÃO confirmar a transferência | screenshot + HTML (Salvar página como, completa) | 09, 10 |
| C-08 | Monitoramento | Menu de três pontos em ticket aguardando e em ticket atribuído | Abrir o menu nos dois tipos de ticket; capturar cada menu; não clicar em nenhuma opção | screenshot + HTML (Salvar página como, completa) | 09 |
| C-09 | Histórico | Histórico com resultados (lista, rodapé e paginação) | Atendimento > Histórico num período com tickets; capturar a lista inteira e o rodapé | screenshot + HTML (Salvar página como, completa) | 11 |
| C-10 | Histórico | Detalhe do ticket | No Histórico, clicar na seta de um cartão; capturar o estado resultante | screenshot + HTML (Salvar página como, completa) | 11 |
| C-11 | Histórico | Filtros rápidos abertos: IDs dos tickets, Atendentes, Tags | Abrir cada uma das três pílulas; incluir seleção múltipla em Atendentes e Tags, se existir | screenshot + HTML (Salvar página como, completa) | 11 |
| C-12 | Histórico | Enviar por e-mail (todas as etapas: seleção, validação, confirmação, erro) | Selecionar um ticket e clicar em Enviar por e-mail; capturar cada etapa; NÃO concluir o envio | screenshot + HTML (Salvar página como, completa) | 12, 13 |
| C-13 | Histórico | Exportar CSV (modal e termos de uso) | Abrir o modal Exportar CSV; capturar cada etapa; NÃO exportar | screenshot + HTML (Salvar página como, completa) | 12, 13 |
| C-14 | Histórico | Exportar PDF (modal e termos de uso) | Abrir o modal Exportar PDF; capturar cada etapa; NÃO exportar | screenshot + HTML (Salvar página como, completa) | 12, 13 |
| C-15 | Filas | Gestão da fila aberta (editar/criar fila) | Filas > clicar numa fila (ou em Nova fila); capturar a tela de gestão inteira; não salvar | screenshot + HTML (Salvar página como, completa) | 14 |
| C-16 | Atendentes | Gestão do atendente aberta (criar, editar, permissões) | Atendentes > Novo, Editar e Permissões; capturar cada tela; não salvar | screenshot + HTML (Salvar página como, completa) | 15 |
| C-17 | Monitoramento | Estado vazio | Abrir a tela Monitoramento em condição de sem dados; capturar | screenshot + HTML (Salvar página como, completa) | 09, 10 |
| C-18 | Monitoramento | Estado carregando | Abrir a tela Monitoramento em condição de carregamento (throttling de rede no DevTools, só leitura); capturar | screenshot + HTML (Salvar página como, completa) | 09, 10 |
| C-19 | Monitoramento | Estado erro | Abrir a tela Monitoramento em condição de falha de carregamento (ex.: desconectar a rede, só leitura); capturar | screenshot + HTML (Salvar página como, completa) | 09, 10 |
| C-20 | Histórico | Estado carregando | Abrir a tela Histórico em condição de carregamento (throttling de rede no DevTools, só leitura); capturar | screenshot + HTML (Salvar página como, completa) | 11 |
| C-21 | Histórico | Estado erro | Abrir a tela Histórico em condição de falha de carregamento (ex.: desconectar a rede, só leitura); capturar | screenshot + HTML (Salvar página como, completa) | 11 |
| C-22 | Filas | Estado vazio | Abrir a tela Filas em condição de sem dados; capturar | screenshot + HTML (Salvar página como, completa) | 14 |
| C-23 | Filas | Estado carregando | Abrir a tela Filas em condição de carregamento (throttling de rede no DevTools, só leitura); capturar | screenshot + HTML (Salvar página como, completa) | 14 |
| C-24 | Filas | Estado erro | Abrir a tela Filas em condição de falha de carregamento (ex.: desconectar a rede, só leitura); capturar | screenshot + HTML (Salvar página como, completa) | 14 |
| C-25 | Atendentes | Estado vazio | Abrir a tela Atendentes em condição de sem dados; capturar | screenshot + HTML (Salvar página como, completa) | 15 |
| C-26 | Atendentes | Estado carregando | Abrir a tela Atendentes em condição de carregamento (throttling de rede no DevTools, só leitura); capturar | screenshot + HTML (Salvar página como, completa) | 15 |
| C-27 | Atendentes | Estado erro | Abrir a tela Atendentes em condição de falha de carregamento (ex.: desconectar a rede, só leitura); capturar | screenshot + HTML (Salvar página como, completa) | 15 |
| C-28 | Regras | Estado vazio | Abrir a tela Regras em condição de sem dados; capturar | screenshot + HTML (Salvar página como, completa) | 17 |
| C-29 | Regras | Estado carregando | Abrir a tela Regras em condição de carregamento (throttling de rede no DevTools, só leitura); capturar | screenshot + HTML (Salvar página como, completa) | 17 |
| C-30 | Regras | Estado erro | Abrir a tela Regras em condição de falha de carregamento (ex.: desconectar a rede, só leitura); capturar | screenshot + HTML (Salvar página como, completa) | 17 |
| C-31 | SLA | Estado vazio | Abrir a tela SLA em condição de sem dados; capturar | screenshot + HTML (Salvar página como, completa) | 17 |
| C-32 | SLA | Estado carregando | Abrir a tela SLA em condição de carregamento (throttling de rede no DevTools, só leitura); capturar | screenshot + HTML (Salvar página como, completa) | 17 |
| C-33 | SLA | Estado erro | Abrir a tela SLA em condição de falha de carregamento (ex.: desconectar a rede, só leitura); capturar | screenshot + HTML (Salvar página como, completa) | 17 |
| C-34 | Horários | Estado vazio | Abrir a tela Horários em condição de sem dados; capturar | screenshot + HTML (Salvar página como, completa) | 18 |
| C-35 | Horários | Estado carregando | Abrir a tela Horários em condição de carregamento (throttling de rede no DevTools, só leitura); capturar | screenshot + HTML (Salvar página como, completa) | 18 |
| C-36 | Horários | Estado erro | Abrir a tela Horários em condição de falha de carregamento (ex.: desconectar a rede, só leitura); capturar | screenshot + HTML (Salvar página como, completa) | 18 |
| C-37 | Pausas | Estado vazio | Abrir a tela Pausas em condição de sem dados; capturar | screenshot + HTML (Salvar página como, completa) | 18 |
| C-38 | Pausas | Estado carregando | Abrir a tela Pausas em condição de carregamento (throttling de rede no DevTools, só leitura); capturar | screenshot + HTML (Salvar página como, completa) | 18 |
| C-39 | Pausas | Estado erro | Abrir a tela Pausas em condição de falha de carregamento (ex.: desconectar a rede, só leitura); capturar | screenshot + HTML (Salvar página como, completa) | 18 |
| C-40 | Respostas | Estado vazio | Abrir a tela Respostas em condição de sem dados; capturar | screenshot + HTML (Salvar página como, completa) | 20 |
| C-41 | Respostas | Estado carregando | Abrir a tela Respostas em condição de carregamento (throttling de rede no DevTools, só leitura); capturar | screenshot + HTML (Salvar página como, completa) | 20 |
| C-42 | Respostas | Estado erro | Abrir a tela Respostas em condição de falha de carregamento (ex.: desconectar a rede, só leitura); capturar | screenshot + HTML (Salvar página como, completa) | 20 |
| C-43 | Templates | Estado vazio | Abrir a tela Templates em condição de sem dados; capturar | screenshot + HTML (Salvar página como, completa) | 20 |
| C-44 | Templates | Estado carregando | Abrir a tela Templates em condição de carregamento (throttling de rede no DevTools, só leitura); capturar | screenshot + HTML (Salvar página como, completa) | 20 |
| C-45 | Templates | Estado erro | Abrir a tela Templates em condição de falha de carregamento (ex.: desconectar a rede, só leitura); capturar | screenshot + HTML (Salvar página como, completa) | 20 |
| C-46 | Canais | Estado vazio | Abrir a tela Canais em condição de sem dados; capturar | screenshot + HTML (Salvar página como, completa) | 21 |
| C-47 | Canais | Estado carregando | Abrir a tela Canais em condição de carregamento (throttling de rede no DevTools, só leitura); capturar | screenshot + HTML (Salvar página como, completa) | 21 |
| C-48 | Canais | Estado erro | Abrir a tela Canais em condição de falha de carregamento (ex.: desconectar a rede, só leitura); capturar | screenshot + HTML (Salvar página como, completa) | 21 |
| C-49 | Configurações gerais | Estado vazio | Abrir a tela Configurações gerais em condição de sem dados; capturar | screenshot + HTML (Salvar página como, completa) | 21 |
| C-50 | Configurações gerais | Estado carregando | Abrir a tela Configurações gerais em condição de carregamento (throttling de rede no DevTools, só leitura); capturar | screenshot + HTML (Salvar página como, completa) | 21 |
| C-51 | Configurações gerais | Estado erro | Abrir a tela Configurações gerais em condição de falha de carregamento (ex.: desconectar a rede, só leitura); capturar | screenshot + HTML (Salvar página como, completa) | 21 |
| C-52 | Relatórios (report, effort, survey-dashboard) | Estado vazio | Abrir a tela Relatórios (report, effort, survey-dashboard) em condição de sem dados; capturar | screenshot + HTML (Salvar página como, completa) | 23 |
| C-53 | Relatórios (report, effort, survey-dashboard) | Estado carregando | Abrir a tela Relatórios (report, effort, survey-dashboard) em condição de carregamento (throttling de rede no DevTools, só leitura); capturar | screenshot + HTML (Salvar página como, completa) | 23 |
| C-54 | Relatórios (report, effort, survey-dashboard) | Estado erro | Abrir a tela Relatórios (report, effort, survey-dashboard) em condição de falha de carregamento (ex.: desconectar a rede, só leitura); capturar | screenshot + HTML (Salvar página como, completa) | 23 |
| C-55 | Dashboards calls e sales | Estado vazio | Abrir a tela Dashboards calls e sales em condição de sem dados; capturar | screenshot + HTML (Salvar página como, completa) | 24 |
| C-56 | Dashboards calls e sales | Estado carregando | Abrir a tela Dashboards calls e sales em condição de carregamento (throttling de rede no DevTools, só leitura); capturar | screenshot + HTML (Salvar página como, completa) | 24 |
| C-57 | Dashboards calls e sales | Estado erro | Abrir a tela Dashboards calls e sales em condição de falha de carregamento (ex.: desconectar a rede, só leitura); capturar | screenshot + HTML (Salvar página como, completa) | 24 |
