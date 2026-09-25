import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import {
  rolePermission,
  permissao as permission,
  user,
  userRole,
  userPermission,
} from '@pipe/db/schema';
import { registrarAuditoria } from '@pipe/db';
import type { Ator, TransacaoPipe as TransactionPipe } from '@pipe/db';
import { PipeError } from '../../errors.js';
import { exigirPermission } from '../../session.js';

/**
 * A página "Permissões" do atendente — `attendance.desk.team.permission` da
 * origem, que é PÁGINA e não modal
 * (`referencias-blip/fichas/FICHA-atendentes-filas-pausas.md` §a.1/§a.4).
 *
 * A forma é a deles: título "Permissões", a descrição "Configure as permissões
 * de …" nas três variantes, a seção "Permissões disponíveis" e uma tabela de
 * duas colunas — "Tipo de permissão" e "Status" — com um botão "Salvar
 * alterações". O CONTEÚDO das linhas é nosso: lá são dez capacidades do Blip
 * Desk (`canSendActiveMessage`, `canCallsVideo`, …); aqui é o catálogo de
 * permissões do Pipe (`packages/db/src/semente.ts`), que é o vocabulário que o
 * produto de verdade confere em cada rota. Copiar os nomes deles seria
 * desenhar dez interruptores que não ligam nada.
 *
 * **Como o Status é calculado, e por que existe `usuario_permissao`.** No Pipe
 * a permissão sempre veio do PAPEL, e papel é conjunto: não havia como dizer
 * "este atendente, e só ele, não transfere ticket" sem inventar um papel de uma
 * pessoa só. A migração 0046 cria a EXCEÇÃO por pessoa, e a conta passa a ser
 *
 *   efetiva = COALESCE(override desta pessoa, união dos papéis)
 *
 * A gravação APAGA o override quando a escolha volta a coincidir com o papel:
 * a tabela guarda só a exceção e nunca vira uma cópia desatualizada do RBAC.
 * É isso que faz trocar o papel de alguém continuar surtindo efeito depois de
 * a tela ter sido aberta uma vez.
 *
 * **Seleção múltipla.** A origem tem as três descrições (`single`, `couple`,
 * `multiples`), então a página atende N atendentes de uma vez. Com mais de um,
 * o Status de uma permissão só aparece LIGADO quando TODOS a têm; quando uns
 * têm e outros não, a linha vem `parcial` — e mexer nela decide para os dois
 * lados. Sem o `parcial`, abrir a tela com dois atendentes diferentes e salvar
 * sem tocar em nada rebaixaria silenciosamente quem tinha mais.
 */

/** "Criar, editar e desativar usuário" — quem manda na permissão dos outros. */
export const USER_MANAGE = 'usuario.gerenciar';

/**
 * Só as capacidades DO ATENDENTE entram na página. A origem lista dez, todas do
 * Desk ("Transferir tickets", "Editar dados do contato", …); o catálogo inteiro
 * do Pipe punha ao lado delas "Emitir e revogar chave de API", "Criar papel e
 * atribuir permissão" e afins — e esta tela concederia isso a um atendente por
 * exceção, sem passar pelo papel. O que é de conversa e de contato é o que o
 * atendente faz no Desk; o resto continua sendo do papel.
 */
export const EH_OF_AGENT = /^(conversa|contato)./;

/** Os rótulos literais da origem onde a capacidade é a mesma. */
const ROTULO_DA_ORIGEM: Record<string, string> = {
  "conversa.transferir": "Transferir tickets",
  "contato.editar": "Editar dados do contato",
};

const ator = (userId: string): Ator => ({ tipo: 'usuario', id: userId });

export interface LineOfPermission {
  code: string;
  group: string;
  description: string;
  /** O que a união dos papéis dá, antes de qualquer exceção. */
  dosPapeis: boolean;
  /** `null` = sem exceção, manda o papel. */
  override: boolean | null;
  /** O que vale hoje para TODOS os atendentes pedidos. */
  ligada: boolean;
  /** Uns têm, outros não — só acontece com mais de um atendente. */
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

/** Ids repetidos, vazios ou fora do tenant não passam: a tela manda o que marcou. */
async function agentsVivos(
  tx: TransactionPipe,
  ids: readonly string[],
): Promise<AgentOfPermissions[]> {
  const unicos = [...new Set(ids.filter((i) => i))];
  if (unicos.length === 0) {
    throw PipeError.request('agent_required', 'Escolha ao menos um atendente.');
  }
  const pessoas = await tx
    .select({ id: user.id, nome: user.nome, email: user.email })
    .from(user)
    .where(inArray(user.id, unicos))
    .orderBy(asc(user.nome));
  if (pessoas.length !== unicos.length) throw PipeError.naoEncontrado('atendente');
  return pessoas;
}

/**
 * O catálogo inteiro com o estado de cada linha para os atendentes pedidos.
 *
 * Em SÉRIE, nunca em `Promise.all`: consulta paralela na mesma conexão apaga o
 * `set_config('pipe.tenant_id')` da transação e a RLS para de filtrar.
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

  /* Uma linha por (pessoa, permissão) que o PAPEL dá. `selectDistinct` porque
     dois papéis repetem permissão o tempo todo. */
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
    /* Com um atendente só, `dosPapeis`/`override` são o dele; com vários, o
       que a tela precisa é só `ligada`/`parcial`, e os dois campos viram o
       retrato do PRIMEIRO — é o que a coluna "Status" desenha ao lado do
       nome quando a seleção é de um. */
    const first = `${alvos[0]}\u0000${c.codigo}`;
    return {
      codigo: c.codigo,
      grupo: c.grupo,
      descricao: ROTULO_DA_ORIGEM[c.codigo] ?? c.descricao,
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
  /** Só o que a tela MEXEU: código → ligado/desligado. O resto fica como está. */
  permissions: Record<string, boolean>;
}

/**
 * "Salvar alterações": para cada (pessoa, código) pedido, grava o override —
 * ou o APAGA, quando a escolha já é o que o papel dá.
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
        /* Voltou a coincidir com o papel: a exceção deixa de existir. */
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

    /* Log só de quem mudou de verdade: salvar sem mexer em nada não é evento. */
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
