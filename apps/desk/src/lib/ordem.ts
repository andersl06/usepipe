/**
 * Adaptado de chatwoot (MIT) — https://github.com/chatwoot/chatwoot/blob/develop/app/finders/conversation_finder.rb
 *
 * A ordem e o recorte por fila da coluna de atendimentos.
 *
 * O Chatwoot oferece oito ordens (`SORT_OPTIONS`) e um escopo `unattended`
 * (`first_reply_created_at IS NULL`). Aqui ficam três ordens e o `unattended`
 * virou ficha, porque a pergunta "quem ainda não recebeu resposta" é filtro e
 * não classificação: quem a faz quer a lista curta, não a lista inteira com os
 * respondidos empurrados para baixo.
 *
 * Em `lib/` e sem uma linha de banco nem de Next: é lógica pura, tem teste em
 * `tests/ordem.test.ts`, e o seletor de filtros que a consome é `'use client'`
 * — importar `consultas.ts` daqui arrastaria o `pg` para dentro do pacote do
 * navegador. Os tipos daqui são os que vão para `packages/contracts` quando a
 * `apps/api` virar a única porta do Postgres.
 */

export type ChaveDeOrdem = 'recentes' | 'antigas' | 'prioridade';

/**
 * O rótulo diz o que fica NO TOPO, não o nome do campo. "Última mensagem
 * decrescente" é o nome da coluna; "Mais recentes primeiro" é a pergunta que o
 * atendente faz.
 */
export const ORDENS: { chave: ChaveDeOrdem; rotulo: string }[] = [
  { chave: 'recentes', rotulo: 'Mais recentes primeiro' },
  { chave: 'antigas', rotulo: 'Mais antigas primeiro' },
  { chave: 'prioridade', rotulo: 'Prioridade primeiro' },
];

export function ehOrdem(valor: string | undefined): valor is ChaveDeOrdem {
  return ORDENS.some((o) => o.chave === valor);
}

/**
 * Só o que a ordenação precisa ler. Estrutural, e não o `ConversaDaLista`
 * inteiro, para que este arquivo não importe nada.
 */
export interface ConversaOrdenavel {
  criadaEm: Date;
  ultimaMensagemEm: Date | null;
  prioridade: string;
  filaNome: string | null;
}

/** Alta primeiro. O desconhecido cai junto de "média", que é o padrão da coluna. */
const PESO_PRIORIDADE: Record<string, number> = { alta: 0, media: 1, baixa: 2 };

function peso(prioridade: string): number {
  return PESO_PRIORIDADE[prioridade] ?? 1;
}

export function ordenar<T extends ConversaOrdenavel>(conversas: T[], ordem: ChaveDeOrdem): T[] {
  const copia = [...conversas];
  if (ordem === 'antigas') {
    // A abertura da conversa, e não a última mensagem: "mais antiga" para quem
    // atende é quem está esperando desde mais cedo, e a última mensagem se move
    // toda vez que o cliente cobra.
    return copia.sort((a, b) => a.criadaEm.getTime() - b.criadaEm.getTime());
  }
  if (ordem === 'prioridade') {
    // Empate em prioridade desempata pela mais antiga — é o
    // `priority_desc_created_at_asc` deles, e é o que impede que a fila de
    // prioridade alta vire pilha, com o último a chegar sendo o primeiro a sair.
    return copia.sort((a, b) => {
      const diferenca = peso(a.prioridade) - peso(b.prioridade);
      return diferenca !== 0 ? diferenca : a.criadaEm.getTime() - b.criadaEm.getTime();
    });
  }
  // Conversa sem mensagem nenhuma vai para o fim: ela não é "a mais antiga",
  // é a que ainda não começou.
  return copia.sort((a, b) => {
    const ta = a.ultimaMensagemEm?.getTime();
    const tb = b.ultimaMensagemEm?.getTime();
    if (ta === undefined && tb === undefined) return 0;
    if (ta === undefined) return 1;
    if (tb === undefined) return -1;
    return tb - ta;
  });
}

/** As filas que aparecem na lista, sem repetição e em ordem alfabética. */
export function filasDe(conversas: ConversaOrdenavel[]): string[] {
  const nomes = new Set<string>();
  for (const conversa of conversas) if (conversa.filaNome) nomes.add(conversa.filaNome);
  return [...nomes].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/** Fila vazia é "todas". Conversa sem fila só aparece em "todas". */
export function naFila(conversa: ConversaOrdenavel, fila: string): boolean {
  return fila === '' || conversa.filaNome === fila;
}
