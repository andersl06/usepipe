import { and, asc, eq, ne, sql } from 'drizzle-orm';
import { diferenca, registrarAuditoria } from '@pipe/db';
import type { Ator, TransactionPipe } from '@pipe/db';
import { flow, flowMember, user } from '@pipe/db/schema';
import type {
  TeamOfFlow,
  MemberOfFlow,
  MyPermissionsInFlow,
  LevelInFlow,
  RoleInFlow,
  RequestOfMemberOfFlow,
  PermissionsInFlow,
  ResourceOfFlow,
} from '@pipe/contracts';
import { PipeError } from '../../errors.js';
import { requirePermission } from '../../session.js';

/**
 * Duplicate `EDITAR_FLUXO` here deliberately: `ciclo-de-vida-do-fluxo.ts` now imports `exigirPermissaoNoFluxo`; importing its constant back would create a module cycle.
 */
const EDIT_FLOW = 'automacao.fluxo.editar';

/**
 * The contact Team tab mirrors source `/team` and PER-FLOW RBAC. Source `getUsersAccounts` (`/applications/{shortName}@msging.net/users/accounts`) combines with `getApplicationUsersPermissions` (`.../permissions`) per contact in `TeamController._loadMembers`; research `referencias-blip/pesquisa/blip-identidade-tenant-permissao.md` §3 records 'a permissão não é do tenant, é do bot'. Contract membership is prerequisite, as the source says: 'Essa pessoa não faz parte do contrato. O administrador deve incluir a pessoa no contrato antes de adicioná-la ao chatbot.'. The role slider (`team.addUserModal.slider`: `visualize`, `custom`, `edit`, `admin`) fills per-resource radios (`PermissionsList.html`: `none` 0, `read` 1, `readWrite` 3) through `selectAllPermissions()`; only custom grants are edited individually. Store the full permission map via `permissoesDoPapel`. Team edits pass `team.escrever` ON THE FLOW or `automacao.fluxo.editar` ON THE ACCOUNT through `exigirPermissaoNoFluxo`. Requiring only flow admin would lock out tenants with no existing members; requiring only account permission would discard per-flow granularity.
 */



/**
 * As linhas do `PermissionsList.html`, na ORDEM do template da origem
 * (`payments`, `channels`, `desk`, `users`, `basicConfigurations`,
 * `connectionInformations`, `resources`, `growth`, `logMessages`, `builder`,
 * `analysis`) e com os títulos do pacote pt-BR
 * (`modules.application.detail.permissions.*.title`).
 *
 * Fora daqui ficam `iaModel`/`iaEnhancement`/`iaProviders` — o item de IA foi
 * removido do catálogo do menu (`apps/management-vite/src/paginas/fluxo/itens.ts`)
 * — e `scheduler`, que aparece no template sem título no pacote de tradução.
 * `team` não está no template, mas está no pacote (`permissions.team.title`) e
 * é o recurso que governa esta própria tela.
 */
export const RESOURCES_OF_FLOW: readonly ResourceOfFlow[] = [
  { key: 'payments', titulo: 'Integrações' },
  { key: 'channels', titulo: 'Canais' },
  { key: 'desk', titulo: 'Atendimento' },
  { key: 'users', titulo: 'Usuários do bot' },
  { key: 'basicConfigurations', titulo: 'Configurações básicas' },
  { key: 'connectionInformations', titulo: 'Informações de conexões' },
  { key: 'resources', titulo: 'Recursos' },
  { key: 'growth', titulo: 'Growth' },
  { key: 'logMessages', titulo: 'Log de mensagens' },
  { key: 'builder', titulo: 'Builder' },
  { key: 'analysis', titulo: 'Análise' },
  { key: 'team', titulo: 'Equipe' },
];

const CHAVES = new Set(RESOURCES_OF_FLOW.map((r) => r.key));

const PAPEIS: readonly RoleInFlow[] = ['visualizar', 'personalizado', 'editar', 'admin'];
const NIVEIS: readonly LevelInFlow[] = ['nenhum', 'ler', 'escrever'];

