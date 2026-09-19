import { and, asc, eq, ne, sql } from 'drizzle-orm';
import { diferenca, registrarAuditoria } from '@pipe/db';
import type { Ator, TransacaoPipe } from '@pipe/db';
import { fluxo, fluxoMembro, usuario } from '@pipe/db/schema';
import type {
  EquipeDoFluxo,
  MembroDoFluxo,
  MinhasPermissoesNoFluxo,
  NivelNoFluxo,
  PapelNoFluxo,
  PedidoDeMembroDoFluxo,
  PermissoesNoFluxo,
  RecursoDoFluxo,
} from '@pipe/contracts';
import { ErroPipe } from '../../erros.js';
import { exigirPermissao } from '../../sessao.js';

/**
 * O `EDITAR_FLUXO` de `ciclo-de-vida-do-fluxo.ts`, repetido aqui de propósito:
 * aquele arquivo passou a chamar `exigirPermissaoNoFluxo`, e importar a
 * constante de volta fecharia um ciclo entre os dois módulos.
 */
const EDITAR_FLUXO = 'automacao.fluxo.editar';

/**
 * A aba "Equipe" do contato — o `/team` da origem, e o RBAC POR FLUXO que ele
 * pressupõe.
 *
 * Na origem a permissão é do BOT, não do contrato: `getUsersAccounts`
 * (`/applications/{shortName}@msging.net/users/accounts`) cruzado com
 * `getApplicationUsersPermissions` (`.../permissions`), tudo por contato
 * (`TeamController._loadMembers`). A pesquisa mede isso no objeto real —
 * `docs/pesquisa/blip-identidade-tenant-permissao.md` §3: "a permissão não é do
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
export const RECURSOS_DO_FLUXO: readonly RecursoDoFluxo[] = [
  { chave: 'payments', titulo: 'Integrações' },
  { chave: 'channels', titulo: 'Canais' },
  { chave: 'desk', titulo: 'Atendimento' },
  { chave: 'users', titulo: 'Usuários do bot' },
  { chave: 'basicConfigurations', titulo: 'Configurações básicas' },
  { chave: 'connectionInformations', titulo: 'Informações de conexões' },
  { chave: 'resources', titulo: 'Recursos' },
  { chave: 'growth', titulo: 'Growth' },
  { chave: 'logMessages', titulo: 'Log de mensagens' },
  { chave: 'builder', titulo: 'Builder' },
  { chave: 'analysis', titulo: 'Análise' },
  { chave: 'team', titulo: 'Equipe' },
];

const CHAVES = new Set(RECURSOS_DO_FLUXO.map((r) => r.chave));

const PAPEIS: readonly PapelNoFluxo[] = ['visualizar', 'personalizado', 'editar', 'admin'];
const NIVEIS: readonly NivelNoFluxo[] = ['nenhum', 'ler', 'escrever'];

/**
 * O código de CONTA equivalente a cada recurso do fluxo — o outro lado do duplo
 * portão. Hoje é `automacao.fluxo.editar` para todos: o catálogo da 0019 tem um
 * verbo só para fluxo ("Cria e edita chatbots"), sem `automacao.fluxo.ler`
 * separado (o comentário de `paginas/fluxo/equipe/permissoes.ts` registra isso).
 * A constante existe porque a granularidade do fluxo é fina e a da conta não é:
 * quando `desk`/`payments` ganharem permissão de conta própria, é aqui que a
 * equivalência muda, e nenhuma rota precisa saber.
 */
const EQUIVALENTE_NA_CONTA: Readonly<Record<string, string>> = Object.fromEntries(
  RECURSOS_DO_FLUXO.map((r) => [r.chave, EDITAR_FLUXO]),
);

/** O recurso que governa a própria aba Equipe. */
const GERIR_EQUIPE = 'team.escrever';

/* ----------------------------------------------------------------- Regras */

