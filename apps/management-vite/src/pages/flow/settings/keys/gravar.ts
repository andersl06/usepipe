import { api } from '../../../../lib/api';
import { atualizarLeituras } from '../../../../lib/actions';
import { motivoDe } from '../basic/gravar';

/**
 * The two writes for "Chaves de acesso": `POST` and `DELETE` (which REVOKES, not deletes — `dominio/gestao/integracoes.ts`) at `/v1/gestao/fluxos/:id/chaves`. The route's name is `chaves`/`chaveId`; the screen says "excluir" because that's the source's word (`deleteKey`), but the actual action underneath is revocation.
 */
export interface KeyListed {
  id: string;
  name: string;
  prefix: string;
  escopos: string[];
  criadaEm: string;
  ultimoUsoEm: string | null;
  revokedAt: string | null;
  requisitante: string | null;
}

/** Only exists in the creation response — after that, it never comes back in the clear again. */
export interface KeyCreated extends KeyListed {
  token: string;
}

export type Resultado<T> = { ok: true; value: T } | { ok: false; error: string };

export async function createKey(flowId: string, nome: string): Promise<Resultado<KeyCreated>> {
  try {
    const value = await api.post<KeyCreated>(`/v1/management/flows/${flowId}/keys`, { name: nome });
    atualizarLeituras();
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error: motivoDe(error, 'Não foi possível criar a chave.') };
  }
}

export async function revokeKey(flowId: string, keyId: string): Promise<Resultado<void>> {
  try {
    await api.delete<void>(`/v1/management/flows/${flowId}/keys/${keyId}`);
    atualizarLeituras();
    return { ok: true, value: undefined };
  } catch (error) {
    return { ok: false, error: motivoDe(error, 'Não foi possível excluir a chave.') };
  }
}
