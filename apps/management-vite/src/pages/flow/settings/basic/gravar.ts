import { api, ApiError } from '../../../../lib/api';
import { atualizarLeituras } from '../../../../lib/actions';
import { IMAGE } from '../../../create/regras-de-nome';

/**
 * As duas escritas de "Editar Fluxo": `PATCH /v1/gestao/fluxos/:id` (o
 * "Salvar") e `DELETE /v1/gestao/fluxos/:id` (o "Excluir fluxo"). A regra
 * mora na `api` (`dominio/gestao/ciclo-de-vida-do-fluxo.ts`); aqui a foto vira
 * `data:` para atravessar o JSON, como em `criar/gravar.ts`, e a recusa vira
 * texto para a tela.
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
  /** `File` novo troca a foto; `null` tira; `undefined` deixa como está. */
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
    /* `onAdvancedConfigurationError` deles, para quando a `api` não disse o motivo. */
    return { ok: false, error: motivoDe(error, 'Ocorreu um erro ao salvar a configuração') };
  }
}

export async function excluirFlow(id: string): Promise<Resultado<void>> {
  try {
    await api.delete<void>(`/v1/management/flows/${id}`);
    atualizarLeituras();
    return { ok: true, value: undefined };
  } catch (error) {
    /* `deleteErrorMessage` deles. */
    return { ok: false, error: motivoDe(error, 'Ocorreu um erro ao tentar excluir o fluxo') };
  }
}

/** O `erro.mensagem` que a `api` põe no corpo (`ErroPipe`), ou o texto padrão. */
export function motivoDe(error: unknown, padrao: string): string {
  if (error instanceof ApiError) {
    const corpo = error.corpo as { error?: { message?: unknown } } | null;
    const message = corpo?.error?.message;
    if (typeof message === 'string' && message) return message;
  }
  return padrao;
}

/** O arquivo em `data:`. `null` quando não é arquivo, está vazio ou passou do teto. */
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
