import type {
  DesenhoDoBuilder,
  BlockError,
  RascunhoGravado,
  VersaoPublicada,
} from '@pipe/contracts';
import { api, ApiError } from '../lib/api';
import { atualizarLeituras } from '../lib/actions';
import { motivoDe, type Resultado } from '../lib/rest';

/**
 * Builder writes use `PUT /v1/gestao/fluxos/:id/builder` to save, `POST .../builder/publicar` to publish, and `POST .../builder/versoes/:versao/restaurar` for history. `api` owns rules in `dominio/gestao/builder-do-fluxo.ts`; here turn refusals into screen text and expose per-block engine errors from `detalhe.erros` on 409.
 */

/** A publish refusal carries engine errors as well as a message. */
export type Recusa = { ok: false; error: string; errors: BlockError[] };
export type ResultadoDoBuilder<T> = { ok: true; value: T } | Recusa;

/** Extract per-block errors from `api` 409 `detalhe` when provided. */
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
