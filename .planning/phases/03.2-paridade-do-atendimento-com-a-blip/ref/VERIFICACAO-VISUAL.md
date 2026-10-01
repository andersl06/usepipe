# Verificação visual lado a lado: Atendimento Blip x Atendimento Pipe

**Tolerância:** 1px (decisão do dono Q1, 2026-09-30; ver `METODO.md` e `DECISOES-DONO.md`).
**Fonte das linhas:** `ref/verificacao/casca.md`, `ref/verificacao/paginacao.md` e `ref/verificacao/tblwrap.md` (cada uma com `Base:` e as medidas completas). Aqui ficam só as linhas que decidem o portão; o detalhe está nos arquivos de origem.
**Tipografia (Q5):** a Blip usa Nunito Sans; o Pipe usa IBM Plex Sans. O dono decidiu manter IBM Plex Sans (lacuna aprovada, `LACUNAS-APROVADAS.md`). A tabela do Monitoramento já resolve Nunito Sans por sobrescrita própria.
**Regra de status:** a de `METODO.md`. Linha com diferença de até 1px passa a contar como dentro da tolerância; as marcadas "(Q1)" nos arquivos de origem entram nessa regra.

## Onda 0

| Tela/estado | Medidas Blip | Medidas Pipe | Diferenças | Status |
|---|---|---|---|---|
| Casca: barra do Portal (altura, plano) | 80px; plano 12px/400, y=43 [M] | 80px; plano 12px/400, y=43 | 0; cor azulada da Blip x branco 64% | NEEDS VALIDATION (cor) |
| Casca: barra do Portal (avatar do contrato) | 32x32 em (32,24) [M] | 40x40 em (32,20) | +8 x +8, -4 y | Lacuna L-01 |
| Casca: barra do contato (altura, ícone do bot) | 56px; ícone 36x36 em (40,90) [M] | 56px; 36x36 em (40,90) | 0 | VISUALLY VERIFIED |
| Casca: barra do contato (nome do bot) | x=91 [M] | x=99 | +8 | Lacuna L-02 |
| Casca: Atendimento selecionado (caixa, texto, sublinhado) | 56px, padding 0 20px, 131,78px; `::before` 4px rgb(63,125,232) [M] | 56px, padding 0 20px, 131,8px; `::before` 4px musgo | 0; azul->verde | VISUALLY VERIFIED |
| Casca: fundos das barras (rgb(20,20,20) e rgb(40,40,40)) | cinzas da Blip [M] | neutros quentes da marca (N1) | tom do neutro | NEEDS VALIDATION |
| Casca: desk-sidebar (posição x, largura, fundo, recuo, topo) | x=0, 262px, branco, recuo 16, y=152 [M] | x=0 (corrigido), 262px, branco, recuo 16, y=152 | 0 | VISUALLY VERIFIED |
| Casca: desk-sidebar (largura útil do item/subitem/rodapé) | 210 / 173 / 242px (com barra de rolagem de 20px) [M] | 229 / 192 / 261px | +19 | Lacuna L-03 |
| Casca: item (altura, padding, raio, ícone, gap, passo) | 42 / 8 / 8; ícone 24; gap 8; passo 50 [M] | idênticos | 0 | VISUALLY VERIFIED |
| Casca: item ativo (ícone, fundo, borda, hover) | ícone azul; fundo cinza 8% [M]; borda e hover não medidos | `--p-marca`; `--p-marca-suave`; borda/hover tinta | azul->verde; cinza 8% x verde suave; sem medida | NEEDS VALIDATION |
| Casca: subitem (altura, início, padding, rótulo, raio, passo) | 39; x=53; 8; x=62; 8; passo 47 [M] | idênticos após correção | 0 | VISUALLY VERIFIED |
| Casca: subitem ativo (barra) | 2 x 21,33, x=38 [M] | 2 x 21, x=39, `--p-marca` | -0,33 de altura e +1 de x: dentro de 1px; azul->verde | VISUALLY VERIFIED |
| Casca: grupos (Relatórios 238, Regras 191) | 238px; 191px [M] | 238px; 191px | 0 | VISUALLY VERIFIED |
| Casca: grupo Comunicação (2 filhos) | 165px [M] | 144px | -21 (captura da Blip parece ter um elemento a mais) | NEEDS VALIDATION (captura pendente) |
| Casca: primeiro filho abaixo do cabeçalho | 7px [M] | 8px | +1 (dentro de 1px) | VISUALLY VERIFIED |
| Casca: grupo Preferências | 2 filhos [M] | 3 filhos (+ Dados) | +1 item | Lacuna L-04 (divergência deliberada) |
| Casca: rodapé da lateral (altura, padding, posição) | 72 / 24; fim do conteúdo [M] | 72 / 24; base = base da casca | 0 | VISUALLY VERIFIED |
| Paginação grade (monitoring-detailed): rodapé, seletor, botões | margem 10px; seletor 74px; botões 40x40 ícone 24; gap 8px; sem estado desabilitado [M] | sem render com dados (CSS-fonte: margem 16px, contador centralizado, 50% de navegação) | margem +6; estrutura diferente | NEEDS VALIDATION (sem render) |
| Paginação lista (lista-regras): altura, rótulo, padding, botões 40x40 | 40px; 14px/400; 8px 4px 8px 12px; 40x40 raio 8 [M] | iguais | 0 | VISUALLY VERIFIED |
| Paginação lista: seletor, contador, ícone, desabilitado | seletor 74px; contador colado à navegação (mr4 20px); ícone 24; sem desabilitado [M] | seletor 50,4px; contador no meio (x=650); ícone 16; `opacity: 0.4` | -23,6; posição; -8; estado extra | DIVERGE (correção em 03.2-07) |
| Paginação portal (`pages/portal.tsx`) | `bds-pagination` do Portal (outra família) [M] | `.pt-pagination` | várias, fora do escopo | DIVERGE (fora do escopo; não alterar) |
| Paginação: skins grade x lista | uma aparência só; margem 10px (grade) ou 20px (lista) [M] | duas skins | colapsar em uma (Q3, decisão do dono) | Decidido: colapsar em 03.2-07 |
| tblwrap: cartão (fundo, padding, raio, borda) | rgb(246,246,246); 20px; 16px; sem borda [M] | rgb(246,246,245); 20px; 16px; 0 | <1 por canal | VISUALLY VERIFIED |
| tblwrap: cabeçalho (altura, fonte, caixa, letter-spacing) | 48px; 14px/600 lh 21; sem caixa alta [M] | iguais | 0 | VISUALLY VERIFIED |
| tblwrap: raio e borda da tabela | 8px; 1px rgba(0,0,0,0.06) [M] | 0; 0 | -8; -1 | DIVERGE (correção em 03.2-08) |
| tblwrap: fundo do cabeçalho | herda #f6f6f6 [M] | branco | branco x cinza-claro | DIVERGE (correção em 03.2-08) |
| tblwrap: fio entre linhas, estado vazio | 0,889px rgba(0,0,0,0.16); "Dados insuficientes" [M] | 1px rgba(0,0,0,0.16); célula 108,5px | 0 em px físico; altura do vazio sem medida | VISUALLY VERIFIED (fio); NEEDS VALIDATION (vazio) |
| tblwrap: linha do corpo (49px) e padding das demais células | 49px; 0 8px [M] | sem linha de dado | sem medida | NEEDS VALIDATION |

