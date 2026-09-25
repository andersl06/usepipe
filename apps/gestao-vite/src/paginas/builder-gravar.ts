import type {
  DesenhoDoBuilder,
  BlockError,
  RascunhoGravado,
  VersaoPublicada,
} from '@pipe/contracts';
import { api, ApiError } from '../lib/api';
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
export type Recusa = { ok: false; error: string; errors: BlockError[] };
export type ResultadoDoBuilder<T> = { ok: true; value: T } | Recusa;

/** Os erros por bloco que a `api` põe no `detalhe` do 409, se vieram. */
function errorsOf(error: unknown): BlockError[] {
  if (!(error instanceof ApiError)) return [];
  const corpo = error.corpo as { error?: { detalhe?: { errors?: unknown } } } | null;
  const lista = corpo?.error?.detalhe?.errors;
  return Array.isArray(lista)
    ? lista.filter(
        (e): e is BlockError =>
          !!e && typeof e === 'object' && typeof (e as BlockError).mensagem === 'string',
      )
    : [];
}

export async function salvarRascunho(
  id: string,
  desenho: DesenhoDoBuilder,
): Promise<Resultado<RascunhoGravado>> {
  try {
    const value = await api.put<RascunhoGravado>(`/v1/management/flows/${id}/builder`, desenho);
    atualizarLeituras();
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error: motivoDe(error, 'Não foi possível salvar o rascunho.') };
  }
}

export async function publishFlow(id: string): Promise<ResultadoDoBuilder<VersaoPublicada>> {
  try {
    const value = await api.post<VersaoPublicada>(`/v1/management/flows/${id}/builder/publish`);
    atualizarLeituras();
    return { ok: true, value };
  } catch (error) {
    return {
      ok: false,
      error: motivoDe(error, 'Não foi possível publicar o fluxo.'),
      errors: errorsOf(error),
    };
  }
}

export async function restoreVersion(
  id: string,
  versao: number,
): Promise<Resultado<RascunhoGravado>> {
  try {
    const value = await api.post<RascunhoGravado>(
      `/v1/management/flows/${id}/builder/versions/${versao}/restore`,
    );
    atualizarLeituras();
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error: motivoDe(error, 'Não foi possível restaurar a versão.') };
  }
}
