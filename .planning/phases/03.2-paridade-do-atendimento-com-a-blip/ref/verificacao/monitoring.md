Base: c57b671e866aee94c48600e3af29ea828f740b35
Tema: claro (cartão cinza-claro e painel `surface-1` sobre conteúdo claro; D-12). O HTML não traz `data-theme`; a captura `.jpg` mostra fundo claro.

# Verificação: barra de botões, detalhe, menu ⋮ e modais do Monitoramento (Blip x Pipe)

**Fonte Blip.** Capturas de 2026-09-30 em `referencias-blip/atendimento/03.2-capturas/` (arquivos `2026-09-30-monitoramento-*`): estrutura (DOM serializado: ordem, rótulos, tooltips, atributos `size`/`width`/`position`) e `.jpg`. Estilos dos componentes lidos no código dos componentes em `referencias-blip/atendimento/attendance-desk-monitoring/supernova.blip.ai/` (ícone, menu suspenso, painel lateral, botão de ícone, tooltip) = [M] (fonte). O HTML salvo não guarda geometria renderizada: onde só há captura de imagem o valor é [A]. Nenhum dado pessoal das capturas foi copiado para o repositório.
**Fonte Pipe.** Coluna "Pipe (antes)" = valores declarados em `attendance.css` e `monitoring-detailed.tsx` na Base. Coluna "Pipe (depois)" = valores declarados após a reescrita. Não houve medição por CDP em nenhuma das duas: o tenant local não tem tickets, então a grade não renderiza linhas e o painel não abre. Toda linha "Pipe" é leitura do CSS e do TSX, não geometria renderizada; por isso nenhuma linha vira VISUALLY VERIFIED nesta rodada (ver `## Lacunas`). A navegação por teclado do menu foi escrita conforme o contrato do plano e não foi exercitada em navegador.

## Estado: lista (barra de botões na coluna Ações)

Blip, aba Atribuído/Em andamento (C-05, C-08 parcial): `Transferir`, `Falar com atendente`, `⋮`. Aba Aguardando atendimento (C-08 parcial, `aba-aguardando-atendimento`): `Transferir`, `Finalizar` (sem ⋮, sem Falar com atendente). Ícones `transfer`, `message-ballon`, `more-options-vertical`, `checkball`, todos tamanho `small` e contorno, numa grade em linha com `gap` 1.

| Elemento | Blip | Pipe (antes) | Pipe (depois) | Status |
|---|---|---|---|---|
| Atribuído: botões e ordem | Transferir, Falar com atendente, ⋮ [M] | mesmos, mas ⋮ era um "+" em círculo | Transferir, Falar com atendente, ⋮ (3 pontos desenhado no Pipe) | NEEDS VALIDATION (C-05, C-08: render) |
| Aguardando: botões e ordem | Transferir, Finalizar [M] | 3 botões iguais ao atribuído | Transferir, Finalizar (círculo com marca desenhado no Pipe) | NEEDS VALIDATION (C-08: render) |
| Tamanho do ícone | 20x20 [M] | 24x24 | 20x20 (`--p-atend-acao-icone`) | NEEDS VALIDATION (C-05: render) |
| Caixa do botão | nenhuma, ícone nu [M] | 40x40, padding 8, raio 8 | alvo 24x24 sem borda nem fundo (`--p-atend-acao-alvo`) | lacuna aprovada pelo plano (alvo mínimo 24x24) |
| Espaço entre ícones | gap 1 da grade, 8px [A] | 16px de ar entre ícones | 8px entre ícones (alvos de 24 com gap 4) | NEEDS VALIDATION (C-05: render) |
| Cor do ícone | texto padrão (neutro) [M, jpg] | #282828 | #282828 (`--mon-text`) | NEEDS VALIDATION (C-05) |
| Tooltip: caixa | raio 8, padding 8, fundo #282828, sombra `0 6px 16px -4px rgba(0,0,0,.16)`, seta 6px [M] | raio 4, padding 6 8, sem sombra, sem seta | raio 8, padding 8, mesma sombra, seta 6px | NEEDS VALIDATION (C-05: render) |
| Tooltip: posição | acima centrada (Transferir, Finalizar), acima à direita (Falar com atendente) [M] | acima centrada em todos | idem à Blip; no painel, abaixo centrada | NEEDS VALIDATION (C-05: render) |
| Tooltip: rótulos | Transferir / Falar com atendente / Finalizar [M] | Transferir / Falar com atendente / Mais opções | Transferir / Falar com atendente / Finalizar (o ⋮ só tem nome acessível) | NEEDS VALIDATION (C-05) |
| Hover, ativo, foco, desabilitado | sem captura [A] | fundo preto 8% / 16%, foco 2px | mantidos | NEEDS VALIDATION (C-05) |
| Alvo mínimo de clique | ícone de 20 (sem caixa) [M] | 40 | 24 | lacuna aprovada pelo plano |
| Célula Contato: ícone de perfil | ícone de pessoa + tooltip "Perfil do contato" [M] | sem ícone | sem ícone | Lacunas |

