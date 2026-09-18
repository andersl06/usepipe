/**
 * A leitura da nota de monitoria, do lado da tela.
 *
 * O CÁLCULO é de `packages/ai/src/avaliacao/nota.ts` e não se repete aqui: os
 * pontos de cada critério já chegam gravados em `resposta_avaliacao`, na escala
 * da nota final, e é isso que permite a ficha dizer "perdeu 12 pontos aqui" sem
 * recalcular nada.
 *
 * O que falta ao banco, e mora aqui, é uma coisa só: dizer se um critério
 * **fatal** foi reprovado. `avaliacao.nota` guarda zero quando algum fatal
 * cai, mas não guarda qual — e "nota 0" sem o nome do critério é a informação
 * inútil que faz o supervisor abrir a conversa inteira para descobrir o óbvio.
 *
 * Os dois tetos de escala são os de `packages/ai/src/avaliacao/tipos.ts`
 * (`TETO_ESCALA` e `TETO_NOTA`). Estão repetidos porque `@pipe/ai` carrega
 * cliente de modelo e não é dependência da Gestão; se um dia divergirem, o teste
 * abaixo é o que mostra.
 */

export const TETO_ESCALA = 5;
export const TETO_NOTA = 10;

/** Quanto do critério foi cumprido, de 0 a 1. `null` quando não se aplica ou não foi respondido. */
export function fracaoRespondida(tipo: string, valor: string | null): number | null {
  if (valor === null) return null;
  const bruto = valor.trim().toLowerCase();
  if (bruto === 'nao_se_aplica') return null;

  if (tipo === 'conforme') {
    if (bruto === 'conforme') return 1;
    if (bruto === 'nao_conforme') return 0;
    return null;
  }

  const teto = tipo === 'escala' ? TETO_ESCALA : TETO_NOTA;
  const numero = Number(bruto.replace(',', '.'));
  if (!Number.isFinite(numero) || numero < 0 || numero > teto) return null;
  return numero / teto;
}

/**
 * Critério fatal reprovado zera a avaliação inteira.
 *
 * A regra é a mesma de `calcularNota`: fatal com fração conhecida e MENOR QUE 1.
 * Fatal não respondido, ou marcado como não se aplica, não reprova — ausência
 * não é falha, e tratar as duas como a mesma coisa transformaria formulário
 * incompleto em atendente com nota zero.
 */
export function fatalReprovado(tipo: string, fatal: boolean, valor: string | null): boolean {
  if (!fatal) return false;
  const fracao = fracaoRespondida(tipo, valor);
  return fracao !== null && fracao < 1;
}
