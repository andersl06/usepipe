import { api } from './api';
import { clienteDeConsultas } from './cliente-de-consultas';

/** O que toda ação devolve: deu certo, ou o motivo em texto para a tela. */
export interface Resultado {
  ok: boolean;
  error?: string;
}

/**
 * Uma ação de formulário da Gestão, agora na `api`.
 *
 * Mesma assinatura que a Server Action tinha — `(anterior, FormData) =>
 * Resultado` —, então os formulários continuam com o `useActionState` e o
 * `envioQuePreserva` de sempre; só o import mudou. O `FormData` vira JSON
 * (chave repetida vira lista, como o `getAll` espera), vai para
 * `POST /v1/gestao/acoes/:nome`, e o `Resultado` volta. Deu certo: as
 * leituras em cache são invalidadas, que é o `revalidatePath` de antes.
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
export const salvarException = acaoRemota('salvarExcecao');
export const salvarRuleQueue = acaoRemota('salvarRegraFila');
export const alternarRuleQueue = acaoRemota('alternarRegraFila');
/* Atendentes */
export const salvarQueue = acaoRemota('salvarFila');
export const salvarMotivoPausa = acaoRemota('salvarMotivoPausa');
/* Comunicação */
export const salvarRespostaPronta = acaoRemota('salvarRespostaPronta');
/* `salvarModelo` saiu: `comunicacao-modelos-formulario.tsx` cria modelo direto
   em `POST /v1/canais/whatsapp/:id/modelos` (a Meta é a fonte agora, não mais
   um `insert` local por `acoes/salvarModelo`). */
/* Preferências */
export const salvarIdentity = acaoRemota('salvarIdentidade');
export const salvarPesquisa = acaoRemota('salvarPesquisa');
export const closureSalvarTags = acaoRemota('salvarEtiquetasDeEncerramento');

/** Deu certo: as leituras em cache são refeitas — o `revalidatePath` de antes. */
export function atualizarLeituras(): void {
  void clienteDeConsultas.invalidateQueries({ queryKey: ['api'] });
}
