# Phase 2: Fechar o Builder - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-26
**Phase:** 02-fechar-o-builder
**Areas discussed:** Pesquisa de satisfação e tags, Painéis de Teste e Filas, Catálogo de conteúdo/ação, ProcessHttp e arestasDe(), Paridade visual e identidade do Pipe

---

## Todos pendentes cruzados com a fase

| Todo | Score | Selecionado |
|------|-------|-------------|
| ProcessHttp em entering actions pula as ações seguintes na retomada | 0.6 | ✓ |
| Varredura de recuperação para `process_http_execucao` preso em `chamando` (BullMQ) | 0.2 | ✓ |

**User's choice:** as duas entram. Suportar a retomada no motor (não proibir no Builder); implementar varredura com timeout + alerta em produção. Wave técnica do motor com testes de regressão.
**Notes:** "A regra da fase é não limitar a UI para contornar uma limitação atual do motor. A Phase 2 deve fechar a funcionalidade de ponta a ponta: Builder + contrato + API + motor."

## Seleção de áreas

Todas as quatro áreas propostas foram selecionadas. O dono adicionou uma quinta: paridade visual com a referência e identidade do Pipe (azul de marca/ênfase vira verde Pipe em todos os estados e efeitos; resto preservado).

---

## Pesquisa de satisfação e tags

| Option | Description | Selected |
|--------|-------------|----------|
| Nativo 1-5 | Bloco dedicado, saída "exibir apenas blocos de pesquisa", nota 1-5 | ✓ |
| NPS 0-10 artesanal | Blocos comuns + script + TrackEvent | |
| Unificar os dois | Bloco com escala configurável | |

| Option | Description | Selected |
|--------|-------------|----------|
| Tags do bloco ($tags) | Paleta/sugestões iguais à referência, só tela | |
| Etiquetas de encerramento (tabela etiqueta) | Saídas ramificam pela etiqueta | |
| Os dois | Paleta do bloco E etiquetas de encerramento disponíveis | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| Tabela própria + variável | Nova tabela + nota como variável | |
| Só variável do fluxo | Sem persistência por ticket | |
| Evento TrackEvent | Evento genérico | |

**User's choice:** nenhuma. Não decidir a persistência ainda; investigar a pesquisa nativa da referência de ponta a ponta (Builder, Atendimento, Relatórios/Analytics, API, bundles) e só então definir o schema, capaz de reproduzir comportamento e relatórios da referência.

| Option | Description | Selected |
|--------|-------------|----------|
| Configurável por saída, ramifica por categoria | 4 saídas fixas | |
| Só encerrado pelo atendente, por categoria | | |
| Configurável por saída, ramifica por nota | Uma saída por nota | |

**User's choice:** nenhuma. Reproduzir exatamente a Blip; investigar cada encerramento, o filtro "exibir apenas blocos de pesquisa", estrutura do bloco, ramificação, timeout, variáveis. Não inferir saídas a partir das categorias do relatório.

| Option | Description | Selected |
|--------|-------------|----------|
| Paridade Blip: tags disponíveis como variável | `input.content@tags`, condições normais | ✓ (com detalhamento) |
| Ramificação por etiqueta | Extensão Pipe | |
| Investigar antes | | |

**Notes:** reproduzir diferenças por tipo de encerramento (atendente e inatividade disponibilizam ticket em `input.content`; cliente não gera o mesmo `input.content`; investigar mecanismo de recuperação, inclusive command/API). Sem UI especial de ramificação por etiqueta. Verificar versões mais novas do Builder.

| Option | Description | Selected |
|--------|-------------|----------|
| Paleta idêntica à referência | Azul de tag fica azul | |
| Azul da paleta vira verde Pipe | | ✓ |

---

## Painéis de Teste e Filas

| Option | Description | Selected |
|--------|-------------|----------|
| Simulação local contra o motor real | Chat de teste em memória | |
| Canal de teste real no motor | Novo canal/adaptador | |
| Investigar a referência antes | | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| CRUD embutido reaproveitando PaginaFilas | | |
| Manter atalho melhorado | | |
| Investigar a referência antes | | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| Implementa a recomendação técnica, marca NEEDS VALIDATION | | |
| Para e pergunta ao dono | | |
| Dono captura mais referência | Planner lista o que falta; dono captura antes da execução | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| Aba Versões lista publicadas com Baixar + Restaurar | Consome `GET :id/builder/versoes` | |
| Investigar a referência antes | | ✓ |

