import { api } from '../../../../lib/api';
import { atualizarLeituras } from '../../../../lib/actions';
import { motivoDe } from '../../settings/basic/gravar';

/**
 * `PATCH /v1/contatos/:id` (`controladores/catalogo.ts`, `ControladorContatos.editar`). `null` clears the field; `undefined` (omitted) leaves it untouched. `atributos` is a merge: only the keys sent here (`city`, `gender`) change — the contact's extra keys are kept.
 */

export interface ContactEdit {
  nome: string | null;
  email: string | null;
  telefone_e164: string | null;
  document: string | null;
  atributos: { city: string | null; gender: string | null };
}

export type Resultado = { ok: true } | { ok: false; error: string };

export async function saveContact(id: string, edit: ContactEdit): Promise<Resultado> {
  try {
    await api.patch(`/v1/contacts/${id}`, {
      name: edit.nome,
      email: edit.email,
      phoneE164: edit.telefone_e164,
      document: edit.document,
      atributos: edit.atributos,
    });
    atualizarLeituras();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: motivoDe(error, 'Ocorreu um erro ao salvar o contato') };
  }
}
