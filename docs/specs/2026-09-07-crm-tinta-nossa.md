# O CRM: arquitetura e funções do Twenty, tinta nossa

Vinculante. Decidido em 07/09/2026, e fecha as quatro perguntas em aberto de
[`fork-do-twenty`](2026-09-07-fork-do-twenty.md).

É o **mesmo método** que a Gestão e o Desk usam com a Blip, e que está escrito no CSS delas desde o
primeiro dia: **a disposição é deles, a tinta é nossa.** Agora aplicado ao Twenty.

## 1. O que se copia e o que não

| Camada | De onde vem |
|---|---|
| Arquitetura, objetos, GraphQL, permissões, workflows | **do Twenty**, pelo fork |
| Disposição de tela, densidade, comportamento | **do Twenty** |
| Ícones | Tabler — **os dois já usam o mesmo** |
| **Cor, tipografia, raio, sombra** | **nossos**, de `MARCA.md` |
| Nome, símbolo, textos | **nossos** |

## 2. O achado que torna isto barato

O `twenty-ui` **não tem cor escrita nos componentes**. Ele tem uma pasta `design-tokens/` (326 KB,
com `accent.ts`, `background.ts`, `border.ts`, `color/*`, `boxShadow.ts`, `buttons.ts`) e um script
gerador:

```
packages/twenty-ui/scripts/generateThemeTokens.ts
   →  theme/constants/ThemeLight.ts
   →  theme/constants/ThemeDark.ts
   →  theme/constants/GrayScaleLight.ts / GrayScaleDark.ts
```

Os arquivos gerados dizem, no topo: *"Generated from design-tokens. Do not edit manually."*

E o destaque inteiro do produto sai de **um arquivo**:

```ts
// design-tokens/accent.ts
export const ACCENT_TOKENS = {
  primary: COLOR_TOKENS.blue5,
  secondary: COLOR_TOKENS.blue5,
  tertiary: COLOR_TOKENS.blue3,
  // … accent1 a accent12, todos blue
};
```

**Trocar `blue` pelo nosso moss em `accent.ts`, ajustar a escala de cinza para o creme da marca, e
rodar o gerador repinta a aplicação inteira** — sem tocar em um componente sequer.

Isso é a diferença entre "adaptar o visual do Twenty" ser uma semana de caça a `styled` espalhado, e
ser um dia de trabalho num punhado de arquivos de token.

## 3. O mapeamento

O Twenty organiza cor em escala de 12 degraus por matiz (padrão Radix). O Pipe organiza por **papel**
(`--p-superficie-0..4`, `--p-conteudo*`, `--p-marca*`), com 31 tokens ao todo. São gramáticas
diferentes, e o mapeamento é o trabalho de verdade:

| Twenty | Pipe |
|---|---|
| `gray1` … `gray5` (fundos claros) | `--p-superficie-0..3` |
| `gray10` … `gray12` (texto) | `--p-conteudo`, `--p-conteudo-desabilitado`, `--p-conteudo-fantasma` |
| `blue5` (`accent.primary`) | `--p-marca` (moss `#4a5d23`) |
| `blue1` … `blue4` | derivados do moss, para os fundos de estado ativo |
| `red`, `yellow`, `green` | os trios `--p-erro-*`, `--p-alerta-*`, `--p-sucesso-*` |
| escala estendida (12 matizes) | `--p-grafico-1..5`, **cercada a gráfico e ilustração** |

Duas decisões que o mapeamento força:

1. **O Twenty usa `color(display-p3 …)`; nós usamos hex.** P3 é espaço de cor maior e rende melhor em
   tela boa. Manter P3 com os nossos valores é conversão, não decisão de marca — e vale manter,
   porque degradar para sRGB seria perder qualidade de graça.
2. **Eles têm 12 matizes na paleta estendida; nós cercamos a nossa a gráfico.** Onde o Twenty pinta
   etiqueta de registro com 12 cores, o Pipe pinta com superfície neutra. Isso é regra de marca e
   vence a disposição deles — é o único ponto em que **não** copiamos.

## 4. Ícones

Os dois usam **Tabler**. O `twenty-ui` traz `@tabler/icons-react` e o Pipe tem a fachada
`packages/ui/src/icones.tsx` com os caminhos copiados (MIT, © Paweł Kuna, atribuído no arquivo).

Consequência boa: **o traço é o mesmo dos dois lados**, e as telas nossas que ficarem fora do fork
(Desk e Gestão) não destoam do CRM. O tamanho também bate — a régua do Twenty é 14/16/20/24 e a
nossa é a mesma.

## 5. O que fica com o `apps/crm` atual

O fork traz lista, ficha, quadro e filtro prontos. O que o Twenty **não** tem, e é nosso, precisa
migrar para dentro dele como objeto e campo customizados:

- **score do lead** e a régua que o calcula (`packages/core/src/score`)
- **faixa** e o roteamento por faixa
- **desqualificação com motivo** de catálogo
- **origem, campanha e UTM** como campos de primeira classe
- a ligação **conversa → lead**, que é a razão de o Pipe existir

O cromo do Lightning aplicado em `ca1147e` **é descartado** — ele existiu enquanto a referência do
CRM era o Salesforce, e a referência mudou. As medidas ficam registradas em
`salesforce-estrutura-e-visual.md` para o dia em que servirem à Gestão.

## 6. A fronteira da licença continua valendo

Nada disto afrouxa o que está em [`fork-do-twenty`](2026-09-07-fork-do-twenty.md) §2: o fork é
AGPLv3, vive em repositório próprio, conversa por rede, e **nenhuma linha dele entra em `apps/*` ou
`packages/*`**. Trocar a cor não muda a licença do código que a usa.

Os 347 arquivos `@license Enterprise` continuam fora — inclusive os 52 do front, que são as telas de
configuração de SSO, billing e permissão avançada.

## 7. Ordem de trabalho

1. Ler os `design-tokens/` e escrever o mapeamento completo, token a token.
2. Trocar `accent.ts` e a escala de cinza; rodar o gerador; comparar antes e depois numa tela.
3. Trocar tipografia e raio.
4. Substituir marca, nome e textos.
5. Só então mexer em objeto e campo — que é onde o score e a faixa entram.

A ordem importa: **cor primeiro** porque é o que se vê, é reversível, e prova que o caminho do
gerador funciona antes de investir em modelagem.
