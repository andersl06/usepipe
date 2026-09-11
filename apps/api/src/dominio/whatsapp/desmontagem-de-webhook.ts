import { sql } from 'drizzle-orm';
import { bancoDono } from '../../banco.js';
import { texto } from './canal.js';
import type { CanalWhatsApp } from './canal.js';
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
export async function desmontarWebhook(canal: CanalWhatsApp): Promise<void> {
  const token = texto(canal.config['tokenAcesso']);
  const numeroId = texto(canal.config['phoneNumberId']);
  const embutido = canal.config['origem'] === 'embedded_signup';

  // `should_teardown_webhook?`
  if (!token || (!numeroId && !canal.wabaId)) return;

  const cliente = clienteGraph(token);

  if (numeroId) {
    try {
      await cliente.limparCallbackDoNumero(numeroId);
    } catch (erro) {
      console.error(`[whatsapp] o callback do canal ${canal.id} não foi apagado: ${(erro as Error).message}`);
    }
  }

  if (embutido && numeroId) {
    try {
      await cliente.descadastrarNumero(numeroId);
    } catch (erro) {
      console.error(`[whatsapp] o número do canal ${canal.id} não foi descadastrado: ${(erro as Error).message}`);
    }
  }

  if (embutido && canal.wabaId) {
    try {
      if (!(await wabaTemOutroCanal(canal))) await cliente.desassinarAppDaWaba(canal.wabaId);
    } catch (erro) {
      console.error(`[whatsapp] a WABA do canal ${canal.id} não foi desassinada: ${(erro as Error).message}`);
    }
  }
}

/**
 * `waba_sibling_exists?`. Papel dono pelo mesmo motivo da unicidade do número: a
 * assinatura é da WABA, e a WABA pode ter número em outro cliente do Pipe.
 */
async function wabaTemOutroCanal(canal: CanalWhatsApp): Promise<boolean> {
  const { rows } = await bancoDono().execute<{ tem: boolean }>(sql`
    select exists (
      select 1 from canal
       where id <> ${canal.id}::uuid and waba_id = ${canal.wabaId} and ativo
    ) as tem
  `);
  return rows[0]?.tem === true;
}
