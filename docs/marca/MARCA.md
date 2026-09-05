# Pipe — identidade

## Símbolo
Dois cotovelos de tubulação monoline que se encaixam sem se tocar: um traço preto que sobe e
vira à direita, e um traço moss que desce e volta à esquerda. Traço uniforme (12 em grade de 120),
pontas e curvas arredondadas. O vão entre os dois é parte do desenho — nunca fechar.

Lockup oficial: **símbolo + wordmark** (variante 1b do estudo original).
O ponto do "i" é um círculo moss — é a única cor no wordmark.

Arquivos em `packages/ui/assets/`:
- `pipe-lockup.svg` — uso padrão, duas cores
- `pipe-symbol.svg` — app icon, favicon, avatar
- `pipe-lockup-mono.svg` / `pipe-symbol-mono.svg` — herdam `currentColor`, para fundo escuro,
  gravação, uma cor só

Área de respiro: metade da altura do símbolo em toda a volta.
Tamanho mínimo do lockup: 120px de largura. Abaixo disso, só o símbolo.

## Cores

| Papel | Hex | Uso |
|---|---|---|
| Moss (primária) | `#4A5D23` | marca, ação primária, estado ativo |
| Sage | `#8A9A5B` | apoio, gráficos, estados suaves |
| Tinta | `#111111` | texto, traço do símbolo |
| Creme | `#F2F1EC` | fundo de aplicação |
| Borda | `#E2E0D8` | divisórias, contorno de card |
| Cinza texto | `#55544D` `#5F5E57` `#6B6A62` | hierarquia de texto secundário |
| Terracota | `#C4442E` | erro, SLA estourado, ofensor |
| Azul profundo | `#2E4A5D` | informação, links de dado |
| Verde escuro | `#1F3A2E` | sucesso, meta batida |
| Branco | `#FFFFFF` | superfície de card |

Regra: moss não vira cor de alerta. Vermelho é só terracota, e só para o que exige ação.

## Tipografia
- Texto e títulos: sans geométrica (system stack com Helvetica/Arial de fallback)
- Rótulos, códigos, IDs, métricas: **IBM Plex Mono**, caixa alta, `letter-spacing` 0.14–0.16em,
  11px — é a assinatura visual do produto, herdada do estudo da marca
