import { api } from '../../../../lib/api';
import { atualizarLeituras } from '../../../../lib/acoes';
import { motivoDe } from '../../configuracoes/basicas/gravar';

/**
 * `PATCH /v1/contatos/:id` (`controladores/catalogo.ts`, `ControladorContatos.editar`).
 * `null` apaga o campo; `undefined` (omitido) não mexe. `atributos` é mescla: só as
 * chaves mandadas aqui (`city`, `gender`) mudam — as extras do contato continuam.
 */

export interface EdicaoDeContato {
  nome: string | null;
  email: string | null;
  telefone_e164: string | null;
  documento: string | null;
  atributos: { city: string | null; gender: string | null };
}

export type Resultado = { ok: true } | { ok: false; erro: string };

export async function salvarContato(id: string, edicao: EdicaoDeContato): Promise<Resultado> {
  try {
    await api.patch(`/v1/contatos/${id}`, edicao);
    atualizarLeituras();
    return { ok: true };
  } catch (erro) {
    return { ok: false, erro: motivoDe(erro, 'Ocorreu um erro ao salvar o contato') };
  }
}
