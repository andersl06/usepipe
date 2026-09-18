import { api, chamarApi, motivoDaFalha } from '../../lib/api';
import { atualizarLeituras } from '../../lib/acoes';
import { irPara } from '../../lib/navegacao';
import type { ContaEmVigor } from '../../lib/conta';
import { conferir } from './regras';

/**
 * Salvar "minha conta" — a Server Action de antes, agora do navegador:
 * `PATCH /v1/conta` com o cookie que já vai sozinho, e a volta para o portal
 * (ou para a mesma tela com o motivo e o campo recusado na URL).
 */
export async function salvarConta(dados: FormData): Promise<void> {
  const corpo = {
    nome: String(dados.get('nome') ?? '').trim(),
    site: String(dados.get('site') ?? '').trim(),
    funcionarios: String(dados.get('funcionarios') ?? '').trim(),
    cidade: String(dados.get('cidade') ?? '').trim(),
    estado: String(dados.get('estado') ?? '').trim(),
    pais: String(dados.get('pais') ?? '').trim(),
    telefone: String(dados.get('telefone') ?? '').trim(),
    optinWhatsapp: dados.get('optinWhatsapp') === 'on',
    idioma: String(dados.get('idioma') ?? '').trim(),
    fuso: String(dados.get('fuso') ?? '').trim(),
  };
  /* As listas válidas vêm da `api`, e não de uma cópia daqui: lista duplicada é
     lista que envelhece do lado errado. */
  const conta = await api.get<ContaEmVigor>('/v1/conta').catch(() => null);
  const recusa = conferir({
    ...corpo,
    faixas: conta?.faixasDeFuncionarios ?? [],
    idiomas: conta?.idiomas ?? [],
    fusos: conta?.fusos ?? [],
  });
  if (recusa) return voltarComErro(recusa.motivo, recusa.campo);
  const resposta = await chamarApi('/v1/conta', {
    method: 'PATCH',
    body: JSON.stringify(corpo),
    headers: { 'content-type': 'application/json' },
  });
  if (!resposta.ok) return voltarComErro(await motivoDaFalha(resposta));
  atualizarLeituras();
  /* A sessão (`Eu`) muda: o onboarding fechou. O `ExigirSessao` relê no portal. */
  window.location.assign('/portal');
}

function voltarComErro(motivo: string, campo?: string): void {
  const busca = new URLSearchParams({ erro: motivo });
  if (campo) busca.set('campo', campo);
  irPara(`/minha-conta?${busca}`);
}
