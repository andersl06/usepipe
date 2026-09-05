/**
 * Erros do pacote. Todos explícitos: a lição mais cara do case-sync é que os oito
 * defeitos tinham a mesma assinatura — **devolviam sucesso sem fazer o trabalho**,
 * e nenhum aparecia em log de erro. Aqui nada devolve resultado parcial em silêncio.
 */

/** O modelo respondeu, mas fora do formato combinado. Carrega o bruto para poder gravar. */
export class ErroFormatoIa extends Error {
  constructor(
    mensagem: string,
    /** O que o modelo devolveu, para o chamador gravar mesmo recusando o resultado. */
    readonly bruto: unknown,
  ) {
    super(mensagem);
    this.name = 'ErroFormatoIa';
  }
}

/** A chamada não chegou a produzir resposta utilizável (recusa, corte, rede). */
export class ErroChamadaIa extends Error {
  constructor(
    mensagem: string,
    readonly causa?: unknown,
  ) {
    super(mensagem);
    this.name = 'ErroChamadaIa';
  }
}
