import { api, chamarApi, motivoDaFalha } from '@pipe/ui/api';
import { atualizarLeituras } from '../../lib/actions';
import { irPara } from '../../lib/navigation';
import type { AccountInForce } from '../../lib/account';
import { APPLICATION } from '../../lib/application-paths';
import { conferir } from './regras';

/**
 * Save "my account" — the former Server Action, now from the browser: `PATCH /v1/conta` with the cookie that already travels on its own, and the return to the portal (or to the same screen with the reason and refused field in the URL).
 */
export async function saveAccount(data: FormData): Promise<void> {
  const corpo = {
    nome: String(data.get('nome') ?? '').trim(),
    site: String(data.get('site') ?? '').trim(),
    funcionarios: String(data.get('funcionarios') ?? '').trim(),
    cidade: String(data.get('cidade') ?? '').trim(),
    estado: String(data.get('estado') ?? '').trim(),
    pais: String(data.get('pais') ?? '').trim(),
    telefone: String(data.get('telefone') ?? '').trim(),
    optinWhatsapp: data.get('optinWhatsapp') === 'on',
    idioma: String(data.get('idioma') ?? '').trim(),
    fuso: String(data.get('fuso') ?? '').trim(),
  };
  /*
   * Valid lists come from the `api`, not from a local copy: a duplicated list is a list that goes stale on the wrong side.
   */
  const account = await api.get<AccountInForce>('/v1/account').catch(() => null);
  const recusa = conferir({
    ...corpo,
    faixas: account?.faixasDeFuncionarios ?? [],
    idiomas: account?.idiomas ?? [],
    fusos: account?.fusos ?? [],
  });
  if (recusa) return backWithError(recusa.motivo, recusa.campo);
  const resposta = await chamarApi('/v1/account', {
    method: 'PATCH',
    body: JSON.stringify(corpo),
    headers: { 'content-type': 'application/json' },
  });
  if (!resposta.ok) return backWithError(await motivoDaFalha(resposta));
  atualizarLeituras();
  /* The session (`Eu`) changes: onboarding closed. `ExigirSessao` re-reads it on the portal. */
  window.location.assign(APPLICATION);
}

function backWithError(motivo: string, campo?: string): void {
  const search = new URLSearchParams({ error: motivo });
  if (campo) search.set('campo', campo);
  irPara(`/my-account?${search}`);
}
