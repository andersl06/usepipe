import { sql } from 'drizzle-orm';
import { schema } from '@pipe/db';
import { noTenant } from '../banco.js';
import { ErroPipe } from '../erros.js';
import { exigirPermissao } from '../sessao.js';
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

const ESTADOS_ATENDENTE = schema.ESTADOS_ATENDENTE;

export type EstadoAtendente = (typeof ESTADOS_ATENDENTE)[number];

export function ehEstadoAtendente(valor: string): valor is EstadoAtendente {
  return (ESTADOS_ATENDENTE as readonly string[]).includes(valor);
}

export interface PedidoDeStatus {
  tenantId: string;
  /** Quem está pedindo. Nulo é integração. */
  porUsuarioId: string | null;
  /** De quem é o status. Diferente de `porUsuarioId` = ação de supervisão. */
  alvoUsuarioId: string;
  estado: EstadoAtendente;
  motivoPausaId?: string | null;
}

export async function definirStatus(pedido: PedidoDeStatus): Promise<{ estado: EstadoAtendente }> {
  // Pausa exige motivo, escolhido da lista que o gestor cadastra. Sem motivo, o tempo
  // de pausa não alimenta relatório nenhum — e é por isso que é obrigatório.
  if (pedido.estado === 'pausa' && !pedido.motivoPausaId) {
    throw ErroPipe.requisicao('motivo_obrigatorio', 'Escolha o motivo da pausa.');
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
    if (pedido.porUsuarioId && pedido.porUsuarioId !== pedido.alvoUsuarioId) {
      await exigirPermissao(tx, pedido.porUsuarioId, 'monitoramento.tempo_real.ver');
    }

    const { rows } = await tx.execute<{ id: string }>(
      sql`select id from usuario where id = ${pedido.alvoUsuarioId}::uuid and ativo limit 1`,
    );
    if (!rows[0]) throw ErroPipe.naoEncontrado('Atendente');

    await tx.execute(sql`
      insert into status_atendente (usuario_id, tenant_id, estado, desde)
      values (${pedido.alvoUsuarioId}, ${pedido.tenantId}, ${pedido.estado}, ${agora})
      on conflict (usuario_id) do update set estado = ${pedido.estado}, desde = ${agora}
    `);

    // Sai da pausa anterior antes de abrir outra: pausa aberta em duplicidade conta o
    // mesmo minuto duas vezes no relatório de ocupação.
    await tx.execute(sql`
      update pausa set encerrada_em = ${agora}
       where usuario_id = ${pedido.alvoUsuarioId}::uuid and encerrada_em is null
    `);

    if (pedido.estado === 'pausa' && pedido.motivoPausaId) {
      const { rows: motivos } = await tx.execute<{ id: string }>(
        sql`select id from motivo_pausa where id = ${pedido.motivoPausaId}::uuid and ativo limit 1`,
      );
      if (!motivos[0]) throw ErroPipe.naoEncontrado('Motivo de pausa');
      await tx.execute(sql`
        insert into pausa (tenant_id, usuario_id, motivo_id)
        values (${pedido.tenantId}, ${pedido.alvoUsuarioId}, ${pedido.motivoPausaId})
      `);
    }
  });

  // Depois do commit, como toda ação de domínio.
  //
  // SEM `usuarioId` de propósito: mudança de status é do interesse do time inteiro —
  // a Gestão pinta o painel de presença e o Desk sabe quem pode receber transferência.
  // Não é dado privado da pessoa.
  await publicar(pedido.tenantId, evento('atendente', pedido.alvoUsuarioId));
  // Quem sai de online devolve conversa para a fila na prática; a lista repinta.
  await publicar(pedido.tenantId, evento('fila'));

  return { estado: pedido.estado };
}
