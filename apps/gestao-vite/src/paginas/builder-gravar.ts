import type {
  DesenhoDoBuilder,
  ErroDoBloco,
  RascunhoGravado,
  VersaoPublicada,
} from '@pipe/contracts';
import { api, ErroDaApi } from '../lib/api';
import { atualizarLeituras } from '../lib/acoes';
import { motivoDe, type Resultado } from '../lib/rest';

/**
 * As escritas do Builder: `PUT /v1/gestao/fluxos/:id/builder` (o "salvar"),
 * `POST .../builder/publicar` (o botão "Publicar fluxo") e `POST
 * .../builder/versoes/:versao/restaurar` (o histórico). A regra mora na `api`
 * (`dominio/gestao/builder-do-fluxo.ts`); aqui a recusa vira texto para a tela,
 * e a lista de erros do motor — que vem no `detalhe.erros` do 409 de publicar —
 * é preservada, porque é ela que a tela pinta bloco a bloco.
 */

/** Recusa que traz a lista do motor junto (publicar fluxo inválido). */
export type Recusa = { ok: false; erro: string; erros: ErroDoBloco[] };
export type ResultadoDoBuilder<T> = { ok: true; valor: T } | Recusa;

/** Os erros por bloco que a `api` põe no `detalhe` do 409, se vieram. */
function errosDe(erro: unknown): ErroDoBloco[] {
  if (!(erro instanceof ErroDaApi)) return [];
  const corpo = erro.corpo as { erro?: { detalhe?: { erros?: unknown } } } | null;
  const lista = corpo?.erro?.detalhe?.erros;
  return Array.isArray(lista)
    ? lista.filter(
        (e): e is ErroDoBloco =>
          !!e && typeof e === 'object' && typeof (e as ErroDoBloco).mensagem === 'string',
      )
    : [];
}

export async function salvarRascunho(
  id: string,
  desenho: DesenhoDoBuilder,
): Promise<Resultado<RascunhoGravado>> {
  try {
    const valor = await api.put<RascunhoGravado>(`/v1/gestao/fluxos/${id}/builder`, desenho);
    atualizarLeituras();
    return { ok: true, valor };
  } catch (erro) {
    return { ok: false, erro: motivoDe(erro, 'Não foi possível salvar o rascunho.') };
  }
}

export async function publicarFluxo(id: string): Promise<ResultadoDoBuilder<VersaoPublicada>> {
  try {
    const valor = await api.post<VersaoPublicada>(`/v1/gestao/fluxos/${id}/builder/publicar`);
    atualizarLeituras();
    return { ok: true, valor };
  } catch (erro) {
    return {
      ok: false,
      erro: motivoDe(erro, 'Não foi possível publicar o fluxo.'),
      erros: errosDe(erro),
    };
  }
}

export async function restaurarVersao(
  id: string,
  versao: number,
): Promise<Resultado<RascunhoGravado>> {
  try {
    const valor = await api.post<RascunhoGravado>(
      `/v1/gestao/fluxos/${id}/builder/versoes/${versao}/restaurar`,
    );
    atualizarLeituras();
    return { ok: true, valor };
  } catch (erro) {
    return { ok: false, erro: motivoDe(erro, 'Não foi possível restaurar a versão.') };
  }
}
