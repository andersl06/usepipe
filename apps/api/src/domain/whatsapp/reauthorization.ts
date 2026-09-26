import { sql } from 'drizzle-orm';
import { noTenant } from '../../database.js';
import { PipeError } from '../../errors.js';
import { updateChannel, readChannelWhatsApp, marcarReautorizado, texto } from './channel.js';
import type { ChannelWhatsApp } from './channel.js';
import { sanitizarNumero } from './info-do-numero.js';
import type { InfoDoNumero } from './info-do-numero.js';

/**
 * Ported from chatwoot/chatwoot (MIT), app/services/whatsapp/reauthorization_service.rb. Reauthorize an existing channel, never create another: require the same number and replace its token and possibly WABA. This restores a channel marked for reauthorization or disconnected. Pipe also sets `ativo = true`; Chatwoot deletes disconnected channels, but Pipe keeps history and only disables them, so recreating would collide with the same number.
 */

export interface RequestOfReauthorization {
  tenantId: string;
  channelId: string;
  numberId?: string | undefined;
  wabaId: string;
  token: string;
  info: InfoDoNumero;
}

export async function reautorizar(pedido: RequestOfReauthorization): Promise<ChannelWhatsApp> {
  const channel = await readChannelWhatsApp(pedido.tenantId, pedido.channelId);

  const esperado = `+${sanitizarNumero(texto(channel.config['numero']))}`;
  if (pedido.info.numero !== esperado) {
    throw new PipeError(
      422,
      'number_mismatched',
      `O número não confere. Esperado ${esperado}, recebido ${pedido.info.numero}`,
    );
  }

  // An older client may omit `phone_number_id`; fall back to the value Meta just returned.
  const numeroId = pedido.numberId || pedido.info.numeroId;
  const atualizado = await updateChannel(
    channel,
    { tokenAcesso: pedido.token, phoneNumberId: numeroId, origem: 'embedded_signup' },
    { wabaId: pedido.wabaId, numberId: numeroId },
  );

  // "Update inbox name if business name changed", e o religamento do Pipe.
  const nomeDaEmpresa = pedido.info.nomeDaEmpresa;
  await noTenant(pedido.tenantId, async (tx) => {
    if (nomeDaEmpresa) {
      await tx.execute(sql`
        update inbox set nome = ${nomeDaEmpresa}, atualizado_em = now()
         where canal_id = ${channel.id}::uuid
      `);
    }
    await tx.execute(sql`
      update canal set ativo = true, atualizado_em = now() where id = ${channel.id}::uuid
    `);
  });

  return marcarReautorizado({ ...atualizado, active: true });
}
