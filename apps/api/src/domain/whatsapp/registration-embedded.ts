import { PipeError } from '../../errors.js';
import { readChannelWhatsApp, pedirReauthorization, texto } from './channel.js';
import type { ChannelWhatsApp } from './channel.js';
import { configureWebhooksOfChannel } from './configuration-of-webhook.js';
import { createChannel } from './creation-of-channel.js';
import { buscarInfoDoNumero } from './info-do-numero.js';
import { reautorizar } from './reauthorization.js';
import { buscarSaude, numeroPendente } from './saude.js';
import { exchangeCode } from './troca-de-token.js';

/**
 * Ported from chatwoot/chatwoot (MIT), app/services/whatsapp/embedded_signup_service.rb. After the customer closes Meta's popup, exchange `code` for a customer token (`troca-de-token.ts`), find the number in the WABA (`info-do-numero.ts`), create or reauthorize the channel if `canalId` is supplied, register the number and configure the webhook (`configuracao-de-webhook.ts`). Webhook failure marks reauthorization rather than undoing the channel. Check a new number's health and mark pending if Meta still reports it pending; skip this on reauthorization and coexistence to avoid false alarms from Meta's delayed status. The controller (`estado-de-conexao.ts`) checks CSRF `state` before this service; Pipe added that guard beyond the original.
 */

export interface RequestOfRegistrationEmbedded {
  tenantId: string;
  userId: string;
  code?: string | undefined;
  wabaId?: string | undefined;
  numberId?: string | undefined;
  coexistencia?: boolean | undefined;
  /** Original `inbox_id`: when present, reauthorize that channel. */
  channelId?: string | undefined;
}

/** Chatwoot `validate_parameters!` service and `validate_embedded_signup_params!` controller checks. */
export function validarParametros(pedido: { code?: string | undefined; wabaId?: string | undefined }): void {
  const ausentes: string[] = [];
  if (!pedido.code?.trim()) ausentes.push('code');
  if (!pedido.wabaId?.trim()) ausentes.push('waba_id');
  if (ausentes.length === 0) return;
  throw PipeError.request(
    'parameters_missing',
    `Parâmetros obrigatórios ausentes: ${ausentes.join(', ')}`,
  );
}

export async function executarRegistrationEmbedded(
  pedido: RequestOfRegistrationEmbedded,
): Promise<ChannelWhatsApp> {
  try {
    validarParametros(pedido);
    const wabaId = pedido.wabaId!.trim();
    const coexistencia = pedido.coexistencia === true;

    const token = await exchangeCode(pedido.code);

    const reautorizando = pedido.channelId
      ? await readChannelWhatsApp(pedido.tenantId, pedido.channelId)
      : null;
    const info = await buscarInfoDoNumero(
      wabaId,
      pedido.numberId || undefined,
      token,
      reautorizando ? texto(reautorizando.config['numero']) : null,
    );

    const channel = pedido.channelId
      ? await reautorizar({
          tenantId: pedido.tenantId,
          channelId: pedido.channelId,
          numberId: pedido.numberId,
          wabaId,
          token,
          info,
        })
      : await createChannel({
          tenantId: pedido.tenantId,
          userId: pedido.userId,
          infoDaWaba: { wabaId, nomeDaEmpresa: info.nomeDaEmpresa },
          infoDoNumero: info,
          token,
        });

    const configurado = await configureWebhooksOfChannel(channel, coexistencia);
    if (!pedido.channelId && !coexistencia) await conferirSaude(configurado);

    return readChannelWhatsApp(pedido.tenantId, channel.id);
  } catch (erro) {
    console.error(`[whatsapp] o cadastro embutido falhou: ${(erro as Error).message}`);
    throw erro;
  }
}

/** `check_channel_health_and_prompt_reauth`: log health-check failures only. */
async function conferirSaude(channel: ChannelWhatsApp): Promise<void> {
  try {
    const saude = await buscarSaude({
      tokenAccess: texto(channel.config['tokenAcesso']),
      numberId: texto(channel.config['phoneNumberId']),
      wabaId: channel.wabaId,
    });
    if (numeroPendente(saude)) await pedirReauthorization(channel);
  } catch (error) {
    console.error(`[whatsapp] a checagem de saúde do canal ${channel.id} falhou: ${(error as Error).message}`);
  }
}
