/**
 * Os recortes de tempo da tela de métricas.
 *
 * São os mesmos cinco atalhos mais o personalizado da tela de referência, com
 * os mesmos limites (`docs/pesquisa/blip-desk-medidas.md`, §10): "Hoje" é o
 * padrão, o recuo de cada atalho é 0 / 1 / 6 / 29 / 89 dias, e o intervalo
 * escolhido à mão não passa de 90 dias para trás.
 *
 * Função pura e sem fuso próprio: ela trabalha no relógio local do servidor,
 * que é o mesmo que o resto do Desk usa para dizer "hoje". Receber o `agora`
 * por parâmetro é o que torna isto testável sem congelar o relógio do processo.
 */

export const PERIODOS = [
  { chave: 'hoje', rotulo: 'Hoje', recuo: 0 },
  { chave: 'ontem', rotulo: 'Ontem', recuo: 1 },
  { chave: '7d', rotulo: '7 Dias', recuo: 6 },
  { chave: '30d', rotulo: '30 dias', recuo: 29 },
  { chave: '90d', rotulo: '90 dias', recuo: 89 },
] as const;

export type ChaveDePeriodo = (typeof PERIODOS)[number]['chave'];

/** Quanto para trás o intervalo escolhido à mão pode ir. */
export const TETO_DIAS = 90;

export interface Intervalo {
  inicio: Date;
  fim: Date;
}

export function ehPeriodo(valor: string | undefined): valor is ChaveDePeriodo {
  return PERIODOS.some((p) => p.chave === valor);
}

function meiaNoite(base: Date, diasAtras: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() - diasAtras);
  d.setHours(0, 0, 0, 0);
  return d;
}

function fimDoDia(base: Date, diasAtras: number): Date {
  const d = meiaNoite(base, diasAtras);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * O intervalo de um atalho.
 *
 * "Hoje" termina **agora**, e não às 23:59: o número que o atendente vê é o do
 * dia até este instante, e projetar o fim do dia faria a média de hoje parecer
 * pior do que é toda manhã. Os demais terminam no fim do último dia inteiro.
 */
export function intervaloDe(chave: ChaveDePeriodo, agora: Date): Intervalo {
  if (chave === 'hoje') return { inicio: meiaNoite(agora, 0), fim: agora };
  if (chave === 'ontem') return { inicio: meiaNoite(agora, 1), fim: fimDoDia(agora, 1) };
  const recuo = PERIODOS.find((p) => p.chave === chave)?.recuo ?? 0;
  return { inicio: meiaNoite(agora, recuo), fim: fimDoDia(agora, 0) };
}

/**
 * O intervalo escrito à mão nos dois campos de data, ou `null` se não der para
 * usar. Nunca lança: entrada de usuário que vira exceção é tela branca.
 *
 * O que ele corrige em silêncio, porque corrigir é mais útil que recusar:
 * datas invertidas trocam de lugar, e o começo antes do teto de 90 dias sobe
 * para o teto. O que ele recusa: data ilegível e intervalo que começa no
 * futuro.
 */
export function intervaloPersonalizado(
  de: string,
  ate: string,
  agora: Date,
): Intervalo | null {
  const a = new Date(`${de}T00:00:00`);
  const b = new Date(`${ate}T23:59:59.999`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;

  let inicio = a;
  let fim = b;
  if (inicio > fim) [inicio, fim] = [fim, inicio];

  const piso = meiaNoite(agora, TETO_DIAS);
  const teto = fimDoDia(agora, 0);
  if (inicio > teto) return null;
  if (inicio < piso) inicio = piso;
  if (fim > teto) fim = teto;
  return { inicio, fim };
}

/** `aaaa-mm-dd` no relógio local, que é o formato que `<input type="date">` quer. */
export function comoCampoDeData(momento: Date): string {
  const mes = String(momento.getMonth() + 1).padStart(2, '0');
  const dia = String(momento.getDate()).padStart(2, '0');
  return `${momento.getFullYear()}-${mes}-${dia}`;
}
