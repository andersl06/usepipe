Base: 720a5812e6964c2ae455d9c0a0e3c9076e5105d2
Tema: claro (a captura ao vivo falhou; o tema vem das fichas e das capturas antigas; D-12 a confirmar na captura ao vivo).

# Verificação: Relatório de atendimento (`report`) (Blip x Pipe)

**Aviso de método.** A captura ao vivo FALHOU (a sessão do Chrome de automação na Blip expirou; nada foi medido em 2026-10-02). As fontes são `desk/desk/desk-relatorio-atendimento__pagina.html`, `fichas/FICHA-relatorio-atendimento.md` e `fichas/FICHA-report.md`. A captura `report.html` de origem é uma tela de login e não vale como fonte. Nenhuma linha abaixo foi medida: todas ficam NEEDS VALIDATION ou [A].

## Estado: com dados

| Elemento | Blip | Pipe | Diferença | Status |
|---|---|---|---|---|
| Cartões de indicadores | sem geometria medida | `Metrica` compartilhada com Monitoramento | desconhecida | NEEDS VALIDATION (capturar ao vivo) |
| Fórmulas dos indicadores | sem captura | as do Pipe (ver Coerência com o motor) | desconhecida | NEEDS VALIDATION (pendente) |

## Estado: lista

| Elemento | Blip | Pipe | Diferença | Status |
|---|---|---|---|---|
| Abas Atendentes / Filas / Tags | descritas na ficha [A] | abas por `?aba=` com tabela unificada (`tblwrap`) | desconhecida | NEEDS VALIDATION |
| Paginação e exportação | sem captura | CSV da aba visível; sem paginação própria | desconhecida | NEEDS VALIDATION (pendente) |

## Estado: vazio

| Elemento | Blip | Pipe | Diferença | Status |
|---|---|---|---|---|
| Texto sem dados | "Dados insuficientes"; "Não foram encontradas métricas de SLA no período informado" [A] | estado vazio honesto com os mesmos textos | desconhecida | NEEDS VALIDATION |

## Estado: carregando

| Elemento | Blip | Pipe | Diferença | Status |
|---|---|---|---|---|
| Indicador de carregamento | sem captura | `TabelaCarregando` | desconhecida | NEEDS VALIDATION |

## Estado: erro

| Elemento | Blip | Pipe | Diferença | Status |
|---|---|---|---|---|
| Falha de leitura | sem captura | `TabelaErro` com "Tentar novamente"; inclui o 400 `periodo_longo_demais` | desconhecida | NEEDS VALIDATION |

## Estado: filtro de período aberto

| Elemento | Blip | Pipe | Diferença | Status |
|---|---|---|---|---|
| Painel de filtros e período | painel lateral "Filtros" (medido no Histórico, plano 16) | `PanelFilters` + `FieldPeriod` com `maxDias=90` | limite de período do relatório na Blip não observado | NEEDS VALIDATION (pergunta 4 da Onda 2 aberta) |

## Coerência com o motor

- `attendance.ts` lê `encerrada_por ?? closedBy` e trata `inatividade` como saída do cliente.
- Mensagens `sistema` e `bot` não geram esforço.
- Conversa sem fila aparece como "Sem fila" no eixo Filas; o fallback de fila padrão (`queue-entry.ts`) não foi conferido neste eixo.
- Não há teste novo de integração dessas leituras com banco.

## Unificação do cartão (D-06)

- `Metrica` é usada por `monitoring.tsx` e `reports-attendance.tsx`: regressão? não.
- `pages/flow/cards.tsx` fica fora da unificação (D-06).
- `CardConfig` é usado só em `settings-general*.tsx`: não unificado, a Blip o usa em 1 tela.
- `metrica.tsx` e `card-config.tsx` não foram alterados neste plano.

## Navegação

- "Gerenciador de Relatórios" leva a `${contactPath}/analytics/data-extractor`.
- As abas usam `?aba=`.
- O painel de filtros usa `PanelFilters`.
- "Baixar" gera CSV da aba visível.

## Lacunas

- Capturar ao vivo: geometria de cartões e tabelas; fórmulas dos indicadores; filtros Canal, Tag, Pesquisas, Tipos de avaliação e Contato; formato da exportação e paginação.
- Limite de período dos relatórios na Blip: aplicada a regra de 90 dias do dono; a pergunta 4 da Onda 2 continua aberta.
- Sem consulta no Pipe, com estado vazio honesto mantido: SLA agregado, tempo máximo, Abertos, série diária, Disponibilidade e os gráficos de satisfação.
