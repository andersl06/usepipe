import { sql } from 'drizzle-orm';
import { databaseOwner } from '../../banco.js';
import { texto } from './canal.js';
import type { ChannelWhatsApp } from './canal.js';
import { clienteGraph } from './cliente-graph.js';

/**
 * Portado de chatwoot/chatwoot (MIT), app/services/whatsapp/webhook_teardown_service.rb
 *
 * Três passos, cada um com a própria rede de segurança — **desmontar nunca
 * impede desconectar**. Um token já revogado pelo cliente não pode deixar o canal
 * preso ligado para sempre:
 *
 * 1. apaga o callback do número;
 * 2. solta o número do nosso app (`deregister`) — só no cadastro embutido: num
 *    número conectado à mão, isso o desligaria no app do próprio cliente;
 * 3. tira a assinatura do app da WABA — só no cadastro embutido, e só quando este
 *    é o último canal ligado dela, porque a assinatura é da WABA inteira.
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
 * `waba_sibling_exists?`. Papel dono pelo mesmo motivo da unicidade do número: a
 * assinatura é da WABA, e a WABA pode ter número em outro cliente do Pipe.
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
