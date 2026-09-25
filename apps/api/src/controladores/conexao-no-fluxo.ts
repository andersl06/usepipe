import { noTenant } from '../banco.js';
import { PipeError } from '../erros.js';
import { exigirPermission } from '../sessao.js';
import {
  conferirQuePodeLigar,
  connectChannelToFlow,
  canReconnectInFlow,
} from '../dominio/gestao/canal-do-fluxo.js';

/**
 * O `fluxo_id` opcional das conexões de canal (`POST /v1/canais/{whatsapp,
 * instagram,messenger}[/manual]`): a conexão feita DE DENTRO do bot, como na
 * origem (`FICHA-conectar-canal-no-bot.md` §4 — o canal é do bot, não da
 * conta). Com ele, a permissão é a do bot (`channels.escrever`,
 * `dominio/gestao/canal-do-fluxo.ts`) e o canal nasce já ligado; sem ele, vale
 * o `canal.gerenciar` da conta, como antes.
 *
 * Partilhado pelos três controladores para não importar um controlador de
 * dentro do outro.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `fluxo_id` do corpo, se veio; fora do padrão de uuid é 404 antes de ir ao banco. */
export function flowIdOfBody(corpo: { flowId?: unknown } | undefined): string | undefined {
  const bruto = corpo?.flowId;
  if (bruto === undefined || bruto === null || bruto === '') return undefined;
  if (typeof bruto !== 'string' || !UUID.test(bruto)) throw PipeError.naoEncontrado('fluxo');
  return bruto;
}

/**
 * Com bot, confere também que ele ainda não tem canal — ANTES de gravar a
 * credencial do cliente, para a ligação não ser recusada depois do canal criado.
 */
export function permitidoConectar(
  tenantId: string,
  userId: string,
  flowId: string | undefined,
): Promise<void> {
  return noTenant(tenantId, async (tx) => {
    if (flowId) await conferirQuePodeLigar(tx, tenantId, userId, flowId);
    else await exigirPermission(tx, userId, 'canal.gerenciar');
  });
}

/**
 * RECONECTAR o canal que o bot já tem (token vencido): na origem isso acontece
 * na página do canal DENTRO do bot, então quem administra o bot basta. Só vale
 * para o canal daquele bot — reconectar canal alheio continua sendo da conta.
 */
export function permitidoReconectar(
  tenantId: string,
  usuarioId: string,
  fluxoId: string | undefined,
  channelId: string,
): Promise<void> {
  return noTenant(tenantId, async (tx) => {
    if (fluxoId && (await canReconnectInFlow(tx, tenantId, usuarioId, fluxoId, channelId))) return;
    await exigirPermission(tx, usuarioId, 'canal.gerenciar');
  });
}

/** O canal recém-criado passa a ser do bot. */
export function connectToFlow(
  tenantId: string,
  usuarioId: string,
  fluxoId: string,
  canalId: string,
): Promise<void> {
  return noTenant(tenantId, async (tx) => {
    await connectChannelToFlow(tx, tenantId, usuarioId, fluxoId, canalId);
  });
}
