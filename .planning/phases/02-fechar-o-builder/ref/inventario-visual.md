# Inventário — Mapa visual azul→verde e ícones próprios do Builder

**Data da investigação:** 2026-09-26

**Nota de escopo (leia antes da tabela).** O Builder da Blip não tem um bundle CSS/JS próprio nesta captura (`referencias-blip/builder/builder/zip19/`) — só o CSS/JS geral do Portal (`portal.css`, `portal.js`), varrido nesta investigação em busca de `#3f7de8`, `#0096fa`, `#1e6bf1`, `#498bff` e variações `rgb`/`rgba` equivalentes. `#498bff` não aparece nesta captura. Os azuis do canvas do Builder (nó, seta, painel lateral) especificamente **não estão presentes neste snapshot** — o código atual do Pipe (`editor.css`, `painel-bloco.css`) já foi escrito numa passada anterior a partir do DOM de produção real da Blip (comentário do próprio arquivo, `editor.css:1-9`: "as medidas são as anotadas nos componentes, tiradas do portal.css e do DOM do Builder de produção") e **já substituiu o azul original pelo verde da Pipe** (`#4a5d23`/`var(--p-marca)`) nos mesmos seletores/estados. Por isso a tabela abaixo usa duas fontes complementares: (1) os azuis efetivamente medidos nesta captura (`portal.css`, marca geral do Portal) e (2) o papel visual de cada estado do canvas, identificado pela estrutura hoje presente em `editor.css`/`painel-bloco.css` (onde o valor "azul" já foi convertido e preservado apenas como fallback hex do token). Onde o azul específico do canvas não está confirmável nesta captura, a linha registra o papel e o token, com o valor exato marcado como pendente de medição ao vivo.

---

## Azuis da referência (D-30, D-32)

| Seletor/elemento | Azul da referência | Papel visual | Token Pipe |
|---|---|---|---|
| `.color-brand`, `.hover-primary:hover`, `.chatbot-home-content-metrics-area__container__item__link` (`portal.css`) | `#3f7de8` | Cor de marca/ênfase do Portal (texto, ícone, hover de link) | `--p-builder-marca` |
| `.color-primary`, `var(--color-primary, #1e6bf1)` (dezenas de ocorrências em `portal.css`: labels, bordas de input, ícones, texto de destaque) | `#1e6bf1` | Cor de marca base usada como variável CSS (`--color-primary`) em todo o Portal — o mesmo papel de "marca base" que `#3f7de8`, com hex ligeiramente diferente conforme o componente | `--p-builder-marca` |
| `input[type=radio]:checked` (`portal.css:2359-2362`), `.additional-recommendation-container-extensions-area__footer-text` (`portal.css:837`) | `#3f7de8`/`#1e6bf1` (ativo/pressionado) | Estado ativo/marcado de um controle | `--p-builder-marca-ativo` |
| `.stepper-modal .cards-list .card-container .active`, borda (`portal.css:2198-2201`) | `#3f7de8` sólido, borda de 6px | Cartão selecionado num seletor de cartões — borda ativa espessa | `--p-builder-marca-borda-ativa` |
| `.stepper-modal .cards-list .card-container .active`, fundo (`portal.css:2198-2201`) | `rgba(63, 125, 232, .2)` — `#3f7de8` a 20% de opacidade | Tingimento de fundo do mesmo cartão selecionado | `--p-builder-marca-destaque` |
| `.bl-no:hover`, `.bl-no--selecionado`, `.bl-no--editando` (`painel-bloco.css`/`editor.css:47-53`): `box-shadow: 0 0 0 4px var(--p-marca, #4a5d23)` | não confirmável nesta captura (bundle do canvas não presente); o token já documentado no `02-UI-SPEC.md` como "anel de seleção/hover, `box-shadow: 0 0 0 4px`" | Anel de seleção/hover do nó no canvas — o ponto focal da tela com um bloco selecionado (ver `02-UI-SPEC.md` §Color) | `--p-builder-marca-anel` |
| `.bl-no--selecionado:not(.bl-no--inicio)` (`editor.css:54-59`): `background: var(--p-marca, #4a5d23)` | não confirmável nesta captura | Fundo do nó quando selecionado (preenchimento total, não só anel) | `--p-builder-marca-selecionado` |
| `.bl-no-saida` (ponto de saída da conexão, `editor.css:158-166`), `.bl-seta-traco`/`.bl-seta-ponta` (traço e ponta da seta, `editor.css:188-209`) | não confirmável nesta captura | Cor base de marca dentro do canvas — ponto de onde se arrasta a ligação e a seta em si (mesmo estado, sem hover próprio hoje) | `--p-builder-marca` |
| `.bl-seta--selecionada .bl-seta-traco`/`.bl-seta-ponta` (`editor.css:206-210`) | não confirmável nesta captura | Seta selecionada — hoje usa o mesmo token da seta padrão, sem um segundo tom próprio | `--p-builder-marca` |
| `.bl-menu-contexto button:hover`/`:focus-visible` (`editor.css:300-304`) | não confirmável nesta captura | Cor do texto do item de menu de contexto em hover/foco | `--p-builder-marca` |
| `.bl-novo-bloco-item:hover`, `.bl-painel .bl-menu-acoes button:hover`, `.bl-painel .selecao-lista button:hover/.selecionada`, `.bl-variaveis-lista li:hover`, `.bl-versoes-item:hover` (`editor.css:305-309,579,883,922`): `background: color-mix(in srgb, var(--p-marca, #4a5d23) 24%, #282828)` | não confirmável nesta captura | Fundo tingido de marca a 24% sobre a superfície escura — hover/seleção de item de lista (menu "novo bloco", menu de ações, seletor de opções, lista de variáveis, lista de versões) | `--p-builder-marca-destaque` |
| `.bl-painel-titulo:focus-visible`, `.bl-painel-adicionar-tag:focus` (`editor.css:417-419,444-454`) | não confirmável nesta captura | Borda inferior de campo em edição/foco (título do bloco, campo de adicionar tag) | `--p-builder-marca-borda-ativa` |
| `.bl-abas button[aria-selected='true']` (`editor.css:508-521`) | não confirmável nesta captura | Sublinhado de aba ativa no painel lateral do bloco | `--p-builder-marca-selecionado` |

