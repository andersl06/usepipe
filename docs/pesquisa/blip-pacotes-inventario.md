# Inventário dos pacotes da Blip

Análise da pasta `Downloads/blio`, extraída pelo Anderson do navegador. 54 arquivos, 29 MB.

**Uso.** Nada daqui entra no repositório do Pipe. Valor de medida, nome de componente e regra de
layout são fato, e fato não tem copyright; código é expressão e não se copia. O que se aproveita é
o método e a medida.

## 1. São três produtos, não um

A pasta mistura pacotes de aplicações diferentes, e confundir isso custou tempo:

| Arquivo | Tamanho | Produto |
|---|---|---|
| `app.731c…css` | 791 KB | **Blip Desk**, folha de estilo |
| `58.d23f…js` | 3,6 MB | **Blip Desk**, pacote principal |
| `app.3c31…js` | 2,4 MB | **Blip Desk**, aplicação |
| `index do desk`, `desk` | 1 KB | **Blip Desk**, HTML de entrada |
| `portal.css` | 970 KB | **Portal**, o casco da gestão |
| `home` | 1,6 KB | **Portal**, HTML de entrada |
| `vendor-…translate…js` | 1,7 MB | traduções, todos os textos de interface |
| ~30 `bds-*.js` | 2 KB a 3,6 MB | **blip-ds**, o design system |

O HTML `home` referencia `/portal.css` e `/portal.js` com o hash `46c175c10e55b494`. Foi essa pista
que permitiu baixar o que faltava.

**O que ainda falta**: `portal.js`, e o micro-frontend do módulo de atendimento
(`portalmfe.blip.ai/beagle/portal-fragment-desk-mfe/latest/main.js`, 4,3 MB), que é onde vivem as
telas de Monitoramento, Histórico e SLA. Ambos baixados à parte, no scratchpad da sessão.

## 2. O design system, com 22 componentes

Do prefixo `bds-`, a lista completa do que eles empacotam:

```
alert (+ header, body, actions)   autocomplete   avatar   badge
button   button-icon   card   checkbox   chip-clickable   grid
icon   illustration   input   input-editable   loading-spinner
menu (+ action, exibition, list)
```

Três merecem atenção:

- **`chip-clickable`** — a etiqueta é componente de primeira classe e tem variante clicável. Nem
  Chatwoot nem Twenty têm um genérico, e cada tela reimplementa o seu. Já resolvido no
  `packages/ui` do Pipe.
- **`illustration`** — ilustração é componente, não imagem solta. É como preenchem estado vazio sem
  depender de foto ou de serviço externo. Também já resolvido.
- **`input-editable`** — campo que vira editável no lugar, sem abrir formulário. Não temos, e é
  padrão bom para a ficha do contato.

O `bds-icon` sozinho tem 3,6 MB, o que indica que empacotam a biblioteca inteira de ícones em vez
de importar o que usam.

## 3. Regras de layout do Portal, medidas

**Grade**: eles não usam uma grade única. Usam `repeat(N, minmax(15rem, 15fr))` com N de 1 a 4,
escolhido por contexto, e `repeat(auto-fit, minmax(240px, 1fr))` onde a quantidade varia.

**Alturas, por frequência**:
```
28px   48 ocorrências    controle pequeno, linha de item
40px   41                controle padrão, botão
27px   32
20px   28                ícone
56px   21                cabeçalho de bloco
```

**Espaçamento entre elementos**:
```
8px    20 ocorrências
12px   20
16px   13  (1rem)
4px    10
```

Ou seja: a régua de espaço é de 4 em 4, com 8 e 12 dominando. Bate com o `spacing()` do `twenty-ui`
e com o que o `packages/ui` do Pipe já adota.

## 4. As traduções, uma fonte que não usamos ainda

`vendor-app_modules_translate_translationLoaders_sync_recursive_js_.js` tem 1,7 MB e carrega **todos
os textos de interface** do produto, em todos os idiomas que eles suportam.

Serve para duas coisas: conferir o vocabulário que eles usam para cada conceito (e decidir se o
nosso é melhor ou pior), e descobrir telas e estados que não aparecem na navegação normal, porque
toda mensagem de erro e de estado vazio está ali.

Não foi explorada. Fica registrado como fonte disponível.

## 5. O que a análise do bundle não entrega

Duas limitações que valem registro, para ninguém tentar de novo:

**Rota não sai do bundle.** A busca por padrão de caminho no pacote principal do Desk não devolve
nada: as rotas são montadas em tempo de execução, não escritas como texto.

**Tamanho de fonte mente.** Os componentes `bds-*` são web components com shadow DOM, e
`getComputedStyle` no elemento hospedeiro devolve 16px para tudo. Os valores reais só aparecem
atravessando o shadow DOM no navegador. Foi assim que se descobriu que rótulo é 12px peso 400 e
valor é 16px peso 700.

**Conclusão de método**: o bundle dá a regra de layout e o inventário de componentes; o DOM vivo dá
a medida real. Nenhum dos dois basta sozinho.
