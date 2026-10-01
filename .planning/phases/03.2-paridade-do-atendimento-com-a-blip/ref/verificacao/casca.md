Base: c833d0db39c52c19678e58c3a4effa55b3491960
Tema: barras do topo escuras (barra do Portal e barra do contato) e lateral/conteúdo claros, confirmado em `referencias-blip/pesquisa/blip-medidas-monitoramento.md` §1 (fundos rgb(20,20,20) e rgb(40,40,40)) e §3 (lateral rgb(255,255,255)). O Pipe segue o mesmo tema.

# Verificação: casca do Atendimento (barra do Portal, barra do contato, desk-sidebar)

**Fonte Blip:** `referencias-blip/pesquisa/blip-medidas-monitoramento.md` (DOM vivo, somente leitura; viewport 1707x767, dpr 1,125) = [M]. Valor deduzido de outra medida = [A]. "não medido" = a fonte não traz.
**Fonte Pipe:** Chrome headless por CDP, viewport 1440x900, dpr 1, tenant local de teste, `medir-tela.js` equivalente (`getBoundingClientRect` + `getComputedStyle`, inclusive `::before`). Prints em `referencias-blip/pipe-capturas/03.2-03-casca-*.png` (fora do Git).
**Posição x:** a Blip foi medida com a árvore em x=16; comparo sempre a posição relativa à borda esquerda da lateral (Blip) e ao `.g-lateral` (Pipe), porque as larguras de tela diferem.
**Neutros (N1):** o Pipe usa os neutros da própria marca (`--p-conteudo` rgb(22,21,15), `--p-superficie-4`), de tom quente, no lugar dos cinzas da Blip. Não é azul->verde; fica `NEEDS VALIDATION` até o portão dizer se conta como troca de paleta.
**Família (Q5):** a Blip resolve `"Nunito Sans"` [M] (`.typo` do bds-typo e §5 da medida). O Pipe resolve `"IBM Plex Sans"`. Ver Q5.

## Estado: lista (Monitoramento carregado)