## Portão visual (Tarefa 3 do plano 03.2-05)

Pendente do dono: comparar a casca lado a lado e dizer "aprovada" ou "corrigir" para cada lacuna de `LACUNAS-APROVADAS.md`. Ver `03.2-05-SUMMARY.md` (status partial).

## Onda 1

**Fonte das linhas:** `ref/verificacao/monitoring.md`, `history.md`, `queue-management.md`, `team.md`, `paginacao.md` e `tblwrap.md` (cada uma com `Base:` e as medidas completas). Aqui ficam só as linhas que decidem o portão. Quase tudo é leitura de CSS e TSX, não geometria renderizada: o tenant local não tem tickets, conversas encerradas nem atendentes carregados, e as capturas da Blip de 2026-09-30 não guardam estilo computado. Por isso as linhas de geometria ficam NEEDS VALIDATION; VISUALLY VERIFIED aqui vale para texto, estrutura, código e testes. As contagens de cada resumo são linhas de tabela do arquivo de origem que citam o status (incluem as tabelas "antes" e "depois").

### Perguntas ao dono

Cada item vem dos resumos 03.2-09 a 03.2-15 e de `ref/verificacao/*.md`; as lacunas correspondentes estão em `LACUNAS-APROVADAS.md` (L-11 a L-34).