**Azul encontrado fora do escopo da tabela — `#0096fa` (`.test-env__rule-title--info`, `portal.css:5086-5088`, ícone com fundo `#eff8ff` em `.test-env__rule-icon--info`).** Este é o único azul da captura fora do par `#3f7de8`/`#1e6bf1`, mas não é marca/ênfase de ação — é o "info" de um par info/perigo dentro de uma lista de regras (o par danger usa `#e60f0f`/`#fee2e2`). Por não ser cor de marca, fica fora da regra azul→verde de D-30 (que só cobre "toda cor azul... usada como marca/ênfase") e fora do namespace `--p-builder-marca-*`; se o Pipe replicar esse padrão de "lista de regras info/perigo" (candidato ao painel de Teste, D-14), o token correto é o de estado informativo já existente no design system (`--p-info-*`), não um token de marca.

**Candidato a revisão futura:** a seta selecionada (`.bl-seta--selecionada`) hoje reaproveita o token `--p-builder-marca` sem um tom próprio de "ativo/selecionado" — se a captura ao vivo do canvas confirmar que a referência usa um tom diferente para a seta selecionada, o candidato natural é `--p-builder-marca-ativo` (mesmo papel já usado para estado ativo/pressionado de controles, ver linha do `input[type=radio]:checked` acima).

**Efeitos ainda sem candidato confirmado nesta captura:** `--p-builder-marca-brilho` (glow/blur), `--p-builder-marca-sombra` (sombra tingida) e `--p-builder-marca-gradiente` não têm hoje um seletor equivalente em `editor.css`/`painel-bloco.css`, nem um azul correspondente identificado em `portal.css`. O `02-UI-SPEC.md` já registra esses três como "a confirmar/preencher quando a tela correspondente for capturada" — mantido como pendência de medição, não como token a descartar.

**Preservação de intensidade (D-32):** o único efeito com opacidade/blur/spread documentado nesta captura é o par borda+fundo do cartão selecionado do stepper (`border: 6px solid`, `background` a 20% de opacidade) e o `color-mix` a 24% já usado pelo Pipe nos hovers de lista. Qualquer novo token de brilho/sombra/gradiente deve registrar opacidade/blur/spread equivalentes assim que a referência do canvas for capturada — não estimar um valor novo sem medição.

