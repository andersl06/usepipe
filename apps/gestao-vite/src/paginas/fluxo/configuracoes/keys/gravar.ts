import { api } from '../../../../lib/api';
import { atualizarLeituras } from '../../../../lib/acoes';
import { motivoDe } from '../basicas/gravar';

/**
 * As duas escritas de "Chaves de acesso": `POST` e `DELETE` (que REVOGA, não
 * apaga — `dominio/gestao/integracoes.ts`) em
 * `/v1/gestao/fluxos/:id/chaves`. O nome da rota é `chaves`/`chaveId`; a tela
 * usa "excluir" porque é a palavra da origem (`deleteKey`), mas o gesto por
 * baixo é revogação.
 */
export interface KeyListed {
  id: string;
  nome: string;
  prefix: string;
  scopes: string[];
  criadaEm: string;
  ultimoUsoEm: string | null;
  revogadaEm: string | null;
  requisitante: string | null;
}

/** Só existe na resposta da criação — depois disso, nunca mais volta em claro. */
export interface KeyCreated extends KeyListed {
  token: string;
}

export type Resultado<T> = { ok: true; value: T } | { ok: false; error: string };

export async function createKey(flowId: string, nome: string): Promise<Resultado<KeyCreated>> {
  try {
    const value = await api.post<KeyCreated>(`/v1/management/flows/${flowId}/keys`, { nome });
    atualizarLeituras();
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error: motivoDe(error, 'Não foi possível criar a chave.') };
  }
}

export async function revogarKey(flowId: string, keyId: string): Promise<Resultado<void>> {
  try {
    await api.delete<void>(`/v1/management/flows/${flowId}/keys/${keyId}`);
    atualizarLeituras();
    return { ok: true, value: undefined };
  } catch (error) {
    return { ok: false, error: motivoDe(error, 'Não foi possível excluir a chave.') };
  }
}
