import { api } from './api';
import { clienteDeConsultas } from './cliente-de-consultas';


export interface Resultado {
  ok: boolean;
  error?: string;
}

/**
 * Uma ação de formulário do Desk, na `api` — o mesmo `acaoRemota` de
 * `apps/management-vite/src/lib/acoes.ts`, apontado para `POST /v1/desk/acoes/:nome`.
 *
 * O `FormData` vira JSON (chave repetida vira lista, como o `getAll` espera), o
 * `Resultado` volta, e, dando certo, as leituras em cache são invalidadas.
 */
export function acaoRemota(nome: string) {
  return async (_anterior: Resultado, data: FormData): Promise<Resultado> => {
    const campos: Record<string, string | string[]> = {};
    for (const [key, value] of data.entries()) {
      const texto = typeof value === 'string' ? value : value.name;
      const atual = campos[key];
      if (atual === undefined) campos[key] = texto;
      else if (Array.isArray(atual)) atual.push(texto);
      else campos[key] = [atual, texto];
    }
    let resultado: Resultado;
    try {
      resultado = await api.post<Resultado>(`/v1/desk/actions/${nome}`, { campos });
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Não foi possível salvar.' };
    }
    if (resultado.ok) void clienteDeConsultas.invalidateQueries({ queryKey: ['api'] });
    return resultado;
  };
}

/** Invoke the same action with an object instead of `FormData`, for buttons without forms. */
export async function executar(
  nome: string,
  campos: Record<string, string | string[]>,
): Promise<Resultado> {
  const data = new FormData();
  for (const [key, value] of Object.entries(campos)) {
    for (const v of Array.isArray(value) ? value : [value]) data.append(key, v);
  }
  return acaoRemota(nome)({ ok: true }, data);
}

/* Status do atendente (`apps/api/src/dominio/desk/acoes.ts`) */
export const definirStatus = acaoRemota('definirStatus');
export const failByInactivity = acaoRemota('cairPorInatividade');
/* Internal composer note maps to `Comentário` in the contact panel. */
export const salvarNotaInterna = acaoRemota('salvarNotaInterna');
export const transferInBulk = acaoRemota('transferirEmMassa');
/* A mensagem ativa vai direto por `POST /v1/mensagens-ativas` (ver paginas/mensagem-ativa/page.tsx). */

/** After success, invalidate cached reads; this replaces the former `revalidatePath` behavior. */
export function atualizarLeituras(): void {
  void clienteDeConsultas.invalidateQueries({ queryKey: ['api'] });
}