## Estado: menu três pontos aberto

Só existe no ticket atribuído (C-08 parcial); a aba Aguardando tem Finalizar direto. O ⋮ por linha aparece em 1 tela capturada (Monitoramento); Filas, Atendentes e Histórico usam menu suspenso para outras funções (filtros, enviar), sem ⋮ por linha nas capturas. Decisão D-06: componente inline em `TicketActions`, sem `menu-acoes.tsx` em `@pipe/ui` (o plano manda manter inline quando a Blip usa em uma tela só), com o mesmo contrato de teclado.

| Elemento | Blip | Pipe (antes) | Pipe (depois) | Status |
|---|---|---|---|---|
| Itens | `Finalizar ticket` com ícone de círculo e marca [M] | `Abrir conversa`, `Finalizar` | `Finalizar ticket` com ícone | NEEDS VALIDATION (C-08: render) |
| Posição | à esquerda do gatilho, topo alinhado: `right: calc(100% + 8px); top: 0` [M] | abaixo (`top: 40px; right: 0`) | `right: calc(100% + 8px); top: 0` sobre a âncora do ⋮ | NEEDS VALIDATION (C-08: render) |
| Caixa | fundo branco, padding 2px, raio 8, sombra `0 6px 16px -4px rgba(0,0,0,.16)`, largura mínima 240 [M] | largura 200, padding 4, borda 1px, sombra `0 8px 24px` | largura mínima 240, padding 2, raio 8, mesma sombra (`--p-atend-menu-largura`, `--p-atend-sombra-flutuante`) | NEEDS VALIDATION (C-08: render) |
| Item | ícone + texto, 14px/400, entrelinha 22, padding 16, gap 8 (valores de pesquisa anterior) [A] | idem | idem; ícone de 24 | NEEDS VALIDATION (C-08) |
| Teclado | não verificável no HTML salvo | sem tratamento | setas, Home/End, Esc (devolve o foco ao gatilho), Tab e clique fora fecham; Enter/Espaço escolhem; `aria-haspopup`, `aria-expanded` | NEEDS VALIDATION (C-08: não exercitado em navegador) |

## Estado: detalhe do ticket aberto (painel lateral)

Destino do clique na linha ou no número do ticket: painel lateral à direita (`thread-message-sidebar`, largura 444, fundo `surface-1`). Abas: Atendimento e Informações; ao abrir por Falar com atendente (C-06) entra uma terceira aba `Falar com atendente` entre as duas, com campo "Digite sua mensagem aqui" no rodapé.

