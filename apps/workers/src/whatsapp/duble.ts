import type { ClienteWhatsApp, PedidoEnvio, RespostaEnvio } from './cliente.js';
import { ErroWhatsApp } from './cliente.js';
import { montarComponentes, ParametroFaltandoErro } from './template.js';

/**
 * Dublê da Cloud API.
 *
 * Não é mock de teste: é o modo de operação enquanto não há WABA. Ele simula o que
 * a Meta faz de verdade — aceita a mensagem, devolve um `wamid`, e **depois** manda
 * os status por webhook. Quem consome o status é o mesmo endpoint que a Meta usaria,
 * então o caminho exercitado é o de produção, não um atalho.
 *
 * Também monta os componentes do template antes de "aceitar": é isso que faz o erro
 * de deslocamento de parâmetro aparecer no dublê, e não só em produção.
 */

export interface ConfiguracaoDuble {
  /** Atraso artificial por envio, em milissegundos. */
  atrasoMs: number;
  /** Destinatários que sempre falham. Serve para exercitar o caminho de erro. */
  falharPara: string[];
  /** A falha simulada é permanente (não repete) ou temporária (volta ao outbox). */
  falhaPermanente: boolean;
  /** Código e texto da falha simulada. */
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

function daEnv(): ConfiguracaoDuble {
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

  private configuracao: ConfiguracaoDuble = daEnv();
  private sequencia = 0;
  private readonly chamadasFeitas: ChamadaDuble[] = [];
  private statusPendentes: StatusSimulado[] = [];

  configurar(parcial: Partial<ConfiguracaoDuble>): void {
    this.configuracao = { ...this.configuracao, ...parcial };
  }

  /** Chamadas realmente feitas. É o que prova que a Meta **não** foi chamada. */
  get chamadas(): readonly ChamadaDuble[] {
    return this.chamadasFeitas;
  }

  /** Zera chamadas, status e sequência — entre cenários de teste. */
  reiniciar(): void {
    this.chamadasFeitas.length = 0;
    this.statusPendentes = [];
    this.sequencia = 0;
    this.configuracao = daEnv();
  }

  /** Retira os status acumulados; quem chama posta cada um no webhook de entrada. */
  drenarStatus(): StatusSimulado[] {
    const saida = this.statusPendentes;
    this.statusPendentes = [];
    return saida;
  }

  /** O cliente abriu a mensagem. A Meta só manda `read` quando isso acontece. */
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
    this.ultimoPhoneNumberId = pedido.credenciais.phoneNumberId;
    if (this.configuracao.atrasoMs > 0) {
      await new Promise((resolver) => setTimeout(resolver, this.configuracao.atrasoMs));
    }

    // Monta o template mesmo sem enviar: parâmetro deslocado tem que falhar aqui,
    // não silenciosamente do outro lado.
    if (pedido.conteudo.tipo === 'template') {
      try {
        montarComponentes(pedido.conteudo.template, pedido.conteudo.valores);
      } catch (erro) {
        if (erro instanceof ParametroFaltandoErro) {
          this.chamadasFeitas.push({
            para: pedido.para,
            tipo: pedido.conteudo.tipo,
            em: new Date(),
            idProvedor: null,
          });
          throw new ErroWhatsApp('132000', erro.message, true);
        }
        throw erro;
      }
    }

    if (this.configuracao.falharPara.includes(pedido.para)) {
      this.chamadasFeitas.push({
        para: pedido.para,
        tipo: pedido.conteudo.tipo,
        em: new Date(),
        idProvedor: null,
      });
      throw new ErroWhatsApp(
        this.configuracao.codigoDeFalha,
        this.configuracao.textoDeFalha,
        this.configuracao.falhaPermanente,
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
    // (`delivered`). `read` só quando o cliente abre — ver `marcarLida`.
    const agora = new Date();
    for (const status of ['sent', 'delivered'] as const) {
      this.statusPendentes.push({
        phoneNumberId: pedido.credenciais.phoneNumberId,
        id: idProvedor,
        status,
        recipientId: pedido.para,
        em: agora,
      });
    }

    return { idProvedor };
  }
}

/** Instância única: o teste e o worker precisam olhar o mesmo dublê. */
export const dubleWhatsApp = new ClienteWhatsAppDuble();

/** Payload de webhook da Meta com um `statuses[]`, para postar no endpoint de entrada. */
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
