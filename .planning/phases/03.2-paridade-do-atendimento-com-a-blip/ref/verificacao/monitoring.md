Base: 4024f5e7357171b7d226bdf138a889f7f0404cdf
Tema: claro (cartão cinza-claro e painel `surface-1` sobre conteúdo claro; D-12). O HTML não traz `data-theme`; a captura `.jpg` mostra fundo claro.

# Verificação: barra de botões, detalhe, menu ⋮ e modais do Monitoramento (Blip x Pipe)

**Fonte Blip.** Capturas de 2026-09-30 em `referencias-blip/atendimento/03.2-capturas/` (arquivos `2026-09-30-monitoramento-*`): estrutura (DOM serializado: ordem, rótulos, tooltips, atributos `size`/`width`/`position`) e `.jpg`. Estilos dos componentes lidos no código dos componentes em `referencias-blip/atendimento/attendance-desk-monitoring/supernova.blip.ai/` (`bds-icon`, `bds-dropdown`, `bds-sidebar`, `bds-button-icon`, tooltip) = [M] (fonte). O HTML salvo não guarda geometria renderizada: onde só há captura de imagem o valor é [A]. Nenhum dado pessoal das capturas foi copiado para o repositório.
**Fonte Pipe (antes).** Valores declarados em `attendance.css` e `monitoring-detailed.tsx` na Base. Não houve medição por CDP: o tenant local não tem tickets, então as linhas da grade não renderizam. Toda linha "Pipe" é leitura do CSS, não geometria renderizada; por isso nenhuma linha vira VISUALLY VERIFIED nesta rodada (ver `## Lacunas`).

## Estado: lista (barra de botões na coluna Ações)

Blip, aba Atribuído/Em andamento (C-05, C-08 parcial): `Transferir`, `Falar com atendente`, `⋮`. Aba Aguardando atendimento (C-08 parcial, `aba-aguardando-atendimento`): `Transferir`, `Finalizar` (sem ⋮, sem Falar com atendente). Ícones `transfer`, `message-ballon`, `more-options-vertical`, `checkball`, todos `size="small"` e `theme="outline"`, em `bds-grid direction=row gap=1 align-items=center`.

| Elemento | Blip | Pipe | Diferença | Status |
|---|---|---|---|---|
| Atribuído: botões e ordem | Transferir, Falar com atendente, ⋮ [M] | Transferir, Falar com atendente, ⋮ (ícone `mais` = "+" em círculo) | ícone do ⋮ errado | DIVERGE |
| Aguardando: botões e ordem | Transferir, Finalizar [M] | Transferir, Falar com atendente, ⋮ | 3 botões x 2; ícone de Finalizar ausente | DIVERGE |
| Tamanho do ícone | 20x20 (`bds-icon--small`) [M] | 24x24 | +4 | DIVERGE |
| Caixa do botão | nenhuma, ícone nu [M] | 40x40, padding 8, raio 8 | +20 | DIVERGE |
| Espaço entre ícones | gap 1 do `bds-grid` (8px) [A] | 0 (caixas de 40 encostadas, 16 de ar entre ícones) | 8 x 16 | DIVERGE |
| Cor do ícone | texto padrão (neutro) [M, jpg] | `--mon-text` #282828 | 0 | NEEDS VALIDATION (C-05) |
| Tooltip: caixa | raio 8, padding 8, fundo #282828, sombra `0 6px 16px -4px rgba(0,0,0,.16)`, seta de 6px [M] | raio 4, padding 6 8, sem sombra, sem seta | raio, padding, sombra, seta | DIVERGE |
| Tooltip: posição | `top-center` (Transferir, Finalizar), `top-right` (Falar com atendente) [M] | acima, centrada em todos | Falar com atendente | DIVERGE |
| Tooltip: rótulos | Transferir / Falar com atendente / Finalizar [M] | Transferir / Falar com atendente / Mais opções | trocar "Mais opções" por Finalizar na aba Aguardando | DIVERGE |
| Estados hover/ativo/foco | sem captura [A] | fundo preto 8% / 16%, foco 2px | não medido | NEEDS VALIDATION (C-05) |
| Estado desabilitado | sem captura | não existe | n/a | NEEDS VALIDATION (C-05) |
| Alvo mínimo de clique | ícone de 20 (sem caixa) [M] | 40 | Pipe usa 24x24 mínimo por acessibilidade (decisão deste plano) | lacuna aprovada pelo plano |
| Célula Contato: ícone de perfil | `user-default` x-small + tooltip "Perfil do contato" [M] | sem ícone | fora do escopo desta barra | Lacunas |