| Elemento | Blip | Pipe | Diferença | Status |
|---|---|---|---|---|
| Barra do Portal: altura | 80px [M] | 80px | 0 | VISUALLY VERIFIED |
| Barra do Portal: fundo | rgb(20,20,20) [M] | rgb(22,21,15) | neutro (N1) | NEEDS VALIDATION |
| Barra do Portal: família | Nunito Sans [M] | IBM Plex Sans | família diferente | NEEDS VALIDATION (ver Q5) |
| Barra do Portal: avatar do contrato | 32x32 em (32,24) [M] | 40x40 em (32,20) | +8 largura, +8 altura, -4 y | DIVERGE (ver Lacunas L-01) |
| Barra do Portal: nome do contrato | 16px/700, lh 24, x=74, y=19 [M] | 16px/700, lh 24, x=82, y=19 | x +8 (consequência do avatar) | DIVERGE (ver Lacunas L-01) |
| Barra do Portal: plano | 12px/400, lh 18, y=43, rgb(179,212,255) [M] | 12px/400, lh 18, y=43, branco 64% | geometria 0; cor azulada da Blip x branco 64% | NEEDS VALIDATION (cor) |
| Barra do contato: altura | 56px [M] | 56px | 0 | VISUALLY VERIFIED |
| Barra do contato: fundo | rgb(40,40,40) [M] | rgb(43,42,37) | neutro (N1) | NEEDS VALIDATION |
| Barra do contato: ícone do bot | 36x36 em (40,90) [M] | 36x36 em (40,90) | 0 | VISUALLY VERIFIED |
| Barra do contato: nome do bot | 16px/300, lh 25,6, x=91 [M] | 16px/300, lh 25,6, x=99 | x +8 | DIVERGE (ver Lacunas L-02) |
| Atendimento selecionado: caixa | altura 56, padding 0 20px, largura 131,78 [M] | altura 56, padding 0 20px, largura 131,8 | 0 | VISUALLY VERIFIED |
| Atendimento selecionado: texto | 16px/300, lh 25,6, rgb(255,255,255) [M] | 16px/300, lh 25,6, rgb(255,255,255) | 0 | VISUALLY VERIFIED |
| Atendimento selecionado: fundo | nenhum [M] | transparente | 0 | VISUALLY VERIFIED |
| Atendimento selecionado: sublinhado | `::before` 4px x 100% do item, bottom 0, rgb(63,125,232) [M] | `::before` 4px x 131,8px, cor `--g-barra-marca` (musgo) | azul->verde | VISUALLY VERIFIED |
| Módulo inativo: texto | 16px/300, rgb(201,223,228) [M] | 16px/300, branco 64% | cor clara azulada x branco 64% | NEEDS VALIDATION (cor) |
| desk-sidebar: posição x | x=0 (nav com padding 0, árvore em x=16) [M] | x=16 (a casca herda o padding 0 16px do `.pt-conteudo`) | +16 | DIVERGE (corrigir) |
| desk-sidebar: largura | 262px [M] | 262px | 0 | VISUALLY VERIFIED |
| desk-sidebar: fundo | rgb(255,255,255) [M] | rgb(255,255,255) | 0 | VISUALLY VERIFIED |
| desk-sidebar: borda direita | não medido | 1px rgba(17,17,17,0.1) | sem medida Blip | NEEDS VALIDATION |
| desk-sidebar: recuo da árvore | 16px [M] | padding 16px | 0 | VISUALLY VERIFIED |
| desk-sidebar: largura útil do item | 210px [M] (com 20px de barra de rolagem) | 229px (sem barra de rolagem) | +19 | DIVERGE (ver Lacunas L-03) |
| desk-sidebar: topo do primeiro item | y=152 (136 + 16) [M] | y=152 | 0 | VISUALLY VERIFIED |
| Item: altura / padding / raio | 42 / 8 / 8 [M] | 42 / 8 / 8 | 0 | VISUALLY VERIFIED |
| Item: ícone | 24x24, x = recuo + 9 [M] | 24x24, x = recuo + 9 | 0 | VISUALLY VERIFIED |
| Item: gap ícone-rótulo | 8px [M] | 8px | 0 | VISUALLY VERIFIED |
| Item inativo: rótulo | 14px/600, rgb(40,40,40) [M] | 14px/600, rgb(22,21,15) | neutro (N1) | NEEDS VALIDATION |
| Item inativo: ícone | não medido | rgb(85,84,77) | sem medida Blip | NEEDS VALIDATION |
| Item ativo: rótulo | 14px/700 [M] | 14px/700 | 0 | VISUALLY VERIFIED |
| Item ativo: ícone | rgb(30,107,241) [M] | rgb(74,93,35) (`--p-marca`) | azul->verde | VISUALLY VERIFIED |
| Item ativo: fundo | `::before` 208,1x40, rgb(40,40,40) a 8% [M] | `--p-marca-suave` rgb(234,238,221) na caixa 229x42 | cinza 8% x verde suave (mapa do plano: `--p-marca-suave`) | NEEDS VALIDATION |
| Item ativo: borda | ~0,9px [A] (o `::before` de 208,1x40 cabe em 210x42), cor não medida | 1px tinta 16% | cor sem medida Blip | NEEDS VALIDATION |
| Item: hover | não medido (§7 da fonte) | fundo tinta 8% + borda tinta 16% | sem medida Blip | NEEDS VALIDATION |
| Passo entre itens | 50px (42 + 8) [M] | 50px (y 152 -> 202) | 0 | VISUALLY VERIFIED |
| Rodapé da lateral: altura / padding | 72 / 24 [M] | 72 / 24 | 0 | VISUALLY VERIFIED |
| Rodapé da lateral: largura | 242px = largura útil inteira do nav [M] | 229px (dentro do padding 16 da lateral) | -13 (rodapé recuado dos dois lados; a régua de cima não encosta nas bordas) | DIVERGE (corrigir) |
| Rodapé da lateral: posição | fim do conteúdo rolável [M] | fim da lateral, 16px acima da borda de baixo (padding da lateral) | +16 de respiro embaixo | DIVERGE (corrigir) |

## Estado: item ativo em cada grupo do desk-sidebar

Medido em `report` (Relatórios), `replies` (Comunicação), `rules` (Regras), `team` (Atendentes), `preferences/general` (Preferências). Os valores do Pipe foram iguais nos 5 grupos, salvo a altura do grupo.

