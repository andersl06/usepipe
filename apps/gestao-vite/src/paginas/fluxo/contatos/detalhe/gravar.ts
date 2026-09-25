import { api } from '../../../../lib/api';
import { atualizarLeituras } from '../../../../lib/acoes';
import { motivoDe } from '../../configuracoes/basicas/gravar';

/**
 * `PATCH /v1/contatos/:id` (`controladores/catalogo.ts`, `ControladorContatos.editar`).
 * `null` apaga o campo; `undefined` (omitido) não mexe. `atributos` é mescla: só as
 * chaves mandadas aqui (`city`, `gender`) mudam — as extras do contato continuam.
 */

export interface ContactEdit {
  nome: string | null;
  email: string | null;
  telefone_e164: string | null;
  document: string | null;
  atributos: { city: string | null; gender: string | null };
}

export type Resultado = { ok: true } | { ok: false; error: string };

export async function salvarContact(id: string, edit: ContactEdit): Promise<Resultado> {
  try {
    await api.patch(`/v1/contatos/${id}`, edit);
    atualizarLeituras();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: motivoDe(error, 'Ocorreu um erro ao salvar o contato') };
  }
}