---

## Tema escuro (D-31)

O sistema de tokens do Pipe (`packages/ui/src/estilos/tokens.css`) já declara duas paletas de superfície — clara (padrão, para o resto do produto) e escura (`:root:not([data-tema='claro'])`, linhas 222-240, e o bloco espelho linhas 285-300):

| Token | Claro (resto do produto) | Escuro (usado pelo Builder) |
|---|---|---|
| `--p-superficie-0` (nó, cartão) | `#ffffff` | `#1a1d15` |
| `--p-superficie-1` (fundo do canvas/app) | `#f2f1ec` | `#12140e` |
| `--p-superficie-2` (painel lateral, recesso) | `#e9e7df` | `#232619` |
| `--p-marca` (semente de marca) | `#4a5d23` | `#a3b76a` |

**Confirmação de que não há tema claro no Builder (D-31):** o par claro existe no sistema de tokens **para o resto do produto**, mas o Builder deve forçar o escopo escuro independentemente do alternador de tema do usuário (`02-UI-SPEC.md` §Color: "O contêiner raiz do Builder deve forçar o escopo escuro... não seguir `prefers-color-scheme` nem a preferência salva do usuário"). Não existe, nem na referência (Blip: "o builder não é claro, é tudo escuro" — decisão do dono, `02-CONTEXT.md` §Specific Ideas) nem no código atual do Pipe, uma segunda paleta clara específica para as classes `.bl-*` do Builder — o único par claro/escuro pertence ao tema global do produto, não ao Builder.

**Superfícies medidas do canvas (escuro, código atual):**
- Nó (`.bl-no`, `editor.css:33-42`): fundo `#393939` (hex direto do DOM da Blip, ainda não migrado para token de superfície), borda-raio 8px, sombra `0 8px 16px rgb(0 0 0 / 25%)`.
- Painel do bloco (`.bl-painel--bloco`, `painel-bloco.css:8-15`): superfícies próprias `--p-superficie-0: #424242`, `--p-superficie-1: #393939`, `--p-superficie-2: #1f1f1f`, `--p-superficie-3: #141414` (comentário do arquivo: "Medidas de portal.css; superfícies efetivas do bds-theme-provider dark").
- Menu de contexto/menu de novo bloco (`editor.css:229-269`): fundo `#1f1f1f`, painel de ações `#282828`.

Essas superfícies escuras específicas do Builder (`#393939`, `#424242`, `#1f1f1f`, `#282828`, `#141414`) ainda não foram migradas para `--p-superficie-*`/`--p-builder-marca-*` — ficam fora do escopo de D-32 (que é só sobre os **azuis** virando verdes), mas registradas aqui porque fazem parte da confirmação de "tudo escuro" pedida por esta seção.

---

## Ícones próprios necessários (D-33)