| Elemento | Blip | Pipe (antes) | Pipe (depois) | Status |
|---|---|---|---|---|
| Destino | painel lateral à direita [M] | painel lateral à direita | idem | NEEDS VALIDATION (C-05: render) |
| Largura | 444 [M] | 420 | 444 (`--p-atend-ticket-detalhe-largura`) | NEEDS VALIDATION (C-05: render) |
| Fundo | `surface-1` #f6f6f6 [M] | `--p-superficie-0` | `--p-superficie-1`, o mesmo do cartão da grade | NEEDS VALIDATION (C-05: render) |
| Cortina | rgba(0,0,0,.7) [M] | `--p-conteudo` a 70% | idem | NEEDS VALIDATION (C-05) |
| Cabeçalho: padding | 24 [M] | 24 | 24 | NEEDS VALIDATION (C-05: render) |
| Cabeçalho: título | "Ticket #N", 20px bold [M] | 20px/24, peso padrão | 20px/700, entrelinha 28 | NEEDS VALIDATION (C-05) |
| Cabeçalho: subtítulo | "Conversa com {contato}", 14px/400, máx. 260px com reticências [M] | "{contato} · {atendente}" | "Conversa com {contato}", 14px, máx. 260 com reticências | NEEDS VALIDATION (C-05) |
| Cabeçalho: ações | botões de contorno `Transferir ticket` e `Finalizar ticket` (tooltip abaixo) e fechar [M] | só fechar | os três, 40x40, contorno 1px, raio 8 | NEEDS VALIDATION (C-05: render, tamanho do botão [A]) |
| Abas | Atendimento / Informações (+ Falar com atendente) [M] | sem abas | três abas com `role="tablist"` e setas esquerda/direita; sublinhado na ativa | NEEDS VALIDATION (C-05, C-06: render) |
| Informações | "Dados do atendimento"; Nome do contato, Atendente, Fila, Chatbot [M] | não existe | os quatro menos Chatbot | Lacunas (Chatbot) |
| Falar com atendente | aba com campo "Digite sua mensagem aqui" no rodapé [M] | formulário sempre visível | só na aba Falar com atendente, mesmo placeholder; grava pela rota de notas existente | NEEDS VALIDATION (C-06) |
| Histórico de mensagens | horários centrados, eventos de sistema, "Responder" [M, jpg] | balões | balões (inalterado) | NEEDS VALIDATION (C-05) |
| Esc | sem captura | sem tratamento | Esc fecha o painel; foco inicial no painel | NEEDS VALIDATION (C-05) |

## Estado: modal Transferir

C-07 (4 capturas): Fila e Atendente, inicial e lista aberta; nada confirmado.

| Elemento | Blip | Pipe (antes) | Pipe (depois) | Status |
|---|---|---|---|---|
| Estrutura | ilustração à esquerda (gap 5), coluna à direita [M] | coluna única | coluna única | Lacunas (ilustração) |
| Título | "Transferir atendimento do Ticket #N", 20px bold [M] | tamanho do token do relatório | 20px/700, entrelinha 28 | NEEDS VALIDATION (C-07: render) |
| Campos | radios Fila / Atendente (gap 2); seletor "Selecionar fila" / "Selecionar atendente" [M] | radios + seletor com rótulo acima | radios com gap 16 + seletor com os mesmos textos, sem rótulo extra | NEEDS VALIDATION (C-07: render) |
| Opções | fila com "N Disponíveis"; atendente com Disponível/Indisponível [M] | só nome | só nome | Lacunas |
| Botões | Cancelar (secundário) e "Transferir ticket" (primário, desabilitado sem seleção), à direita, gap 8 [M] | idem | idem | NEEDS VALIDATION (C-07) |
| Caixa | padding 32, raio 8 (ficha do modal, [A]) | padding 28, raio `--p-r-lg` | padding 32, raio `--p-r-md` (8) | NEEDS VALIDATION (C-07: render) |
| Aviso | não existe [M] | texto do Pipe | mantido | Lacunas |
| Gravação | rota existente | `/v1/management/monitoring/conversations/:id/transfer` | idem, sem mudança | VISUALLY VERIFIED (código) |

## Estado: modal Finalizar

Sem captura do modal aberto (C-08 parcial: só o menu). Fonte: `FICHA-encerrar-ticket.md` ([A], bundle do Desk).

| Elemento | Blip | Pipe (antes) | Pipe (depois) | Status |
|---|---|---|---|---|
| Título e campos | "Finalizar atendimento do Ticket #N", tags, Cancelar / primário [A, ficha] | cartão de encerramento compartilhado com o Desk | idem | NEEDS VALIDATION (C-08) |
| Foco inicial | n/a | nenhum | "Cancelar" recebe o foco ao abrir (T-03.2-15) | NEEDS VALIDATION (C-08: render; foco não exercitado em navegador) |
| Gravação | rota existente | `.../finalize` com `etiqueta_ids` | idem, sem mudança | VISUALLY VERIFIED (código) |

## Estado: filtros abertos

C-01 a C-04 (`monitoramento-filtro-filas-aberto`, `-filtro-atendentes-aberto`, `-filtro-contato-sem-resultado`, `-filtro-status-atendente-aberto`). **Achado: na Blip os filtros rápidos abrem um painel lateral à direita ("Filtros", aba Nova consulta / Filtros salvos, rodapé com a chave "Criar Filtro Salvo com estes parâmetros", "Limpar tudo" e "Aplicar"), não um popover.** O Pipe já tinha esse painel (`PanelFilters`); o plano previa um popover, e foi mantido o painel por ser o que a captura mostra (ver Desvios no SUMMARY). Não há contador de filtros ativos nas pílulas da Blip (a pílula ativa só muda de estilo), então o contador não foi criado. Medidas só por imagem (.jpg, o HTML salvo não guarda geometria): [A].