1. Filas: manter ou remover o cartão "Dados da fila" (cor, capacidade, ordem, horário, "Ativa"), que não existe na Blip? Se manter, onde colocar? (L-23)
2. Filas e Atendentes: que ação a seleção em lote de atendentes da fila habilita? Hoje a seleção existe sem ação. (L-24)
3. Histórico: manter ou remover o item "Baixar planilha (.csv)" do menu "Enviar por e-mail" (não existe na Blip)? (L-18)
4. Histórico: a Blip aceita enviar para e-mail fora do tenant? Hoje o Pipe só envia para usuários do tenant. Permissão para exportar por e-mail. (L-19)
5. API: confirmar `@types/pdfkit@^0.17.6` como devDependency (o `pdfkit@0.20.2` já foi aprovado). Aparência do PDF e texto do e-mail. (L-20)
6. Atendentes: e-mail sem conta no Pipe ao adicionar atendente: manter a recusa com orientação ("Convide a pessoa em Contrato") ou criar o convite nesta tela? (L-28)
7. Atendentes: permissões próprias da Blip (dez) x catálogo do Pipe (o que as rotas checam): o catálogo ganha as da Blip? (L-30)
8. Modais (Transferir, Criar nova fila, Enviar por e-mail CSV e PDF): ilustrações; arte própria do Pipe, não copiar a da Blip. (L-13, L-21, L-25)
9. Monitoramento: busca de contato por e-mail e telefone (a linha do Pipe só traz o nome). (L-15)
10. Monitoramento: qual pílula (Atendentes, Contato ou Status) recebe o foco no painel de filtros da Blip? (L-16)
11. Filas: Tags da fila e Encerramento automático por inatividade: construir a regra (hoje dependência da 03.1)? (L-26)
12. Histórico: algum item retirado do cartão deve voltar (Encerrada, Fila, selo de status e destaque de "Perdida", etiquetas)? (L-17)
13. Histórico: aceitar a exceção a `apis.md` §5.3 (paginação por offset em vez de cursor)? Criar rota própria de leitura do Histórico (hoje o detalhe exige `monitoramento.tempo_real.ver`)? Detalhe com ou sem a barra lateral do atendimento? (L-22)
14. Auditoria: registrar a exportação por e-mail? (L-20)

### Monitoramento (`ref/verificacao/monitoring.md`)

| Tela/estado | Medidas Blip | Medidas Pipe | Diferenças | Status |
|---|---|---|---|---|
| Lista: barra de botões (Atribuído: Transferir, Falar com atendente, ⋮; Aguardando: Transferir, Finalizar) | ícone 20x20 sem caixa, gap 8px, tooltip raio 8 / padding 8 / seta 6px [M, A] | declarado: ícone 20x20, alvo 24x24, gap 8px, tooltip igual (CSS, sem render) | alvo mínimo 24 (aprovado pelo plano); hover, foco e desabilitado sem captura | NEEDS VALIDATION (C-05, C-08 parcial) |
| Menu ⋮ aberto | `Finalizar ticket`; à esquerda do gatilho, mín. 240, padding 2, raio 8 [M] | declarado igual; teclado (setas, Home/End, Esc, Tab) escrito, não exercitado em navegador | só existe no ticket atribuído | NEEDS VALIDATION (C-08 parcial) |
| Detalhe do ticket (painel lateral) | 444px, fundo `surface-1`, abas Atendimento / Informações (+ Falar com atendente), cabeçalho 24 [M] | declarado: 444px, `--p-superficie-1`, três abas, ações no cabeçalho | falta o campo Chatbot (03.1) | NEEDS VALIDATION (C-05, C-06) |
| Modal Transferir | título 20px bold, padding 32, raio 8, radios Fila/Atendente [M] | declarado igual, coluna única | sem ilustração; sem sublinhas de disponibilidade (03.1) | NEEDS VALIDATION (C-07); lacuna (ilustração) |
| Modal Finalizar | sem captura do modal; ficha do bundle [A] | cartão de encerramento compartilhado; foco inicial em "Cancelar" | n/a | NEEDS VALIDATION (C-08) |
| Filtros rápidos abertos | painel lateral "Filtros" (não popover) [M, jpg] | `PanelFilters` mantido; Esc, foco preso e foco devolvido | Contato só por nome; Invisível sem regra (03.1) | NEEDS VALIDATION (C-01..C-04; C-02 e C-03 parciais) |
| Falar com atendente | aba com campo "Digite sua mensagem aqui" ativo [M, jpg] | campo desabilitado com aviso (D-14) | não envia mensagem (03.1) | NEEDS VALIDATION (C-06); 03.1 |
| Vazio, carregando, erro | sem captura | textos do UI-SPEC; esqueleto e "Tentar novamente" | n/a | NEEDS VALIDATION (C-17..C-19) |
| Cartões do topo | só a ordem no jpg | não medidos | n/a | NEEDS VALIDATION |
| Resumo | 78 linhas de tabela no arquivo: 4 VISUALLY VERIFIED (gravação e função, por código e teste), 54 NEEDS VALIDATION, 8 com lacuna ou divergência | | | |

