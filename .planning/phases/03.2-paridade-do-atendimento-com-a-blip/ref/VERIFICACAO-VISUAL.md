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
