# Método de medição — Atendimento Blip x Pipe

Contrato de "igual" (D-11). Todo plano de tela desta fase mede e registra do mesmo jeito. O snippet de medição é `ref/medir-tela.js` (idêntico ao da Fase 2, `02-fechar-o-builder/ref/medir-tela.js`, só o comentário de cabeçalho mudou).

## Fontes do lado Blip

- Capturas HTML/JSON de `C:/Users/anderson.linhares/pipe/referencias-blip/portal/dom/` e as árvores `C:/Users/anderson.linhares/pipe/referencias-blip/atendimento/attendance-desk-*`.
- Fichas `C:/Users/anderson.linhares/pipe/referencias-blip/fichas/FICHA-*.md` e `MEDIDAS-monitoramento.md`.
- `C:/Users/anderson.linhares/pipe/referencias-blip/pesquisa/blip-desk-medidas.md`.
- Cada valor é marcado [M] (medido na fonte) ou [A] (aproximado), como na Fase 2.
- Medição ao vivo na Blip só por leitura: colar `medir-tela.js` no console da aba logada. Nunca clicar em ação que grave (confirmar, salvar, transferir, finalizar, exportar, enviar e-mail).

## Fontes do lado Pipe

- `pnpm --filter @pipe/management-vite dev` contra a API local.
- Chrome headless por CDP, viewport 1440x900; script descartável no scratchpad (fora do repositório).
- `medir-tela.js` injetado por `Runtime.evaluate`; cliques reais por `Input.dispatchMouseEvent`.
- Prints em `C:/Users/anderson.linhares/pipe/referencias-blip/pipe-capturas/03.2-*.png` (fora do Git).

## Regra de status

- `VISUALLY VERIFIED`: geometria, espaçamento e tipografia batem dentro da tolerância e a única diferença de cor é azul da Blip -> token verde `--p-*`.
- Qualquer outra diferença vira correção ou lacuna.
- Estado sem captura = `NEEDS VALIDATION`, nunca aprovado.
- Tolerância: PENDENTE DE DECISÃO DO DONO (Q1 em QUESTOES-DONO.md): 0px pelo UI-SPEC ou 1px pela Fase 2; até a decisão, registrar a diferença numérica exata em toda linha.

## Procedimento por tela

O que todo plano de tela executa:

1. Gravar `git rev-parse HEAD` como primeira linha `Base: <sha>` em `ref/verificacao/{tela}.md`.
2. Confirmar o tema da tela na captura (claro ou escuro, D-12) e registrar em `Tema:`.
3. Para cada estado (lista, vazio, carregando, erro e os abertos de D-10 que a tela tiver), criar a seção `## Estado: {nome}` com a tabela `| Elemento | Blip | Pipe | Diferença | Status |`. Medir com `medir-tela.js`.
4. Corrigir o CSS/TSX usando tokens `--p-*`/`--p-atend-*`. Valor fora da escala vira token em `packages/ui/src/estilos/tokens.css`, documentado em `docs/marca/MARCA.md` com valor, papel e fonte.
5. Medir de novo e atualizar a tabela.
6. Diferença que sobrar vai para `## Lacunas` do mesmo arquivo.
7. Funções que dependem da 03.1/Fase 3 entram em `ref/DEPENDENCIAS-03.1.md`.
8. Comentário de código cita a `FICHA-*` de origem.

## Destinos de clique (D-04)

Toda tela registra em `## Navegação` a tabela:

| Clique | Destino Blip (tela/modal/painel + URL) | Destino Pipe | Status |
|---|---|---|---|

## Proibições

- Nada de `bds-*`, `shadowRoot`, CSS, SVG, ícone ou imagem da Blip no repositório (D-05, D-33).
- Ícone faltante é desenhado no Pipe: `packages/ui/src/icones.tsx`, `icones-portal.tsx`, `apps/management-vite/src/components/icones-management.tsx`.