| Elemento | Blip | Pipe | Diferença | Status |
|---|---|---|---|---|
| Cabeçalho do grupo aberto: altura | 42px [M] | 42px (5 grupos) | 0 | VISUALLY VERIFIED |
| Cabeçalho do grupo aberto: destaque | não medido | fundo `--p-marca-suave`, 14px/700, ícone `--p-marca` | sem medida Blip | NEEDS VALIDATION |
| Grupo Relatórios (4 filhos): altura | 238px [M] | 238px | 0 | VISUALLY VERIFIED |
| Grupo Comunicação (2 filhos): altura | 165px [M] | 144px | -21 (a própria geometria da Blip dá 42+8+39+8+39+8 = 144; o 165 indica um elemento a mais na captura) | NEEDS VALIDATION (captura pendente) |
| Grupo Regras (3 filhos): altura | 191px [M] | 191px | 0 | VISUALLY VERIFIED |
| Grupo Atendentes (3 filhos): altura | não medido | 191px | sem medida Blip | NEEDS VALIDATION |
| Grupo Preferências: filhos | 2 (Configurações gerais, Canais de atendimento) [M] | 3 (+ Dados) | +1 item | DIVERGE (ver Lacunas L-04) |
| Primeiro filho abaixo do cabeçalho | 7px [M] | 8px | +1 (dpr 1,125 na Blip; 238 só fecha com 8) | NEEDS VALIDATION (Q1) |
| Respiro no pé do grupo | 8px [M] | 8px | 0 | VISUALLY VERIFIED |
| Subitem: altura | 39px [M] | 39px | 0 | VISUALLY VERIFIED |
| Subitem: início da caixa | recuo + 37 (x=53) [M] | recuo + 23 | -14 | DIVERGE (corrigir) |
| Subitem: padding | 8px [M] (com borda de ~0,9px, ver rótulo) | 8px 8px 8px 22px, sem borda | +14 à esquerda | DIVERGE (corrigir) |
| Subitem: rótulo | x = recuo + 46 (x=62 = 53 + 0,9 + 8) [M] | recuo + 45 | -1 | DIVERGE (corrigir) |
| Subitem: raio | 8px [M] | 8px | 0 | VISUALLY VERIFIED |
| Subitem: fonte inativo / ativo | 14px/600 / 14px/700 [M] | 14px/600 / 14px/700 | 0 | VISUALLY VERIFIED |
| Passo entre subitens | 47px (39 + 8) [M] | 47px | 0 | VISUALLY VERIFIED |
| Subitem ativo: barra | `::before` 2 x 21,33, raio 8, `left: -15px`, x = recuo + 22 (x=38), rgb(30,107,241) [M] | 2 x 23, raio 8, `left: 0`, x = recuo + 23, `--p-marca` | altura +1,7; x +1; azul->verde | DIVERGE (corrigir altura) |
| Subitem ativo: fundo | `::after` 108,7x37,3, rgb(40,40,40) a 8% [M] | `--p-marca-suave` na caixa inteira 206x39 | largura e cor (mapa do plano: `--p-marca-suave`) | NEEDS VALIDATION |
| Subitem: hover | não medido (§7 da fonte) | fundo tinta 8%, barra tinta 16% | sem medida Blip | NEEDS VALIDATION |
| Subitem: largura | 173px [A] (210 - 37, com barra de rolagem) | 206px | +33 (19 da barra de rolagem + 14 do recuo) | DIVERGE (corrigir recuo; ver L-03) |

## Lacunas

- **L-01 Avatar do contrato 40x40 contra 32x32.** O avatar do Pipe (`.pt-account-icon`) tem 40x40 com padding 8; o da Blip tem 32x32 em y=24, e o nome começa em x=74. A barra do Portal é compartilhada com todas as telas do Portal (`components/barra-do-portal.tsx`, `global.css`), fora dos arquivos deste plano; corrigir aqui mudaria o Portal inteiro sem medição dele. Proposta: corrigir junto com a verificação do Portal.
- **L-02 Nome do bot 8px à direita.** O `summary` do nome (`flow.css`, `.fx-contact-menu > summary`) tem `margin-left: 15px` + `padding: 4px 8px` (a pílula de hover); na Blip o nome começa 15px depois do ícone, sem padding. A barra do contato é compartilhada por todos os módulos do contato (Builder, Growth...), fora dos arquivos deste plano. Proposta: `margin-left` de 15px menos o padding, verificando o Builder junto.
- **L-03 Barra de rolagem da lateral.** Na Blip a lateral rola sozinha (`overflow-y: auto`, `scrollHeight` 1165 contra `clientHeight` 631) e a barra de rolagem de 20px come a largura útil (210px). No Pipe a lateral não rola por conta própria: a casca cresce com o conteúdo e o `.pt-conteudo` rola tudo junto, então não há barra na lateral e a largura útil é 229px. Igualar exige mudar a arquitetura de rolagem da casca (lateral com altura fixa e rolagem própria), o que não é ajuste de medida.
- **L-04 Item "Dados" em Preferências.** O Pipe tem a tela própria `preferences/data` (decisão anterior registrada em `shell.tsx`); a Blip não tem esse item. Divergência deliberada, mantida.
