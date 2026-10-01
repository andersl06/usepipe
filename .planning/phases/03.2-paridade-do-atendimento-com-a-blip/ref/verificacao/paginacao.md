Base: c833d0db39c52c19678e58c3a4effa55b3491960
Tema: claro (rodapé dentro do conteúdo claro do Atendimento e do Portal).

# Verificação: as 3 skins de paginação (Blip x Pipe)

**Fonte Blip.** Não há medida ao vivo da paginação (`blip-medidas-monitoramento.md` §7: "Altura da linha do rodapé de paginação: não medido"). Os valores vêm do código-fonte capturado, lido por caminho absoluto em `referencias-blip/`:
- marcação renderizada: `portal/dom/monitoring.html` (grade), `portal/dom/rules.html`, `queue-management.html`, `team.html` (lista);
- componente React do Atendimento: `atendimento/attendance-desk-monitoring/portalmfe.blip.ai/beagle/portal-fragment-desk-mfe/latest/main.js` (rodapé da grade `desk-grid-tabled-paginated`, rodapé da lista `pagination-and-search`, seletor `ResultsSelect`, botões `pagination-test`);
- folhas: utilitários `mt3`/`mt4`/`mr4` em `atendimento/attendance-desk-monitoring/supernova.blip.ai/portal.css`; estilos Stencil em `bundles-e-css/*bds-select*`, `*bds-button-icon*`, `*bds-grid_5*`, `*bds-pagination*` e `atendimento/attendance-desk-monitoring/supernova.blip.ai/*bds-icon*`.

Valor lido literalmente na fonte = [M]. Valor deduzido (soma de padding, rem para px com raiz de 16px) = [A].

**Fonte Pipe.** Chrome headless por CDP, 1440x900, tenant local de teste. `lista` medida em `attendance/queue-management`; `portal` em `/application`. A `grade` não renderiza no tenant local (`Pagination` com `total === 0` devolve `null`: não há ticket no Monitoramento detalhado e a Equipe está vazia); a coluna Pipe da grade traz o CSS-fonte (`apps/management-vite/src/estilos/global.css:4690-4765`), marcado [CSS], e o status fica `NEEDS VALIDATION` até haver dado.

**Família (Q5).** Blip: `"Nunito Sans"` [M] (`.typo` do bds-typo). Pipe: `"IBM Plex Sans"`. Ver Q5.

## Estado: grade (monitoring-detailed)

