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
  RecursoOfFlow,
} from '@pipe/contracts';
import { PipeError } from '../../errors.js';
import { exigirPermission } from '../../session.js';

/**
 * O `EDITAR_FLUXO` de `ciclo-de-vida-do-fluxo.ts`, repetido aqui de propósito:
 * aquele arquivo passou a chamar `exigirPermissaoNoFluxo`, e importar a
 * constante de volta fecharia um ciclo entre os dois módulos.
 */
const EDITAR_FLOW = 'automacao.fluxo.editar';

/**
 * A aba "Equipe" do contato — o `/team` da origem, e o RBAC POR FLUXO que ele
 * pressupõe.
 *
 * Na origem a permissão é do BOT, não do contrato: `getUsersAccounts`
 * (`/applications/{shortName}@msging.net/users/accounts`) cruzado com
 * `getApplicationUsersPermissions` (`.../permissions`), tudo por contato
 * (`TeamController._loadMembers`). A pesquisa mede isso no objeto real —
 * `referencias-blip/pesquisa/blip-identidade-tenant-permissao.md` §3: "a permissão não é do
 * tenant, é do bot". O contrato é PRÉ-REQUISITO, não fonte: o próprio aviso da
 * origem diz "Essa pessoa não faz parte do contrato. O administrador deve
 * incluir a pessoa no contrato antes de adicioná-la ao chatbot.".
 *
 * ## As duas peneiras que a tela usa
 *
 * 1. o traço "Permissão" (`rzslider`), com as quatro paradas de
 *    `team.addUserModal.slider`: `visualize`, `custom`, `edit`, `admin`;
 * 2. a lista por recurso (`PermissionsList.html` da rota `/team/team/edit`),
 *    com três rádios por linha: `none` (0), `read` (1), `readWrite` (3).
 *
 * A primeira MARCA a segunda (`selectAllPermissions()`): "Visualizar" põe tudo
 * em `read`, "Ver e editar" e "Admin" põem tudo em `readWrite`, e
 * "Personalizado" (`checkStatus()`) libera cada linha para a mão. É por isso
 * que `permissoesDoPapel` existe: o mapa gravado é sempre o mapa completo, e o
 * papel só diz como ele foi preenchido.
 *
 * ## Quem pode mexer na equipe
 *
 * `team.escrever` NO FLUXO (que todo `admin` do fluxo tem) **ou**
 * `automacao.fluxo.editar` NA CONTA — a regra de `exigirPermissaoNoFluxo`,
 * aplicada com o recurso `team`. Exigir só o admin do fluxo trancaria a porta
 * em todo tenant que nunca abriu esta tela (ninguém é membro de nada ainda) e
 * exigir só a conta jogaria fora a granularidade que a tabela existe para ter.
 * É o "duplo portão" da §4.3 da pesquisa, do lado de quem distribui.
 */

/* --------------------------------------------------------------- Catálogo */

/**
 * As linhas do `PermissionsList.html`, na ORDEM do template da origem
 * (`payments`, `channels`, `desk`, `users`, `basicConfigurations`,
 * `connectionInformations`, `resources`, `growth`, `logMessages`, `builder`,
 * `analysis`) e com os títulos do pacote pt-BR
 * (`modules.application.detail.permissions.*.title`).
 *
 * Fora daqui ficam `iaModel`/`iaEnhancement`/`iaProviders` — o item de IA foi
 * removido do catálogo do menu (`apps/gestao-vite/src/paginas/fluxo/itens.ts`)
 * — e `scheduler`, que aparece no template sem título no pacote de tradução.
 * `team` não está no template, mas está no pacote (`permissions.team.title`) e
 * é o recurso que governa esta própria tela.
 */
