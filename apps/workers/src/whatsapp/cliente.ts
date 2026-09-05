import type { TemplateParaEnvio } from './template.js';

/**
 * O adaptador de saída para o WhatsApp.
 *
 * Duas implementações atrás da mesma interface porque **não temos WABA de teste**:
 * `ClienteWhatsAppReal` fala com a Cloud API; `ClienteWhatsAppDuble` simula entrega,
 * atraso e falha e é o que permite provar o caminho inteiro hoje. A escolha é por
 * `PIPE_WHATSAPP_CLIENTE`; sem WABA no ambiente, o padrão é o dublê, de propósito —
 * subir com o cliente real sem credencial só produziria falha de autenticação em
 * série, que é ruído, não sinal.
 */

export type TipoConteudo = 'texto' | 'imagem' | 'audio' | 'video' | 'documento' | 'template';

export interface CredenciaisCanal {
  /** `WHATSAPP_PHONE_NUMBER_ID` — o número que envia. */
  phoneNumberId: string;
  /** Token do usuário de sistema. Cifrado em `canal.config` (§6 da spec). */
  tokenAcesso: string;
  /** Padrão `v21.0`. A Meta descontinua versão antiga; por isso é configuração. */
  apiVersao?: string | undefined;
}

export interface ConteudoTexto {
  tipo: 'texto';
  texto: string;
}

export interface ConteudoMidia {
  tipo: 'imagem' | 'audio' | 'video' | 'documento';
  /** URL pública do storage de objetos. A mídia sobe antes do envio (§4.3). */
  link: string;
  legenda?: string | undefined;
  nomeArquivo?: string | undefined;
}

export interface ConteudoTemplate {
  tipo: 'template';
  template: TemplateParaEnvio;
  /** Valores por posição **de disparo**, com o deslocamento de mídia já aplicado. */
  valores: Record<string, string>;
}

export type Conteudo = ConteudoTexto | ConteudoMidia | ConteudoTemplate;

export interface PedidoEnvio {
  /** Destinatário em E.164 sem o `+`, como a Cloud API exige. */
  para: string;
  conteudo: Conteudo;
  credenciais: CredenciaisCanal;
}

export interface RespostaEnvio {
  /** `wamid.…` — vira `mensagem.id_provedor` e casa o status que chega por webhook. */
  idProvedor: string;
}

/**
 * `permanente` decide o destino: falha permanente para de tentar e grava
 * `erro_codigo`/`erro_texto` na mensagem; falha temporária volta ao outbox com espera
 * crescente. Confundir as duas é gastar 5 tentativas num número que não existe.
 */
export class ErroWhatsApp extends Error {
  readonly codigo: string;
  readonly permanente: boolean;

  constructor(codigo: string, mensagem: string, permanente: boolean) {
    super(mensagem);
    this.name = 'ErroWhatsApp';
    this.codigo = codigo;
    this.permanente = permanente;
  }
}

export interface ClienteWhatsApp {
  readonly nome: 'real' | 'duble';
  enviar(pedido: PedidoEnvio): Promise<RespostaEnvio>;
}
