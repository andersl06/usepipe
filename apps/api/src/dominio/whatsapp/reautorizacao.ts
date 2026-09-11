import { sql } from 'drizzle-orm';
import { noTenant } from '../../banco.js';
import { ErroPipe } from '../../erros.js';
import { atualizarCanal, lerCanalWhatsApp, marcarReautorizado, texto } from './canal.js';
import type { CanalWhatsApp } from './canal.js';
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

export interface PedidoDeReautorizacao {
  tenantId: string;
  canalId: string;
  numeroId?: string | undefined;
  wabaId: string;
  token: string;
  info: InfoDoNumero;
}

export async function reautorizar(pedido: PedidoDeReautorizacao): Promise<CanalWhatsApp> {
  const canal = await lerCanalWhatsApp(pedido.tenantId, pedido.canalId);

  const esperado = `+${sanitizarNumero(texto(canal.config['numero']))}`;
  if (pedido.info.numero !== esperado) {
    throw new ErroPipe(
      422,
      'numero_divergente',
      `O número não confere. Esperado ${esperado}, recebido ${pedido.info.numero}`,
    );
  }

  // Cliente antigo pode não mandar o `phone_number_id`: cai no que a Meta acabou de devolver.
  const numeroId = pedido.numeroId || pedido.info.numeroId;
  const atualizado = await atualizarCanal(
    canal,
    { tokenAcesso: pedido.token, phoneNumberId: numeroId, origem: 'embedded_signup' },
    { wabaId: pedido.wabaId, numeroId },
  );

  // "Update inbox name if business name changed", e o religamento do Pipe.
  const nomeDaEmpresa = pedido.info.nomeDaEmpresa;
  await noTenant(pedido.tenantId, async (tx) => {
    if (nomeDaEmpresa) {
      await tx.execute(sql`
        update inbox set nome = ${nomeDaEmpresa}, atualizado_em = now()
         where canal_id = ${canal.id}::uuid
      `);
    }
    await tx.execute(sql`
      update canal set ativo = true, atualizado_em = now() where id = ${canal.id}::uuid
    `);
  });

  return marcarReautorizado({ ...atualizado, ativo: true });
}
