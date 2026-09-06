/**
 * Verificação do design system. `node verificar-tokens.mjs`.
 *
 * Sem framework de propósito: é uma checagem só, e ela existe porque o modo de
 * falhar deste pacote é sempre o mesmo — um token usado que ninguém definiu,
 * ou definido só no tema claro. Foi assim que `--sage` e `--online` sumiram do
 * tema escuro na primeira versão, e ninguém percebeu até a tela ficar branca.
 *
 * O que ela garante:
 *   1. Todo `var(--p-*)` usado tem definição.
 *   2. Todo token de cor definido no tema claro é redefinido nos dois blocos
 *      de tema escuro (preferência do sistema e escolha explícita).
 *   3. As regras contáveis continuam valendo: 5 superfícies, 4 degraus de
 *      conteúdo, 4 estados com 3 variáveis cada, 3 raios, 4 degraus de texto.
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
  readFileSync(join(aqui, 'src/ilustracoes.tsx'), 'utf8'),
].join('\n');

/** Nomes de token declarados em qualquer bloco de tokens.css, ponte inclusa. */
const definidos = new Set([...tokens.matchAll(/^\s*(--p-[a-z0-9-]+)\s*:/gm)].map((m) => m[1]));

/**
 * O mesmo conjunto sem a ponte de migração. As regras contáveis olham só para
 * cá: o apelido antigo não pode fazer a régua parecer maior do que ela é.
 * Quando a ponte for apagada, os dois conjuntos voltam a ser o mesmo.
 */
const semPonte = tokens.slice(0, tokens.indexOf('PONTE DE MIGRAÇÃO'));
const proprios = new Set([...semPonte.matchAll(/^\s*(--p-[a-z0-9-]+)\s*:/gm)].map((m) => m[1]));

/* 1 — nada usa o que não existe. ------------------------------------------ */
const usados = new Set([...fontes.matchAll(/var\((--p-[a-z0-9-]+)\)/g)].map((m) => m[1]));
const orfaos = [...usados].filter((t) => !definidos.has(t));
assert.deepEqual(orfaos, [], `token usado sem definição: ${orfaos.join(', ')}`);

/* 2 — todo token de cor do tema claro existe nos dois blocos escuros. ------ */
const claro = tokens.slice(tokens.indexOf(':root {'), tokens.indexOf('@media (prefers-color-scheme: dark)'));
const preferencia = tokens.slice(
  tokens.indexOf('@media (prefers-color-scheme: dark)'),
  tokens.indexOf(":root[data-tema='escuro']"),
);
const explicito = tokens.slice(tokens.indexOf(":root[data-tema='escuro']"), tokens.indexOf('PONTE DE MIGRAÇÃO'));

/** Cor = tem hex ou rgba no valor. Tamanho e duração não mudam com o tema. */
const coresClaras = [...claro.matchAll(/^\s*(--p-[a-z0-9-]+)\s*:\s*(#|rgba)/gm)].map((m) => m[1]);
for (const bloco of [preferencia, explicito]) {
  const nele = new Set([...bloco.matchAll(/^\s*(--p-[a-z0-9-]+)\s*:/gm)].map((m) => m[1]));
  const faltando = coresClaras.filter((t) => !nele.has(t));
  assert.deepEqual(faltando, [], `cor sem versão no tema escuro: ${faltando.join(', ')}`);
}
assert.equal(
  [...preferencia.matchAll(/^\s*(--p-[a-z0-9-]+)\s*:/gm)].length,
  [...explicito.matchAll(/^\s*(--p-[a-z0-9-]+)\s*:/gm)].length,
  'os dois blocos de tema escuro divergiram — o alternador vai funcionar só num sentido',
);

/* 3 — as regras contáveis. ------------------------------------------------ */
const contar = (padrao) => [...proprios].filter((t) => padrao.test(t)).length;

assert.equal(contar(/^--p-superficie-\d$/), 5, 'são cinco superfícies, nem mais nem menos');
assert.equal(contar(/^--p-conteudo(-|$)/), 4, 'são quatro degraus de conteúdo');
assert.equal(contar(/^--p-r-/), 3, 'são três raios: padrão, controle e pílula');
assert.equal(contar(/^--p-t-(lg|md|sm|xs)$/), 4, 'a régua de texto tem 16, 14, 12 e 10');

for (const estado of ['erro', 'alerta', 'sucesso', 'info']) {
  for (const parte of ['fundo', 'linha', 'conteudo']) {
    assert.ok(
      proprios.has(`--p-${estado}-${parte}`),
      `estado é um par com linha: falta --p-${estado}-${parte}`,
    );
  }
}

/* 4 — a paleta estendida continua cercada. --------------------------------
   Ela pode em dois lugares: a barra de dado (`.trilho`/`.fill`, que é gráfico)
   e a ilustração, que desenha com o próprio SVG. Todo o resto de base.css é
   cromo, e cromo não recebe matiz da paleta estendida. Este é o teste que
   pega o erro que o dono reprovou antes de ele chegar na tela. */
const cromo =
  base.slice(0, base.indexOf('------ barra')) + base.slice(base.indexOf('----- avatar'));
const grafico = [...cromo.matchAll(/var\((--p-grafico-\d)\)/g)].map((m) => m[1]);
assert.deepEqual(
  grafico,
  [],
  `paleta estendida vazou para o cromo: ${grafico.join(', ')} — ela só pode em gráfico e ilustração`,
);

console.log(`ok — ${proprios.size} tokens, ${usados.size} em uso, tema claro e escuro em paridade`);
