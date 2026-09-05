/**
 * Bancada por linha de comando.
 *
 *   pnpm --filter @pipe/ai build
 *   pnpm --filter @pipe/ai bancada -- fixtures/conjunto-referencia.json --modelo=claude-sonnet-5
 *
 * Precisa de `ANTHROPIC_API_KEY` no ambiente: aqui a chamada ao modelo é de verdade.
 *
 * Sai com código 1 quando algum caso falha. Execução verde com erro dentro foi a
 * armadilha número um do case-sync — aqui ela não passa.
 */

import { arredondarCentavos } from '../consumo/index.js';
import { rodarBancada } from './bancada.js';
import { lerConjunto } from './conjunto.js';

const CAMINHO_PADRAO = 'fixtures/conjunto-referencia.json';

interface Argumentos {
  caminho: string;
  modelo?: string;
  max?: number;
}

export function lerArgumentos(argv: readonly string[]): Argumentos {
  let caminho = CAMINHO_PADRAO;
  let modelo: string | undefined;
  let max: number | undefined;

  for (const arg of argv) {
    if (arg.startsWith('--modelo=')) modelo = arg.slice('--modelo='.length);
    else if (arg.startsWith('--max=')) max = Number(arg.slice('--max='.length));
    else if (!arg.startsWith('--')) caminho = arg;
  }
  return { caminho, modelo, max };
}

function porcento(fracao: number): string {
  return `${(fracao * 100).toFixed(1)}%`;
}

async function principal(): Promise<number> {
  const args = lerArgumentos(process.argv.slice(2));
  const todos = await lerConjunto(args.caminho);
  const casos = args.max ? todos.slice(0, args.max) : todos;

  console.log(`Bancada: ${casos.length} casos de ${args.caminho}`);
  if (args.modelo) console.log(`Modelo: ${args.modelo}`);

  const resultado = await rodarBancada({
    casos,
    modelo: args.modelo,
    aoTerminarCaso: (casoId, medido) => {
      if (!medido) {
        console.log(`  ${casoId}: FALHOU`);
        return;
      }
      console.log(
        `  ${casoId}: humano ${medido.notaHumana} · IA ${medido.notaIa} · desvio ${medido.desvioNota} · ` +
          `${medido.criteriosIguais}/${medido.criteriosTotal} critérios · confiança ${medido.confianca}`,
      );
    },
  });

  console.log('');
  console.log(`Acurácia geral (critério a critério): ${porcento(resultado.acuraciaGeral)}`);
  console.log(`Desvio médio da nota: ${resultado.desvioMedioNota}`);
  console.log('');
  console.log('Desvio por critério, do pior para o melhor:');
  for (const c of resultado.porCriterio) {
    console.log(
      `  ${porcento(c.acuracia).padStart(6)} · desvio ${String(c.desvioMedioPontos).padStart(6)} pts · ` +
        `${c.acertos}/${c.n} · ${c.nome} (${c.criterioId})`,
    );
  }

  console.log('');
  for (const c of resultado.consumo) {
    console.log(
      `Consumo ${c.modelo}: ${c.tokensEntrada} entrada · ${c.tokensSaida} saída · ` +
        `${arredondarCentavos(c.custoCentavos)} centavos`,
    );
  }

  if (resultado.falhas.length > 0) {
    console.error('');
    console.error(`${resultado.falhas.length} caso(s) falharam:`);
    for (const f of resultado.falhas) console.error(`  ${f.casoId}: ${f.erro}`);
    return 1;
  }
  return 0;
}

principal().then(
  (codigo) => {
    process.exitCode = codigo;
  },
  (erro: unknown) => {
    console.error(erro instanceof Error ? erro.message : erro);
    process.exitCode = 1;
  },
);
