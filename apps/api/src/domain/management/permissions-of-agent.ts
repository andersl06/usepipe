import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import {
  rolePermission,
  permission,
  user,
  userRole,
  userPermission,
} from '@pipe/db/schema';
import { registrarAuditoria } from '@pipe/db';
import type { Ator, TransactionPipe } from '@pipe/db';
import { PipeError } from '../../errors.js';
import { exigirPermission } from '../../session.js';

/**
 * The agent Permissions page mirrors source `attendance.desk.team.permission` as a PAGE, not modal (`referencias-blip/fichas/FICHA-atendentes-filas-pausas.md` §§a.1/a.4). Keep source literal labels 'Permissões', 'Configure as permissões de …', 'Permissões disponíveis', 'Tipo de permissão', 'Status', and 'Salvar alterações', but populate rows from Pipe's enforced catalog (`packages/db/src/semente.ts`) rather than Blip's ten Desk capabilities (`canSendActiveMessage`, `canCallsVideo`, etc.). Migration 0046 adds per-person `usuario_permissao` override: effective = `COALESCE(override, union of roles)`. Delete an override when the choice matches the role again, avoiding stale copies of RBAC. For multi-agent selection (`single`, `couple`, `multiples`), show a permission on only when ALL have it and `parcial` when mixed; saving without touching a mixed row must not silently revoke anyone.
 */

/** Catalog permission 'Criar, editar e desativar usuário' governs changing others' permissions. */
export const USER_MANAGE = 'usuario.gerenciar';

/**
 * Expose only AGENT capabilities on this page. Blip lists ten Desk actions such as 'Transferir tickets' and 'Editar dados do contato'; including Pipe's whole catalog would let an agent receive API-key issuance or role-management powers through an override, bypassing roles. Conversation and contact capabilities belong here; the rest stay role-controlled.
 */
export const EH_OF_AGENT = /^(conversa|contato)./;

/** Use literal source labels where the capability is equivalent. */
const ROTULO_DA_ORIGEM: Record<string, string> = {
  "conversa.transferir": "Transferir tickets",
  "contato.editar": "Editar dados do contato",
};

const ator = (userId: string): Ator => ({ type: 'usuario', id: userId });

export interface LineOfPermission {
  code: string;
  group: string;
  description: string;
  /** Union of role grants before per-person exceptions. */
  dosPapeis: boolean;
  /** `null` means no override; use the role grant. */
  override: boolean | null;
  /** Whether the permission is currently effective for ALL requested agents. */
  ligada: boolean;
  /** Some agents have it and others do not; possible only with multiple agents. */
  parcial: boolean;
}

export interface AgentOfPermissions {
  id: string;
  name: string;
  email: string;
}

export interface PermissionsOfAgent {
  agents: AgentOfPermissions[];
  permissions: LineOfPermission[];
}

/** Reject duplicate, empty or out-of-tenant IDs; the screen sends its selected agents. */
async function agentsVivos(
  tx: TransactionPipe,
  ids: readonly string[],
): Promise<AgentOfPermissions[]> {
  const unicos = [...new Set(ids.filter((i) => i))];
  if (unicos.length === 0) {
    throw PipeError.request('agent_required', 'Escolha ao menos um atendente.');
  }
  const pessoas = await tx
    .select({ id: user.id, name: user.nome, email: user.email })
    .from(user)
    .where(inArray(user.id, unicos))
    .orderBy(asc(user.nome));
  if (pessoas.length !== unicos.length) throw PipeError.naoEncontrado('atendente');
  return pessoas;
}

/**
 * Load the whole catalog with each requested agent's permission state. Run queries SERIALLY, never under `Promise.all`: parallel work on one connection can clear transaction `set_config('pipe.tenant_id')` and stop RLS filtering.
 */
