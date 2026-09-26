import { saveContact } from '../gravar';
import { irPara } from '../../../lib/navigation';
import { RECADOS } from './regras';

/**
 * Create a flow: saves through the `api` and goes to the newly created contact's screen — the source's `goToApplicationDetails()`, which ends at `auth.application.detail.home`. On error, goes back to the name step with the reason and the typed name in the URL, as the screen already knows how to show. TODO(template): the hidden `template` field (only present when the person came from "Usar template", see `casco.tsx` and `fluxo/page.tsx`) reaches this far and isn't used. In the source, `MarketplaceTemplatesService.processTemplate` would apply the newly created flow's business hours, human handoff, evaluation, and agent-availability checks from `blip_deskCustomerService` — no equivalent endpoint exists in `apps/api` today, and this file shouldn't invent a new contract. When it exists, this is where the second call goes, after `resultado.id` comes out of `gravarContato`.
 */
export async function createFlow(data: FormData): Promise<void> {
  const resultado = await saveContact(data, { tipo: 'fluxo', recados: RECADOS });
  if (resultado.error) {
    return backWithError(resultado.error, String(data.get('nome') ?? ''), data.get('template'));
  }
  irPara(`/flow/${resultado.id}`);
}

function backWithError(motivo: string, nome: string, template: FormDataEntryValue | null): void {
  /* Passo no path (D-31, `std/nav-contract.md` §Gestão); erro/nome/template
     continuam na query, classificados em separado. */
  const search = new URLSearchParams({ error: motivo });
  if (nome) search.set('nome', nome);
  if (typeof template === 'string' && template) search.set('template', template);
  irPara(`/create/flow/name?${search}`);
}