---

## Catálogo de conteúdo/ação

| Option | Description | Selected |
|--------|-------------|----------|
| Todos os da referência, com motor e canal confirmados | | |
| Mídia + pesquisa primeiro | | |
| Investigar a referência antes | | ✓ (com mandato detalhado) |

**Notes:** objetivo final é todos os tipos do Builder de referência com editor + contrato + persistência + motor + canal; lista de campos a documentar por tipo; tipo novo criável não termina como "Não executada no Pipe".

| Option | Description | Selected |
|--------|-------------|----------|
| Todas as 19, com motor | | |
| As 10 do motor + script com sandbox | | |
| Investigar a referência antes | | ✓ (com mandato detalhado) |

**Notes:** não assumir as 19 do SDK como final; cruzar bundles, Help Center, SDK, payload, Logs/Debug; verificar `ExecuteBlipFunction` e ações de IA; scripts e biblioteca de funções investigados antes de escolher sandbox.

| Option | Description | Selected |
|--------|-------------|----------|
| Constrói equivalente nativo quando reproduzível | | |
| Só o que o motor já tem base | | |
| Decidir ação por ação após a investigação | Dono aprova a lista num portão | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| Blip ao vivo no momento da investigação | | ✓ (com congelamento) |
| Snapshot capturado em 23/09 (zip19) | | |

**Notes:** alvo = Blip ao vivo no início da investigação, congelada em snapshot datado antes da implementação; lançamentos posteriores viram delta para fase futura.

---

## ProcessHttp e arestasDe()

| Option | Description | Selected |
|--------|-------------|----------|
| Sim, opção A com teste de regressão | Mesma wave dos todos dobrados | ✓ |
| Sim, mas reavaliar a opção de fix | | |
| Fora da Phase 2 | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Teste de caracterização + investigação na referência | | ✓ (ampliado) |
| Caçar o bug com fluxos reais | | ✓ (ampliado) |
| Só teste de caracterização | | |

**User's choice:** teste de caracterização + investigação da referência + validação com fluxos reais (AUVP Capital); fechar como validado se bater; divergência reproduzível vira caso mínimo + fix com regressão. `$defaultOutput` sem seta não é bug. (Primeira resposta veio com texto da interface colado; pergunta repetida uma vez.)

---

## Paridade visual e identidade do Pipe

| Option | Description | Selected |
|--------|-------------|----------|
| Tokens `--p-*` por papel, sem hex solto | | ✓ (com detalhamento) |
| Hex do verde direto no CSS do Builder | | |
| Você decide | | |

**Notes:** mapear cada azul pela função visual (brand, hover, active, focus ring, border active, selected, highlight, glow, shadow, overlay, gradiente); criar token semântico novo em `tokens.css` + `MARCA.md` quando faltar; preservar contraste/opacidade/blur; remover `#4a5d23`/`--bl-verde` gradualmente.

| Option | Description | Selected |
|--------|-------------|----------|
| Foto lado a lado por tela/estado nesta fase | | |
| Medidas por DOM/CSS agora, foto na Phase 3 | | |
| Você decide | | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| Segue tema do Pipe (claro/escuro) | | |
| Só claro, como a Blip | | |
| Você decide | | |

**User's choice:** "o builder não é claro, é tudo escuro" — premissa das opções estava errada; Pipe reproduz o tema escuro da referência.

---

## Claude's Discretion

- Critério de aceite visual da fase (escolhido: foto lado a lado por tela/estado, Builder sai VISUALLY VERIFIED).
- Formato/local do inventário congelado e da lista de capturas pendentes.
- Ordem das investigações e divisão em waves, respeitando investigação → portão do dono → implementação.
- Desenho dos testes de caracterização e da comparação com fluxos reais.
- Sandbox de scripts (após investigação), cobertura de teste do copiar/colar.

## Deferred Ideas

- Tela/dashboard de Relatório de Satisfação (Analytics).
- Mudanças da Blip posteriores ao congelamento do snapshot.
- NPS 0-10 com tela própria.
- Aba "Variáveis" do painel de Configuração, se não entrar no inventário.