/**
 * `selectAllPermissions()` da origem: o nível de cima marca os rádios de baixo.
 * Só `personalizado` lê o que veio da tela — nos outros três o traço manda, e
 * gravar outra coisa deixaria o banco contradizendo o que a pessoa vê.
 */
export function permissoesDoPapel(
  papel: PapelNoFluxo,
  personalizadas: PermissoesNoFluxo = {},
): PermissoesNoFluxo {
  if (papel === 'personalizado') {
    const mapa: PermissoesNoFluxo = {};
    for (const recurso of RECURSOS_DO_FLUXO) {
      const nivel = personalizadas[recurso.chave];
      mapa[recurso.chave] = nivel && NIVEIS.includes(nivel) ? nivel : 'nenhum';
    }
    return mapa;
  }
  const nivel: NivelNoFluxo = papel === 'visualizar' ? 'ler' : 'escrever';
  return Object.fromEntries(RECURSOS_DO_FLUXO.map((r) => [r.chave, nivel]));
}

function papelConferido(bruto: unknown): PapelNoFluxo {
  if (typeof bruto === 'string' && (PAPEIS as readonly string[]).includes(bruto)) {
    return bruto as PapelNoFluxo;
  }
  throw ErroPipe.requisicao(
    'papel_no_fluxo_invalido',
    `A permissão precisa ser uma de: ${PAPEIS.join(', ')}.`,
  );
}

/** Chave que a origem não tem é descartada; nível inválido é recusa, não silêncio. */
function permissoesConferidas(bruto: unknown): PermissoesNoFluxo {
  if (bruto === undefined || bruto === null) return {};
  if (typeof bruto !== 'object') {
    throw ErroPipe.requisicao('permissoes_invalidas', 'As permissões precisam ser um objeto.');
  }
  const mapa: PermissoesNoFluxo = {};
  for (const [chave, valor] of Object.entries(bruto as Record<string, unknown>)) {
    if (!CHAVES.has(chave)) continue;
    if (typeof valor !== 'string' || !(NIVEIS as readonly string[]).includes(valor)) {
      throw ErroPipe.requisicao(
        'nivel_invalido',
        `O nível de "${chave}" precisa ser um de: ${NIVEIS.join(', ')}.`,
      );
    }
    mapa[chave] = valor as NivelNoFluxo;
  }
  return mapa;
}

/** `ler` se contenta com `escrever`; `escrever` não se contenta com `ler`. */
function atende(nivel: NivelNoFluxo | undefined, verbo: NivelNoFluxo): boolean {
  if (verbo === 'ler') return nivel === 'ler' || nivel === 'escrever';
  return nivel === verbo;
}

/* ------------------------------------------------------------- A permissão */

interface LinhaDeMembro {
  papelNoFluxo: string;
  permissoes: PermissoesNoFluxo;
}

async function membro(
  tx: TransacaoPipe,
  usuarioId: string,
  fluxoId: string,
): Promise<LinhaDeMembro | undefined> {
  const [linha] = await tx
    .select({ papelNoFluxo: fluxoMembro.papelNoFluxo, permissoes: fluxoMembro.permissoes })
    .from(fluxoMembro)
    .where(and(eq(fluxoMembro.fluxoId, fluxoId), eq(fluxoMembro.usuarioId, usuarioId)))
    .limit(1);
  return linha;
}