| Elemento | Blip | Pipe | Diferença | Status |
|---|---|---|---|---|
| Rodapé: estrutura | `div.flex.items-center.mt3` > [grupo esquerdo: rótulo + seletor] + [grupo direito `ml-a`: contador + navegação] [M] | `.pg` flex: rótulo+seletor, contador centralizado (`margin: 0 auto`), navegação com `width: 50%` [CSS] | contador no meio x contador colado na navegação à direita | NEEDS VALIDATION (sem render) |
| Rodapé: margem acima | `mt3` = .625rem = 10px [M]/[A] | `margin-top: 16px` [CSS] | +6 | NEEDS VALIDATION (sem render) |
| Rodapé: altura | 40px [A] (maior filho: botão 40 e seletor 40) | não renderizado | sem medida | NEEDS VALIDATION |
| Rótulo "Resultados por página" | bds-typo fs-14 (0.875rem, lh 150% = 21px), peso normal (400), `mr4` = 20px até o seletor [M] | 14px, `gap: 20px` [CSS]; no Monitoramento sobrescrito para `gap: 16px` (`attendance.css:1595`) | 0 no padrão; -4 no Monitoramento | NEEDS VALIDATION (sem render) |
| Seletor: largura | 74px (`ResultsSelect`, styled `width: 74px`) [M] | `min-width: 74px` só para `select` nativo [CSS]; o `Select` de `@pipe/ui` mediu 50,4px na lista | provável -23,6 | NEEDS VALIDATION (sem render) |
| Seletor: altura / padding / raio | 40px [A] / 8px 4px 8px 12px [M] / 8px [M] | 40px / 0 8px / 8px [CSS do `select` nativo] | padding a confirmar no render | NEEDS VALIDATION |
| Seletor: opções / padrão / abertura | 5, 10, 15, 25, 50, 100, 250, 500 / 5 / para cima (`optionsPosition: "top"`) [M] | `PAGE_SIZES` iguais; padrão e direção a medir | a medir | NEEDS VALIDATION |
| Contador | bds-typo fs-14, "1-5 de 8", `mr4` = 20px até a navegação [M] | 14px, centralizado [CSS] | posição | NEEDS VALIDATION (sem render) |
| Botões: tamanho / raio / padding | 40x40 / 8 / 8 (`bds-button-icon size="short"`) [M] | 40x40 / 8 / 0 [CSS] | padding | NEEDS VALIDATION (sem render) |
| Botões: aparência | `variant="secondary"`: fundo transparente, cor rgb(40,40,40) [M] | fundo transparente, `--p-conteudo`; hover `--p-superficie-2` [CSS] | neutro (N1 de `casca.md`) | NEEDS VALIDATION |
| Botões: ícone | `bds-icon` medium 24x24 (first, left, right, last) [M] | `GridIcon` (svg próprio) | a medir | NEEDS VALIDATION |
| Botões: gap | `bds-grid gap="1"` = 8px [M] | `justify-content: space-between` em 50% da largura [CSS] | espaçamento variável x 8px | NEEDS VALIDATION (sem render) |
| Botão desabilitado | não existe: o componente não passa `disabled`; clique fora do limite é ignorado (`e > 0 && n(e)`) [M] | `:disabled` com `opacity: 0.35` [CSS] | estado extra no Pipe | NEEDS VALIDATION (sem render) |
| Página atual | texto bds-typo fs-14 entre "anterior" e "próxima", `margin="x-1"` = 8px de cada lado [M] | `.pg-atual` texto, `min-width: 16px` [CSS] | margem a medir | NEEDS VALIDATION |

## Estado: lista (lista-regras)

Pipe medido em `attendance/queue-management` (lista com seletor). `rules` está vazia no tenant local e não mostra rodapé.

| Elemento | Blip | Pipe | Diferença | Status |
|---|---|---|---|---|
| Rodapé: estrutura | idêntica à grade: `div.flex.items-center.mt4` > [rótulo + `ResultsSelect`] + [`ml-a`: contador + o MESMO componente de navegação] [M] | `.footer-pagination` flex, `gap: 20px`: rótulo+seletor, contador, navegação | contador fica no meio (x=650) e não colado à navegação | DIVERGE (registrar; correção no plano 03.2-07) |
| Rodapé: margem acima | `mt4` = 1.25rem = 20px [M]/[A] | não medido nesta passada | a medir | NEEDS VALIDATION |
| Rodapé: altura | 40px [A] | 40px | 0 | VISUALLY VERIFIED |
| Rótulo "Resultados por página" | fs-14, lh 21, 400, `mr4` = 20px [M] | 14px/400, lh 21, `gap: 20px` | 0 (família ver Q5) | VISUALLY VERIFIED |
| Seletor: largura | 74px [M] | 50,4px | -23,6 | DIVERGE (registrar; correção no plano 03.2-07) |
| Seletor: altura | 40px [A] | 40px | 0 | VISUALLY VERIFIED |
| Seletor: padding / raio | 8px 4px 8px 12px / 8px [M] | 8px 4px 8px 12px / 8px | 0 | VISUALLY VERIFIED |
| Seletor: borda / fundo | `input--state-primary` do bds-select; cor não lida | 1px rgba(17,17,17,0.1) / branco | sem medida Blip | NEEDS VALIDATION |
| Seletor: opções / padrão | 5 ... 500 / 5 (`value="5"` em `rules.html`, `queue-management.html`, `team.html`) [M] | `PAGE_SIZES` iguais / padrão a confirmar | a medir | NEEDS VALIDATION |
| Contador | fs-14, `mr4` = 20px até a navegação [M] | 14px/400, 53,2x21, a 139,8px da navegação | posição | DIVERGE (registrar; plano 03.2-07) |
| Botões: tamanho / raio | 40x40 / 8 [M] | 40x40 / 8 | 0 | VISUALLY VERIFIED |
| Botões: padding | 8px [M] | 1px 6px (padrão do `button`) | ícone centralizado nos dois; padding diferente | NEEDS VALIDATION |
| Botões: ícone | 24x24 [M] | 16x16 | -8 | DIVERGE (registrar; plano 03.2-07) |
| Botões: gap | 8px [M] | navegação de 542,9px de largura | espaçamento a medir por botão | NEEDS VALIDATION |
| Botão desabilitado | não existe [M] | `opacity: 0.4` | estado extra no Pipe | DIVERGE (registrar; plano 03.2-07) |
| Página atual | fs-14, margem 8px dos dois lados [M] | 14px/400, 16x21 | margem a medir | NEEDS VALIDATION |
| Sem seletor (`ocultarTamanho`) | `personalizedbreaks` sem `pagination-and-search-results-select` (FICHA-atendentes-filas-pausas) [M] | `personalizedbreaks` renderiza `.footer-pagination` | a medir se o seletor some | NEEDS VALIDATION |

