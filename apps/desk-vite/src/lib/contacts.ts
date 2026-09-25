/**
 * As regras puras da aba Contatos — a ordenação e o agrupamento da
 * referência (`referencias-blip/pesquisa/blip-desk-medidas.md` §11): "Ordem alfabética"
 * (padrão) agrupa pela primeira letra do nome, com os sem-nome num grupo `#`
 * sempre no fim; "Última interação" agrupa pela data da última mensagem, da
 * mais recente para a mais antiga.
 */
export interface ListaContact {
  id: string;
  nome: string | null;
  telefone: string | null;
  email: string | null;
  lastInteractionAt: string | null;
}

export type ContactsOrder = 'alfabetica' | 'ultima-interacao';

export interface ContactsGroup {
  rotulo: string;
  contacts: ListaContact[];
}

function letra(nome: string | null): string {
  const n = (nome ?? '').trim();
  if (!n) return '#';
  const first = n.charAt(0).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  return /[A-Z]/.test(first) ? first : '#';
}

function dia(iso: string | null): string {
  if (!iso) return 'Sem interação';
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function agruparContacts(
  contacts: readonly ListaContact[],
  order: ContactsOrder,
): ContactsGroup[] {
  const groups = new Map<string, ListaContact[]>();
  const ordenados = [...contacts].sort((a, b) => {
    if (order === 'alfabetica') {
      const an = (a.nome ?? '').trim();
      const bn = (b.nome ?? '').trim();
      if (!an && bn) return 1;
      if (an && !bn) return -1;
      return an.localeCompare(bn, 'pt-BR', { sensitivity: 'base' });
    }
    const at = a.lastInteractionAt ? new Date(a.lastInteractionAt).getTime() : 0;
    const bt = b.lastInteractionAt ? new Date(b.lastInteractionAt).getTime() : 0;
    return bt - at;
  });
  for (const c of ordenados) {
    const key = order === 'alfabetica' ? letra(c.nome) : dia(c.lastInteractionAt);
    const lista = groups.get(key);
    if (lista) lista.push(c);
    else groups.set(key, [c]);
  }
  const saida = [...groups.entries()].map(([rotulo, lista]) => ({ rotulo, contatos: lista }));
  if (order === 'alfabetica') {
    // O grupo `#` sempre por último, como lá.
    saida.sort((a, b) => (a.rotulo === '#' ? 1 : b.rotulo === '#' ? -1 : 0));
  }
  return saida;
}
