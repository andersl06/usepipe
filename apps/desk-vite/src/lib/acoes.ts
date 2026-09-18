import { api } from './api';
import { clienteDeConsultas } from './cliente-de-consultas';

/** O que toda ação devolve: deu certo, ou o motivo em texto para a tela. */
export interface Resultado {
  ok: boolean;
  erro?: string;
}

/**
 * Uma ação de formulário do Desk, na `api` — o mesmo `acaoRemota` de
 * `apps/gestao-vite/src/lib/acoes.ts`, apontado para `POST /v1/desk/acoes/:nome`.
 *
 * O `FormData` vira JSON (chave repetida vira lista, como o `getAll` espera), o
 * `Resultado` volta, e, dando certo, as leituras em cache são invalidadas.
 */
export function acaoRemota(nome: string) {
  return async (_anterior: Resultado, dados: FormData): Promise<Resultado> => {
    const campos: Record<string, string | string[]> = {};
    for (const [chave, valor] of dados.entries()) {
      const texto = typeof valor === 'string' ? valor : valor.name;
      const atual = campos[chave];
      if (atual === undefined) campos[chave] = texto;
      else if (Array.isArray(atual)) atual.push(texto);
      else campos[chave] = [atual, texto];
    }
    let resultado: Resultado;
    try {
      resultado = await api.post<Resultado>(`/v1/desk/acoes/${nome}`, { campos });
    } catch (erro) {
      return { ok: false, erro: erro instanceof Error ? erro.message : 'Não foi possível salvar.' };
    }
    if (resultado.ok) void clienteDeConsultas.invalidateQueries({ queryKey: ['api'] });
    return resultado;
  };
}

/** A mesma ação, chamada com um objeto em vez de `FormData` — para botão sem formulário. */
export async function executar(
  nome: string,
  campos: Record<string, string | string[]>,
): Promise<Resultado> {
  const dados = new FormData();
  for (const [chave, valor] of Object.entries(campos)) {
    for (const v of Array.isArray(valor) ? valor : [valor]) dados.append(chave, v);
  }
  return acaoRemota(nome)({ ok: true }, dados);
}

/* Status do atendente (`apps/api/src/dominio/desk/acoes.ts`) */
export const definirStatus = acaoRemota('definirStatus');
export const cairPorInatividade = acaoRemota('cairPorInatividade');
/* Nota interna do compositor */
export const salvarNotaInterna = acaoRemota('salvarNotaInterna');
/* Comentário do contato (painel), preferências, ações em massa e mensagem ativa */
export const salvarComentarioDoContato = acaoRemota('salvarComentarioDoContato');
export const transferirEmMassa = acaoRemota('transferirEmMassa');
export const enviarMensagemAtiva = acaoRemota('enviarMensagemAtiva');

/** Deu certo: as leituras em cache são refeitas — o `revalidatePath` de antes. */
export function atualizarLeituras(): void {
  void clienteDeConsultas.invalidateQueries({ queryKey: ['api'] });
}
