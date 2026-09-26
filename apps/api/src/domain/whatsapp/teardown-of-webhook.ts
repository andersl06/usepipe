import { sql } from 'drizzle-orm';
import { databaseOwner } from '../../database.js';
import { texto } from './channel.js';
import type { ChannelWhatsApp } from './channel.js';
import { clienteGraph } from './cliente-graph.js';

/**
 * Ported from chatwoot/chatwoot (MIT), app/services/whatsapp/webhook_teardown_service.rb. Each teardown step is best effort so even a revoked token cannot prevent channel disconnection. Clear the number callback; deregister the number from Pipe's app only for embedded signup, since doing so for manual setup would disconnect the customer's app; unsubscribe the app from the WABA only for embedded signup and only after its last active channel leaves, because subscription covers the whole WABA. The deregistration step is `deregister`.
 */
export async function desmontarWebhook(channel: ChannelWhatsApp): Promise<void> {
  const token = texto(channel.config['tokenAcesso']);
  const numeroId = texto(channel.config['phoneNumberId']);
  const embutido = channel.config['origem'] === 'embedded_signup';

  // `should_teardown_webhook?`
  if (!token || (!numeroId && !channel.wabaId)) return;

  const cliente = clienteGraph(token);

  if (numeroId) {
    try {
      await cliente.limparCallbackDoNumero(numeroId);
    } catch (error) {
      console.error(`[whatsapp] o callback do canal ${channel.id} não foi apagado: ${(error as Error).message}`);
    }
  }

  if (embutido && numeroId) {
    try {
      await cliente.descadastrarNumero(numeroId);
    } catch (erro) {
      console.error(`[whatsapp] o número do canal ${channel.id} não foi descadastrado: ${(erro as Error).message}`);
    }
  }

  if (embutido && channel.wabaId) {
    try {
      if (!(await wabaHasOtherChannel(channel))) await cliente.desassinarAppDaWaba(channel.wabaId);
    } catch (erro) {
      console.error(`[whatsapp] a WABA do canal ${channel.id} não foi desassinada: ${(erro as Error).message}`);
    }
  }
}

/**
 * `waba_sibling_exists?` uses the owner role for the same reason as global number uniqueness: WABA subscription spans numbers that may belong to another Pipe tenant.
 */
async function wabaHasOtherChannel(canal: ChannelWhatsApp): Promise<boolean> {
  const { rows } = await databaseOwner().execute<{ tem: boolean }>(sql`
    select exists (
      select 1 from canal
       where id <> ${canal.id}::uuid and waba_id = ${canal.wabaId} and ativo
    ) as tem
  `);
  return rows[0]?.tem === true;
}