/** `<recurso>.<verbo>` → as duas metades, ou recusa de programação. */
function separar(codigo: string): { recurso: string; verbo: NivelNoFluxo } {
  const corte = codigo.lastIndexOf('.');
  const recurso = corte < 0 ? codigo : codigo.slice(0, corte);
  const verbo = corte < 0 ? '' : codigo.slice(corte + 1);
  if (!CHAVES.has(recurso) || !(NIVEIS as readonly string[]).includes(verbo)) {
    throw new Error(`permissão de fluxo desconhecida: ${codigo}`);
  }
  return { recurso, verbo: verbo as NivelNoFluxo };
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
export async function exigirPermissaoNoFluxo(
  tx: TransacaoPipe,
  usuarioId: string,
  fluxoId: string,
  codigo: string,
): Promise<void> {
  const { recurso, verbo } = separar(codigo);
  const linha = await membro(tx, usuarioId, fluxoId);
  if (linha) {
    if (linha.papelNoFluxo === 'admin') return;
    if (atende(linha.permissoes[recurso], verbo)) return;
  }
  await exigirPermissao(tx, usuarioId, EQUIVALENTE_NA_CONTA[recurso] ?? EDITAR_FLUXO);
}

/** O mesmo teste sem estourar — para a tela decidir o que desenhar. */
export async function podeNoFluxo(
  tx: TransacaoPipe,
  usuarioId: string,
  fluxoId: string,
  codigo: string,
): Promise<boolean> {
  try {
    await exigirPermissaoNoFluxo(tx, usuarioId, fluxoId, codigo);
    return true;
  } catch (erro) {
    if (erro instanceof ErroPipe && erro.status === 403) return false;
    throw erro;
  }
}

/* ------------------------------------------------------------------ Gestos */

const ator = (usuarioId: string): Ator => ({ tipo: 'usuario', id: usuarioId });

/** O contato vivo do tenant, ou 404 — o mesmo `fetch_inbox` de `ciclo-de-vida-do-fluxo.ts`. */
async function fluxoVivo(tx: TransacaoPipe, tenantId: string, fluxoId: string): Promise<string> {
  const [atual] = await tx
    .select({ id: fluxo.id })
    .from(fluxo)
    .where(and(eq(fluxo.tenantId, tenantId), eq(fluxo.id, fluxoId), ne(fluxo.estado, 'arquivado')))
    .limit(1);
  if (!atual) throw ErroPipe.naoEncontrado('fluxo');
  return atual.id;
}

function paraContrato(linha: {
  usuarioId: string;
  nome: string;
  email: string;
  papelNoFluxo: string;
  permissoes: PermissoesNoFluxo;
  criadoEm: Date;
}): MembroDoFluxo {
  return {
    usuarioId: linha.usuarioId,
    nome: linha.nome,
    email: linha.email,
    papelNoFluxo: linha.papelNoFluxo as PapelNoFluxo,
    permissoes: linha.permissoes ?? {},
    criadoEm: linha.criadoEm.toISOString(),
  };
}

const COLUNAS = {
  usuarioId: fluxoMembro.usuarioId,
  nome: usuario.nome,
  email: usuario.email,
  papelNoFluxo: fluxoMembro.papelNoFluxo,
  permissoes: fluxoMembro.permissoes,
  criadoEm: fluxoMembro.criadoEm,
};

/**
 * A lista de `TeamController._loadMembers()`. Ver a equipe é `team.ler`: o
 * modal de editar mostra o que cada um pode, e isso é informação de quem
 * administra o contato — não de quem só conversa nele.
 */
export async function listarEquipe(
  tx: TransacaoPipe,
  tenantId: string,
  usuarioId: string,
  fluxoId: string,
): Promise<EquipeDoFluxo> {
  await fluxoVivo(tx, tenantId, fluxoId);
  await exigirPermissaoNoFluxo(tx, usuarioId, fluxoId, 'team.ler');

  const linhas = await tx
    .select(COLUNAS)
    .from(fluxoMembro)
    .innerJoin(usuario, eq(usuario.id, fluxoMembro.usuarioId))
    .where(eq(fluxoMembro.fluxoId, fluxoId))
    .orderBy(asc(usuario.nome));

  return {
    membros: linhas.map(paraContrato),
    recursos: [...RECURSOS_DO_FLUXO],
    podeGerir: await podeNoFluxo(tx, usuarioId, fluxoId, GERIR_EQUIPE),
  };
}

/** O que o menu do contato peneira — sempre responde, mesmo para quem não é membro. */
export async function minhasPermissoesNoFluxo(
  tx: TransacaoPipe,
  tenantId: string,
  usuarioId: string,
  fluxoId: string,
): Promise<MinhasPermissoesNoFluxo> {
  await fluxoVivo(tx, tenantId, fluxoId);
  const linha = await membro(tx, usuarioId, fluxoId);
  const { rows } = await tx.execute<{ tem: boolean }>(sql`
    select exists (
      select 1
        from usuario_papel up
        join papel_permissao pp on pp.papel_id = up.papel_id
       where up.usuario_id = ${usuarioId}::uuid and pp.permissao_codigo = ${EDITAR_FLUXO}
    ) as tem
  `);
  return {
    papelNoFluxo: (linha?.papelNoFluxo as PapelNoFluxo | undefined) ?? null,
    permissoes: linha?.permissoes ?? {},
    editaPelaConta: rows[0]?.tem === true,
  };
}

/** Quantos administradores este fluxo tem, fora `exceto`. */
async function outrosAdmins(tx: TransacaoPipe, fluxoId: string, exceto: string): Promise<number> {
  const { rows } = await tx.execute<{ n: string }>(sql`
    select count(*)::text as n from fluxo_membro
     where fluxo_id = ${fluxoId}::uuid and papel_no_fluxo = 'admin'
       and usuario_id <> ${exceto}::uuid
  `);
  return Number(rows[0]?.n ?? '0');
}

function ultimoAdmin(): ErroPipe {
  /* A origem esconde as ações do `owner` (`ng-if="!user.owner"`); aqui não há
     dono, então a trava é numérica: um contato sem administrador nenhum é um
     contato que ninguém mais consegue administrar. */
  return ErroPipe.conflito(
    'ultimo_admin',
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
export async function adicionarMembro(
  tx: TransacaoPipe,
  tenantId: string,
  usuarioId: string,
  fluxoId: string,
  pedido: PedidoDeMembroDoFluxo,
): Promise<MembroDoFluxo> {
  await fluxoVivo(tx, tenantId, fluxoId);
  await exigirPermissaoNoFluxo(tx, usuarioId, fluxoId, GERIR_EQUIPE);

  const email = (pedido.email ?? '').trim().toLowerCase();
  if (!email) throw ErroPipe.requisicao('email_ausente', 'Informe o e-mail de quem entra.');

  const [pessoa] = await tx
    .select({ id: usuario.id, nome: usuario.nome, email: usuario.email })
    .from(usuario)
    .where(and(eq(usuario.email, email), eq(usuario.ativo, true)))
    .limit(1);
  if (!pessoa) {
    throw ErroPipe.requisicao(
      'pessoa_fora_do_contrato',
      'Essa pessoa não faz parte do contrato. O administrador deve incluir a pessoa no ' +
        'contrato antes de adicioná-la ao chatbot.',
      { email },
    );
  }

  const papelNoFluxo = papelConferido(pedido.papelNoFluxo ?? 'visualizar');
  const permissoes = permissoesDoPapel(papelNoFluxo, permissoesConferidas(pedido.permissoes));

  const [criado] = await tx
    .insert(fluxoMembro)
    .values({
      tenantId,
      fluxoId,
      usuarioId: pessoa.id,
      papelNoFluxo,
      permissoes,
      convidadoPor: usuarioId,
    })
    .onConflictDoNothing({ target: [fluxoMembro.fluxoId, fluxoMembro.usuarioId] })
    .returning({ criadoEm: fluxoMembro.criadoEm });
  if (!criado) {
    throw ErroPipe.conflito('ja_e_membro', `${email} já faz parte da equipe deste fluxo.`);
  }

  await registrarAuditoria(tx, tenantId, {
    ator: ator(usuarioId),
    acao: 'criou',
    objetoTipo: 'fluxo_membro',
    objetoId: pessoa.id,
    depois: { fluxoId, email, papelNoFluxo, permissoes },
  });

  return paraContrato({ ...pessoa, usuarioId: pessoa.id, papelNoFluxo, permissoes, ...criado });
}

/** O "Salvar alterações" do modal de editar. Nada mudou, nada é gravado. */
export async function editarMembro(
  tx: TransacaoPipe,
  tenantId: string,
  usuarioId: string,
  fluxoId: string,
  alvoId: string,
  pedido: PedidoDeMembroDoFluxo,
): Promise<MembroDoFluxo> {
  await fluxoVivo(tx, tenantId, fluxoId);
  await exigirPermissaoNoFluxo(tx, usuarioId, fluxoId, GERIR_EQUIPE);

  const [atual] = await tx
    .select(COLUNAS)
    .from(fluxoMembro)
    .innerJoin(usuario, eq(usuario.id, fluxoMembro.usuarioId))
    .where(and(eq(fluxoMembro.fluxoId, fluxoId), eq(fluxoMembro.usuarioId, alvoId)))
    .limit(1);
  if (!atual) throw ErroPipe.naoEncontrado('membro');

  const papelNoFluxo =
    pedido.papelNoFluxo === undefined
      ? (atual.papelNoFluxo as PapelNoFluxo)
      : papelConferido(pedido.papelNoFluxo);
  const permissoes = permissoesDoPapel(
    papelNoFluxo,
    pedido.permissoes === undefined
      ? (atual.permissoes ?? {})
      : permissoesConferidas(pedido.permissoes),
  );

  /* Achatado (um campo por recurso) porque `diferenca` compara por `===`: dois
     mapas iguais são objetos diferentes, e sem achatar todo Salvar viraria
     mudança. De quebra o log diz QUAL linha da lista mudou. */
  const mudanca = diferenca(
    { papelNoFluxo: atual.papelNoFluxo, ...(atual.permissoes ?? {}) },
    { papelNoFluxo, ...permissoes },
  );
  if (Object.keys(mudanca.depois).length === 0) return paraContrato(atual);

  if (atual.papelNoFluxo === 'admin' && papelNoFluxo !== 'admin') {
    if ((await outrosAdmins(tx, fluxoId, alvoId)) === 0) throw ultimoAdmin();
  }

  await tx
    .update(fluxoMembro)
    .set({ papelNoFluxo, permissoes, atualizadoEm: new Date() })
    .where(and(eq(fluxoMembro.fluxoId, fluxoId), eq(fluxoMembro.usuarioId, alvoId)));

  await registrarAuditoria(tx, tenantId, {
    ator: ator(usuarioId),
    acao: 'alterou',
    objetoTipo: 'fluxo_membro',
    objetoId: alvoId,
    antes: { fluxoId, ...mudanca.antes },
    depois: mudanca.depois,
  });

  return paraContrato({ ...atual, papelNoFluxo, permissoes });
}

/** `removeUser()` — e a trava do último administrador, que a origem não precisa ter. */
export async function removerMembro(
  tx: TransacaoPipe,
  tenantId: string,
  usuarioId: string,
  fluxoId: string,
  alvoId: string,
): Promise<void> {
  await fluxoVivo(tx, tenantId, fluxoId);
  await exigirPermissaoNoFluxo(tx, usuarioId, fluxoId, GERIR_EQUIPE);

  const [atual] = await tx
    .select({
      papelNoFluxo: fluxoMembro.papelNoFluxo,
      permissoes: fluxoMembro.permissoes,
      email: usuario.email,
    })
    .from(fluxoMembro)
    .innerJoin(usuario, eq(usuario.id, fluxoMembro.usuarioId))
    .where(and(eq(fluxoMembro.fluxoId, fluxoId), eq(fluxoMembro.usuarioId, alvoId)))
    .limit(1);
  if (!atual) throw ErroPipe.naoEncontrado('membro');

  if (atual.papelNoFluxo === 'admin' && (await outrosAdmins(tx, fluxoId, alvoId)) === 0) {
    throw ultimoAdmin();
  }

  await tx
    .delete(fluxoMembro)
    .where(and(eq(fluxoMembro.fluxoId, fluxoId), eq(fluxoMembro.usuarioId, alvoId)));

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
