import { api, chamarApi, motivoDaFalha } from '../../lib/api';
import { atualizarLeituras } from '../../lib/acoes';
import { irPara } from '../../lib/navegacao';
import type { AccountInVigor } from '../../lib/conta';
import { conferir } from './regras';

/**
 * Salvar "minha conta" — a Server Action de antes, agora do navegador:
 * `PATCH /v1/conta` com o cookie que já vai sozinho, e a volta para o portal
 * (ou para a mesma tela com o motivo e o campo recusado na URL).
 */
export async function salvarAccount(data: FormData): Promise<void> {
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
  /* As listas válidas vêm da `api`, e não de uma cópia daqui: lista duplicada é
     lista que envelhece do lado errado. */
  const account = await api.get<AccountInVigor>('/v1/conta').catch(() => null);
  const recusa = conferir({
    ...corpo,
    faixas: account?.faixasDeFuncionarios ?? [],
    idiomas: account?.idiomas ?? [],
    fusos: account?.fusos ?? [],
  });
  if (recusa) return voltarWithError(recusa.motivo, recusa.campo);
  const resposta = await chamarApi('/v1/conta', {
    method: 'PATCH',
    body: JSON.stringify(corpo),
    headers: { 'content-type': 'application/json' },
  });
  if (!resposta.ok) return voltarWithError(await motivoDaFalha(resposta));
  atualizarLeituras();
  /* A sessão (`Eu`) muda: o onboarding fechou. O `ExigirSessao` relê no portal. */
  window.location.assign('/portal');
}

function voltarWithError(motivo: string, campo?: string): void {
  const search = new URLSearchParams({ erro: motivo });
  if (campo) search.set('campo', campo);
  irPara(`/minha-conta?${search}`);
}
