# Referência congelada — Builder (Phase 2)

**Congelado em:** 2026-09-26

Este documento fixa a data e a procedência dos cinco inventários produzidos na wave 1 (investigação) da Phase 2. A partir desta data, qualquer mudança que a Blip publique no Builder é **delta para fase futura** (D-02) — não amplia o escopo desta fase nem dos planos 02-08 a 02-22. A base é a captura `referencias-blip/builder/zip19` (23/09/2026) cruzada com pesquisa e documentação pública já registradas no repositório (ver procedência em cada inventário); nenhuma sessão desta investigação teve acesso ao vivo, autenticado, ao Builder real da Blip.

Mudanças da Blip depois desta data são delta para fase futura (D-02).

## Inventários congelados

| Inventário | Arquivo | Commit |
|---|---|---|
| Conteúdo (BUILDER-01) | `ref/inventario-conteudo.md` | `1bc88c7` |
| Ações, scripts e biblioteca de funções (BUILDER-01/02) | `ref/inventario-acoes.md` | `0feb0ae` |
| Pesquisa de satisfação e tags (BUILDER-03) | `ref/inventario-satisfacao-e-tags.md` | `467503d` |
| Painéis, copiar/colar, seletor de destino e setas (BUILDER-04/05) | `ref/inventario-paineis-e-setas.md` | `5dc46ec` |
| Mapa visual azul→verde e ícones (BUILDER-04/05, identidade) | `ref/inventario-visual.md` | `d0d8b62` |

Cada commit acima é o último a tocar o respectivo arquivo até o momento do congelamento (`git log -1 --format=%h -- <arquivo>`).

## Caminhos resolvidos (D-05)

O mapa old→new da Phase 1 (`std/map/gestao-vite.csv`, `packages-core.csv`, `api.csv`, `packages-contracts.csv`, `packages-db.csv`) está com as linhas relevantes ao Builder em status **`approved`**, mas a aplicação mecânica do mapa (D-49) **ainda não rodou** neste repositório — confirmado por `Glob`/leitura direta: todos os arquivos abaixo existem hoje só com o nome em português citado pelos inventários e pelo `02-RESEARCH.md`/`02-PATTERNS.md`. Por isso, para todo arquivo de código citado pelos planos 02-08..02-22, **o caminho vigente é o caminho atual** (D-05, regra explícita do plano: "se a aplicação D-49 ainda não entrou, caminho vigente = caminho atual"). A coluna "Destino aprovado" abaixo é só referência para quando a Phase 1 aplicar o mapa — nenhum plano de implementação desta fase deve hardcodar esse destino como caminho de leitura/escrita antes da aplicação real.

