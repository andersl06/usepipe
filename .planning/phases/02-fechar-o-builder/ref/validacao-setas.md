# Validação de setas com fluxos reais (D-29.3-5)

**Data:** 2026-09-27

## O que foi procurado

Busca por qualquer export real `{flow, globalActions}` de um fluxo publicado — o formato que `arestasDe()` (`apps/management-vite/src/pages/builder/model.ts`) consome — em `referencias-blip/` (recursivo, todas as extensões e todos os subdiretórios: `builder/`, `atendimento/`, `pesquisa/`, `portal/`, `canais/`, `desk/`, `equipe/`, `fichas/`, `zips/`) e no restante do repositório.

Resultado: **nenhum export real de fluxo foi encontrado.**

- `grep -rl "conditionOutputs"` em todo `referencias-blip/` não retornou nenhum arquivo.
- `grep -rl "globalActions"` em todo `referencias-blip/` (`--include="*.json"`) não retornou nenhum arquivo.
- `find referencias-blip -iname "*auvp*"` só encontra páginas de onboarding/appcues do usuário logado (`api.appcues.net/.../anderson.linhares@auvp.com.br`) e o detalhe da aplicação `auvpescolaprd` (outro app, não o fluxo "AUVP Capital") — nada relacionado ao fluxo em si.
- Os únicos JSONs do repositório com `conditionOutputs` são fixtures **sintéticas**, criadas para teste de round-trip, não exports reais: `packages/core/src/flow/fixtures/editor-sintetico.json` (nome do próprio arquivo já diz "sintético"; blocos `onboarding`/`boas-vindas` inventados) e `apps/api/tests/fixtures/jsonb/flow-block-content.json` (fixture de schema jsonb, blocos "Boas-vindas"/"menu" de exemplo). Usá-los como se fossem o fluxo real do AUVP Capital inventaria dado — não é o que D-29.3 pede.
- A única fonte textual sobre o fluxo AUVP Capital é `referencias-blip/pesquisa/blip-portal-telas.md` (seção "1. Builder", "O fluxo real observado"): uma descrição funcional feita por leitura/automação de navegador no Portal Blip real (app "AUVP Capital", organização Supernova), **sem export do JSON nem print do canvas com contagem de setas** — só a lista de blocos observados (recepção, triagem por IA, filas, horário de atendimento, pesquisa de satisfação, campanhas, qualificação de lead, transbordos, blocos de sistema).

Essa é exatamente a lacuna já registrada como **C-42** em `ref/CAPTURAS-PENDENTES.md`: "Export do fluxo AUVP Capital em produção + print do mesmo fluxo no canvas da Blip" — pendente do dono, bloqueante só para este plano (02-09), não para o resto da fase.

## Tabela de validação

| Fluxo | Setas referência | Setas Pipe | Faltando no Pipe | Sobrando no Pipe | Casos (atendimento, condições múltiplas, Redirect, ProcessHttp) | Veredito |
|---|---|---|---|---|---|---|
| AUVP Capital (produção, Supernova) | não disponível (sem export nem print) | não disponível (sem export para rodar `lerDesenho`/`arestasDe`) | — | — | descritos em `blip-portal-telas.md` (atendimento humano, pesquisa de satisfação com ramificação, campanhas), mas sem o JSON para rodar contra `arestasDe()` | **NEEDS VALIDATION (captura C-42 pendente)** |

Nenhum outro export real (`{flow, globalActions}` de um fluxo publicado, do AUVP Capital ou de qualquer outro cliente/fluxo) foi encontrado em `referencias-blip/` para preencher uma segunda linha desta tabela.

## Por que `modelo.ts`/`model.ts` não foi alterado

O plano 02-06 já caracterizou `arestasDe()` com 9 testes (`edges:` em `apps/management-vite/tests/builder-editor.test.ts`) cobrindo exatamente os casos do inventário `ref/inventario-paineis-e-setas.md` §"Relações que geram seta (D-29.2)": saída normal, saída de atendimento humano, saída de disponibilidade (`$isDeskCustomOutput`), exclusão de `$isDeskDefaultOutput`, exclusão de `$defaultOutput`, dedupe de múltiplas saídas para o mesmo destino, e destino inexistente — sem encontrar nenhuma divergência reproduzível (`02-06-SUMMARY.md`). Este plano não encontrou nenhum export real adicional (de qualquer fluxo, não só do AUVP Capital) que pudesse expor um caso não coberto por aquela caracterização.

Sem um export real para rodar contra `arestasDe()`, não há caso mínimo a registrar nem divergência a reproduzir — alterar `modelo.ts`/`model.ts` sem evidência seria mudança especulativa, proibida pela regra do plano ("corrigir só divergência reproduzida"). `modelo.ts` **não foi alterado**.

## Status de BUILDER-05

- **Comportamento de `arestasDe()` (D-29.2/29.4/29.5):** caracterizado e sem divergência encontrada — herdado de 02-06, confirmado por este plano ao não achar nenhum export real que o contradissesse.
- **Validação com fluxo real do AUVP Capital (D-29.3):** **bloqueada por captura pendente (C-42)** — não fechada nesta wave. Quando o dono fornecer o export `{flow, globalActions}` do fluxo AUVP Capital e o print do canvas da referência, repetir este procedimento (rodar `lerDesenho`/`arestasDe` sobre o export e comparar linha a linha com o print) para fechar D-29.3 e, com isso, a validação completa de BUILDER-05 com evidência de fluxo real.

## Resultado com o export real (2026-10-06)

Export recebido do dono: `auvpcapitaldev1 (7).json` (formato `{flow, globalActions}`, 174 blocos).

| Medida | Valor |
|---|---|
| Blocos | 174 |
| Saídas de condição (`$conditionOutputs`) | 261 |
| Setas desenhadas por `arestasDe()` | 245 |
| Duplicadas removidas (mesmo bloco, mesmo destino) | 14 |
| Destino inexistente no fluxo | 1 |
| Saída de erro de encaminhamento (`$isDeskDefaultOutput`, não desenhada) | 1 |
| Blocos com `$defaultOutput` (não desenhado por regra) | 174, dos quais 168 com destino existente e 15 que também são uma condição |

Leitura: a função roda num fluxo real sem divergência com a regra documentada em `inventario-paineis-e-setas.md`. Veredito: **NEEDS VALIDATION** até o dono comparar a contagem com o canvas da Blip (dois ou três blocos bastam). O JSON de origem fica fora do repositório (está em Downloads do dono).
