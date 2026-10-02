Base: 720a5812e6964c2ae455d9c0a0e3c9076e5105d2
Tema: claro (capturas congeladas de `referencias-blip/desk/desk/`; D-12).

# Verificação: Pesquisa de satisfação (`survey-dashboard`) (Blip x Pipe)

**Aviso de método.** A captura ao vivo FALHOU (sessão do Chrome de automação na Blip expirada; nada medido hoje). Fontes: `referencias-blip/desk/desk/desk-satisfacao__pagina.html` (rótulos, abas, placeholders, tooltips), `fichas/FICHA-relatorio-satisfacao.md` (reconstruída de chaves de tradução; colunas e métricas "esperadas, não confirmadas"), `ref/inventario-visual.md`. Sem geometria renderizada da Blip: toda linha é [A] ou NEEDS VALIDATION. Nenhum dado pessoal ou marcação copiados.

## Estado: com dados

| Elemento | Blip | Pipe | Diferença | Status |
|---|---|---|---|---|
| Título e período | "Relatório de satisfação"; período e "Filtros" à direita [A] | igual | nenhuma conhecida | NEEDS VALIDATION |
| "Dados gerais" | 4 cartões: Média geral de satisfação, Total de tickets fechados, Total de respostas, Taxa de resposta [A] | iguais; média "—" quando há mais de uma escala | decisão de fórmula do Pipe | NEEDS VALIDATION (pendente: fórmulas da Blip) |
| Satisfação geral / Comparativo | pizza e barras com seletor Atendentes/Filas [A] | distribuição em tabela; comparativo vazio honesto | sem gráfico (sem `--p-grafico-*` aplicado) | NEEDS VALIDATION (pendente) |
| Análise do período | série diária [A] | vazio honesto | sem consulta | NEEDS VALIDATION (pendente) |
| Detalhamento | abas Geral, Filas, Atendentes [A] | iguais, na URL | nenhuma conhecida | NEEDS VALIDATION |
| Filtros da Blip | Pesquisas, Tipos de avaliação, Atendentes, Filas, Contato (placeholders na captura) | só período | filtros ausentes no Pipe; comportamento atual mantido | NEEDS VALIDATION (pendente) |
| Filtro de período | atalhos + Personalizado | `FieldPeriod maxDias=90` (cliente) + teto no servidor | limite da Blip desconhecido; regra do dono aplicada | NEEDS VALIDATION (pendente) |
| Cartões | cartões brancos 14/600 sobre 20/700 [A] | `block-rel` / `card-rel` | sem medição | NEEDS VALIDATION |

## Estado: lista

| Elemento | Blip | Pipe | Diferença | Status |
|---|---|---|---|---|
| Tabela de respostas | Data, Contato, Atendente, Score, Comentário, Canal "esperado" na ficha, não confirmado | tabelas por aba | desconhecida | NEEDS VALIDATION |

## Estado: vazio

| Elemento | Blip | Pipe | Diferença | Status |
|---|---|---|---|---|
| Sem respostas | sem captura | estado vazio do Pipe | desconhecida | NEEDS VALIDATION |

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
| Painel de filtros | painel lateral | `PanelFilters` + `FieldPeriod`, `Select` global | sem captura | NEEDS VALIDATION |

## Navegação

| Clique | Destino Blip | Destino Pipe | Status |
|---|---|---|---|
| Abas Geral/Filas/Atendentes | mesma tela [A] | `?aba=` na mesma URL | NEEDS VALIDATION |
| Período e Filtros | painel lateral | `PanelFilters` | NEEDS VALIDATION |
| Exportar / configurar pesquisa | botões esperados na ficha, não confirmados | ausentes; nada exibido sem função | NEEDS VALIDATION (pendente) |

## Lacunas

Capturar ao vivo: geometria; fórmulas de média, taxa de resposta, NPS e CSAT; filtros Pesquisas/Tipos de avaliação/Contato; limite de período; exportação; gráficos (pizza, barras, série) com `--p-grafico-*`.