| Caminho citado | Status no std/map | Caminho vigente |
|---|---|---|
| `apps/gestao-vite/src/paginas/builder/modelo.ts` | approved → destino `apps/management-vite/src/pages/builder/model.ts` (nota do map: "contextual: flow-builder data model, not a WhatsApp message template" — resolve o Pitfall 4 do `02-RESEARCH.md`) | `apps/gestao-vite/src/paginas/builder/modelo.ts` |
| `apps/gestao-vite/src/paginas/builder/painel-saidas.tsx` | approved → destino `apps/management-vite/src/pages/builder/panel-outputs.tsx` | `apps/gestao-vite/src/paginas/builder/painel-saidas.tsx` |
| `apps/gestao-vite/src/paginas/builder/painel-configuracao.tsx` | approved → destino `apps/management-vite/src/pages/builder/panel-configuration.tsx` | `apps/gestao-vite/src/paginas/builder/painel-configuracao.tsx` |
| `apps/gestao-vite/src/paginas/builder/painel-filas.tsx` | approved → destino `apps/management-vite/src/pages/builder/panel-queues.tsx` | `apps/gestao-vite/src/paginas/builder/painel-filas.tsx` |
| `apps/gestao-vite/src/paginas/builder/etiquetas-do-bloco.ts` | approved → destino `apps/management-vite/src/pages/builder/tags-of-block.ts` | `apps/gestao-vite/src/paginas/builder/etiquetas-do-bloco.ts` |
| `apps/gestao-vite/src/paginas/builder/acoes-do-bloco.ts` | approved → destino `apps/management-vite/src/pages/builder/actions-of-block.ts` | `apps/gestao-vite/src/paginas/builder/acoes-do-bloco.ts` |
| `apps/gestao-vite/src/paginas/builder/painel-conteudo.tsx` | approved → destino `apps/management-vite/src/pages/builder/panel-content.tsx` | `apps/gestao-vite/src/paginas/builder/painel-conteudo.tsx` |
| `apps/gestao-vite/src/paginas/builder/painel-acoes.tsx` | approved → destino `apps/management-vite/src/pages/builder/panel-actions.tsx` | `apps/gestao-vite/src/paginas/builder/painel-acoes.tsx` |
| `apps/gestao-vite/src/paginas/builder/painel.tsx` | approved → destino `apps/management-vite/src/pages/builder/panel.tsx` | `apps/gestao-vite/src/paginas/builder/painel.tsx` |
| `apps/gestao-vite/src/paginas/builder/estado.ts` | approved → destino `apps/management-vite/src/pages/builder/state.ts` | `apps/gestao-vite/src/paginas/builder/estado.ts` |
| `apps/gestao-vite/src/paginas/builder/variaveis.ts` | approved → destino `apps/management-vite/src/pages/builder/variables.ts` | `apps/gestao-vite/src/paginas/builder/variaveis.ts` |
| `apps/gestao-vite/src/paginas/builder/painel-variaveis.tsx` | approved → destino `apps/management-vite/src/pages/builder/panel-variables.tsx` | `apps/gestao-vite/src/paginas/builder/painel-variaveis.tsx` |
| `apps/gestao-vite/src/paginas/builder/importar-exportar.ts` | approved → destino `apps/management-vite/src/pages/builder/import-exportar.ts` | `apps/gestao-vite/src/paginas/builder/importar-exportar.ts` |
| `apps/gestao-vite/src/paginas/builder/condicoes.ts` | approved → destino `apps/management-vite/src/pages/builder/conditions.ts` | `apps/gestao-vite/src/paginas/builder/condicoes.ts` |
| `apps/gestao-vite/src/paginas/builder/conteudo.ts` | sem linha de arquivo no mapa (só o diretório-pai tem rename aprovado; nome do arquivo em si não foi proposto para tradução) | `apps/gestao-vite/src/paginas/builder/conteudo.ts` |
| `apps/gestao-vite/src/paginas/builder/canvas.tsx` | sem linha de arquivo no mapa (mesma situação de `conteudo.ts`) | `apps/gestao-vite/src/paginas/builder/canvas.tsx` |
| `apps/gestao-vite/src/paginas/builder-gravar.ts` | sem linha de arquivo no mapa (só símbolos internos têm rename aprovado; nome do arquivo mantém-se) | `apps/gestao-vite/src/paginas/builder-gravar.ts` |
| `apps/gestao-vite/tests/builder-editor.test.ts` | sem linha de arquivo no mapa (só símbolos/títulos de teste internos têm rename aprovado) | `apps/gestao-vite/tests/builder-editor.test.ts` |
| `apps/gestao-vite/tests/builder-painels.test.ts` | sem linha de arquivo no mapa (idem) | `apps/gestao-vite/tests/builder-painels.test.ts` |
| `packages/core/src/fluxo/acoes.ts` | approved → destino `packages/core/src/flow/actions.ts` (dir `packages/core/src/fluxo` → `packages/core/src/flow` também approved) | `packages/core/src/fluxo/acoes.ts` |
| `packages/core/src/fluxo/editor.ts` | sem linha de arquivo no mapa (só o diretório-pai tem rename aprovado) | `packages/core/src/fluxo/editor.ts` |
| `packages/core/src/fluxo/gerenciador.ts` | approved → destino `packages/core/src/flow/manager.ts` | `packages/core/src/fluxo/gerenciador.ts` |
| `packages/contracts/src/gestao-fluxo.ts` | approved → destino `packages/contracts/src/management-flow.ts` | `packages/contracts/src/gestao-fluxo.ts` |
| `packages/contracts/src/encerramento.ts` | approved → destino `packages/contracts/src/closure.ts` | `packages/contracts/src/encerramento.ts` |
| `packages/db/src/schema/conversas.ts` | approved → destino `packages/db/src/schema/conversations.ts` | `packages/db/src/schema/conversas.ts` |
| `packages/db/src/schema/automacao.ts` | approved → destino `packages/db/src/schema/automation.ts` | `packages/db/src/schema/automacao.ts` |
| `apps/api/src/dominio/fluxo.ts` | approved → destino `apps/api/src/domain/flow.ts` (dir `dominio` → `domain` approved) | `apps/api/src/dominio/fluxo.ts` |
| `apps/api/src/filas.ts` | approved → destino `apps/api/src/queues.ts` | `apps/api/src/filas.ts` |
| `apps/api/src/controladores/gestao-builder.ts` | approved → destino `apps/api/src/controllers/management-builder.ts` (dir `controladores` → `controllers` approved) | `apps/api/src/controladores/gestao-builder.ts` |
| `apps/api/src/dominio/gestao/builder-do-fluxo.ts` | approved → destino `apps/api/src/domain/management/builder-of-flow.ts` (dir `dominio/gestao` → `domain/management` approved) | `apps/api/src/dominio/gestao/builder-do-fluxo.ts` |
| `apps/api/src/dominio/envio.ts` | sem linha de arquivo no mapa (só o diretório-pai tem rename aprovado) | `apps/api/src/dominio/envio.ts` |
| `apps/api/src/dominio/whatsapp/*`, `apps/api/src/dominio/instagram/*`, `apps/api/src/dominio/messenger/*` | diretórios aprovados (`domain/whatsapp`, `domain/instagram`, `domain/messenger`); arquivos individuais dentro deles não foram conferidos linha a linha nesta consolidação | caminhos atuais (`apps/api/src/dominio/whatsapp/`, `.../instagram/`, `.../messenger/`) |
| `packages/ui/src/estilos/tokens.css`, `packages/ui/src/tema.ts`, `packages/ui/src/icones.tsx` | sem linha no mapa (`std/map/packages-ui.csv` não lista rename proposto para estes três arquivos até o momento) | caminhos atuais (sem mudança prevista) |

**Resumo da regra:** nenhum arquivo listado acima já foi fisicamente renomeado neste repositório. Todo plano de implementação (02-08..02-22) deve ler/escrever pelo caminho **vigente** (coluna da direita); se a Phase 1 aplicar o mapa antes de um desses planos rodar, o executor daquele plano deve reconferir o CSV no momento da execução (mesma instrução já registrada em `02-RESEARCH.md`/`02-PATTERNS.md`), não confiar cegamente nesta tabela congelada.
