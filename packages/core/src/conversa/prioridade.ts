/**
 * A régua de prioridade da conversa, e a ordem que ela impõe na fila de espera.
 *
 * **Mora aqui, e não em `@pipe/db`, por um motivo concreto.** Ela nasceu junto da
 * restrição do banco, no `schema/comum.ts` — e todo o `schema/` importa
 * `drizzle-orm/pg-core`. O app do atendente ordena a coluna dele num componente
 * de navegador, e importar a régua de lá arrastaria o driver do Postgres para o
 * pacote do navegador. O resultado foi previsível: o Desk manteve um **mapa
 * paralelo de pesos**, com três níveis e um padrão que mandava todo valor
 * desconhecido para o peso de "média". Duas cópias da mesma régua divergiram, e
 * a fila do atendente passou a ordenar `maxima` e `sem_prioridade` como se
 * fossem médias.
 *
 * Regra pura, sem banco e sem HTTP, é a definição deste pacote. É aqui que ela
 * fica, e `@pipe/db` importa daqui para montar a restrição.
 *
 * Ver `referencias-blip/pesquisa/blip-gestao-medidas.md` §8.5.
 */

/**
 * Os cinco degraus, **em ordem de precedência**: o índice é o peso, e o primeiro
 * é o que atende primeiro.
 *
 * `sem_prioridade` não é "média por omissão": é a AUSÊNCIA de prioridade, e a
 * regra da fila depende dela — um ticket `baixa` fura a frente de um
 * `sem_prioridade`. Enquanto a coluna nascia em `media`, todo ticket tinha
 * prioridade que ninguém escolheu, e ordenar por prioridade era ordenar por um
 * dado inventado.
 *
 * A ordem desta lista é significado, não arrumação. Quem inserir um degrau no
 * meio muda a ordem da fila de espera; use `pesoPrioridade`, nunca um mapa
 * paralelo de pesos.
 */
export const NIVEIS_PRIORIDADE = ['maxima', 'alta', 'media', 'baixa', 'sem_prioridade'] as const;

export type NivelPrioridade = (typeof NIVEIS_PRIORIDADE)[number];

/**
 * O que uma REGRA de priorização pode atribuir: tudo menos a ausência. Uma regra
 * que atribui "sem prioridade" não é uma regra — é a falta dela, e teria o
 * efeito de rebaixar o ticket para o fim da fila sem ninguém ter pedido.
 */
export const NIVEIS_ATRIBUIVEIS = NIVEIS_PRIORIDADE.filter((n) => n !== 'sem_prioridade');

/** Rótulo de tela de cada degrau. */
export const ROTULOS_PRIORIDADE: Record<NivelPrioridade, string> = {
  maxima: 'Máxima',
  alta: 'Alta',
  media: 'Média',
  baixa: 'Baixa',
  sem_prioridade: 'Sem prioridade',
};

/**
 * Peso de ordenação: menor atende primeiro. Valor desconhecido cai no FIM, e não
 * no meio — inventar prioridade para o que não se reconhece é o defeito que esta
 * função existe para não repetir.
 */
export function pesoPrioridade(nivel: string): number {
  const posicao = (NIVEIS_PRIORIDADE as readonly string[]).indexOf(nivel);
  return posicao === -1 ? NIVEIS_PRIORIDADE.length : posicao;
}

/*
 * O COMPARADOR fica em cada app, e isto é deliberado: a linha da Gestão guarda a
 * data em `marcos.criadaEm` e a do Desk em `criadaEm`, e uma função genérica o
 * bastante para servir às duas custaria mais do que as três linhas que ela
 * economiza. O que não pode divergir é a régua acima, e ela é uma só.
 *
 * O desempate é sempre o mesmo e é parte da regra: **prioridade primeiro,
 * empate pela mais antiga** — sem ele a fila vira pilha, com o último a chegar
 * sendo o primeiro a sair.
 */