## Estado: portal (pages/portal.tsx)

Fora do Atendimento (censo: "não alterar nesta fase"). Medido só como evidência de que é outra família.

| Elemento | Blip | Pipe | Diferença | Status |
|---|---|---|---|---|
| Componente | `bds-pagination` (Portal/Equipe): `bds-grid justify-content="space-between"` [M] | `.pt-pagination`, 1300x80, padding 20px 32px | altura/padding do contêiner sem medida Blip | NEEDS VALIDATION |
| Rótulo | "Itens por página:" fs-14 [M] | "Itens por página:" 14px/400 | 0 | VISUALLY VERIFIED |
| Seletor de tamanho | `.actions_select` 74px [M] | 84x40 | +10 | DIVERGE (fora do escopo; não alterar) |
| Contador | fs-14, `no-wrap` [M] | 14px/400 | 0 | VISUALLY VERIFIED |
| Navegação: gap | `bds-grid gap="1"` = 8px [M] | 10px | +2 | DIVERGE (fora do escopo; não alterar) |
| Botões | `bds-button-icon` short 40x40, raio 8, ícones arrow-* 24x24 [M] | 40x40, raio 8, glifos de texto « ‹ › » (Arial 22px) | ícone x glifo | DIVERGE (fora do escopo; não alterar) |
| Botão desabilitado | `disabled` nos limites; `--secondary--disabled` com `opacity: 50%` [M] | `:disabled` sem mudança visual (opacidade 1, cor igual) | -50% de opacidade ausente | DIVERGE (fora do escopo; não alterar) |
| Página atual | `bds-select` 74px [M] + "de N páginas" fs-14 [M] | `Select` 84x40 + "de N páginas" 14px | +10 no seletor | DIVERGE (fora do escopo; não alterar) |

## Conclusão para Q3

A Blip tem **uma aparência só** para grade e lista dentro do Atendimento:

1. Os dois rodapés (`desk-grid-tabled-paginated` no Monitoramento e `pagination-and-search` em Regras, Filas e Gestão de atendentes) têm a mesma marcação: rótulo fs-14 com `mr4`, o mesmo `ResultsSelect` de 74px aberto para cima, contador fs-14 com `mr4` num grupo `ml-a` à direita, e o MESMO componente de navegação (`data-testid="pagination-test"`, 4 `bds-button-icon` short secundários com `gap` 8px e a página atual em texto no meio). Fonte: `main.js` do `portal-fragment-desk-mfe` e as quatro capturas HTML.
2. A única diferença é a margem de cima, que vem do contêiner: `mt3` (10px) na grade, `mt4` (20px) na lista.
3. O `bds-pagination` do Portal ("Itens por página:", página atual em seletor, botões desabilitados a 50%) é outra família e não aparece nas telas do Atendimento.

Evidência a favor da opção (a) de Q3: colapsar `grade` e `lista` numa skin única do Atendimento, com a margem de cima como único parâmetro, e manter `portal` à parte. A medida do lado Pipe da `grade` ainda depende de render com dados (ticket no Monitoramento ou membro na Equipe).

## Depois da correção (03.2-07)

