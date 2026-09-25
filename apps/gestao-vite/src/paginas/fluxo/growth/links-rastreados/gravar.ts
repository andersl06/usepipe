import { api, ApiError } from '../../../../lib/api';
import { atualizarLeituras } from '../../../../lib/acoes';
import { fieldOfErrorOfLink, type LinkRastreado, type Resultado } from './dados';

/**
 * A escrita de verdade do rastreador de cliques — `POST
 * /v1/gestao/fluxos/:fluxoId/links-rastreados`. Tipos e a regra de campo do
 * erro moram em `dados.ts` (módulo puro); aqui só o que precisa de `./api`.
 * Mesmo formato de `mensagens-ativas/disparo.ts`.
 */
function falha<T>(error: unknown, padrao: string): Resultado<T> {
  if (error instanceof ApiError) {
    const corpo = error.corpo as { error?: { codigo?: unknown; message?: unknown } } | null;
    const message = corpo?.error?.message;
    const codigo = corpo?.error?.codigo;
    const campo = typeof codigo === 'string' ? fieldOfErrorOfLink(codigo) : undefined;
    return {
      ok: false,
      error: typeof message === 'string' && message ? message : padrao,
      ...(campo ? { campo } : {}),
    };
  }
  return { ok: false, error: padrao };
}

export async function createLinkTracked(
  flowId: string,
  pedido: { nome: string; destination: string },
): Promise<Resultado<LinkRastreado>> {
  try {
    const value = await api.post<LinkRastreado>(
      `/v1/management/flows/${flowId}/links-tracked`,
      pedido,
    );
    atualizarLeituras();
    return { ok: true, value };
  } catch (error) {
    return falha(error, 'Não foi possível criar o link.');
  }
}
