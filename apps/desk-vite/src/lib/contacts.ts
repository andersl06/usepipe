/**
 * Pure Contacts-tab sorting and grouping from `referencias-blip/pesquisa/blip-desk-medidas.md` §11. `Ordem alfabética` (default) groups by the first letter of the name, always putting unnamed contacts in `#` last; `Última interação` groups by the latest message date, newest first.
 */
export interface ListContact {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  lastInteractionAt: string | null;
}

export type ContactsOrder = 'alfabetica' | 'ultima-interacao';

export interface ContactsGroup {
  rotulo: string;
  contacts: ListContact[];
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

export function groupContacts(
  contacts: readonly ListContact[],
  order: ContactsOrder,
): ContactsGroup[] {
  const groups = new Map<string, ListContact[]>();
  const ordenados = [...contacts].sort((a, b) => {
    if (order === 'alfabetica') {
      const an = (a.name ?? '').trim();
      const bn = (b.name ?? '').trim();
      if (!an && bn) return 1;
      if (an && !bn) return -1;
      return an.localeCompare(bn, 'pt-BR', { sensitivity: 'base' });
    }
    const at = a.lastInteractionAt ? new Date(a.lastInteractionAt).getTime() : 0;
    const bt = b.lastInteractionAt ? new Date(b.lastInteractionAt).getTime() : 0;
    return bt - at;
  });
  for (const c of ordenados) {
    const key = order === 'alfabetica' ? letra(c.name) : dia(c.lastInteractionAt);
    const lista = groups.get(key);
    if (lista) lista.push(c);
    else groups.set(key, [c]);
  }
  const saida = [...groups.entries()].map(([rotulo, lista]) => ({ rotulo, contacts: lista }));
  if (order === 'alfabetica') {
    saida.sort((a, b) => (a.rotulo === '#' ? 1 : b.rotulo === '#' ? -1 : 0));
  }
  return saida;
}