/**
 * Map each flow resource to an equivalent ACCOUNT permission for the second authorization gate. Currently all map to `automacao.fluxo.editar`: catalog 0019 has only 'Cria e edita chatbots', with no separate `automacao.fluxo.ler` (`paginas/fluxo/equipe/permissoes.ts`). Keep this mapping central so future account permissions for `desk` or `payments` do not require route changes.
 */
const EQUIVALENT_IN_ACCOUNT: Readonly<Record<string, string>> = Object.fromEntries(
  RESOURCES_OF_FLOW.map((r) => [r.key, EDIT_FLOW]),
);

/** The resource governing the Team tab itself. */
const GERIR_EQUIPE = 'team.escrever';

/* ----------------------------------------------------------------- Regras */

/**
 * Source `selectAllPermissions()` uses the top-level role to fill lower radios. Only `personalizado` reads screen-selected entries; other levels determine the map, avoiding stored permissions that contradict the displayed role.
 */
export function permissionsOfRole(
  role: RoleInFlow,
  personalizadas: PermissionsInFlow = {},
): PermissionsInFlow {
  if (role === 'personalizado') {
    const mapa: PermissionsInFlow = {};
    for (const recurso of RESOURCES_OF_FLOW) {
      const nivel = personalizadas[recurso.key];
      mapa[recurso.key] = nivel && NIVEIS.includes(nivel) ? nivel : 'nenhum';
    }
    return mapa;
  }
  const nivel: LevelInFlow = role === 'visualizar' ? 'ler' : 'escrever';
  return Object.fromEntries(RESOURCES_OF_FLOW.map((r) => [r.key, nivel]));
}

function roleChecked(bruto: unknown): RoleInFlow {
  if (typeof bruto === 'string' && (PAPEIS as readonly string[]).includes(bruto)) {
    return bruto as RoleInFlow;
  }
  throw PipeError.request(
    'role_in_flow_invalid',
    `A permissão precisa ser uma de: ${PAPEIS.join(', ')}.`,
  );
}

/** Ignore keys unknown to the source; reject an invalid level rather than silently accepting it. */
function permissionsChecked(bruto: unknown): PermissionsInFlow {
  if (bruto === undefined || bruto === null) return {};
  if (typeof bruto !== 'object') {
    throw PipeError.request('permissions_invalid', 'As permissões precisam ser um objeto.');
  }
  const mapa: PermissionsInFlow = {};
  for (const [key, value] of Object.entries(bruto as Record<string, unknown>)) {
    if (!CHAVES.has(key)) continue;
    if (typeof value !== 'string' || !(NIVEIS as readonly string[]).includes(value)) {
      throw PipeError.request(
        'level_invalid',
        `O nível de "${key}" precisa ser um de: ${NIVEIS.join(', ')}.`,
      );
    }
    mapa[key] = value as LevelInFlow;
  }
  return mapa;
}

/** `ler` is satisfied by `escrever`; `escrever` is not satisfied by `ler`. */
function atende(nivel: LevelInFlow | undefined, verbo: LevelInFlow): boolean {
  if (verbo === 'ler') return nivel === 'ler' || nivel === 'escrever';
  return nivel === verbo;
}



interface LineOfMember {
  roleInFlow: string;
  permissions: PermissionsInFlow;
}

async function member(
  tx: TransactionPipe,
  userId: string,
  flowId: string,
): Promise<LineOfMember | undefined> {
  const [linha] = await tx
    .select({ roleInFlow: flowMember.roleInFlow, permissions: flowMember.permissions })
    .from(flowMember)
    .where(and(eq(flowMember.flowId, flowId), eq(flowMember.userId, userId)))
    .limit(1);
  return linha;
}

/** Split `<recurso>.<verbo>` into its two parts or reject a programming error. */
function separar(codigo: string): { recurso: string; verbo: LevelInFlow } {
  const corte = codigo.lastIndexOf('.');
  const recurso = corte < 0 ? codigo : codigo.slice(0, corte);
  const verbo = corte < 0 ? '' : codigo.slice(corte + 1);
  if (!CHAVES.has(recurso) || !(NIVEIS as readonly string[]).includes(verbo)) {
    throw new Error(`permissão de fluxo desconhecida: ${codigo}`);
  }
  return { recurso, verbo: verbo as LevelInFlow };
}