| Elemento | Blip | Pipe | Diferença | Status |
|---|---|---|---|---|
| Gatilho | pílulas Filas (faixa de cima); Atendentes, Contato, Status do atendente (faixa de baixo) [M, jpg] | as mesmas quatro, todas com `aria-haspopup="dialog"` e `aria-expanded` | nenhuma de ordem ou rótulo | NEEDS VALIDATION (C-01..C-04: render do Pipe) |
| Destino do clique | painel lateral à direita com os campos da faixa [M, jpg] | Filas abre o painel só com Filas; as outras três abrem o painel com Atendentes, Contato e Status | Blip: Atendentes, Contato e Status também aparecem juntos [M, jpg] | NEEDS VALIDATION (qual pílula recebe o foco na Blip) |
| Campo Filas | rótulo "Filas", apoio "Selecione uma ou mais filas", seleção múltipla, placeholder "Selecione as filas" [M] | idem (chips) | nenhuma | NEEDS VALIDATION (render) |
| Campo Atendentes | "Selecione um ou mais atendentes", "Selecione os atendentes" [M] | idem | nenhuma | NEEDS VALIDATION (render) |
| Campo Contato | busca com placeholder "Digite parte do nome, e-mail ou telefone do contato" [M] | campo de busca com o mesmo placeholder; filtra por nome | Blip busca também e-mail e telefone; a linha do Pipe só traz o nome | Lacunas |
| Campo Status do atendente | "Selecione um status"; opções Online, Em Pausa, Invisível [M] | idem; Invisível mostra "Este recurso será liberado em breve para este fluxo." | opção Invisível sem regra (D-14) | NEEDS VALIDATION (render); DEPENDENCIAS-03.1 |
| Rodapé | chave "Criar Filtro Salvo com estes parâmetros", "Limpar tudo", "Aplicar" [M, jpg] | idem (chave desabilitada com motivo) | nenhuma | NEEDS VALIDATION (render) |
| Teclado | não verificável no HTML salvo | Esc fecha e devolve o foco à pílula; foco preso (Tab e Shift+Tab ciclam); clique na cortina fecha | n/a | NEEDS VALIDATION (não exercitado em navegador) |
| Função | n/a | Filas e Atendentes consultam a API (`queue`, `agent`, validados como UUID); Contato e Status filtram as linhas já carregadas (`matchesListFilters`, testado) | nenhuma mudança na API: o handler não precisou de filtro novo | VISUALLY VERIFIED (código e teste) |
| Largura do painel, espaços e tipografia | sem geometria renderizada nas capturas (HTML sem estilo computado) | `attendance.css` (`.mon-page .panel-side`) | não medido | NEEDS VALIDATION |
| Contato com resultados reais; Atendentes com dois marcados | sem captura (C-02 e C-03 parciais) | n/a | n/a | NEEDS VALIDATION |

## Estado: vazio

Sem captura da Blip (C-17 pendente). Texto do UI-SPEC (§Copywriting), não inventado.

| Elemento | Blip | Pipe | Diferença | Status |
|---|---|---|---|---|
| Sem ticket aberto (abas Atribuído e Aguardando) | sem captura | título "Nenhum atendimento em andamento" e corpo "Quando um cliente pedir atendimento humano, o ticket aparece aqui." (`VazioTickets`) | n/a | NEEDS VALIDATION (C-17) |
| Filtros sem resultado | sem captura da lista (C-03 mostra só o campo Contato sem resultado) | "Nenhum resultado encontrado" e "Ajuste os filtros para ver atendimentos." | n/a | NEEDS VALIDATION (C-17) |
| Geometria da área vazia | sem captura | altura mínima 108 (já existente), conteúdo centrado | n/a | NEEDS VALIDATION |

## Estado: carregando

Sem captura (C-18 pendente).

