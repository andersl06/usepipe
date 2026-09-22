import type { AtendenteCadastrado } from './cadastros';

/**
 * As contas da tela "Gestão de atendentes" — busca, filtro por fila e o texto
 * da descrição da página de permissões.
 *
 * Módulo PURO, sem `./api` e sem JSX, pelo mesmo motivo que `cadastros.ts`:
 * é o que deixa `tests/atendentes.test.ts` rodar com `node --test` + `tsx`,
 * fora do Vite.
 *
 * A forma vem de `FICHA-atendentes-filas-pausas.md` §b.2: a origem tem UMA
 * busca ("Buscar por nome ou e-mail") e UM filtro ("Filtrar por: Filas", com
 * seleção múltipla, "Limpar seleção"/"Cancelar"/"Aplicar"). Nenhum outro.
 */

export interface FiltroDeAtendentes {
  /** O texto de "Buscar por nome ou e-mail". */
  busca: string;
  /** Nomes de fila marcados no painel "Filtrar por: Filas". Vazio = todas. */
  filas: readonly string[];
}

export const FILTRO_VAZIO: FiltroDeAtendentes = { busca: '', filas: [] };

/**
 * Busca em nome E e-mail, como o placeholder promete — buscar só no nome faria
 * a pessoa digitar o e-mail que está na tela e não achar nada.
 */
export function filtrarAtendentes(
  atendentes: readonly AtendenteCadastrado[],
  filtro: FiltroDeAtendentes,
): AtendenteCadastrado[] {
  const alvo = filtro.busca.trim().toLowerCase();
  const filas = new Set(filtro.filas);
  return atendentes.filter((a) => {
    if (alvo && !`${a.nome} ${a.email}`.toLowerCase().includes(alvo)) return false;
    /* Uma fila marcada basta: quem está em Suporte aparece no filtro de
       Suporte mesmo estando também em Financeiro. */
    if (filas.size > 0 && !a.filas.some((f) => filas.has(f))) return false;
    return true;
  });
}

/**
 * As filas que o painel de filtro oferece — as que os atendentes carregam,
 * sem repetição e em ordem. Sai da própria lista porque o painel da origem
 * não tem "todas as filas do tenant", tem as que a lista mostra.
 */
export function filasDosAtendentes(atendentes: readonly AtendenteCadastrado[]): string[] {
  const nomes = new Set<string>();
  for (const a of atendentes) for (const f of a.filas) nomes.add(f);
  return [...nomes].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/**
 * A coluna "Filas" do cartão, no formato da captura: `Default,Suporte` —
 * vírgula, sem espaço, sem etiqueta (`team.html` linha 628).
 */
export function filasNoCartao(filas: readonly string[]): string {
  return filas.length === 0 ? '—' : filas.join(',');
}

/**
 * A descrição da página de permissões, nas TRÊS variantes da origem
 * (`singleMemberDescription`, `coupleMembersDescription`,
 * `multiplesMembersDescription` — §a.4 da ficha).
 */
export function descricaoDasPermissoes(nomes: readonly string[]): string {
  const [primeiro, segundo] = nomes;
  if (nomes.length === 0) return 'Configure as permissões do atendente';
  if (nomes.length === 1) return `Configure as permissões de ${primeiro}`;
  if (nomes.length === 2) return `Configure as permissões de ${primeiro} e ${segundo}`;
  return `Configure as permissões de ${primeiro} e outros ${nomes.length - 1} atendentes`;
}

/** O título da página de edição em lote: "Editar 3 atendentes" / "Editar 1 atendente". */
export function tituloDaEdicao(quantidade: number): string {
  return `Editar ${quantidade} atendente${quantidade === 1 ? '' : 's'}`;
}
