import { saveContact } from '../gravar';
import { irPara } from '../../../lib/navigation';
import { createNamePath, flowPath } from '../../../lib/application-paths';
import { RECADOS } from './regras';

/**
 * Create a router: saves through the `api` and goes to the newly created contact's
 * screen — the source's `goToApplicationDetails()`. On error, goes back to the
 * name step with the reason and the typed name in the URL.
 */
export async function createRouter(data: FormData): Promise<void> {
  const resultado = await saveContact(data, { tipo: 'roteador', recados: RECADOS });
  /* Checking `shortName` (not `error`) is what lets TS narrow the union — see the same note in
     `../flow/actions.ts`. */
  if (!resultado.shortName) {
    return backWithError(resultado.error ?? 'Não foi possível criar.', String(data.get('nome') ?? ''));
  }
  irPara(flowPath(resultado.shortName));
}

function backWithError(motivo: string, nome: string): void {
  /* Step in the path (D-31, D-52); error/name stay in the query, classified separately. */
  const search = new URLSearchParams({ error: motivo });
  if (nome) search.set('nome', nome);
  irPara(`${createNamePath('master')}?${search}`);
}
