import { api, ErroDaApi } from '../../../../lib/api';
import { atualizarLeituras } from '../../../../lib/acoes';

/**
 * `POST /v1/mensagens-ativas` — a escrita que faltava ligar na tela (o resto,
 * `GET .../growth`, já lê dado real). Mesmo formato de `Resultado<T>` de
 * `configuracoes/basicas/gravar.ts`: `ok`/`valor` ou `ok`/`erro` em texto pronto
 * para o `aviso` da tela.
 */

export interface DestinoDoDisparo {
  contato_id?: string;
  telefone?: string;
  nome?: string;
  parametros?: string[];
}

export interface ResultadoPorContato {
  telefone: string | null;
  contato_id: string | null;
  enviada: boolean;
  mensagem_id: string | null;
  conversa_id: string | null;
  motivo: string | null;
  detalhe: string | null;
}

export interface RespostaDoDisparo {
  enviadas: number;
  recusadas: number;
  data: ResultadoPorContato[];
}

export interface LimitesDeDisparo {
  max_contatos_por_disparo: number;
  limite_diario_por_contato: number;
}

export type Resultado<T> = { ok: true; valor: T } | { ok: false; erro: string };

export async function dispararMensagensAtivas(pedido: {
  canal_id: string;
  template_id: string;
  contatos: DestinoDoDisparo[];
  parametros?: string[];
}): Promise<Resultado<RespostaDoDisparo>> {
  try {
    const valor = await api.post<RespostaDoDisparo>('/v1/mensagens-ativas', pedido);
    atualizarLeituras();
    return { ok: true, valor };
  } catch (erro) {
    return { ok: false, erro: motivoDe(erro, 'Não foi possível enviar a mensagem ativa.') };
  }
}

/** O `erro.mensagem` que a `api` põe no corpo (`ErroPipe`), ou o texto padrão. */
export function motivoDe(erro: unknown, padrao: string): string {
  if (erro instanceof ErroDaApi) {
    const corpo = erro.corpo as { erro?: { mensagem?: unknown } } | null;
    const mensagem = corpo?.erro?.mensagem;
    if (typeof mensagem === 'string' && mensagem) return mensagem;
  }
  return padrao;
}

/** `MotivoDeRecusa` de `dominio/mensagem-ativa.ts`, em português de tela. */
const ROTULOS_DE_RECUSA: Record<string, string> = {
  numero_invalido: 'Número de telefone inválido',
  ja_em_atendimento: 'Este contato já está em atendimento',
  limite_diario: 'Contato atingiu o limite diário de mensagens ativas',
  contato_duplicado: 'Contato duplicado nesta lista',
};

export function rotuloDeRecusa(motivo: string | null): string {
  if (!motivo) return 'Falha no envio';
  return ROTULOS_DE_RECUSA[motivo] ?? motivo;
}
