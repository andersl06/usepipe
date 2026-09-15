# Desk Pipe Visual Pipe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Entregar uma prévia do Desk com o layout validado do Blip e apenas a logo e a cor principal do Pipe.

**Architecture:** Reaproveitar `apps/desk` e sua estrutura atual de três colunas. Alterar somente o ponto visual compartilhado (`@pipe/ui`/tokens e logo usada pelo trilho), sem criar uma nova camada de componentes ou backend. Os dados demo existentes continuam sendo a fonte da prévia.

**Tech Stack:** Next.js 15, React 19, TypeScript, CSS custom properties, `@pipe/ui`, pnpm/Turbo.

## Global Constraints

- Preservar tipografia, ícones, espaçamento, densidade e geometria da referência Blip.
- Usar somente logo Pipe e Moss `#4A5D23` como identidade nova.
- Não criar integração com Twenty, Chatwoot, WhatsApp ou IA nesta etapa.
- Não alterar modelo de dados, autenticação ou regras de atendimento.
- Preservar alterações pré-existentes fora dos arquivos tocados pela tarefa.

---

### Task 1: Confirmar a superfície visual usada pelo Desk

**Files:**
- Read: `apps/desk/src/app/layout.tsx`
- Read: `apps/desk/src/app/globais.css`
- Read: `apps/desk/src/componentes/trilho-desk.tsx`
- Read: `packages/ui/src/estilos/tokens.css`
- Read: `packages/ui/src/componentes/estrutura.tsx`

**Interfaces:**
- Consumes: tokens `--p-*` e componente `Simbolo` já existentes.
- Produces: lista fechada de pontos que precisam de mudança visual, sem alteração de layout.

- [ ] **Step 1: Confirmar se o trilho já usa a marca Pipe**

Run:

```powershell
rg -n "Simbolo|pipe-symbol|p-marca|d-trilho" apps/desk/src packages/ui/src
```

Expected: a logo do trilho vem de `Simbolo` e a cor ativa vem de `--p-marca`.

- [ ] **Step 2: Confirmar que a geometria Blip está em `globais.css`**

Run:

```powershell
rg -n "grid-template-columns|d-trilho-largura|d-cabecalho-lista|d-bloco-status|thread|panel" apps/desk/src/app/globais.css
```

Expected: as medidas existentes permanecem intactas; qualquer alteração posterior deve ser somente de cor ou marca.

### Task 2: Aplicar a identidade Pipe sem alterar a geometria

**Files:**
- Modify: `packages/ui/src/estilos/tokens.css`
- Modify: `apps/desk/src/app/globais.css` only if a Desk-specific brand override is proven necessary
- Modify: `apps/desk/src/componentes/trilho-desk.tsx` only if the current symbol is not the Pipe mark

**Interfaces:**
- Consumes: tokens e logo já existentes no `@pipe/ui`.
- Produces: Desk com logo Pipe e Moss nos papéis de marca/ativo/foco, mantendo a tipografia e o layout atuais.

- [ ] **Step 1: Não duplicar tokens existentes**

Run:

```powershell
rg -n "--p-marca|#4A5D23|Simbolo" packages/ui/src apps/desk/src
```

Expected: se `--p-marca` já for `#4A5D23` e `Simbolo` já renderizar o Pipe, nenhum novo token ou componente será criado.

- [ ] **Step 2: Fazer somente o menor ajuste confirmado**

Implementação permitida:

```css
:root {
  --p-marca: #4A5D23;
}
```

Se esse valor e a logo já estiverem presentes, registrar a conclusão sem editar CSS. Não alterar `font-family`, `grid-template-columns`, alturas, raios ou ícones.

- [ ] **Step 3: Garantir que os estados ativos usam o mesmo token**

Run:

```powershell
rg -n "#2563|#005|#1976|blue|font-family|grid-template-columns" apps/desk/src packages/ui/src/estilos/tokens.css
```

Expected: nenhuma cor azul de marca ou mudança tipográfica introduzida no Desk; estados semânticos continuam separados da cor Moss.

### Task 3: Verificar a prévia renderizada

**Files:**
- Read: `apps/desk/src/app/page.tsx`
- Read: `apps/desk/src/componentes/conversa.tsx`
- Read: `apps/desk/src/componentes/painel-contato.tsx`
- Test: `apps/desk/tests/*.test.ts`

**Interfaces:**
- Consumes: Desk demo existente e tokens Pipe.
- Produces: evidência de que lista, conversa, painel de contato e trilho continuam montados.

- [ ] **Step 1: Rodar typecheck do Desk**

Run:

```powershell
pnpm --filter @pipe/desk typecheck
```

Expected: PASS sem novos erros.

- [ ] **Step 2: Rodar os testes do Desk**

Run:

```powershell
pnpm --filter @pipe/desk test
```

Expected: PASS em todos os testes existentes.

- [ ] **Step 3: Subir a prévia visual**

Run:

```powershell
pnpm --filter @pipe/desk dev
```

Expected: Desk disponível em `http://localhost:3200`.

- [ ] **Step 4: Inspecionar a tela**

Verificar no viewport desktop:

```text
trilho Pipe | lista de atendimentos | conversa Blip | painel de contato
```

Expected: geometria e tipografia reconhecíveis como Blip; logo Pipe visível; Moss somente em marca/ativo/foco; nenhuma nova tela vazia ou erro de hidratação.

- [ ] **Step 5: Commit da implementação visual**

```powershell
git add apps/desk packages/ui/src/estilos/tokens.css
git commit -m "feat: aplica identidade pipe ao desk blip"
```
