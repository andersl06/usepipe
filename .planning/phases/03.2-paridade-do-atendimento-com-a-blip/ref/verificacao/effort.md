Base: 720a5812e6964c2ae455d9c0a0e3c9076e5105d2
Tema: claro (captura de verificação do Pipe em `referencias-blip/desk/desk/verif/esforco.png`; D-12).

# Verificação: Esforço por atendente (`effort`) (Blip x Pipe)

**Aviso de método.** A captura ao vivo FALHOU (sessão do Chrome de automação na Blip expirada; nada medido hoje). `fichas/FICHA-relatorio-esforco.md` registra que NÃO existe captura de tela de esforço na Blip (busca negativa por "effort"/"esforço" nas capturas; `desk-esforco__pagina.html` traz só a casca do portal). Não é possível afirmar que a Blip tem esta tela. Toda linha é NEEDS VALIDATION; o comportamento atual do Pipe foi mantido, só com os ajustes de regras do dono e dos estados.

## Estado: com dados

| Elemento | Blip | Pipe | Diferença | Status |
|---|---|---|---|---|
| Existência da tela | sem captura | "Esforço por atendente" | desconhecida | NEEDS VALIDATION (pendente) |
| Cartões "Total do período" | sem captura | 3 cartões-rótulo (`block-rel`) | desconhecida | NEEDS VALIDATION |
| Tabela por atendente | sem captura | 11 colunas (tickets, esforço, escrito, lido, áudio, sessão, ocupação, resposta pronta) | desconhecida | NEEDS VALIDATION |
| Filtro de período | atalhos + Personalizado | `FieldPeriod maxDias=90` no painel (antes: dois campos de data nativos num formulário) | limite da Blip desconhecido; regra do dono aplicada | NEEDS VALIDATION (pendente) |

## Estado: lista

| Elemento | Blip | Pipe | Diferença | Status |
|---|---|---|---|---|
| Ordenação | sem captura | por esforço decrescente | desconhecida | NEEDS VALIDATION |

## Estado: vazio

| Elemento | Blip | Pipe | Diferença | Status |
|---|---|---|---|---|
| Sem conversas | sem captura | "Nenhuma conversa encerrada com atendente entre ..." | desconhecida | NEEDS VALIDATION |

## Estado: carregando

| Elemento | Blip | Pipe | Diferença | Status |
|---|---|---|---|---|
| Carregando | sem captura | `TabelaCarregando` (antes: tela em branco) | não medido | NEEDS VALIDATION |

## Estado: erro

| Elemento | Blip | Pipe | Diferença | Status |
|---|---|---|---|---|
| Erro, inclusive período maior que 90 dias (400 `periodo_longo_demais`) | sem captura | `TabelaErro` com "Tentar novamente" (antes: tela em branco) | não medido | NEEDS VALIDATION |

## Estado: filtro de período aberto

| Elemento | Blip | Pipe | Diferença | Status |
|---|---|---|---|---|
| Painel de filtros | painel lateral (`periodo-blip.md`) | `PanelFilters` + `FieldPeriod`, `Select` global | sem captura desta tela | NEEDS VALIDATION |

## Coerência com o motor

Mensagens `sistema` e `bot` não geram esforço (`packages/core/src/effort/regua.ts`; testes em `effort.test.ts`). Conversas sem atendente ficam fora do esforço e aparecem em "sem atendente identificado".

## Navegação

| Clique | Destino Blip | Destino Pipe | Status |
|---|---|---|---|
| Período e Filtros | painel lateral [A] | `PanelFilters` na mesma URL (`?de=&ate=`) | NEEDS VALIDATION |
| Aplicar | recarrega o relatório | navegação GET na mesma URL | NEEDS VALIDATION |

## Lacunas

Capturar ao vivo: se a tela existe na Blip (ou se esforço é aba de outro relatório), medidas, colunas, fórmulas, limite de período e exportação. Se a Blip não tem a tela, decisão do dono sobre mantê-la.
