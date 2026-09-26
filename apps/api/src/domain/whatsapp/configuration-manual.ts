import type { ChannelWhatsApp } from './channel.js';
import { texto, urlDoWebhook } from './channel.js';
import { configurarWebhook } from './configuration-of-webhook.js';
import { createChannel } from './creation-of-channel.js';
import { validateConfigurationManual } from './validation-of-configuration-manual.js';
import { reautorizar } from './reauthorization.js';
import { updateChannel } from './channel.js';

/**
 * Ported from chatwoot/chatwoot (MIT), app/services/whatsapp/manual_setup_service.rb. Validate, create channel and inbox (`manual_setup_v2`), and configure webhook. A failed webhook leaves the channel and returns `erroDeWebhook` so the UI can explain it; the original runs setup explicitly rather than in a save callback. Unlike embedded signup, the token belongs to the customer's system user, so disconnecting must not deregister the number or unsubscribe its WABA (`desmontagem-de-webhook.ts`). Pipe additionally uses the customer's App Secret to verify Meta signatures, while Chatwoot uses one installation-wide secret.
 */

export interface ConfigurationManual {
  channel: ChannelWhatsApp;
  /** `webhook_error`; null means `webhook_setup?` succeeded. A `null` value represents success. */
  webhookError: string | null;
  /**
   * Customer-entered callback for their app (Dashboard → WhatsApp → Configuration). Messages arrive through the existing number override, but template status, quality, and `account_update` cannot be overridden and arrive only if their app points here.
   */
  webhook: { url: string; verifyToken: string };
}

export async function runConfigurationManual(pedido: {
  tenantId: string;
  userId: string;
  wabaId?: string | undefined;
  numberId?: string | undefined;
  token?: string | undefined;
  appSecret?: string | undefined;
  name?: string | undefined;
  /**
   * Reconnect over the existing channel. The original platform-owned token reconnects the same channel when invalidated; WhatsApp has no disconnect button (`FICHA-conectar-canal-no-bot.md` §5). Here the customer-owned token expires, so without this route replacement would fail on its own number (`numero_em_uso`).
   */
  channelId?: string | undefined;
}): Promise<ConfigurationManual> {
  const previa = await validateConfigurationManual(pedido);

  if (pedido.channelId) {
    const religado = await reautorizar({
      tenantId: pedido.tenantId,
      channelId: pedido.channelId,
      numberId: previa.numberId,
      wabaId: previa.wabaId,
      token: pedido.token ?? '',
      info: {
        numeroId: previa.numberId,
        numero: previa.number,
        verificado: true,
        nomeDaEmpresa: previa.nomeVerificado ?? previa.number,
      },
    });
    /*
     * The App Secret belongs to the customer's app and may change with the token. Without the new secret, webhook signatures fail. `reautorizar` originated in embedded signup, but manual setup owns this value.
     */
    const withSecret = await updateChannel(religado, {
      origem: 'manual_setup_v2',
      ...(pedido.appSecret ? { appSecret: pedido.appSecret } : {}),
      ...(previa.appId ? { appId: previa.appId } : {}),
    });
    const webhookDele = {
      url: urlDoWebhook(withSecret.id),
      verifyToken: texto(withSecret.config['verifyToken']) ?? '',
    };
    try {
      const resultado = await configurarWebhook(withSecret, { wabaId: previa.wabaId });
      if (resultado.errorOfRecord) throw resultado.errorOfRecord;
      return { channel: resultado.channel, webhookError: null, webhook: webhookDele };
    } catch (erro) {
      return { channel: withSecret, webhookError: (erro as Error).message, webhook: webhookDele };
    }
  }

  const channel = await createChannel({
    tenantId: pedido.tenantId,
    userId: pedido.userId,
    infoDaWaba: { wabaId: previa.wabaId, nomeDaEmpresa: previa.nomeVerificado ?? undefined },
    infoDoNumero: {
      numeroId: previa.numberId,
      numero: previa.number,
      verificado: true,
      nomeDaEmpresa: previa.nomeVerificado ?? previa.number,
    },
    token: pedido.token ?? '',
    origin: 'manual_setup_v2',
    name: pedido.name?.trim() || previa.nomeSugerido,
    appSecret: pedido.appSecret,
    appId: previa.appId,
  });
  const webhook = { url: urlDoWebhook(channel.id), verifyToken: texto(channel.config['verifyToken']) ?? '' };

  // `setup_webhook`: registration failure also counts as a webhook error.
  try {
    const resultado = await configurarWebhook(channel, { wabaId: previa.wabaId });
    if (resultado.errorOfRecord) throw resultado.errorOfRecord;
    return { channel: resultado.channel, webhookError: null, webhook };
  } catch (error) {
    return { channel, webhookError: (error as Error).message, webhook };
  }
}