export const RECURSOS_OF_FLOW: readonly RecursoOfFlow[] = [
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

const CHAVES = new Set(RECURSOS_OF_FLOW.map((r) => r.key));

const PAPEIS: readonly RoleInFlow[] = ['visualizar', 'personalizado', 'editar', 'admin'];
const NIVEIS: readonly LevelInFlow[] = ['nenhum', 'ler', 'escrever'];

/**
 * O código de CONTA equivalente a cada recurso do fluxo — o outro lado do duplo
 * portão. Hoje é `automacao.fluxo.editar` para todos: o catálogo da 0019 tem um
 * verbo só para fluxo ("Cria e edita chatbots"), sem `automacao.fluxo.ler`
 * separado (o comentário de `paginas/fluxo/equipe/permissoes.ts` registra isso).
 * A constante existe porque a granularidade do fluxo é fina e a da conta não é:
 * quando `desk`/`payments` ganharem permissão de conta própria, é aqui que a
 * equivalência muda, e nenhuma rota precisa saber.
 */
const EQUIVALENTE_IN_ACCOUNT: Readonly<Record<string, string>> = Object.fromEntries(
  RECURSOS_OF_FLOW.map((r) => [r.key, EDITAR_FLOW]),
);

/** O recurso que governa a própria aba Equipe. */
const GERIR_EQUIPE = 'team.escrever';

/* ----------------------------------------------------------------- Regras */

/**
 * `selectAllPermissions()` da origem: o nível de cima marca os rádios de baixo.
 * Só `personalizado` lê o que veio da tela — nos outros três o traço manda, e
 * gravar outra coisa deixaria o banco contradizendo o que a pessoa vê.
 */
export function permissionsOfRole(
  role: RoleInFlow,
  personalizadas: PermissionsInFlow = {},
): PermissionsInFlow {
  if (role === 'personalizado') {
    const mapa: PermissionsInFlow = {};
    for (const recurso of RECURSOS_OF_FLOW) {
      const nivel = personalizadas[recurso.key];
      mapa[recurso.key] = nivel && NIVEIS.includes(nivel) ? nivel : 'nenhum';
    }
    return mapa;
  }
  const nivel: LevelInFlow = role === 'visualizar' ? 'ler' : 'escrever';
  return Object.fromEntries(RECURSOS_OF_FLOW.map((r) => [r.key, nivel]));
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

/** Chave que a origem não tem é descartada; nível inválido é recusa, não silêncio. */
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

/** `ler` se contenta com `escrever`; `escrever` não se contenta com `ler`. */
function atende(nivel: LevelInFlow | undefined, verbo: LevelInFlow): boolean {
  if (verbo === 'ler') return nivel === 'ler' || nivel === 'escrever';
  return nivel === verbo;
}

/* ------------------------------------------------------------- A permissão */

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
    .select({ papelNoFluxo: flowMember.roleInFlow, permissoes: flowMember.permissions })
    .from(flowMember)
    .where(and(eq(flowMember.flowId, flowId), eq(flowMember.userId, userId)))
    .limit(1);
  return linha;
}

/** `<recurso>.<verbo>` → as duas metades, ou recusa de programação. */
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
 * A permissão DESTE fluxo, ou a equivalente na conta — a irmã por contato de
 * `exigirPermissao` (`sessao.ts`), e o segundo portão da §4.3 da pesquisa.
 *
 * `codigo` é `<recurso>.<verbo>` da ORIGEM (`builder.escrever`, `channels.ler`,
 * `team.escrever`). Passa quem:
 *
 * - é membro do fluxo e tem o nível pedido naquele recurso (`admin` tem tudo,
 *   por definição do traço); **ou**
 * - tem na conta o código equivalente (`EQUIVALENTE_NA_CONTA`).
 *
 * A ordem importa pouco para o resultado e muito para a conta de consultas: a
 * do fluxo é uma linha por chave única, a da conta é um `exists` com dois
 * joins, e a maioria dos tenants ainda não tem ninguém nesta tabela.
 */
export async function exigirPermissionInFlow(
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
  await exigirPermission(tx, usuarioId, EQUIVALENTE_IN_ACCOUNT[recurso] ?? EDITAR_FLOW);
}

/** O mesmo teste sem estourar — para a tela decidir o que desenhar. */
export async function canInFlow(
  tx: TransactionPipe,
  usuarioId: string,
  fluxoId: string,
  codigo: string,
): Promise<boolean> {
  try {
    await exigirPermissionInFlow(tx, usuarioId, fluxoId, codigo);
    return true;
  } catch (error) {
    if (error instanceof PipeError && error.status === 403) return false;
    throw error;
  }
}

/* ------------------------------------------------------------------ Gestos */

const ator = (usuarioId: string): Ator => ({ tipo: 'usuario', id: usuarioId });

/** O contato vivo do tenant, ou 404 — o mesmo `fetch_inbox` de `ciclo-de-vida-do-fluxo.ts`. */
async function flowVivo(tx: TransactionPipe, tenantId: string, fluxoId: string): Promise<string> {
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
    nome: linha.nome,
    email: linha.email,
    roleInFlow: linha.papelNoFluxo as RoleInFlow,
    permissions: linha.permissoes ?? {},
    criadoEm: linha.criadoEm.toISOString(),
  };
}

