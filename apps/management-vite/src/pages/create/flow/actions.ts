import { saveContact } from '../gravar';
import { irPara } from '../../../lib/navigation';
import { createNamePath, flowPath } from '../../../lib/application-paths';
import { RECADOS } from './regras';

/**
 * Create a flow: saves through the `api` and goes to the newly created contact's screen — the source's `goToApplicationDetails()`, which ends at `auth.application.detail.home`. On error, goes back to the name step with the reason and the typed name in the URL, as the screen already knows how to show. TODO(template): the hidden `template` field (only present when the person came from "Usar template", see `casco.tsx` and `fluxo/page.tsx`) reaches this far and isn't used. In the source, `MarketplaceTemplatesService.processTemplate` would apply the newly created flow's business hours, human handoff, evaluation, and agent-availability checks from `blip_deskCustomerService` — no equivalent endpoint exists in `apps/api` today, and this file shouldn't invent a new contract. When it exists, this is where the second call goes, after `resultado.id` comes out of `saveContact`.
 */
export async function createFlow(data: FormData): Promise<void> {
  const resultado = await saveContact(data, { tipo: 'fluxo', recados: RECADOS });
  /* Checking `shortName` (not `error`) is what lets TS narrow the union: `error` is a plain
     `string` in the failure branch, ambiguously truthy, while `shortName` is strictly `undefined`
     there — the only property that excludes it cleanly. */
  if (!resultado.shortName) {
    return backWithError(
      resultado.error ?? 'Não foi possível criar.',
      String(data.get('nome') ?? ''),
      data.get('template'),
    );
  }
  irPara(flowPath(resultado.shortName));
}

function backWithError(motivo: string, nome: string, template: FormDataEntryValue | null): void {
  /* Step in the path (D-31, D-52); error/name stay in the query, classified separately. */
  const search = new URLSearchParams({ error: motivo });
  if (nome) search.set('nome', nome);
  const templateName = typeof template === 'string' && template ? template : 'builder';
  irPara(`${createNamePath(templateName)}?${search}`);
}
