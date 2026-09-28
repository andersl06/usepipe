import { api } from '../../lib/api';
import { atualizarLeituras } from '../../lib/actions';
import { IMAGE, type RecadosDoNome } from './regras-de-nome';

/**
 * Create a contact (flow or router): `POST /v1/gestao/fluxos`.
 *
 * Name validation, permission checks, and reading the photo by its bytes live in
 * the `api` (`gestao-fluxo.ts` → `dominio/gestao/ciclo-de-vida-do-fluxo.ts`), with
 * the rules from `regras-de-nome.ts`. Here the photo only becomes a `data:` URI
 * to cross the JSON boundary — and doesn't even go if it's already past the cap.
 */
export type Resultado =
  | { id: string; shortName: string; error?: undefined }
  | { id?: undefined; shortName?: undefined; error: string };

export interface RecordingOptions {
  tipo: 'fluxo' | 'roteador';
  recados: RecadosDoNome & { nomeEmUso: string; withoutPermission: string };
}

export async function saveContact(
  data: FormData,
  { tipo, recados }: RecordingOptions,
): Promise<Resultado> {
  const image = await readImage(data.get('imagem'));
  try {
    // Body keys follow the API contract (`RequestOfContact`: name, type). The form field
    // itself is still called `nome`.
    const resultado = await api.post<Resultado>('/v1/management/flows', {
      name: String(data.get('nome') ?? ''),
      type: tipo,
      image,
      recados,
    });
    if (resultado.id) atualizarLeituras();
    return resultado;
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Não foi possível criar.' };
  }
}

async function readImage(campo: FormDataEntryValue | null): Promise<string | null> {
  /* An empty field arrives as a zero-byte `File`, not as `null`. */
  if (!(campo instanceof File) || campo.size === 0) return null;
  if (campo.size > IMAGE.maxBytes) return null;
  return new Promise((resolver) => {
    const leitor = new FileReader();
    leitor.onload = () => resolver(typeof leitor.result === 'string' ? leitor.result : null);
    leitor.onerror = () => resolver(null);
    leitor.readAsDataURL(campo);
  });
}