| Elemento | Blip | Pipe | Diferença | Status |
|---|---|---|---|---|
| Esqueleto | sem captura (a captura do filtro de status mostra um spinner circular sobre a grade durante o recarregamento) [M, jpg] | esqueleto com a geometria final: faixas, quatro cartões, tabela (`MonitoringLoading`), `role="status"`, `aria-busy="true"`, texto para leitor de tela; faixas de filtro e paginação sem ação | Blip usa spinner no recarregamento | NEEDS VALIDATION (C-18) |

## Estado: erro

Sem captura (C-19 pendente).

| Elemento | Blip | Pipe | Diferença | Status |
|---|---|---|---|---|
| Erro de carga | sem captura | "Não foi possível carregar os dados. Verifique a conexão e tente novamente." com "Tentar novamente" chamando `refetch` (`TabelaErro`); a mensagem do servidor não é exibida | n/a | NEEDS VALIDATION (C-19) |

## Estado: Falar com atendente

C-06 (`monitoramento-ticket-falar-com-atendente`): aba "Falar com atendente" entre Atendimento e Informações, campo "Digite sua mensagem aqui" no rodapé do painel lateral.

| Elemento | Blip | Pipe | Diferença | Status |
|---|---|---|---|---|
| Controle e destino | ícone na coluna Ações, abre o painel lateral na aba Falar com atendente [M] | idem (`TicketActions` e `PreviaConversa` em `monitoring-detailed.tsx`) | nenhuma | NEEDS VALIDATION (C-06: render) |
| Campo de mensagem | ativo, envia ao cliente [M, jpg] | campo visível e desabilitado, com "Este recurso será liberado em breve para este fluxo." | o Pipe não envia: depende de presença e sessão do atendente (D-14); antes gravava uma nota interna, que fingia o envio | DEPENDENCIAS-03.1 |
| Gravação | n/a | nenhuma; a rota de notas (`/notes`) continua existindo e não é mais chamada por esta tela | n/a | VISUALLY VERIFIED (código) |

## Cartões do topo

Os quatro cartões de métricas (tempo real, status dos atendentes, atendimento hoje, status dos tickets): o HTML das capturas de 2026-09-30 não guarda geometria renderizada, e o .jpg só permite ver a ordem (Na fila, Tempo máximo na fila, Tempo máximo até 1ª resposta, Em atendimento, Média de tickets por atendente; Atendimento hoje com quatro tempos). Nenhum valor foi medido ou alterado nesta rodada: NEEDS VALIDATION. Reabrir com medição por CDP e dados de teste.

## Navegação

| Clique | Destino Blip (tela/modal/painel + URL) | Destino Pipe | Status |
|---|---|---|---|
| Linha ou número do ticket | painel lateral, abas Atendimento e Informações (C-05) | painel lateral (`ConversationPreview`) | NEEDS VALIDATION (C-05: render) |
| Transferir (linha) | modal Transferir (C-07) | modal Transferir | NEEDS VALIDATION (C-07: render) |
| Falar com atendente | painel lateral com a aba Falar com atendente (C-06) | painel lateral aberto nessa aba, com o aviso de indisponível (D-14) | NEEDS VALIDATION (C-06: render) |
| Pílulas Filas, Atendentes, Contato, Status do atendente | painel lateral Filtros (C-01..C-04) | painel lateral Filtros | NEEDS VALIDATION (render) |
| ⋮ > Finalizar ticket | modal Finalizar | modal Finalizar | NEEDS VALIDATION (C-08) |
| Finalizar (aba Aguardando) | modal Finalizar (sem captura do modal) | modal Finalizar | NEEDS VALIDATION (C-08) |
| Transferir ticket / Finalizar ticket (cabeçalho do painel) | modal Transferir / modal Finalizar | os mesmos modais, sobre o painel | NEEDS VALIDATION (C-05) |

## Lacunas

