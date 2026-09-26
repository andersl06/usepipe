import { randomInt } from 'node:crypto';
import { PipeError } from '../../errors.js';
import { updateChannel, requestReauthorization, texto, urlDoWebhook } from './channel.js';
import type { ChannelWhatsApp } from './channel.js';
import { CAMPOS_PADRAO_DO_WEBHOOK, clienteGraph } from './cliente-graph.js';
import { buscarSaude, numeroPendente } from './saude.js';
import type { SaudeDoNumero } from './saude.js';

/**
 * Ported from chatwoot/chatwoot (MIT), app/services/whatsapp/webhook_setup_service.rb and `setup_webhooks` in app/models/channel/whatsapp.rb. First register the number with `POST /{phone}/register` and a six-digit PIN only if not verified/connected or still pending at Meta; a failure is recorded in `erroDeRegistro` and does not stop setup. Next subscribe the app to the WABA and point the number callback at the channel route; failure stops with "Falha ao configurar o webhook". Keep the PIN for future reauthorization because Meta rejects a different PIN, but encrypt it (`pinVerificacao` in `CAMPOS_SECRETOS_DE_CANAL`). Pipe also subscribes the three fields without per-number overrides for umbrella routing (webhook-por-cliente spec §7), checks the 200-character override URL limit before calling Meta, and excludes `calls` because Pipe has no voice support. Subscribe `messages` and `smb_message_echoes` as well as the umbrella fields.
 */

export const CAMPOS_ASSINADOS = [
  ...CAMPOS_PADRAO_DO_WEBHOOK,
  'message_template_status_update',
  // Template recategorization from the original Alerts Settings tab.
  'template_category_update',
  'phone_number_quality_update',
  'account_update',
] as const;

/** Limite da Meta para `override_callback_uri`. */
const LIMITE_DA_URL = 200;

export interface OptionsOfWebhook {
  wabaId?: string | null;
  token?: string | null;
  /**
   * `true` means coexistence with WhatsApp Business: the number is already registered, so skip registration without checking health. `null` means manual setup gave no hint; use `is_on_biz_app` to decide.
   */
  coexistencia?: boolean | null;
}

export interface ResultadoDoWebhook {
  channel: ChannelWhatsApp;
  errorOfRecord: Error | null;
}

function asError(erro: unknown): Error {
  return erro instanceof Error ? erro : new Error(String(erro));
}

export async function configurarWebhook(
  canal: ChannelWhatsApp,
  options: OptionsOfWebhook = {},
): Promise<ResultadoDoWebhook> {
  const wabaId = options.wabaId ?? canal.wabaId ?? '';
  const token = options.token ?? texto(canal.config['tokenAcesso']) ?? '';
  const numeroId = texto(canal.config['phoneNumberId']);
  const coexistencia = options.coexistencia === undefined ? null : options.coexistencia;

  // `validate_parameters!`
  if (!wabaId) throw PipeError.request('waba_missing', 'O WABA ID é obrigatório.');
  if (!token) throw PipeError.request('token_missing', 'O token de acesso é obrigatório.');
  if (!numeroId) throw PipeError.request('number_missing', 'O Phone Number ID é obrigatório.');

  const cliente = clienteGraph(token);

  let saude: SaudeDoNumero | null = null;
  const lerSaude = async (): Promise<SaudeDoNumero> => {
    if (saude) return saude;
    try {
      saude = await buscarSaude({ tokenAccess: token, numberId: numeroId, wabaId });
    } catch (erro) {
      // Without health data, follow the original's conservative decision and do not register.
      console.error(`[whatsapp] a checagem de saúde falhou: ${asError(erro).message}`);
      saude = {};
    }
    return saude;
  };

  const verificado = async (): Promise<boolean> => {
    try {
      return await cliente.numeroVerificado(numeroId);
    } catch (erro) {
      // If health checking fails, assume unverified, the safer choice in the original.
      console.error(`[whatsapp] a checagem de verificação do número falhou: ${asError(erro).message}`);
      return false;
    }
  };

  // `should_register_phone_number?`
  const deveRegistrar = async (): Promise<boolean> => {
    if (coexistencia === true) return false;
    if (coexistencia === null && (await lerSaude()).is_on_biz_app) return false;
    return !(await verificado()) || numeroPendente(await lerSaude());
  };

  let atual = canal;
  let errorOfRecord: Error | null = null;
  if (await deveRegistrar()) {
    try {
      // `fetch_or_create_pin`: o guardado, ou um novo entre 100000 e 999999.
      const pin = texto(atual.config['pinVerificacao']) ?? String(randomInt(100_000, 1_000_000));
      await cliente.registrarNumero(numeroId, pin);
      atual = await updateChannel(atual, { pinVerificacao: pin });
    } catch (error) {
      errorOfRecord = asError(error);
      console.warn(`[whatsapp] o registro do número falhou, seguindo: ${errorOfRecord.message}`);
    }
  }

  const url = urlDoWebhook(atual.id);
  if (url.length > LIMITE_DA_URL) {
    throw new PipeError(
      500,
      'url_long_excessive',
      `A URL do webhook tem ${url.length} caracteres e a Meta aceita ${LIMITE_DA_URL}. Encurte PIPE_URL_API.`,
    );
  }

  const verifyToken = texto(atual.config['verifyToken']) ?? '';
  try {
    await cliente.assinarWebhookDoNumero(wabaId, numeroId, url, verifyToken, CAMPOS_ASSINADOS);
  } catch (erro) {
    const message = asError(erro).message;
    console.error(`[whatsapp] a configuração do webhook falhou: ${message}`);
    throw new PipeError(502, 'webhook_failed', `Falha ao configurar o webhook: ${message}`);
  }

  return { channel: atual, errorOfRecord };
}

/**
 * Chatwoot `Channel::Whatsapp#setup_webhooks`: webhook failure does not undo channel creation. Mark it for reauthorization so the Channels screen asks the customer to reconnect.
 */
export async function configureWebhooksOfChannel(
  channel: ChannelWhatsApp,
  coexistencia: boolean | null = null,
): Promise<ChannelWhatsApp> {
  try {
    return (await configurarWebhook(channel, { coexistencia })).channel;
  } catch (erro) {
    console.error(`[whatsapp] a configuração do webhook falhou: ${asError(erro).message}`);
    return requestReauthorization(channel);
  }
}
