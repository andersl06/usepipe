import { WhatsAppError } from './whatsapp/cliente.js';

/**
 * Saída pelo Instagram (Direct). Reconstruído de chatwoot/chatwoot (MIT),
 * app/services/instagram/send_on_instagram_service.rb (`POST /{ig-user-id}/messages`
 * no `graph.instagram.com`, corpo `{recipient:{id}, message:{text}|{attachment}}`).
 *
 * A falha usa o `ErroWhatsApp` de propósito: é a classe que a entrega entende
 * (`permanente` decide entre repetir e desistir), não um erro "do WhatsApp".
 *
 * Mesma escolha do cliente do WhatsApp: `PIPE_WHATSAPP_CLIENTE=real` fala com a Meta,
 * qualquer outro valor usa o dublê.
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

/** Tipo do Pipe → `attachment.type` do Instagram. Conferir com token real: `file` para documento. */
const ATTACHMENT = { imagem: 'image', audio: 'audio', video: 'video', documento: 'file' } as const;

export class ClienteInstagramReal implements ClienteInstagram {
  readonly nome = 'real' as const;

  constructor(private readonly buscar: typeof fetch = fetch) {}

  async enviar(pedido: PedidoInstagram): Promise<{ idProvedor: string }> {
    const c = pedido.conteudo;
    const message =
      c.tipo === 'texto' ? { text: c.texto } : { attachment: { type: ATTACHMENT[c.tipo], payload: { url: c.link } } };
    const idProvedor = await this.postar(pedido, message);

    // O Direct não tem legenda em anexo: vai como segunda mensagem. Falhar aqui NÃO
    // devolve erro — repetir reenviaria a mídia que já chegou. Fica no log.
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
      // 4xx é permanente (fora da janela de 24h, usuário que bloqueou, token vencido);
      // 429 e 5xx voltam ao outbox. A mensagem da Meta não carrega o token: vai no header.
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

/** Dublê: devolve `mid` sequencial e registra a chamada, sem token. */
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
