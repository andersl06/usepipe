import { api, ErroDaApi } from '../../../../lib/api';
import { atualizarLeituras } from '../../../../lib/acoes';
import { campoDoErroDeLink, type LinkRastreado, type Resultado } from './dados';

/**
 * A escrita de verdade do rastreador de cliques — `POST
 * /v1/gestao/fluxos/:fluxoId/links-rastreados`. Tipos e a regra de campo do
 * erro moram em `dados.ts` (módulo puro); aqui só o que precisa de `./api`.
 * Mesmo formato de `mensagens-ativas/disparo.ts`.
 */
function falha<T>(erro: unknown, padrao: string): Resultado<T> {
  if (erro instanceof ErroDaApi) {
    const corpo = erro.corpo as { erro?: { codigo?: unknown; mensagem?: unknown } } | null;
    const mensagem = corpo?.erro?.mensagem;
    const codigo = corpo?.erro?.codigo;
    const campo = typeof codigo === 'string' ? campoDoErroDeLink(codigo) : undefined;
    return {
      ok: false,
      erro: typeof mensagem === 'string' && mensagem ? mensagem : padrao,
      ...(campo ? { campo } : {}),
    };
  }
  return { ok: false, erro: padrao };
}

export async function criarLinkRastreado(
  fluxoId: string,
  pedido: { nome: string; destino: string },
): Promise<Resultado<LinkRastreado>> {
  try {
    const valor = await api.post<LinkRastreado>(
      `/v1/gestao/fluxos/${fluxoId}/links-rastreados`,
      pedido,
    );
    atualizarLeituras();
    return { ok: true, valor };
  } catch (erro) {
    return falha(erro, 'Não foi possível criar o link.');
  }
}
