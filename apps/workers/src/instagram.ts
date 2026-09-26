import { WhatsAppError } from './whatsapp/cliente.js';

/**
 * Instagram Direct outbound adapter, reconstructed from chatwoot/chatwoot (MIT), `app/services/instagram/send_on_instagram_service.rb`: `POST /{ig-user-id}/messages` on `graph.instagram.com` with `{recipient:{id}, message:{text}|{attachment}}`. Failures intentionally use `WhatsAppError`, the delivery class whose `permanente` flag decides retry versus stopping; it is not a WhatsApp-only error. As with WhatsApp, `PIPE_WHATSAPP_CLIENTE=real` calls Meta and any other value uses the test double.
 */

export interface CredentialsInstagram {
  /** O id da conta profissional (`canal.config.igUserId`). */
  igUserId: string;
  tokenAccess: string;
  apiVersao?: string | undefined;
}

export type ConteudoInstagram =
  | { tipo: 'texto'; texto: string }
  | { tipo: 'imagem' | 'audio' | 'video' | 'documento'; link: string; legenda?: string | undefined };

export interface PedidoInstagram {
  /** IGSID do contato (`contato_identidade.identificador`). */
  para: string;
  conteudo: ConteudoInstagram;
  credentials: CredentialsInstagram;
}

export interface ClienteInstagram {
  readonly nome: 'real' | 'duble';
  enviar(pedido: PedidoInstagram): Promise<{ idProvedor: string }>;
}

const BASE = process.env['INSTAGRAM_API_BASE'] ?? 'https://graph.instagram.com';

/** Map Pipe type to Instagram `attachment.type`. Confirm `file` for documents with a real token. */
const ATTACHMENT = { imagem: 'image', audio: 'audio', video: 'video', documento: 'file' } as const;

export class ClienteInstagramReal implements ClienteInstagram {
  readonly nome = 'real' as const;

  constructor(private readonly buscar: typeof fetch = fetch) {}

  async enviar(pedido: PedidoInstagram): Promise<{ idProvedor: string }> {
    const c = pedido.conteudo;
    const message =
      c.tipo === 'texto' ? { text: c.texto } : { attachment: { type: ATTACHMENT[c.tipo], payload: { url: c.link } } };
    const idProvedor = await this.postar(pedido, message);

    // Direct has no attachment caption: send it as a second message. A failure here must NOT
    // return an error, since retry would resend delivered media; log it instead.
    if (c.tipo !== 'texto' && c.legenda?.trim()) {
      await this.postar(pedido, { text: c.legenda }).catch((error: Error) =>
        console.error(`[instagram] a legenda de ${idProvedor} não foi: ${error.message}`),
      );
    }
    return { idProvedor };
  }

  private async postar(pedido: PedidoInstagram, message: Record<string, unknown>): Promise<string> {
    const { igUserId, tokenAccess, apiVersao } = pedido.credentials;
    let resposta: Response;
    try {
      resposta = await this.buscar(`${BASE}/${apiVersao ?? 'v23.0'}/${igUserId}/messages`, {
        method: 'POST',
        headers: { authorization: `Bearer ${tokenAccess}`, 'content-type': 'application/json' },
        body: JSON.stringify({ recipient: { id: pedido.para }, message: message }),
      });
    } catch (erro) {
      throw new WhatsAppError('rede', `Não alcançou o Instagram: ${(erro as Error).message}`, false);
    }
    const data = (await resposta.json().catch(() => ({}))) as {
      message_id?: string;
      error?: { code?: number; message?: string };
    };
    if (!resposta.ok || data.error) {
      // Treat 4xx as permanent (outside the 24-hour window, blocked user, expired token),
      // while 429 and 5xx return to the outbox. The Meta message omits the token; it is in the header.
      const permanente = resposta.status >= 400 && resposta.status < 500 && resposta.status !== 429;
      throw new WhatsAppError(
        String(data.error?.code ?? resposta.status),
        data.error?.message ?? `O Instagram respondeu ${resposta.status}.`,
        permanente,
      );
    }
    if (!data.message_id) throw new WhatsAppError('sem_id', 'O Instagram aceitou mas não devolveu o id.', false);
    return data.message_id;
  }
}

/** Test double: return sequential `mid` values and record calls without a token. */
export class ClienteInstagramDuble implements ClienteInstagram {
  readonly nome = 'duble' as const;
  readonly chamadas: { para: string; tipo: string; igUserId: string; idProvedor: string | null }[] = [];
  /** IGSIDs que sempre falham, de forma permanente. */
  falharPara: string[] = [];
  private sequencia = 0;

  reiniciar(): void {
    this.chamadas.length = 0;
    this.falharPara = [];
    this.sequencia = 0;
  }

  enviar(pedido: PedidoInstagram): Promise<{ idProvedor: string }> {
    const base = { para: pedido.para, tipo: pedido.conteudo.tipo, igUserId: pedido.credentials.igUserId };
    if (this.falharPara.includes(pedido.para)) {
      this.chamadas.push({ ...base, idProvedor: null });
      return Promise.reject(new WhatsAppError('10', 'Fora da janela de mensagens (simulado pelo dublê).', true));
    }
    this.sequencia += 1;
    const idProvedor = `aWdfZAG.DUBLE${String(this.sequencia).padStart(6, '0')}`;
    this.chamadas.push({ ...base, idProvedor });
    return Promise.resolve({ idProvedor });
  }
}

export const dubleInstagram = new ClienteInstagramDuble();

let escolhido: ClienteInstagram | null = null;

export function clienteInstagram(): ClienteInstagram {
  escolhido ??= process.env['PIPE_WHATSAPP_CLIENTE'] === 'real' ? new ClienteInstagramReal() : dubleInstagram;
  return escolhido;
}

export function definirClienteInstagram(cliente: ClienteInstagram | null): void {
  escolhido = cliente;
}