### Histórico (`ref/verificacao/history.md`)

| Tela/estado | Medidas Blip | Medidas Pipe | Diferenças | Status |
|---|---|---|---|---|
| Lista de cartões | cartão `surface-1`; campos Ticket, Atendente, Contato, três tempos [M]; altura ~90 [A] | declarado: min-height 88, padding 20, raio 16, gap 8 | itens retirados do cartão; larguras das colunas por casar | NEEDS VALIDATION |
| Rodapé de paginação | seletor com 100, abre para cima [M] | `Pagination layout="grade"`, 100 por página, página no servidor | consulta SQL não exercitada contra Postgres | NEEDS VALIDATION; testes de API passam |
| Vazio | "Nenhum resultado encontrado" + texto da ficha [M] | mesmo texto, "Redefinir filtros" | ilustração própria | VISUALLY VERIFIED (texto); NEEDS VALIDATION (render) |
| Carregando, erro | sem captura (C-20, C-21) | textos do UI-SPEC | n/a | NEEDS VALIDATION |
| Filtros abertos | Período, IDs, Atendentes, Tags, Filas, Contato [M] | mesmos campos; filtrados no servidor | sem chips nem multisseleção; sem filtros salvos | NEEDS VALIDATION; lacunas (contrato de API) |
| Detalhe do ticket | nova aba, página própria do contato (C-10) | nova aba dentro da casca | sem dados do contato nem lista de tickets (03.1) | lacuna |
| Enviar por e-mail: menu | botão único; itens "Lista de tickets" e "Histórico de conversas (.pdf)"; ~190px [A] | mesmos itens, 360px; item extra "Baixar planilha (.csv)" | ícones dos itens ausentes | NEEDS VALIDATION (C-12 parcial) |
| Modais CSV e PDF | caixa ~690px [A], rótulo flutuante, ilustração, termo | 520px, rótulo acima, sem ilustração | termo sem captura | NEEDS VALIDATION (C-13, C-14 parciais) |
| Envio com erro e sucesso | sem captura | texto do Pipe | n/a | NEEDS VALIDATION (C-12) |
| Resumo | 66 linhas de tabela: 3 VISUALLY VERIFIED (texto e navegação), 34 NEEDS VALIDATION, 12 com lacuna ou divergência | | | |

### Filas (`ref/verificacao/queue-management.md`)

| Tela/estado | Medidas Blip | Medidas Pipe | Diferenças | Status |
|---|---|---|---|---|
| Lista | texto e ordem [M]; nenhuma medida em pixel | leitura do código | ações na ordem lápis, lixeira, interruptor | NEEDS VALIDATION (C-15 parcial) |
| Vazio, carregando, erro | sem captura (C-22..C-24) | vazio do UI-SPEC; carregando sem tela (`return null`) | n/a | NEEDS VALIDATION |
| Gestão da fila | seis cartões [M] | Atendentes, Regras de Atendimento e Priorização, "Dados da fila" (só Pipe) | Tags e Encerramento automático desabilitados (03.1); seleção sem ação | NEEDS VALIDATION; pergunta ao dono |
| Criar nova fila | modal com ilustração [M] | modal sem ilustração | ilustração própria | NEEDS VALIDATION (C-15) |
| Excluir fila | sem captura | texto do UI-SPEC, foco em "Cancelar" | n/a | NEEDS VALIDATION |
| Resumo | 29 linhas de tabela: 0 VISUALLY VERIFIED, 21 NEEDS VALIDATION; nenhuma medida em pixel | | | |

