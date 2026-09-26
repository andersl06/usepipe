/**
 * Design-system check: `node verificar-tokens.mjs`.
 *
 * This deliberately uses no framework: it is one check for this package's recurring failure, a token used without a definition or defined only in the light theme. `--sage` and `--online` disappeared from the first dark theme that way, unnoticed until the screen turned white.
 *
 * It checks: (1) every used `var(--p-*)` is defined; (2) every light-theme color token is redefined in both dark-theme blocks (system preference and explicit choice); (3) counted rules remain at five surfaces, four content steps, four states with three variables each, three radii, and four text sizes.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const aqui = dirname(fileURLToPath(import.meta.url));
const tokens = readFileSync(join(aqui, 'src/estilos/tokens.css'), 'utf8');
const base = readFileSync(join(aqui, 'src/estilos/base.css'), 'utf8');
const fontes = [
  base,
  readFileSync(join(aqui, 'src/tema.ts'), 'utf8'),
  readFileSync(join(aqui, 'src/icones.tsx'), 'utf8'),
  readFileSync(join(aqui, 'src/illustrations.tsx'), 'utf8'),
].join('\n');

/** Nomes de token declarados em qualquer bloco de tokens.css, ponte inclusa. */
const definidos = new Set([...tokens.matchAll(/^\s*(--p-[a-z0-9-]+)\s*:/gm)].map((m) => m[1]));

/**
 * The same token set without the migration bridge. Counted rules inspect only this set so old aliases cannot inflate the scale. Once the bridge is removed, both sets become identical again.
 */
const withoutBridge = tokens.slice(0, tokens.indexOf('MIGRATION BRIDGE'));
const proprios = new Set([...withoutBridge.matchAll(/^\s*(--p-[a-z0-9-]+)\s*:/gm)].map((m) => m[1]));

/* 1 - nothing uses an undefined token. ------------------------------------------ */
const usados = new Set([...fontes.matchAll(/var\((--p-[a-z0-9-]+)\)/g)].map((m) => m[1]));
const orfaos = [...usados].filter((t) => !definidos.has(t));
assert.deepEqual(orfaos, [], `token usado sem definição: ${orfaos.join(', ')}`);

/* 2 — todo token de cor do tema claro existe nos dois blocos escuros. ------ */
const claro = tokens.slice(tokens.indexOf(':root {'), tokens.indexOf('@media (prefers-color-scheme: dark)'));
const preferencia = tokens.slice(
  tokens.indexOf('@media (prefers-color-scheme: dark)'),
  tokens.indexOf(":root[data-tema='escuro']"),
);
const explicito = tokens.slice(tokens.indexOf(":root[data-tema='escuro']"), tokens.indexOf('MIGRATION BRIDGE'));

/** A color value contains hex or rgba; sizes and durations do not change with the theme. */
const coresClaras = [...claro.matchAll(/^\s*(--p-[a-z0-9-]+)\s*:\s*(#|rgba)/gm)].map((m) => m[1]);
for (const block of [preferencia, explicito]) {
  const nele = new Set([...block.matchAll(/^\s*(--p-[a-z0-9-]+)\s*:/gm)].map((m) => m[1]));
  const faltando = coresClaras.filter((t) => !nele.has(t));
  assert.deepEqual(faltando, [], `cor sem versão no tema escuro: ${faltando.join(', ')}`);
}
assert.equal(
  [...preferencia.matchAll(/^\s*(--p-[a-z0-9-]+)\s*:/gm)].length,
  [...explicito.matchAll(/^\s*(--p-[a-z0-9-]+)\s*:/gm)].length,
  'os dois blocos de tema escuro divergiram — o alternador vai funcionar só num sentido',
);

/* 3 - enforce the counted rules. ------------------------------------------------ */
const contar = (padrao) => [...proprios].filter((t) => padrao.test(t)).length;

assert.equal(contar(/^--p-superficie-\d$/), 5, 'são cinco superfícies, nem mais nem menos');
assert.equal(contar(/^--p-conteudo(-|$)/), 4, 'são quatro degraus de conteúdo');
assert.equal(contar(/^--p-r-/), 3, 'são três raios: padrão, controle e pílula');
assert.equal(contar(/^--p-t-(lg|md|sm|xs)$/), 4, 'a régua de texto tem 16, 14, 12 e 10');

/* Only erro has an approved rename; the other state tokens remain in Portuguese. */
const triosDeEstado = [
  ['--p-error-background', '--p-error-line', '--p-error-content'],
  ['--p-alerta-fundo', '--p-alerta-linha', '--p-alerta-conteudo'],
  ['--p-sucesso-fundo', '--p-sucesso-linha', '--p-sucesso-conteudo'],
  ['--p-info-fundo', '--p-info-linha', '--p-info-conteudo'],
];
for (const trio of triosDeEstado) {
  for (const nome of trio) {
    assert.ok(proprios.has(nome), `estado é um par com linha: falta ${nome}`);
  }
}

/*
 * 4 - keep the extended palette contained. --------------------------------
 * It is allowed in two places: the data bar (`.trilho`/`.fill`, which is a chart) and the illustration drawn with its own SVG. All other `base.css` styles are chrome, which must not receive extended-palette hues. This test catches the error previously rejected by the owner before it reaches the screen.
 */
const cromo =
  base.slice(0, base.indexOf('------ bar')) + base.slice(base.indexOf('----- avatar'));
const grafico = [...cromo.matchAll(/var\((--p-grafico-\d)\)/g)].map((m) => m[1]);
assert.deepEqual(
  grafico,
  [],
  `paleta estendida vazou para o cromo: ${grafico.join(', ')} — ela só pode em gráfico e ilustração`,
);

console.log(`ok — ${proprios.size} tokens, ${usados.size} em uso, tema claro e escuro em paridade`);
