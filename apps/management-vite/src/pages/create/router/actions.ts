import { saveContact } from '../gravar';
import { irPara } from '../../../lib/navigation';
import { RECADOS } from './regras';

/**
 * Create a router: saves through the `api` and goes to the newly created contact's
 * screen — the source's `goToApplicationDetails()`. On error, goes back to the
 * name step with the reason and the typed name in the URL.
 */
export async function createRouter(data: FormData): Promise<void> {
  const resultado = await saveContact(data, { tipo: 'roteador', recados: RECADOS });
  if (resultado.error) return voltarWithError(resultado.error, String(data.get('nome') ?? ''));
  irPara(`/router/${resultado.id}`);
}

function voltarWithError(motivo: string, nome: string): void {
  /* Passo no path (D-31, `std/nav-contract.md` §Gestão); erro/nome
     continuam na query, classificados em separado. */
  const search = new URLSearchParams({ error: motivo });
  if (nome) search.set('nome', nome);
  irPara(`/create/router/name?${search}`);
}