### Atendentes (`ref/verificacao/team.md`)

| Tela/estado | Medidas Blip | Medidas Pipe | Diferenças | Status |
|---|---|---|---|---|
| Lista | não medida (spinner em três tentativas) | leitura do código | spinner de carregamento não implementado | NEEDS VALIDATION |
| Editar atendente | cartão raio 16 / padding 40; seletor 643,5x39,8; interruptor 32x21,3 [M, 2026-10-01] | tokens `--p-atend-equipe-*`, mesmos valores declarados | borda de 1px mantida; sem edição em lote na Blip | NEEDS VALIDATION |
| Adicionar atendentes | campo 643,5x42,8, borda 0,89, raio 8; Cancelar 90,6x40; Salvar 74,9x40 [M] | `ChipsInput` do Pipe (medidas do componente, não conferidas) | e-mail sem conta é recusado; validação não medida | NEEDS VALIDATION; lacuna |
| Permissões | cartão 1366,9x664; linhas de 56; dez permissões [M] | catálogo do Pipe; interruptor de três estados | conteúdo próprio | NEEDS VALIDATION; lacuna |
| Remover atendente | sem captura | texto do UI-SPEC, foco em "Cancelar" | n/a | NEEDS VALIDATION |
| Resumo | 35 linhas de tabela: 0 VISUALLY VERIFIED, 21 NEEDS VALIDATION, 7 com lacuna | | | |

### Paginação (`ref/verificacao/paginacao.md`)

| Tela/estado | Medidas Blip | Medidas Pipe | Diferenças | Status |
|---|---|---|---|---|
| Grade e lista (uma skin só, Q3) | margem 10px (grade) ou 20px (lista); seletor 74x40; botões 40x40 ícone 24; gap 8px [M] | iguais, em página de teste descartável (CSS real, Chrome headless) | página atual em verde de marca e peso 600 (D-11); desabilitado a 50% mantido | VISUALLY VERIFIED (CSS); tela viva NEEDS VALIDATION |
| Consumidores (Monitoramento, Regras, Filas, Atendentes, Pausas) | `mt3` / `mt4` [M] | `afastado`, `ocultarVazio`, `ocultarTamanho` | tela viva sem dados | VISUALLY VERIFIED (CSS); NEEDS VALIDATION (tela viva) |
| Portal | `bds-pagination` (outra família) [M] | `layout="portal"` inalterado | fora do escopo | sem mudança |
| Resumo | 54 linhas de tabela: 16 VISUALLY VERIFIED, 24 NEEDS VALIDATION, 10 divergências (as da lista corrigidas em 03.2-07; as do Portal, fora do escopo) | | | |

### tblwrap (`ref/verificacao/tblwrap.md`)

| Tela/estado | Medidas Blip | Medidas Pipe | Diferenças | Status |
|---|---|---|---|---|
| Cartão (fundo, padding, raio, borda) | rgb(246,246,246); 20; 16; sem borda [M] | rgb(246,246,245); 20; 16; 0 | <1 por canal | VISUALLY VERIFIED |
| Tabela (raio, borda, cabeçalho) | 8px; 1px rgba(0,0,0,.06); cabeçalho 48 sem fundo próprio [M] | declarado após 03.2-08: 8px; 1px `--p-linha`; 48; transparente | cor da borda a medir | NEEDS VALIDATION |
| Linha do corpo, fio, vazio | 49px; 0,889px; "Dados insuficientes" [M] | 49px declarado; fio 1px | sem render com dados | VISUALLY VERIFIED (fio); NEEDS VALIDATION (linha, vazio) |
| Esqueleto e erro | sem captura | `.tblwrap-esqueleto`, `.tblwrap-erro` | n/a | NEEDS VALIDATION |
| Resumo | 31 linhas de tabela: 9 VISUALLY VERIFIED, 16 NEEDS VALIDATION, 3 com lacuna ou divergência | | | |

### Estado do portão da Onda 1

Pendente do dono: percorrer as telas ao lado da Blip, responder "aprovada" ou "corrigir" para cada lacuna L-11 a L-34 de `LACUNAS-APROVADAS.md` e às perguntas acima. Ver `03.2-16-SUMMARY.md` (status partial).
