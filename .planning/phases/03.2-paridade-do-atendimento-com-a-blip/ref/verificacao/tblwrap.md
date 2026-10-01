Base: c833d0db39c52c19678e58c3a4effa55b3491960
Tema: claro (cartão cinza-claro sobre o conteúdo claro).

# Verificação: tabela `tblwrap` (Blip x Pipe)

**Fonte Blip.** Linhas e células: `referencias-blip/pesquisa/blip-medidas-monitoramento.md` §4.3 e §4.5 (DOM vivo, "Monitoramento detalhado", dpr 1,125) = [M]. Tabela e cabeçalho: estilos Stencil em `referencias-blip/atendimento/attendance-desk-monitoring/supernova.blip.ai/*bds-table-body*`, `*bds-table-th*`, `*bds-table-cell*`, `*bds-table-row*` = [M] (fonte). Estado vazio: `main.js` do `portal-fragment-desk-mfe` e FICHA-monitoring §6 = [M].
Observação: o `bds-table-row` declara `height: 64px` na folha, mas a medida ao vivo deu 48/49px; vale a medida ao vivo (a tela usa a variante densa: `.dense-th { min-height: 48px }`, `.dense_cell { margin: 0 }`).

**Fonte Pipe.** Chrome headless por CDP, 1440x900, `attendance/monitoring`, `.tblwrap.mon-detalhado` (aba aberta, sem ticket no tenant local: só o estado vazio tem corpo). Print em `referencias-blip/pipe-capturas/03.2-03-casca-monitoring.png`.

**Família.** Blip `"Nunito Sans"` [M]. Pipe: a tabela do Monitoramento já resolve `"Nunito Sans", Carbona...` (sobrescrita própria do `mon-detalhado`), diferente do resto do Pipe (IBM Plex Sans). Ver Q5.

## Estado: lista (Monitoramento detalhado, aba sem dados)