/**
 * Authorize THIS flow's permission or its account equivalent, matching `exigirPermissao` in `sessao.ts` and the second gate in research §4.3. `codigo` is a source `<recurso>.<verbo>` such as `builder.escrever`, `channels.ler`, or `team.escrever`. Permit a flow member with the requested resource level (`admin` grants all) OR an account member with `EQUIVALENTE_NA_CONTA`. Check the flow's unique-key row first, then the account's `exists` with two joins; many tenants have no flow membership rows.
 */
export async function requirePermissionInFlow(
  tx: TransactionPipe,
  usuarioId: string,
  fluxoId: string,
  codigo: string,
): Promise<void> {
  const { recurso, verbo } = separar(codigo);
  const linha = await member(tx, usuarioId, fluxoId);
  if (linha) {
    if (linha.roleInFlow === 'admin') return;
    if (atende(linha.permissions[recurso], verbo)) return;
  }
  await requirePermission(tx, usuarioId, EQUIVALENT_IN_ACCOUNT[recurso] ?? EDIT_FLOW);
}

/** Check the same permission without throwing, so the screen can decide what to render. */
export async function canInFlow(
  tx: TransactionPipe,
  usuarioId: string,
  fluxoId: string,
  codigo: string,
): Promise<boolean> {
  try {
    await requirePermissionInFlow(tx, usuarioId, fluxoId, codigo);
    return true;
  } catch (error) {
    if (error instanceof PipeError && error.status === 403) return false;
    throw error;
  }
}

/* ------------------------------------------------------------------ Gestos */

const ator = (usuarioId: string): Ator => ({ type: 'usuario', id: usuarioId });

/** O contato vivo do tenant, ou 404 — o mesmo `fetch_inbox` de `ciclo-de-vida-do-fluxo.ts`. */
async function flowLive(tx: TransactionPipe, tenantId: string, fluxoId: string): Promise<string> {
  const [atual] = await tx
    .select({ id: flow.id })
    .from(flow)
    .where(and(eq(flow.tenantId, tenantId), eq(flow.id, fluxoId), ne(flow.estado, 'arquivado')))
    .limit(1);
  if (!atual) throw PipeError.naoEncontrado('fluxo');
  return atual.id;
}

function forContract(linha: {
  userId: string;
  name: string;
  email: string;
  roleInFlow: string;
  permissions: PermissionsInFlow;
  criadoEm: Date;
}): MemberOfFlow {
  return {
    userId: linha.userId,
    nome: linha.name,
    email: linha.email,
    roleInFlow: linha.roleInFlow as RoleInFlow,
    permissions: linha.permissions ?? {},
    criadoEm: linha.criadoEm.toISOString(),
  };
}

const COLUNAS = {
  userId: flowMember.userId,
  name: user.nome,
  email: user.email,
  roleInFlow: flowMember.roleInFlow,
  permissions: flowMember.permissions,
  criadoEm: flowMember.criadoEm,
};

/**
 * List members like `TeamController._loadMembers()`. Viewing the team requires `team.ler`, because the edit modal exposes each member's permissions to contact administrators, not every participant.
 */
export async function listarEquipe(
  tx: TransactionPipe,
  tenantId: string,
  usuarioId: string,
  fluxoId: string,
): Promise<TeamOfFlow> {
  await flowLive(tx, tenantId, fluxoId);
  await requirePermissionInFlow(tx, usuarioId, fluxoId, 'team.ler');

  const linhas = await tx
    .select(COLUNAS)
    .from(flowMember)
    .innerJoin(user, eq(user.id, flowMember.userId))
    .where(eq(flowMember.flowId, fluxoId))
    .orderBy(asc(user.nome));

  return {
    members: linhas.map(forContract),
    recursos: [...RESOURCES_OF_FLOW],
    podeGerir: await canInFlow(tx, usuarioId, fluxoId, GERIR_EQUIPE),
  };
}