| Significado | Onde aparece | Existe em `icones.tsx`? | Nome proposto |
|---|---|---|---|
| Atendimento humano / usuário engajado (equivalente ao `user-engaged` da Blip, citado em BUILDER-04) | Bloco de Atendimento Humano no canvas, ícone do card de conteúdo do tipo Atendimento | Não (`icones.tsx` só tem `pessoa`/`pessoas` genéricos, sem variante "engajado/em atendimento") | `pessoa-atendendo` |
| Fila de atendimento | `PainelDeFilas` (atalho), possível card do painel de Filas embutido | Sim — `fila` já existe em `packages/ui/src/icones.tsx:39` | `fila` (reaproveitar) |
| Vídeo (tipo de conteúdo) | Menu "Novo bloco" / catálogo de conteúdo (D-18), quando implementado | Sim — `video` já existe em `icones-portal.tsx:515` | `video` (reaproveitar) |
| Carrossel (tipo de conteúdo) | Catálogo de conteúdo (D-18) | Sim — `carrossel` já existe em `icones-portal.tsx:536` | `carrossel` (reaproveitar) |
| Anexo/documento (tipo de conteúdo) | Catálogo de conteúdo (D-18) | Parcial — `anexo` existe em `icones-portal.tsx:325`; não há um ícone dedicado de "documento" (PDF/arquivo) distinto de anexo genérico | `documento` |
| Imagem (tipo de conteúdo) | Catálogo de conteúdo (D-18) | Não | `imagem` |
| Áudio (tipo de conteúdo) | Catálogo de conteúdo (D-18) | Não | `audio` |
| Menu numerado / quick reply com opções (tipo de conteúdo já existente na tela, ícone próprio) | Cartão de conteúdo "Menu" (`conteudo.ts`) | Não confirmado — nenhum ícone `menu` em `icones.tsx`/`icones-gestao.tsx`/`icones-portal.tsx` | `menu-numerado` |
| Localização (enviar/solicitar) | Catálogo de conteúdo (D-18) | Não | `localizacao` |
| Link externo / web link (tipo de conteúdo) | Catálogo de conteúdo (D-18) | Parcial — `externo` existe (ícone genérico de link externo, `icones-gestao.tsx:36` e `icones-portal.tsx:679`), mas é usado para "abrir em nova aba", não especificamente para o tipo de conteúdo "Web link" do Builder — reavaliar se serve ou precisa de um ícone dedicado quando D-18 fechar o catálogo | `web-link` (a confirmar reaproveitamento de `externo`) |
| Conteúdo HTTP / requisição (ação `ProcessHttp`, já implementada) | Card de ação "Requisição HTTP" no editor de ações | Não — nenhum ícone de rede/API em `icones.tsx` | `requisicao-http` |
| Script / função (ações `ExecuteScript`/biblioteca de funções, D-19/D-22, se aprovadas no portão) | Card de ação, biblioteca de funções | Não | `script` |
| Ambiente de teste (painel de Teste, D-14, se confirmado) | Cabeçalho do painel de Teste | Não | `ambiente-de-teste` |
| Restaurar/histórico de versão (ação por linha da lista de versões, D-16) | Lista de versões publicadas | Parcial — `historico` existe em `icones-gestao.tsx:23` (usado para o painel "Versões" hoje) e `atualizar` existe (ícone de refazer/atualizar); nenhum ícone dedicado de "restaurar para esta versão" | `restaurar-versao` |

**Nota de significado, não de desenho (D-33):** todos os nomes acima descrevem o papel funcional do ícone (o que ele representa no fluxo do usuário), nunca a forma exata do ícone da Blip — nenhum path/traçado da Blip foi transcrito aqui; o desenho final de cada ícone novo é responsabilidade de quem implementar, seguindo o estilo já usado em `packages/ui/src/icones.tsx` (traços simples, estilo outline, mesma grade dos ícones existentes).

---

## Pendências de medida

- **PENDENTE-CAPTURA #7 — Canvas do Builder ao vivo (nó, seta, anel de seleção).** Nenhum bundle CSS/JS específico do canvas do Builder está presente nesta captura (`zip19` só tem o Portal geral). Sem essa captura, o valor exato de azul por trás de `--p-builder-marca`, `--p-builder-marca-anel`, `--p-builder-marca-selecionado`, `--p-builder-marca-hover` fica com o valor semente (`#a3b76a`) do `02-UI-SPEC.md`, não um azul medido diretamente do canvas.
- **PENDENTE-CAPTURA #8 — Glow/sombra/gradiente do Builder.** Nenhum efeito de `--p-builder-marca-brilho`/`-sombra`/`-gradiente` foi encontrado nesta captura, nem no Portal geral nem no código atual do Builder. Se a referência tiver algum desses efeitos (ex.: glow ao arrastar uma ligação), só uma captura ao vivo confirma opacidade/blur/spread.
- **PENDENTE-CAPTURA #9 — Painel de Teste (ícone/cor do cabeçalho).** Se D-14 (painel de Teste) sair de `BLOQUEADO` na próxima rodada de captura, medir também a cor/ícone do cabeçalho daquela tela.
- **PENDENTE-CAPTURA #10 — Desenho final de cada ícone novo listado acima.** A lista de significados está fechada por esta investigação; o traçado (path) de cada ícone novo (`pessoa-atendendo`, `imagem`, `audio`, `menu-numerado`, `localizacao`, `requisicao-http`, `script`, `ambiente-de-teste`, `restaurar-versao`, `documento`) é trabalho de implementação, não de investigação — não há path de ícone da Blip a copiar (regra permanente, D-33).