| Elemento | Blip | Pipe | Diferença | Status |
|---|---|---|---|---|
| Envoltório (cartão): fundo | rgb(246,246,246) [M] | rgb(246,246,245) | <1 por canal | VISUALLY VERIFIED |
| Envoltório: padding | 20px [M] | 20px | 0 | VISUALLY VERIFIED |
| Envoltório: raio | 16px [M] | 16px | 0 | VISUALLY VERIFIED |
| Envoltório: sombra | rgba(0,0,0,0.16) 0 2px 8px -2px [M] | rgba(17,17,17,0.16) 0 2px 8px -2px | neutro (N1 de `casca.md`) | NEEDS VALIDATION |
| Envoltório: borda | nenhuma [M] | 0 | 0 | VISUALLY VERIFIED |
| Tabela: raio | 8px (`.sc-bds-table-h`) [M] | 0 | -8 | DIVERGE (registrar; correção no plano 03.2-08) |
| Tabela: fundo | `--color-surface-1` #f6f6f6 [M] | transparente (o cartão #f6f6f5 atravessa) | 0 visível na tabela; ver cabeçalho | NEEDS VALIDATION |
| Tabela: borda | 1px rgba(0,0,0,0.06) (`--color-border-3`) [M] | 0 | -1 | DIVERGE (registrar; plano 03.2-08) |
| Cabeçalho: altura | 48px [M] | 48px | 0 | VISUALLY VERIFIED |
| Cabeçalho: fundo | sem fundo próprio (herda o #f6f6f6 da tabela) [M] | rgb(255,255,255) | branco x cinza-claro | DIVERGE (registrar; plano 03.2-08) |
| Cabeçalho: fonte | 14px/600, lh 21 [M] | 14px/600, lh 21 | 0 | VISUALLY VERIFIED |
| Cabeçalho: caixa alta | nenhuma (`text-transform` não declarado) [M] | `none` | 0 | VISUALLY VERIFIED |
| Cabeçalho: letter-spacing | não declarado (normal) [M] | `normal` | 0 | VISUALLY VERIFIED |
| Cabeçalho: padding da célula | 0 8px; primeira `0 8px 0 16px`; última com 16px à direita [M] | `0 8px 0 16px` | 0 na primeira; demais e última a medir com mais colunas visíveis | NEEDS VALIDATION |
| Linha do corpo: altura | 49px [M] | sem linha de dado (estado vazio de 108,5px) | sem medida | NEEDS VALIDATION |
| Célula do corpo: padding / fonte | 0 8px (primeira 16px à esquerda) / 14px/400, lh 21 [M] | `0 8px 0 16px` / 14px/400, lh 21 (célula do vazio) | fonte 0; padding das demais a medir | NEEDS VALIDATION |
| Fio entre linhas | 0,889px solid rgba(0,0,0,0.16) [M] (1px físico em dpr 1,125) | 1px solid rgba(0,0,0,0.16) | 0 em px físico | VISUALLY VERIFIED |
| Estado vazio | "Dados insuficientes", bds-typo fs-14 regular, centralizado no corpo, `data-testid="desk-grid-tabled-paginated-empty-<aba>"` [M] | célula de 1043,8x108,5 com texto 14px/400 | altura do vazio sem medida Blip | NEEDS VALIDATION |

## Lacunas

Nenhuma corrigida aqui: este plano só mede. As divergências da tabela (raio, borda, fundo do cabeçalho) entram no plano 03.2-08 (unificação do `.tblwrap`).

## Depois da correção (03.2-08)

Base: 64d61f64b7806e536be6c0d77f2f6d2070307b9f

**Escopo da medição.** Os valores abaixo são os DECLARADOS no CSS após a correção (`global.css` bloco `.tblwrap`, `attendance.css` `.mon-detalhado .scroll`). Não houve medição por CDP nesta execução (sem tenant com dados nem Chrome headless), então tudo que dependia de medida viva fica `NEEDS VALIDATION`, nunca aprovado (METODO.md). Tolerância 1px (Q1).

**Definição única.** `.tblwrap` do app tem uma só regra de envoltório em `global.css`. A regra de `base.css:614` ficou, porque `apps/crm` também usa `tblwrap` (grep). Cabeçalho `th`: 64px -> 48px, sem fundo próprio (transparente, herda a tabela). Linha `td`: 58px content-box (64px visuais) -> 49px border-box. Quadro do Monitoramento detalhado: raio 8 e borda 1px `--p-linha` (antes 0).

| Elemento | Blip | Pipe (declarado) | Status |
|---|---|---|---|
| Tabela: raio / borda | 8px / 1px rgba(0,0,0,.06) [M] | 8px (`--p-r-md`) / 1px `--p-linha` | NEEDS VALIDATION (cor da borda a medir) |
| Cabeçalho: altura / fundo | 48px / herda a tabela [M] | 48px / transparente | NEEDS VALIDATION |
| Linha: altura | 49px [M] | 49px | NEEDS VALIDATION |
| Esqueleto (`.tblwrap-esqueleto`) | sem captura | 48px + linhas de 49px, `aria-busy="true"` | NEEDS VALIDATION |
| Erro (`.tblwrap-erro`) | sem captura | `--p-error-background`/`--p-error-content`, texto fixo, "Tentar novamente" | NEEDS VALIDATION |

## Telas consumidoras

| Tela | Paginação | Carregando | Erro | Vazio | Status |
|---|---|---|---|---|---|
| monitoring-detailed | já tem (`usePage` + `Pagination`) | `monitoring.tsx` esqueleto com 48/49px e `aria-busy` | `TabelaErro` (via monitoring) | `WithoutData` | NEEDS VALIDATION |
| monitoring | sem paginação na Blip fora do detalhado | idem | `TabelaErro` com "Tentar novamente" | n/a | NEEDS VALIDATION |
| reports-attendance | sem paginação na Blip (sem evidência nas fichas; CENSO-COMPONENTES §Paginação) | `TabelaCarregando` | `TabelaErro` | "Dados insuficientes" | NEEDS VALIDATION |
| agents-permissions | sem paginação na Blip (idem) | `TabelaCarregando` | `TabelaErro` | n/a | NEEDS VALIDATION |
| settings-data | sem paginação na Blip (idem) | `TabelaCarregando` | `TabelaErro` | `.empty` existente | NEEDS VALIDATION |

D-06: nenhuma das 4 telas ganhou `<Pagination>`, porque o censo não tem evidência de que a Blip pagina nelas ("captura pendente antes de adotar").
