import { api } from './api';
import { clienteDeConsultas } from './cliente-de-consultas';

/** O que toda ação devolve: deu certo, ou o motivo em texto para a tela. */
export interface Resultado {
  ok: boolean;
  error?: string;
}

/**
 * Gestao form actions now call `api` while keeping the old Server Action signature (formerly `revalidatePath` for refresh) `(anterior, FormData) => Resultado`, so forms retain `useActionState` and `envioQuePreserva`. Convert `FormData` to JSON, collecting repeated keys like `getAll`; post to `POST /v1/gestao/acoes/:nome`, return `Resultado`, and invalidate cached reads after success.
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
      resultado = await api.post<Resultado>(`/v1/management/actions/${nome}`, { campos });
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Não foi possível salvar.' };
    }
    if (resultado.ok) void clienteDeConsultas.invalidateQueries({ queryKey: ['api'] });
    return resultado;
  };
}

/* Regras */
export const salvarHorario = acaoRemota('salvarHorario');
export const salvarFaixa = acaoRemota('salvarFaixa');
export const saveException = acaoRemota('salvarExcecao');
export const saveRuleQueue = acaoRemota('salvarRegraFila');
export const toggleRuleQueue = acaoRemota('alternarRegraFila');
/* Atendentes */
export const saveQueue = acaoRemota('salvarFila');
export const salvarMotivoPausa = acaoRemota('salvarMotivoPausa');

export const salvarRespostaPronta = acaoRemota('salvarRespostaPronta');
/*
 * `salvarModelo` was removed: `comunicacao-modelos-formulario.tsx` creates templates directly through `POST /v1/canais/whatsapp/:id/modelos`. Meta is now the source, replacing local `insert` through `acoes/salvarModelo`.
 */

export const saveIdentity = acaoRemota('salvarIdentidade');
export const salvarPesquisa = acaoRemota('salvarPesquisa');
export const closureSaveTags = acaoRemota('salvarEtiquetasDeEncerramento');

/** After success, invalidate cached reads, replacing the former `revalidatePath` behavior. */
export function atualizarLeituras(): void {
  void clienteDeConsultas.invalidateQueries({ queryKey: ['api'] });
}