export async function loadPermissionsOfAgent(
  tx: TransactionPipe,
  ids: readonly string[],
): Promise<PermissionsOfAgent> {
  const agents = await agentsVivos(tx, ids);
  const alvos = agents.map((a) => a.id);

  const catalogo = await tx
    .select({ codigo: permission.codigo, grupo: permission.grupo, descricao: permission.descricao })
    .from(permission)
    .orderBy(asc(permission.grupo), asc(permission.codigo));

  /*
   * One row per person and permission granted by a ROLE; use `selectDistinct` because multiple roles often grant the same permission.
   */
  const dosPapeis = await tx
    .selectDistinct({
      usuarioId: userRole.userId,
      codigo: rolePermission.permissionCode,
    })
    .from(userRole)
    .innerJoin(rolePermission, eq(rolePermission.roleId, userRole.papelId))
    .where(inArray(userRole.userId, alvos));

  const exceptions = await tx
    .select({
      usuarioId: userPermission.usuarioId,
      codigo: userPermission.permissaoCodigo,
      concedida: userPermission.concedida,
    })
    .from(userPermission)
    .where(inArray(userPermission.usuarioId, alvos));

  const ofRole = new Set(dosPapeis.map((l) => `${l.usuarioId}\u0000${l.codigo}`));
  const override = new Map(exceptions.map((e) => [`${e.usuarioId}\u0000${e.codigo}`, e.concedida]));

  const permissions = catalogo.filter((c) => EH_OF_AGENT.test(c.codigo)).map((c) => {
    const efetivas = alvos.map((alvo) => {
      const key = `${alvo}\u0000${c.codigo}`;
      return override.get(key) ?? ofRole.has(key);
    });
    const todos = efetivas.every((v) => v);
    const nenhum = efetivas.every((v) => !v);
    /*
     * With one agent, `dosPapeis` and `override` describe that agent. With several, the screen needs only `ligada`/`parcial`; those two fields describe the first solely for the single-selection Status column.
     */
    const first = `${alvos[0]}\u0000${c.codigo}`;
    return {
      code: c.codigo,
      group: c.grupo,
      description: ROTULO_DA_ORIGEM[c.codigo] ?? c.descricao,
      dosPapeis: ofRole.has(first),
      override: override.get(first) ?? null,
      ligada: todos,
      parcial: !todos && !nenhum,
    };
  });

  return { agents, permissions };
}

export interface RequestOfPermissions {
  userIds: string[];
  /** Only permissions the screen CHANGED: code to enabled/disabled; leave all others as they are. */
  permissions: Record<string, boolean>;
}

/**
 * On 'Salvar alterações', write an override for each requested person and code, or DELETE it when the selected value already matches the role grant.
 */
export async function writePermissionsOfAgent(
  tx: TransactionPipe,
  tid: string,
  autorId: string,
  pedido: RequestOfPermissions,
): Promise<{ ok: true }> {
  await exigirPermission(tx, autorId, USER_MANAGE);

  const atendentes = await agentsVivos(tx, pedido.userIds ?? []);
  const escolhas = Object.entries(pedido.permissions ?? {});
  if (escolhas.length === 0) return { ok: true };

  const codigos = escolhas.map(([codigo]) => codigo);
  const conhecidas = await tx
    .select({ codigo: permission.codigo })
    .from(permission)
    .where(inArray(permission.codigo, codigos));
  const valida = new Set(conhecidas.map((c) => c.codigo));
  for (const codigo of codigos) {
    if (!EH_OF_AGENT.test(codigo)) {
      throw PipeError.request("permission_outside_of_agent", `"${codigo}" não se concede por atendente: vem do papel.`);
    }
    if (!valida.has(codigo)) {
      throw PipeError.request('permission_unknown', `"${codigo}" não é uma permissão do Pipe.`);
    }
  }

  for (const pessoa of atendentes) {
    const mudou: Record<string, boolean> = {};

    for (const [codigo, ligada] of escolhas) {
      const { rows } = await tx.execute<{ tem: boolean }>(sql`
        select exists (
          select 1
            from usuario_papel up
            join papel_permissao pp on pp.papel_id = up.papel_id
           where up.usuario_id = ${pessoa.id}::uuid and pp.permissao_codigo = ${codigo}
        ) as tem
      `);
      const doPapel = rows[0]?.tem ?? false;

      const [atual] = await tx
        .select({ concedida: userPermission.concedida })
        .from(userPermission)
        .where(
          and(
            eq(userPermission.usuarioId, pessoa.id),
            eq(userPermission.permissaoCodigo, codigo),
          ),
        )
        .limit(1);
      const efetivaAntes = atual?.concedida ?? doPapel;

      if (ligada === doPapel) {
        /* The choice matches the role again, so remove the exception. */
        if (atual !== undefined) {
          await tx
            .delete(userPermission)
            .where(
              and(
                eq(userPermission.usuarioId, pessoa.id),
                eq(userPermission.permissaoCodigo, codigo),
              ),
            );
        }
      } else if (atual === undefined) {
        await tx.insert(userPermission).values({
          tenantId: tid,
          usuarioId: pessoa.id,
          permissaoCodigo: codigo,
          concedida: ligada,
        });
      } else if (atual.concedida !== ligada) {
        await tx
          .update(userPermission)
          .set({ concedida: ligada, atualizadoEm: new Date() })
          .where(
            and(
              eq(userPermission.usuarioId, pessoa.id),
              eq(userPermission.permissaoCodigo, codigo),
            ),
          );
      }

      if (efetivaAntes !== ligada) mudou[codigo] = ligada;
    }

    /* Audit only actual changes; saving without edits is not an event. */
    if (Object.keys(mudou).length > 0) {
      await registrarAuditoria(tx, tid, {
        ator: ator(autorId),
        acao: 'alterou',
        objetoTipo: 'usuario_permissao',
        objetoId: pessoa.id,
        depois: mudou,
      });
    }
  }

  return { ok: true };
}
