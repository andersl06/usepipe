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
 * Portado de chatwoot/chatwoot (MIT), app/services/whatsapp/embedded_signup_service.rb
 *
 * O que acontece depois que o cliente fecha o popup da Meta, na ordem do original:
 *
 * 1. troca o `code` pelo token do cliente (`troca-de-token.ts`);
 * 2. descobre o número dentro da WABA (`info-do-numero.ts`);
 * 3. cria o canal, ou reautoriza o existente quando vem `canalId`;
 * 4. registra o número e aponta o webhook (`configuracao-de-webhook.ts`) — falha
 *    aqui marca o canal para reautorização em vez de desfazê-lo;
 * 5. confere a saúde do número recém-criado e marca para reautorização se a Meta
 *    ainda o dá como pendente. Pula na reautorização (evita alarme falso) e na
 *    coexistência (a saúde da Meta demora minutos para acompanhar).
 *
 * O `state` contra CSRF não é deste serviço: é conferido antes, no controlador
 * (`estado-de-conexao.ts`), e é acréscimo do Pipe — o original não tem.
 */

export interface RequestOfRegistrationEmbedded {
  tenantId: string;
  userId: string;
  code?: string | undefined;
  wabaId?: string | undefined;
  numberId?: string | undefined;
  coexistencia?: boolean | undefined;
  /** O `inbox_id` do original: presente, é reautorização daquele canal. */
  channelId?: string | undefined;
}

/** `validate_parameters!` do serviço e `validate_embedded_signup_params!` do controlador. */
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

/** `check_channel_health_and_prompt_reauth`. Falha da checagem só vai para o log. */
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