/** Return what the contact menu may show, including when the user is not a member. */
export async function myPermissionsInFlow(
  tx: TransactionPipe,
  tenantId: string,
  usuarioId: string,
  fluxoId: string,
): Promise<MyPermissionsInFlow> {
  await flowLive(tx, tenantId, fluxoId);
  const linha = await member(tx, usuarioId, fluxoId);
  const { rows } = await tx.execute<{ tem: boolean }>(sql`
    select exists (
      select 1
        from usuario_papel up
        join papel_permissao pp on pp.papel_id = up.papel_id
       where up.usuario_id = ${usuarioId}::uuid and pp.permissao_codigo = ${EDIT_FLOW}
    ) as tem
  `);
  return {
    papelNoFluxo: (linha?.roleInFlow as RoleInFlow | undefined) ?? null,
    permissoes: linha?.permissions ?? {},
    editsByAccount: rows[0]?.tem === true,
  };
}

/** Quantos administradores este fluxo tem, fora `exceto`. */
async function outrosAdmins(tx: TransactionPipe, fluxoId: string, exceto: string): Promise<number> {
  const { rows } = await tx.execute<{ n: string }>(sql`
    select count(*)::text as n from fluxo_membro
     where fluxo_id = ${fluxoId}::uuid and papel_no_fluxo = 'admin'
       and usuario_id <> ${exceto}::uuid
  `);
  return Number(rows[0]?.n ?? '0');
}

function ultimoAdmin(): PipeError {
  /*
   * Blip hides actions for `owner` (`ng-if="!user.owner"`). Pipe has no owner role, so numerically prevent a contact from losing its last administrator.
   */
  return PipeError.conflito(
    'last_admin',
    'Este é o último administrador do fluxo. Promova outra pessoa antes.',
  );
}

/**
 * Source `confirmAddUser()` first invites non-contract users as `guest`. Pipe keeps invitation separate at `POST /v1/convites` in `dominio/convites.ts`; it starts its own transaction and returns a copyable link because Pipe sends no email. Use the source refusal text and let the screen offer invitation afterward.
 */
export async function addMember(
  tx: TransactionPipe,
  tenantId: string,
  usuarioId: string,
  fluxoId: string,
  pedido: RequestOfMemberOfFlow,
): Promise<MemberOfFlow> {
  await flowLive(tx, tenantId, fluxoId);
  await requirePermissionInFlow(tx, usuarioId, fluxoId, GERIR_EQUIPE);

  const email = (pedido.email ?? '').trim().toLowerCase();
  if (!email) throw PipeError.request('email_missing', 'Informe o e-mail de quem entra.');

  const [pessoa] = await tx
    .select({ id: user.id, nome: user.nome, email: user.email })
    .from(user)
    .where(and(eq(user.email, email), eq(user.ativo, true)))
    .limit(1);
  if (!pessoa) {
    throw PipeError.request(
      'person_outside_of_contract',
      'Essa pessoa não faz parte do contrato. O administrador deve incluir a pessoa no ' +
        'contrato antes de adicioná-la ao chatbot.',
      { email },
    );
  }

  const roleInFlow = roleChecked(pedido.papelNoFluxo ?? 'visualizar');
  const permissions = permissionsOfRole(roleInFlow, permissionsChecked(pedido.permissoes));

  const [criado] = await tx
    .insert(flowMember)
    .values({
      tenantId,
      flowId: fluxoId,
      userId: pessoa.id,
      roleInFlow,
      permissions,
      guestBy: usuarioId,
    })
    .onConflictDoNothing({ target: [flowMember.flowId, flowMember.userId] })
    .returning({ criadoEm: flowMember.criadoEm });
  if (!criado) {
    throw PipeError.conflito('already_member', `${email} já faz parte da equipe deste fluxo.`);
  }

  await registrarAuditoria(tx, tenantId, {
    ator: ator(usuarioId),
    acao: 'criou',
    objetoTipo: 'fluxo_membro',
    objetoId: pessoa.id,
    depois: { fluxoId, email, roleInFlow, permissions },
  });

  return forContract({
    userId: pessoa.id,
    name: pessoa.nome,
    email: pessoa.email,
    roleInFlow,
    permissions,
    criadoEm: criado.criadoEm,
  });
}

