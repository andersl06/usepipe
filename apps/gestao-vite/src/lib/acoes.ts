import { api } from './api';
import { clienteDeConsultas } from './cliente-de-consultas';

/** O que toda ação devolve: deu certo, ou o motivo em texto para a tela. */
export interface Resultado {
  ok: boolean;
  erro?: string;
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
      resultado = await api.post<Resultado>(`/v1/gestao/acoes/${nome}`, { campos });
    } catch (erro) {
      return { ok: false, erro: erro instanceof Error ? erro.message : 'Não foi possível salvar.' };
    }
    if (resultado.ok) void clienteDeConsultas.invalidateQueries({ queryKey: ['api'] });
    return resultado;
  };
}

/* Regras */
export const salvarHorario = acaoRemota('salvarHorario');
export const salvarFaixa = acaoRemota('salvarFaixa');
export const salvarExcecao = acaoRemota('salvarExcecao');
export const salvarRegraFila = acaoRemota('salvarRegraFila');
export const alternarRegraFila = acaoRemota('alternarRegraFila');
/* Atendentes */
export const salvarFila = acaoRemota('salvarFila');
export const salvarMotivoPausa = acaoRemota('salvarMotivoPausa');
/* Comunicação */
export const salvarRespostaPronta = acaoRemota('salvarRespostaPronta');
/* `salvarModelo` saiu: `comunicacao-modelos-formulario.tsx` cria modelo direto
   em `POST /v1/canais/whatsapp/:id/modelos` (a Meta é a fonte agora, não mais
   um `insert` local por `acoes/salvarModelo`). */
/* Preferências */
export const salvarIdentidade = acaoRemota('salvarIdentidade');
export const salvarPesquisa = acaoRemota('salvarPesquisa');
export const salvarEtiquetasDeEncerramento = acaoRemota('salvarEtiquetasDeEncerramento');

/** Deu certo: as leituras em cache são refeitas — o `revalidatePath` de antes. */
export function atualizarLeituras(): void {
  void clienteDeConsultas.invalidateQueries({ queryKey: ['api'] });
}
