# Atendimento Blip Fidelity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir Monitoramento e Histórico para reproduzir a estrutura, a densidade e as interações comprovadas da Blip sem alterar outras áreas do Pipe.

**Architecture:** Manter API, rotas e estado em URL existentes. Criar controles React específicos de Atendimento para filtros rápidos, estados de leitura e seleção; concentrar a geometria visual no CSS exclusivo do módulo e preservar os tokens Pipe.

**Tech Stack:** React 19, React Router 7, TanStack Query 5, TypeScript 5.9, CSS nativo, testes Node/tsx.

## Global Constraints

- Trabalhar somente em Atendimento: Monitoramento, Histórico e componentes exclusivos usados por essas telas.
- Não alterar endpoints nem substituir APIs funcionais por mocks.
- Não inventar comportamentos ausentes nas referências; registrar pendências.
- Preservar estado compartilhável na URL e navegação existente.
- Usar como evidência `docs/pesquisa/blip-medidas-monitoramento.md`, `docs/pesquisa/blip-telas-atendimento.md`, os DOMs/capturas locais e o bundle do ZIP.

---

### Task 1: Filtros rápidos e estados de Monitoramento

**Files:**
- Modify: `apps/gestao-vite/src/componentes/filtros-rapidos.tsx`
- Modify: `apps/gestao-vite/src/lib/filtros-monitoramento.ts`
- Modify: `apps/gestao-vite/src/paginas/operacao/monitoramento.tsx`
- Modify: `apps/gestao-vite/src/paginas/operacao/atendimento.css`
- Test: `apps/gestao-vite/tests/filtros-monitoramento.test.ts`

**Interfaces:**
- Consumes: `Busca`, catálogos de filas/atendentes e query string existentes.
- Produces: pílulas que abrem popovers específicos e mantêm `fila`, `atendente`, `contato`, `status`, `aba` e `busca` na URL.

- [ ] **Step 1: Adicionar testes de serialização e limpeza dos filtros**

Cobrir preservação de parâmetros não editados, remoção do filtro corrente e aplicação de valores múltiplos onde o modelo permitir.

- [ ] **Step 2: Implementar popovers React por tipo de filtro**

Cada pílula deve ser um botão/combobox único com `aria-expanded`, fechar por Escape/clique externo e navegar somente ao aplicar uma seleção. O funil continua abrindo `PainelFiltros`.

- [ ] **Step 3: Renderizar loading e erro explícitos**

Substituir o retorno `null` por estado de carregamento com esqueleto estável e erro com botão de nova tentativa usando `leitura.refetch()`.

- [ ] **Step 4: Executar testes da tarefa**

Run: `pnpm --filter @pipe/gestao-vite test -- filtros-monitoramento.test.ts`
Expected: PASS.

### Task 2: Coerência funcional e visual do Histórico

**Files:**
- Modify: `apps/gestao-vite/src/paginas/operacao/historico.tsx`
- Modify: `apps/gestao-vite/src/componentes/lista-historico.tsx`
- Modify: `apps/gestao-vite/src/lib/historico.ts`
- Modify: `apps/gestao-vite/src/paginas/operacao/atendimento.css`
- Modify: `apps/api/src/controladores/gestao-operacao.ts`
- Test: `apps/api/tests/historico.test.ts`
- Test: `apps/gestao-vite/tests/historico.test.ts`
- Test: `apps/gestao-vite/tests/csv-historico.test.ts`

**Interfaces:**
- Consumes: consulta existente, `CartaoHistorico`, `montarCsv` e filtros da URL.
- Produces: período padrão de 30 dias, seleção restrita aos resultados visíveis e ação nomeada conforme o comportamento real.

- [ ] **Step 1: Cobrir reconciliação da seleção**

Testar que IDs ausentes da lista corrente são removidos e que "Selecionar todos" reflete apenas cartões visíveis.

- [ ] **Step 2: Corrigir período e exportação**

Usar 30 dias na consulta da API quando a URL não define datas, preservando datas explícitas. Renomear a ação para `Exportar CSV`, mantendo o download real; registrar envio por e-mail como pendência de backend/referência.

- [ ] **Step 3: Aplicar geometria medida dos cartões e rodapé**

Cartões de 88 px, padding 20 px, raio 16 px, labels 12/400, values 16/700, passo vertical 96 px, controles de 40 px e paginação no mesmo alinhamento da captura.

- [ ] **Step 4: Executar testes da tarefa**

Run: `pnpm --filter @pipe/api test -- historico.test.ts && pnpm --filter @pipe/gestao-vite test -- historico.test.ts csv-historico.test.ts`
Expected: PASS.

### Task 3: Validação visual e regressão

**Files:**
- Modify if needed: files from Tasks 1–2 only.
- Create: `docs/pesquisa/pendencias-referencia-atendimento.md`

**Interfaces:**
- Consumes: build funcional e capturas `docs/capturas/comparacao/*-original.png`.
- Produces: screenshots atuais, testes verdes e lista específica do que o material não comprova.

- [ ] **Step 1: Rodar testes, typecheck e build**

Run: `pnpm --filter @pipe/gestao-vite test && pnpm --filter @pipe/gestao-vite typecheck && pnpm --filter @pipe/gestao-vite build`
Expected: PASS.

- [ ] **Step 2: Validar com navegador real**

Abrir Monitoramento e Histórico, testar pílulas, funil, abas, busca, paginação, seleção, menu, drawer e modais; capturar viewport equivalente à referência.

- [ ] **Step 3: Registrar somente lacunas comprovadas**

Documentar elemento, aba e clique necessário para obter qualquer estado ausente (por exemplo, conteúdo visual de modal aberto que o ZIP não serializou).
