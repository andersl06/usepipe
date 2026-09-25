import { sql } from 'drizzle-orm';
import { schema } from '@pipe/db';
import { noTenant } from '../banco.js';
import { PipeError } from '../erros.js';
import { exigirPermission } from '../sessao.js';
import { evento, publicar } from '../tempo-real.js';

/**
 * Status do atendente: online, pausa, invisível, offline.
 *
 * Sobe do Desk para cá pelo mesmo motivo de encerrar e pausar conversa: **o evento não
 * pode depender de a tela lembrar**. Sem isto, a Gestão só descobre que alguém saiu no
 * próximo recarregamento — e o "desconectar atendente inativo" não teria como existir,
 * porque derrubar alguém é mexer no status de OUTRA pessoa, e isso nenhuma tela faz
 * direto no banco.
 */

const STATES_AGENT = schema.STATES_AGENT;

export type StateAgent = (typeof STATES_AGENT)[number];

export function ehStateAgent(value: string): value is StateAgent {
  return (STATES_AGENT as readonly string[]).includes(value);
}

export interface PedidoDeStatus {
  tenantId: string;
  /** Quem está pedindo. Nulo é integração. */
  byUserId: string | null;
  /** De quem é o status. Diferente de `porUsuarioId` = ação de supervisão. */
  targetUserId: string;
  state: StateAgent;
  motivoPausaId?: string | null;
}

export async function definirStatus(pedido: PedidoDeStatus): Promise<{ estado: StateAgent }> {
  // Pausa exige motivo, escolhido da lista que o gestor cadastra. Sem motivo, o tempo
  // de pausa não alimenta relatório nenhum — e é por isso que é obrigatório.
  if (pedido.state === 'pausa' && !pedido.motivoPausaId) {
    throw PipeError.request('motivo_obrigatorio', 'Escolha o motivo da pausa.');
  }

  const agora = new Date();

  await noTenant(pedido.tenantId, async (tx) => {
    // Mexer no status de OUTRA pessoa é supervisão, e é o que a Gestão faz ao
    // desconectar quem ficou inativo. Quem mexe no próprio não precisa de permissão.
    //
    // A permissão é `monitoramento.tempo_real.ver`, e não uma nova: é a que o papel
    // `supervisor` já tem e é exatamente a tela de onde a ação parte.
    //
    // ponytail: permissão emprestada. O certo é `atendente.gerenciar` própria, e o
    // custo é UMA linha em `CATALOGO_PERMISSOES` de `packages/db/src/semente.ts`
    // (mais o papel do supervisor) e UMA linha aqui. Ficou de fora hoje só para não
    // haver dois agentes no mesmo arquivo de catálogo. Enquanto for assim, quem tiver
    // o monitoramento consegue derrubar atendente — que é o mesmo público, mas por
    // coincidência, não por desenho.
    if (pedido.byUserId && pedido.byUserId !== pedido.targetUserId) {
      await exigirPermission(tx, pedido.byUserId, 'monitoramento.tempo_real.ver');
    }

    const { rows } = await tx.execute<{ id: string }>(
      sql`select id from usuario where id = ${pedido.targetUserId}::uuid and ativo limit 1`,
    );
    if (!rows[0]) throw PipeError.naoEncontrado('Atendente');

    await tx.execute(sql`
      insert into status_atendente (usuario_id, tenant_id, estado, desde)
      values (${pedido.targetUserId}, ${pedido.tenantId}, ${pedido.state}, ${agora})
      on conflict (usuario_id) do update set estado = ${pedido.state}, desde = ${agora}
    `);

    // Sai da pausa anterior antes de abrir outra: pausa aberta em duplicidade conta o
    // mesmo minuto duas vezes no relatório de ocupação.
    await tx.execute(sql`
      update pausa set encerrada_em = ${agora}
       where usuario_id = ${pedido.targetUserId}::uuid and encerrada_em is null
    `);

    if (pedido.state === 'pausa' && pedido.motivoPausaId) {
      const { rows: motivos } = await tx.execute<{ id: string }>(
        sql`select id from motivo_pausa where id = ${pedido.motivoPausaId}::uuid and ativo limit 1`,
      );
      if (!motivos[0]) throw PipeError.naoEncontrado('Motivo de pausa');
      await tx.execute(sql`
        insert into pausa (tenant_id, usuario_id, motivo_id)
        values (${pedido.tenantId}, ${pedido.targetUserId}, ${pedido.motivoPausaId})
      `);
    }
  });

  // Depois do commit, como toda ação de domínio.
  //
  // SEM `usuarioId` de propósito: mudança de status é do interesse do time inteiro —
  // a Gestão pinta o painel de presença e o Desk sabe quem pode receber transferência.
  // Não é dado privado da pessoa.
  await publicar(pedido.tenantId, evento('atendente', pedido.targetUserId));
  // Quem sai de online devolve conversa para a fila na prática; a lista repinta.
  await publicar(pedido.tenantId, evento('fila'));

  return { estado: pedido.state };
}