- Nenhuma linha acima é VISUALLY VERIFIED: sem tickets no tenant local não há render do Pipe para medir com CDP. Reabrir com dados de teste.
- Ilustração do modal Transferir: arte da Blip, não copiada (D-05). Desenhar a do Pipe exige decisão do dono.
- Sublinhas de disponibilidade nas opções de fila e atendente: o contrato de API não define "disponível"; fica para a 03.1.
- Aviso "A transferência encerra este ticket..." é texto do Pipe sem equivalente na Blip; mantido por descrever o comportamento real da rota de transferência.
- Campo Chatbot em Informações: a API de prévia não devolve o chatbot; fica para a 03.1.
- Ícone de perfil na célula Contato: fora do escopo desta barra.
- Ícones de transferir, finalizar e 3 pontos são desenhados no Pipe e não são cópia dos da Blip; a semelhança de traço só se confirma no render.
- Hover, ativo, foco e desabilitado dos ícones, tamanho do botão de contorno do painel e histórico de mensagens, sem captura: NEEDS VALIDATION.
- O ícone de Falar com atendente usa o desenho já existente `comunicacao` do portal (herdado de antes deste plano).
- Filtros rápidos: a Blip abre painel lateral, não popover (C-01..C-04); mantido o painel. Contador de filtros ativos nas pílulas não existe na Blip e não foi criado.
- Contato: a Blip busca por nome, e-mail e telefone; o Pipe filtra só por nome (a linha da lista não traz e-mail nem telefone).
- Vazio, carregando e erro (C-17..C-19) e cartões do topo: sem captura ou sem geometria; textos do UI-SPEC, medidas NEEDS VALIDATION.
- Falar com atendente não envia mensagem (D-14); tudo que sobra depende da 03.1.

## Correção B2: tabela das abas (D-T01 h)

Fonte Blip: `monitoramento-tabela-blip.md` (medido ao vivo em 2026-10-01 [M]). Pipe: código e CSS (`monitoring-detailed.tsx`, `attendance.css`); sem render medido em Chrome headless nesta correção (não houve sessão autorizada para abrir a tela autenticada), por isso nenhuma linha abaixo é VISUALLY VERIFIED.

| Elemento | Blip | Pipe | Diferença | Status |
|---|---|---|---|---|
| Bloco da tabela | fundo #ffffff, raio 8, borda 1px rgba(0,0,0,.06) [M] | `.mon-detalhado .scroll`: `--p-superficie-0`, `--p-r-md`, borda `--p-atend-tabela-borda` (rgba(0,0,0,.06)) | 0 no código | NEEDS VALIDATION (render) |
| Colunas | largura igual (~165,6 em 1327) [M] | `table-layout: fixed` sem largura por coluna | 0 no código | NEEDS VALIDATION (render) |
| Célula | padding `0 8px 0 16px`, 14px `#282828`, linha 48,9 e cabeçalho 48,4 [M] | `0 8px 0 16px`, 14px, linha 49 e cabeçalho 48 | 0 | NEEDS VALIDATION (render) |
| Alinhamento | tempos e Ticket centralizados; Contato, Fila e Atendente à esquerda [M] | `th.ctr` e `td.num` centralizados; demais à esquerda | 0 | NEEDS VALIDATION (render) |
| Ticket | texto simples "#27", sem botão [M] | continua `<button>` (acesso por teclado) sem aparência de botão e sem sublinhado | semântica mantida de propósito | NEEDS VALIDATION (render) |
| Contato | ícone de pessoa 16x16 + nome [M] | `Icone pessoa` 16 + nome | 0 | NEEDS VALIDATION (render) |
| Ações | ícones 20x20 sem caixa [M] | ícone 20 (`--p-atend-acao-icone`), alvo de clique 24 transparente | alvo de 24 mantido para clique e foco | NEEDS VALIDATION (render) |
| Aba Aguardando: prioridade | texto ("Sem prioridade") [M] | texto de `LABELS_PRIORITY` | 0 | NEEDS VALIDATION (render) |
| Aba Aguardando: ações | transferir e assumir (check no círculo) [M] | transferir e finalizar | DIVERGE: não existe "assumir" no Pipe; pendente do dono | DIVERGE |
| Aba Aguardando: Atendente | "Transferência direta" quando houve transferência para atendente [M] | atendente ou traço | DIVERGE: sem dado de transferência direta | DIVERGE |
| Tempo de atendimento sem 1ª resposta | não visto na captura (nenhuma linha destacada) | traço (antes "Aguardando...") | a medir | NEEDS VALIDATION |
| Abas e colunas | Atribuído/Em andamento, Aguardando atendimento, Atendentes, Filas, Tags com as colunas de `monitoramento-tabela-blip.md` [M] | mesmas colunas e ordem | 0 | NEEDS VALIDATION (render) |
| Legenda amarela | só na aba Atribuído [A] | `tbl-legenda` só na aba Atribuído | 0 | NEEDS VALIDATION (render) |
