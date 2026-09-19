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
export interface ChaveListada {
  id: string;
  nome: string;
  prefixo: string;
  escopos: string[];
  criadaEm: string;
  ultimoUsoEm: string | null;
  revogadaEm: string | null;
}

/** Só existe na resposta da criação — depois disso, nunca mais volta em claro. */
export interface ChaveCriada extends ChaveListada {
  token: string;
}

export type Resultado<T> = { ok: true; valor: T } | { ok: false; erro: string };

export async function criarChave(fluxoId: string, nome: string): Promise<Resultado<ChaveCriada>> {
  try {
    const valor = await api.post<ChaveCriada>(`/v1/gestao/fluxos/${fluxoId}/chaves`, { nome });
    atualizarLeituras();
    return { ok: true, valor };
  } catch (erro) {
    return { ok: false, erro: motivoDe(erro, 'Não foi possível criar a chave.') };
  }
}

export async function revogarChave(fluxoId: string, chaveId: string): Promise<Resultado<void>> {
  try {
    await api.delete<void>(`/v1/gestao/fluxos/${fluxoId}/chaves/${chaveId}`);
    atualizarLeituras();
    return { ok: true, valor: undefined };
  } catch (erro) {
    return { ok: false, erro: motivoDe(erro, 'Não foi possível excluir a chave.') };
  }
}
