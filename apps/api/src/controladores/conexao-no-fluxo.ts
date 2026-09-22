import { noTenant } from '../banco.js';
import { ErroPipe } from '../erros.js';
import { exigirPermissao } from '../sessao.js';
import {
  conferirQuePodeLigar,
  ligarCanalAoFluxo,
  podeReconectarNoFluxo,
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
export function fluxoIdDoCorpo(corpo: { fluxo_id?: unknown } | undefined): string | undefined {
  const bruto = corpo?.fluxo_id;
  if (bruto === undefined || bruto === null || bruto === '') return undefined;
  if (typeof bruto !== 'string' || !UUID.test(bruto)) throw ErroPipe.naoEncontrado('fluxo');
  return bruto;
}

/**
 * Com bot, confere também que ele ainda não tem canal — ANTES de gravar a
 * credencial do cliente, para a ligação não ser recusada depois do canal criado.
 */
export function permitidoConectar(
  tenantId: string,
  usuarioId: string,
  fluxoId: string | undefined,
): Promise<void> {
  return noTenant(tenantId, async (tx) => {
    if (fluxoId) await conferirQuePodeLigar(tx, tenantId, usuarioId, fluxoId);
    else await exigirPermissao(tx, usuarioId, 'canal.gerenciar');
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
  canalId: string,
): Promise<void> {
  return noTenant(tenantId, async (tx) => {
    if (fluxoId && (await podeReconectarNoFluxo(tx, tenantId, usuarioId, fluxoId, canalId))) return;
    await exigirPermissao(tx, usuarioId, 'canal.gerenciar');
  });
}

/** O canal recém-criado passa a ser do bot. */
export function ligarAoFluxo(
  tenantId: string,
  usuarioId: string,
  fluxoId: string,
  canalId: string,
): Promise<void> {
  return noTenant(tenantId, async (tx) => {
    await ligarCanalAoFluxo(tx, tenantId, usuarioId, fluxoId, canalId);
  });
}