Base: 96d53e3cd8d091b09a4290e5f15bbe7589eeef47
Decisões aplicadas: Q1 (tolerância 1px), Q3 (colapsar `grade` e `lista`; `portal` fica à parte), Q5 (IBM Plex Sans).

**Como foi medido.** O app em dev exige API local, login e dados (a `grade` já não renderizava com o tenant de teste). Foi usada uma página de teste descartável, fora do repositório, com o `tokens.css` e o `global.css` reais e a mesma marcação do `Pagination`, aberta em Chrome headless 1440x900. Vale como medida de CSS. Estado de dados real (5 grades, Equipe, Regras, Pausas) segue `NEEDS VALIDATION` em tela viva.

**O que mudou.** Uma skin só (`layout="grade"`; `lista` removida junto com `.footer-pagination`/`.rp-*`). Parâmetros: `afastado` (margem de cima 20px, listas), `ocultarVazio={false}` (Regras mostra o rodapé vazio), `ocultarTamanho` (Pausas). Sobrescrita `.mon-detalhado .pg*` de `attendance.css` removida: divergia da Blip (botões 32px, gap 4px, rótulo a 16px). Tokens `--p-atend-paginacao-*` em `MARCA.md`.

| Consumidor | Blip | Pipe | Diferença | Status |
|---|---|---|---|---|
| monitoring-detailed (5 grades): margem de cima | 10px [M] | 10px | 0 | VISUALLY VERIFIED (CSS em página de teste) |
| monitoring-detailed: rodapé / rótulo | 40px [A] / 14px, 400, `mr4` 20px [M] | 40px / 14px, 400, gap 20px | 0 | VISUALLY VERIFIED (CSS) |
| monitoring-detailed: seletor | 74x40 [M] | 74x40 | 0 | VISUALLY VERIFIED (CSS) |
| monitoring-detailed: contador / navegação | contador `mr4` 20px até a navegação, grupo à direita [M] | contador a 20px da navegação, grupo `margin-left: auto` | 0 | VISUALLY VERIFIED (CSS) |
| monitoring-detailed: botões / ícone / gap | 40x40 / 24x24 / 8px [M] | 40x40 / 24x24 / 8px | 0 | VISUALLY VERIFIED (CSS) |
| monitoring-detailed: página atual | 14px, margem 8px dos dois lados [M] | 16px de largura, margem 8px, verde de marca `rgb(74,93,35)`, peso 600 | cor/peso: marca (D-11) | VISUALLY VERIFIED (CSS) |
| lista-regras (Regras, Filas, Gestão de atendentes) | `mt4` 20px, mesmo rodapé [M] | `afastado`: margem 20px, mesmas medidas da grade | 0 | VISUALLY VERIFIED (CSS); tela viva NEEDS VALIDATION |
| team (`pages/flow/team/tela.tsx`) | `mt3` 10px [M] | `layout="grade"`, margem 10px | 0 | VISUALLY VERIFIED (CSS); tela viva NEEDS VALIDATION |
| portal (`pages/portal.tsx`) | `bds-pagination`, outra família | `layout="portal"` não alterado | não alterar (fora do escopo) | sem mudança |
| personalizedbreaks (`ocultarTamanho`) | sem seletor [M] | sem rótulo/seletor, margem 20px, contador e setas à direita | 0 | VISUALLY VERIFIED (CSS) |
| Botão desabilitado | não existe na Blip [M] | `opacity: 0.5`, igual ao desabilitado do `bds-pagination` | estado extra mantido (primeira/última) | decisão do plano |

Foco: `outline` 2px `--p-foco` nos botões. Opção selecionada do seletor: verde de marca, já pelo `Select` compartilhado (`.selection-list button.selecionada`). Aria dos botões e `aria-live="polite"` do contador mantidos.

Consumidores com mudança fora do rodapé? regressão? não. Mudança visível: `monitoring-detailed` perde a miniaturização (botões 32px viram 40px, gap 4px vira 8px), por pedido da medida da Blip; `lista-regras` perde o contador centralizado e a navegação a 50% da largura. A rota de `Pagination` na Equipe e no Portal não mudou além disso.
