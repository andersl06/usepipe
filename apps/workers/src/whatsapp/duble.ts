import type { ClienteWhatsApp, PedidoEnvio, RespostaEnvio } from './cliente.js';
import { WhatsAppError } from './cliente.js';
import { assembleComponents, ParameterMissingError } from './template.js';

/**
 * Cloud API double. It is the operating mode while there is no WABA, not merely a test mock. It simulates Meta accepting a message, returning a `wamid`, and LATER sending status webhooks. The same endpoint used in production consumes those statuses, so the tested path is real. It also builds template components before accepting, exposing shifted-parameter errors in the double instead of only in production.
 */

export interface ConfigurationDouble {
  /** Atraso artificial por envio, em milissegundos. */
  atrasoMs: number;
  /** Recipients that always fail, to exercise the error path. */
  falharPara: string[];

  falhaPermanente: boolean;

  codigoDeFalha: string;
  textoDeFalha: string;
}

export interface ChamadaDuble {
  para: string;
  tipo: string;
  em: Date;
  idProvedor: string | null;
}

/** Um `statuses[]` da Meta, pronto para ser postado no webhook de entrada. */
export interface StatusSimulado {
  phoneNumberId: string;
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  recipientId: string;
  em: Date;
}

function daEnv(): ConfigurationDouble {
  return {
    atrasoMs: Number(process.env['PIPE_WHATSAPP_DUBLE_ATRASO_MS'] ?? 0),
    falharPara: (process.env['PIPE_WHATSAPP_DUBLE_FALHAR_PARA'] ?? '')
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean),
    falhaPermanente: process.env['PIPE_WHATSAPP_DUBLE_FALHA_PERMANENTE'] !== 'false',
    codigoDeFalha: process.env['PIPE_WHATSAPP_DUBLE_CODIGO'] ?? '131026',
    textoDeFalha:
      process.env['PIPE_WHATSAPP_DUBLE_TEXTO'] ??
      'Destinatário não pode receber mensagens (simulado pelo dublê).',
  };
}

export class ClienteWhatsAppDuble implements ClienteWhatsApp {
  readonly nome = 'duble' as const;

  private configuration: ConfigurationDouble = daEnv();
  private sequencia = 0;
  private readonly chamadasFeitas: ChamadaDuble[] = [];
  private statusPendentes: StatusSimulado[] = [];

  configurar(parcial: Partial<ConfigurationDouble>): void {
    this.configuration = { ...this.configuration, ...parcial };
  }

  /** Actual calls made, proving that Meta was NOT called. */
  get chamadas(): readonly ChamadaDuble[] {
    return this.chamadasFeitas;
  }


  reiniciar(): void {
    this.chamadasFeitas.length = 0;
    this.statusPendentes = [];
    this.sequencia = 0;
    this.configuration = daEnv();
  }

  /** Retira os status acumulados; quem chama posta cada um no webhook de entrada. */
  drenarStatus(): StatusSimulado[] {
    const saida = this.statusPendentes;
    this.statusPendentes = [];
    return saida;
  }

  /** The client opened the message; Meta sends `read` only then. */
  marcarLida(idProvedor: string): void {
    const original = this.chamadasFeitas.find((c) => c.idProvedor === idProvedor);
    if (!original) return;
    this.statusPendentes.push({
      phoneNumberId: this.ultimoPhoneNumberId,
      id: idProvedor,
      status: 'read',
      recipientId: original.para,
      em: new Date(),
    });
  }

  private ultimoPhoneNumberId = 'duble';

  async enviar(pedido: PedidoEnvio): Promise<RespostaEnvio> {
    this.ultimoPhoneNumberId = pedido.credentials.phoneNumberId;
    if (this.configuration.atrasoMs > 0) {
      await new Promise((resolver) => setTimeout(resolver, this.configuration.atrasoMs));
    }

    // Build the template even without sending: a shifted parameter must fail here,
    // rather than silently on the far side.
    if (pedido.conteudo.tipo === 'template') {
      try {
        assembleComponents(pedido.conteudo.template, pedido.conteudo.values);
      } catch (error) {
        if (error instanceof ParameterMissingError) {
          this.chamadasFeitas.push({
            para: pedido.para,
            tipo: pedido.conteudo.tipo,
            em: new Date(),
            idProvedor: null,
          });
          throw new WhatsAppError('132000', error.message, true);
        }
        throw error;
      }
    }

    if (this.configuration.falharPara.includes(pedido.para)) {
      this.chamadasFeitas.push({
        para: pedido.para,
        tipo: pedido.conteudo.tipo,
        em: new Date(),
        idProvedor: null,
      });
      throw new WhatsAppError(
        this.configuration.codigoDeFalha,
        this.configuration.textoDeFalha,
        this.configuration.falhaPermanente,
      );
    }

    this.sequencia += 1;
    const idProvedor = `wamid.DUBLE${String(this.sequencia).padStart(6, '0')}`;
    this.chamadasFeitas.push({
      para: pedido.para,
      tipo: pedido.conteudo.tipo,
      em: new Date(),
      idProvedor,
    });

    // A Meta confirma em dois tempos: aceitou (`sent`) e chegou no aparelho
    // (`delivered`). Emit `read` only when the client opens the message; see `marcarLida`.
    const agora = new Date();
    for (const status of ['sent', 'delivered'] as const) {
      this.statusPendentes.push({
        phoneNumberId: pedido.credentials.phoneNumberId,
        id: idProvedor,
        status,
        recipientId: pedido.para,
        em: agora,
      });
    }

    return { idProvedor };
  }
}

/** Keep a single instance so tests and worker inspect the same double. */
export const dubleWhatsApp = new ClienteWhatsAppDuble();

/** Meta webhook payload with one `statuses[]`, for posting to the inbound endpoint. */
export function payloadDeStatus(status: StatusSimulado): unknown {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'waba-duble',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { phone_number_id: status.phoneNumberId },
              statuses: [
                {
                  id: status.id,
                  status: status.status,
                  timestamp: String(Math.floor(status.em.getTime() / 1000)),
                  recipient_id: status.recipientId,
                },
              ],
            },
          },
        ],
      },
    ],
  };
}
