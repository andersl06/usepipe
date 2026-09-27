import type { TemplateParaEnvio } from './template.js';

/**
 * WhatsApp outbound adapter. Two implementations share an interface because we have NO test WABA: `ClienteWhatsAppReal` calls Cloud API; `ClienteWhatsAppDuble` simulates delivery, delays, and failures to exercise the whole path. `PIPE_WHATSAPP_CLIENTE` selects one; without a WABA, the default is intentionally the double. Starting the real client without credentials would generate repeated authentication failures rather than useful signal.
 */

export type TipoConteudo = 'texto' | 'imagem' | 'audio' | 'video' | 'documento' | 'localizacao' | 'template' | 'interativo';

export interface CredentialsChannel {

  phoneNumberId: string;
  /** System-user token, encrypted in `canal.config` (spec §6). */
  tokenAccess: string;
  /** Default `v21.0`. Meta discontinues old versions, so this is configurable. */
  apiVersao?: string | undefined;
}

export interface ConteudoTexto {
  tipo: 'texto';
  texto: string;
}

export interface ContentMedia {
  tipo: 'imagem' | 'audio' | 'video' | 'documento';
  /** Public object-storage URL. Media is uploaded before sending (§4.3). */
  link: string;
  legenda?: string | undefined;
  nameFile?: string | undefined;
}

export interface ConteudoTemplate {
  tipo: 'template';
  template: TemplateParaEnvio;
  /** Template values by SEND position, after applying the media offset. */
  values: Record<string, string>;
}


export interface ConteudoInterativo {
  tipo: 'interativo';
  format: 'botoes' | 'lista';
  texto: string;
  options: string[];
}

export interface ConteudoLocalizacao {
  tipo: 'localizacao';
  latitude: number;
  longitude: number;
}

export type Conteudo = ConteudoTexto | ContentMedia | ConteudoTemplate | ConteudoInterativo | ConteudoLocalizacao;

export interface PedidoEnvio {
  /** Recipient in E.164 without `+`, as Cloud API requires. */
  para: string;
  conteudo: Conteudo;
  credentials: CredentialsChannel;
}

export interface RespostaEnvio {
  /** `wamid.…` — vira `mensagem.id_provedor` e casa o status que chega por webhook. */
  idProvedor: string;
}

/**
 * `permanente` controls the outcome: a permanent failure stops retries and writes `erro_codigo`/`erro_texto` on the message; a temporary failure returns to the outbox with increasing delay. Confusing them wastes five attempts on a nonexistent number.
 */
export class WhatsAppError extends Error {
  readonly codigo: string;
  readonly permanente: boolean;

  constructor(codigo: string, message: string, permanente: boolean) {
    super(message);
    this.name = 'ErroWhatsApp';
    this.codigo = codigo;
    this.permanente = permanente;
  }
}

export interface ClienteWhatsApp {
  readonly nome: 'real' | 'duble';
  enviar(pedido: PedidoEnvio): Promise<RespostaEnvio>;
}
