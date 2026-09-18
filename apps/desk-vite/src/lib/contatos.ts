/**
 * As regras puras da aba Contatos — a ordenação e o agrupamento da
 * referência (`docs/pesquisa/blip-desk-medidas.md` §11): "Ordem alfabética"
 * (padrão) agrupa pela primeira letra do nome, com os sem-nome num grupo `#`
 * sempre no fim; "Última interação" agrupa pela data da última mensagem, da
 * mais recente para a mais antiga.
 */
export interface ContatoDaLista {
  id: string;
  nome: string | null;
  telefone: string | null;
  email: string | null;
  ultimaInteracaoEm: string | null;
}

export type OrdemDeContatos = 'alfabetica' | 'ultima-interacao';

export interface GrupoDeContatos {
  rotulo: string;
  contatos: ContatoDaLista[];
}

function letra(nome: string | null): string {
  const n = (nome ?? '').trim();
  if (!n) return '#';
  const primeira = n.charAt(0).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  return /[A-Z]/.test(primeira) ? primeira : '#';
}

function dia(iso: string | null): string {
  if (!iso) return 'Sem interação';
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function agruparContatos(
  contatos: readonly ContatoDaLista[],
  ordem: OrdemDeContatos,
): GrupoDeContatos[] {
  const grupos = new Map<string, ContatoDaLista[]>();
  const ordenados = [...contatos].sort((a, b) => {
    if (ordem === 'alfabetica') {
      const an = (a.nome ?? '').trim();
      const bn = (b.nome ?? '').trim();
      if (!an && bn) return 1;
      if (an && !bn) return -1;
      return an.localeCompare(bn, 'pt-BR', { sensitivity: 'base' });
    }
    const at = a.ultimaInteracaoEm ? new Date(a.ultimaInteracaoEm).getTime() : 0;
    const bt = b.ultimaInteracaoEm ? new Date(b.ultimaInteracaoEm).getTime() : 0;
    return bt - at;
  });
  for (const c of ordenados) {
    const chave = ordem === 'alfabetica' ? letra(c.nome) : dia(c.ultimaInteracaoEm);
    const lista = grupos.get(chave);
    if (lista) lista.push(c);
    else grupos.set(chave, [c]);
  }
  const saida = [...grupos.entries()].map(([rotulo, lista]) => ({ rotulo, contatos: lista }));
  if (ordem === 'alfabetica') {
    // O grupo `#` sempre por último, como lá.
    saida.sort((a, b) => (a.rotulo === '#' ? 1 : b.rotulo === '#' ? -1 : 0));
  }
  return saida;
}