const COLUNAS = {
  usuarioId: flowMember.userId,
  nome: user.nome,
  email: user.email,
  papelNoFluxo: flowMember.roleInFlow,
  permissoes: flowMember.permissions,
  criadoEm: flowMember.criadoEm,
};

/**
 * A lista de `TeamController._loadMembers()`. Ver a equipe é `team.ler`: o
 * modal de editar mostra o que cada um pode, e isso é informação de quem
 * administra o contato — não de quem só conversa nele.
 */
export async function listarEquipe(
  tx: TransactionPipe,
  tenantId: string,
  usuarioId: string,
  fluxoId: string,
): Promise<TeamOfFlow> {
  await flowVivo(tx, tenantId, fluxoId);
  await exigirPermissionInFlow(tx, usuarioId, fluxoId, 'team.ler');

  const linhas = await tx
    .select(COLUNAS)
    .from(flowMember)
    .innerJoin(user, eq(user.id, flowMember.userId))
    .where(eq(flowMember.flowId, fluxoId))
    .orderBy(asc(user.nome));

  return {
    members: linhas.map(forContract),
    recursos: [...RECURSOS_OF_FLOW],
    podeGerir: await canInFlow(tx, usuarioId, fluxoId, GERIR_EQUIPE),
  };
}

/** O que o menu do contato peneira — sempre responde, mesmo para quem não é membro. */
export async function myPermissionsInFlow(
  tx: TransactionPipe,
  tenantId: string,
  usuarioId: string,
  fluxoId: string,
): Promise<MyPermissionsInFlow> {
  await flowVivo(tx, tenantId, fluxoId);
  const linha = await member(tx, usuarioId, fluxoId);
  const { rows } = await tx.execute<{ tem: boolean }>(sql`
    select exists (
      select 1
        from usuario_papel up
        join papel_permissao pp on pp.papel_id = up.papel_id
       where up.usuario_id = ${usuarioId}::uuid and pp.permissao_codigo = ${EDITAR_FLOW}
    ) as tem
  `);
  return {
    papelNoFluxo: (linha?.roleInFlow as RoleInFlow | undefined) ?? null,
    permissoes: linha?.permissions ?? {},
    editaByAccount: rows[0]?.tem === true,
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
  /* A origem esconde as ações do `owner` (`ng-if="!user.owner"`); aqui não há
     dono, então a trava é numérica: um contato sem administrador nenhum é um
     contato que ninguém mais consegue administrar. */
  return PipeError.conflito(
    'last_admin',
    'Este é o último administrador do fluxo. Promova outra pessoa antes.',
  );
}

/**
 * `confirmAddUser()` — com a diferença que a origem confessa: lá, quem não está
 * no contrato é convidado como `guest` antes de entrar no bot; aqui o convite é
 * um gesto separado (`POST /v1/convites`, `dominio/convites.ts`), que abre a
 * própria transação e devolve o link para copiar, porque o Pipe não manda
 * e-mail. Então a recusa é a frase da própria origem, e a tela oferece o
 * convite em seguida.
 */
export async function adicionarMember(
  tx: TransactionPipe,
  tenantId: string,
  usuarioId: string,
  fluxoId: string,
  pedido: RequestOfMemberOfFlow,
): Promise<MemberOfFlow> {
  await flowVivo(tx, tenantId, fluxoId);
  await exigirPermissionInFlow(tx, usuarioId, fluxoId, GERIR_EQUIPE);

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
      fluxoId,
      usuarioId: pessoa.id,
      roleInFlow,
      permissions,
      convidadoPor: usuarioId,
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

  return forContract({ ...pessoa, userId: pessoa.id, roleInFlow, permissions, ...criado });
}

/** O "Salvar alterações" do modal de editar. Nada mudou, nada é gravado. */
export async function editarMember(
  tx: TransactionPipe,
  tenantId: string,
  usuarioId: string,
  fluxoId: string,
  alvoId: string,
  pedido: RequestOfMemberOfFlow,
): Promise<MemberOfFlow> {
  await flowVivo(tx, tenantId, fluxoId);
  await exigirPermissionInFlow(tx, usuarioId, fluxoId, GERIR_EQUIPE);

  const [atual] = await tx
    .select(COLUNAS)
    .from(flowMember)
    .innerJoin(user, eq(user.id, flowMember.userId))
    .where(and(eq(flowMember.flowId, fluxoId), eq(flowMember.userId, alvoId)))
    .limit(1);
  if (!atual) throw PipeError.naoEncontrado('membro');

  const papelNoFluxo =
    pedido.papelNoFluxo === undefined
      ? (atual.papelNoFluxo as RoleInFlow)
      : roleChecked(pedido.papelNoFluxo);
  const permissoes = permissionsOfRole(
    papelNoFluxo,
    pedido.permissoes === undefined
      ? (atual.permissoes ?? {})
      : permissionsChecked(pedido.permissoes),
  );

  /* Achatado (um campo por recurso) porque `diferenca` compara por `===`: dois
     mapas iguais são objetos diferentes, e sem achatar todo Salvar viraria
     mudança. De quebra o log diz QUAL linha da lista mudou. */
  const mudanca = diferenca(
    { papelNoFluxo: atual.papelNoFluxo, ...(atual.permissoes ?? {}) },
    { papelNoFluxo, ...permissoes },
  );
  if (Object.keys(mudanca.depois).length === 0) return forContract(atual);

  if (atual.papelNoFluxo === 'admin' && papelNoFluxo !== 'admin') {
    if ((await outrosAdmins(tx, fluxoId, alvoId)) === 0) throw ultimoAdmin();
  }

  await tx
    .update(flowMember)
    .set({ papelNoFluxo, permissoes, atualizadoEm: new Date() })
    .where(and(eq(flowMember.flowId, fluxoId), eq(flowMember.userId, alvoId)));

  await registrarAuditoria(tx, tenantId, {
    ator: ator(usuarioId),
    acao: 'alterou',
    objetoTipo: 'fluxo_membro',
    objetoId: alvoId,
    antes: { fluxoId, ...mudanca.antes },
    depois: mudanca.depois,
  });

  return forContract({ ...atual, papelNoFluxo, permissoes });
}

/** `removeUser()` — e a trava do último administrador, que a origem não precisa ter. */
export async function removeMember(
  tx: TransactionPipe,
  tenantId: string,
  usuarioId: string,
  fluxoId: string,
  alvoId: string,
): Promise<void> {
  await flowVivo(tx, tenantId, fluxoId);
  await exigirPermissionInFlow(tx, usuarioId, fluxoId, GERIR_EQUIPE);

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
