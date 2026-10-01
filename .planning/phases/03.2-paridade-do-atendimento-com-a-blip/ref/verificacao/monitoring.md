Base: 4024f5e7357171b7d226bdf138a889f7f0404cdf
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

## Navegação

| Clique | Destino Blip (tela/modal/painel + URL) | Destino Pipe | Status |
|---|---|---|---|
| Linha ou número do ticket | painel lateral, abas Atendimento e Informações (C-05) | painel lateral (`ConversationPreview`) | NEEDS VALIDATION (C-05: render) |
| Transferir (linha) | modal Transferir (C-07) | modal Transferir | NEEDS VALIDATION (C-07: render) |
| Falar com atendente | painel lateral com a aba Falar com atendente (C-06) | painel lateral aberto nessa aba | NEEDS VALIDATION (C-06: render) |
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