/** The edit modal's 'Salvar alterações'; write nothing when no values changed. */
export async function editMember(
  tx: TransactionPipe,
  tenantId: string,
  usuarioId: string,
  fluxoId: string,
  alvoId: string,
  pedido: RequestOfMemberOfFlow,
): Promise<MemberOfFlow> {
  await flowLive(tx, tenantId, fluxoId);
  await requirePermissionInFlow(tx, usuarioId, fluxoId, GERIR_EQUIPE);

  const [atual] = await tx
    .select(COLUNAS)
    .from(flowMember)
    .innerJoin(user, eq(user.id, flowMember.userId))
    .where(and(eq(flowMember.flowId, fluxoId), eq(flowMember.userId, alvoId)))
    .limit(1);
  if (!atual) throw PipeError.naoEncontrado('membro');

  const papelNoFluxo =
    pedido.papelNoFluxo === undefined
      ? (atual.roleInFlow as RoleInFlow)
      : roleChecked(pedido.papelNoFluxo);
  const permissoes = permissionsOfRole(
    papelNoFluxo,
    pedido.permissoes === undefined
      ? (atual.permissions ?? {})
      : permissionsChecked(pedido.permissoes),
  );

  /*
   * Flatten to one field per resource because `diferenca` compares with `===`: equal maps are different objects, so nested values would make every Save appear changed. Flattening also names the changed permission row in the log.
   */
  const mudanca = diferenca(
    { papelNoFluxo: atual.roleInFlow, ...(atual.permissions ?? {}) },
    { papelNoFluxo, ...permissoes },
  );
  if (Object.keys(mudanca.depois).length === 0) return forContract(atual);

  if (atual.roleInFlow === 'admin' && papelNoFluxo !== 'admin') {
    if ((await outrosAdmins(tx, fluxoId, alvoId)) === 0) throw ultimoAdmin();
  }

  await tx
    .update(flowMember)
    .set({ roleInFlow: papelNoFluxo, permissions: permissoes, atualizadoEm: new Date() })
    .where(and(eq(flowMember.flowId, fluxoId), eq(flowMember.userId, alvoId)));

  await registrarAuditoria(tx, tenantId, {
    ator: ator(usuarioId),
    acao: 'alterou',
    objetoTipo: 'fluxo_membro',
    objetoId: alvoId,
    antes: { fluxoId, ...mudanca.antes },
    depois: mudanca.depois,
  });

  return forContract({ ...atual, roleInFlow: papelNoFluxo, permissions: permissoes });
}

/** `removeUser()` includes a last-administrator guard absent from the source. */
export async function removeMember(
  tx: TransactionPipe,
  tenantId: string,
  usuarioId: string,
  fluxoId: string,
  alvoId: string,
): Promise<void> {
  await flowLive(tx, tenantId, fluxoId);
  await requirePermissionInFlow(tx, usuarioId, fluxoId, GERIR_EQUIPE);

  const [atual] = await tx
    .select({
      papelNoFluxo: flowMember.roleInFlow,
      permissoes: flowMember.permissions,
      email: user.email,
    })
    .from(flowMember)
    .innerJoin(user, eq(user.id, flowMember.userId))
    .where(and(eq(flowMember.flowId, fluxoId), eq(flowMember.userId, alvoId)))
    .limit(1);
  if (!atual) throw PipeError.naoEncontrado('membro');

  if (atual.papelNoFluxo === 'admin' && (await outrosAdmins(tx, fluxoId, alvoId)) === 0) {
    throw ultimoAdmin();
  }

  await tx
    .delete(flowMember)
    .where(and(eq(flowMember.flowId, fluxoId), eq(flowMember.userId, alvoId)));

  await registrarAuditoria(tx, tenantId, {
    ator: ator(usuarioId),
    acao: 'excluiu',
    objetoTipo: 'fluxo_membro',
    objetoId: alvoId,
    antes: {
      fluxoId,
      email: atual.email,
      papelNoFluxo: atual.papelNoFluxo,
      permissoes: atual.permissoes ?? {},
    },
  });
}