## Estado: menu três pontos aberto

Só existe no ticket atribuído (C-08 parcial). Menu do ticket aguardando não existe na Blip (a aba tem Finalizar direto). O ⋮ aparece em 1 tela capturada (Monitoramento); Filas, Atendentes e Histórico usam `bds-dropdown` para outras funções (filtros, enviar), sem ⋮ por linha nas capturas. Decisão D-06: componente inline em `TicketActions`, sem `menu-acoes.tsx` em `@pipe/ui`.

| Elemento | Blip | Pipe | Diferença | Status |
|---|---|---|---|---|
| Itens | `Finalizar ticket` (ícone `checkball`) [M] | `Abrir conversa`, `Finalizar` | item extra; rótulo e ícone | DIVERGE |
| Posição | `right-top`: `right: calc(100% + 8px); top: 0` [M] | abaixo (`top: 40px; right: 0`) | abre à esquerda, na altura do gatilho | DIVERGE |
| Caixa | fundo branco (`surface-0`), padding 2px, raio 8, sombra `0 6px 16px -4px rgba(0,0,0,.16)`, largura mínima 240 [M] | largura 200, padding 4, borda 1px, sombra `0 8px 24px` | 4 propriedades | DIVERGE |
| Item | ícone + texto, 14px/400, entrelinha 22, padding 16, gap 8 (valores já registrados em pesquisa anterior) [A] | idem | 0 | NEEDS VALIDATION (C-08) |
| Teclado | não verificável no HTML salvo | Esc fecha no clique fora? não (sem tratamento) | falta setas, Home/End, Esc, clique fora e retorno de foco | DIVERGE |
| Esc / clique fora / foco | `outzone` fixa cobre a tela; clique fora fecha [M] | clique fora não fecha | | DIVERGE |

## Estado: detalhe do ticket aberto (painel lateral)

Destino do clique na linha ou no número do ticket: `bds-sidebar` (`sidebar-position=right`, `type=over`, `width=444`, `background=surface-1`), id `thread-message-sidebar`. Abas: Atendimento e Informações; ao abrir por Falar com atendente (C-06) entra uma terceira aba `Falar com atendente` entre as duas, com campo "Digite sua mensagem aqui" no rodapé.

| Elemento | Blip | Pipe | Diferença | Status |
|---|---|---|---|---|
| Destino | painel lateral à direita [M] | painel lateral à direita | 0 | VISUALLY VERIFIED (estrutura, C-05) |
| Largura | 444 [M] | 420 | -24 | DIVERGE |
| Fundo | `surface-1` #f6f6f6 [M] | `--p-superficie-0` | tom | DIVERGE |
| Cortina | rgba(0,0,0,.7) [M] | `--p-conteudo` a 70% | 0 | NEEDS VALIDATION (C-05) |
| Cabeçalho: padding | 24 [M] | 24 | 0 | NEEDS VALIDATION (C-05) |
| Cabeçalho: título | "Ticket #N", 20px bold [M] | "Ticket #N", 20px/24 | peso | DIVERGE |
| Cabeçalho: subtítulo | "Conversa com {contato}", 14px/400, máx. 260px com reticências [M] | "{contato} · {atendente}" | texto | DIVERGE |
| Cabeçalho: ações | dois botões outline `medium`: `Transferir ticket`, `Finalizar ticket`, tooltip embaixo; depois fechar [M] | só fechar | faltam 2 botões | DIVERGE |
| Abas | Atendimento / Informações (+ Falar com atendente se aberto por ele) [M] | sem abas | | DIVERGE |
| Informações | "Dados do atendimento"; Nome do contato, Atendente, Fila, Chatbot [M] | não existe | Chatbot não vem da API | DIVERGE (ver Lacunas) |
| Falar com atendente | aba com campo "Digite sua mensagem aqui" no rodapé [M] | formulário sempre visível, rótulo "Falar com atendente" | | DIVERGE |
| Histórico de mensagens | horários centrados, eventos de sistema, ações "Responder" [M, jpg] | balões | não medido | NEEDS VALIDATION (C-05) |

