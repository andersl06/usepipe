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
