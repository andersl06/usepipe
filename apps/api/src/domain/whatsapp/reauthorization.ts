import { sql } from 'drizzle-orm';
import { noTenant } from '../../database.js';
import { PipeError } from '../../errors.js';
import { atualizarChannel, readChannelWhatsApp, marcarReautorizado, texto } from './channel.js';
import type { ChannelWhatsApp } from './channel.js';
import { sanitizarNumero } from './info-do-numero.js';
import type { InfoDoNumero } from './info-do-numero.js';

/**
 * Portado de chatwoot/chatwoot (MIT), app/services/whatsapp/reauthorization_service.rb
 *
 * Reautorizar é trocar a credencial de um canal que JÁ existe, sem criar outro:
 * o número tem de ser o mesmo, e o que muda é o token (e o WABA, se o cliente o
 * trocou). É a porta de volta de um canal marcado para reautorização e, no Pipe,
 * também a de um canal desconectado.
 *
 * Acréscimo do Pipe: reautorizar RELIGA o canal (`ativo = true`). No Chatwoot
 * desconectar apaga o canal; aqui desconectar só desliga, para o histórico
 * continuar do cliente — e a volta precisa acontecer por aqui, porque criar de
 * novo esbarraria no próprio número.
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

  // Cliente antigo pode não mandar o `phone_number_id`: cai no que a Meta acabou de devolver.
  const numeroId = pedido.numberId || pedido.info.numeroId;
  const atualizado = await atualizarChannel(
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