## Estado: modal Transferir

C-07 (4 capturas): Fila e Atendente, inicial e lista aberta; nada confirmado.

| Elemento | Blip | Pipe | Diferença | Status |
|---|---|---|---|---|
| Estrutura | `bds-modal` dynamic: ilustração `paper-plane` à esquerda (gap 5), coluna à direita [M] | coluna única, sem ilustração | ilustração (arte da Blip, não copiada) | Lacunas |
| Título | "Transferir atendimento do Ticket #N", 20px bold [M] | h2 "Transferir atendimento do Ticket N" | peso/tamanho | DIVERGE |
| Campos | radios Fila / Atendente (gap 2); autocomplete "Selecionar fila" / "Selecionar atendente" [M] | radios + Select com os mesmos rótulos | 0 em texto | NEEDS VALIDATION (C-07) |
| Opções | fila com "N Disponíveis"; atendente com Disponível/Indisponível [M] | só nome | sublinha ausente | Lacunas |
| Botões | Cancelar (secondary) e "Transferir ticket" (primary, desabilitado sem seleção), à direita, gap 1 [M] | idem | 0 | NEEDS VALIDATION (C-07) |
| Aviso | não existe [M] | "A transferência encerra este ticket e cria um novo no destino." | texto extra do Pipe | Lacunas |

## Estado: modal Finalizar

Sem captura do modal aberto (C-08 parcial: só o menu). Fonte: `FICHA-encerrar-ticket.md` ([A], bundle do Desk).

| Elemento | Blip | Pipe | Diferença | Status |
|---|---|---|---|---|
| Título e campos | "Finalizar atendimento do Ticket #N", tags, botões Cancelar / primário [A, ficha] | `CardClosureTicket` (mesmo cartão do Desk) | não medido no Monitoramento | NEEDS VALIDATION (C-08) |
| Foco inicial | n/a | "Cancelar" não recebe foco | exigência T-03.2-15 | DIVERGE |

## Navegação

| Clique | Destino Blip (tela/modal/painel + URL) | Destino Pipe | Status |
|---|---|---|---|
| Linha ou número do ticket | painel lateral `thread-message-sidebar`, abas Atendimento e Informações (C-05) | painel lateral (`ConversationPreview`) | VISUALLY VERIFIED (destino) |
| Transferir (linha) | modal Transferir (C-07) | modal Transferir | VISUALLY VERIFIED (destino) |
| Falar com atendente | painel lateral com aba Falar com atendente (C-06) | painel lateral | DIVERGE (sem a aba) |
| ⋮ > Finalizar ticket | modal Finalizar | modal Finalizar | NEEDS VALIDATION (C-08) |
| Finalizar (aba Aguardando) | modal Finalizar (sem captura do modal) | não existe o botão | DIVERGE |
| Botões do painel (Transferir ticket / Finalizar ticket) | modais acima | não existem | DIVERGE |

## Lacunas

- Ilustração `paper-plane` do modal Transferir: arte da Blip, não copiada (D-05). Desenhar a do Pipe exige decisão do dono.
- Sublinhas de disponibilidade nas opções de fila e atendente: o contrato de API não define "disponível"; fica para a 03.1.
- Aviso "A transferência encerra este ticket..." é texto do Pipe sem equivalente na Blip; mantido por descrever o comportamento real da rota `/transfer`.
- Campo Chatbot em Informações: a API de prévia não devolve o chatbot; fica para a 03.1.
- Ícone de perfil na célula Contato: fora do escopo desta barra.
- Estados hover, ativo, foco e desabilitado dos ícones, e o histórico de mensagens, sem captura: NEEDS VALIDATION.
