import { api, ApiError } from '../../../../lib/api';
import { atualizarLeituras } from '../../../../lib/actions';
import { IMAGE } from '../../../create/regras-de-nome';

/**
 * The two writes for "Editar Fluxo": `PATCH /v1/gestao/fluxos/:id` ("Salvar") and `DELETE /v1/gestao/fluxos/:id` ("Excluir fluxo"). The rule lives in the `api` (`dominio/gestao/ciclo-de-vida-do-fluxo.ts`); here the photo becomes `data:` to cross the JSON, as in `criar/gravar.ts`, and the rejection becomes text for the screen.
 */

/** O que o PATCH devolve (`FluxoGravado` na `api`). */
export interface FlowSaved {
  id: string;
  nome: string;
  description: string | null;
  imageUrl: string | null;
  shortName: string | null;
}

export interface EditBasic {
  nome: string;
  description: string;
  /** A new `File` replaces the photo; `null` removes it; `undefined` leaves it as is. */
  image: File | null | undefined;
}

export type Resultado<T> = { ok: true; value: T } | { ok: false; error: string };

export async function salvarBasicas(
  id: string,
  edit: EditBasic,
): Promise<Resultado<FlowSaved>> {
  const image = edit.image === undefined ? undefined : await readImage(edit.image);
  if (edit.image instanceof File && image === null) {
    const tipos = IMAGE.aceitos.join(', ');
    const teto = Math.round(IMAGE.maxBytes / 1024);
    return { ok: false, error: `A imagem precisa ser ${tipos} e ter até ${teto} KB.` };
  }
  try {
    const value = await api.patch<FlowSaved>(`/v1/management/flows/${id}`, {
      nome: edit.nome,
      descricao: edit.description,
      ...(image === undefined ? {} : { image }),
    });
    atualizarLeituras();
    return { ok: true, value };
  } catch (error) {
    /* Their `onAdvancedConfigurationError`, for when the `api` didn't say why. */
    return { ok: false, error: motivoDe(error, 'Ocorreu um erro ao salvar a configuração') };
  }
}

export async function deleteFlow(id: string): Promise<Resultado<void>> {
  try {
    await api.delete<void>(`/v1/management/flows/${id}`);
    atualizarLeituras();
    return { ok: true, value: undefined };
  } catch (error) {
    /* `deleteErrorMessage` deles. */
    return { ok: false, error: motivoDe(error, 'Ocorreu um erro ao tentar excluir o fluxo') };
  }
}

/** The `erro.mensagem` the `api` puts in the body (`ErroPipe`), or the default text. */
export function motivoDe(error: unknown, padrao: string): string {
  if (error instanceof ApiError) {
    const corpo = error.corpo as { error?: { message?: unknown } } | null;
    const message = corpo?.error?.message;
    if (typeof message === 'string' && message) return message;
  }
  return padrao;
}

/** The file as `data:`. `null` when it isn't a file, is empty, or exceeds the cap. */
function readImage(file: File | null): Promise<string | null> {
  if (!(file instanceof File) || file.size === 0 || file.size > IMAGE.maxBytes) {
    return Promise.resolve(null);
  }
  return new Promise((resolver) => {
    const leitor = new FileReader();
    leitor.onload = () => resolver(typeof leitor.result === 'string' ? leitor.result : null);
    leitor.onerror = () => resolver(null);
    leitor.readAsDataURL(file);
  });
}
