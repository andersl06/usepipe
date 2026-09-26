import { sql } from 'drizzle-orm';
import { noTenant } from './database.js';
import { ausente, collection, falha, ok, partirUri, TYPE_DOCUMENT, TIPO_TICKET } from './lime.js';
import type { ComandoLime, RespostaLime } from './lime.js';
import { asAccount, asDocuments, comoTicket, comoTime } from './translation.js';
import type { ConversationRow, MessageRow } from './translation.js';
import { loadGlobal, carregarRascunho, saveFlow } from './builder.js';
import {
  assumirProximo,
  identityConversation,
  encerrar,
  responder,
  transferForQueue,
} from './actions.js';

/**
 * LIME command router. A route not implemented here returns `null`, letting the lab fall back to its mock. This allows command-by-command migration without breaking the copied screen.
 */

export interface Session {
  tenantId: string;
  userId: string;
  email: string;
  name: string | null;
}

interface Context {
  session: Session;
  path: string;
  query: URLSearchParams;
  cmd: ComandoLime;
}

type Manipulador = (ctx: Context) => Promise<RespostaLime>;


type Rota = [RegExp, Manipulador, string[]?];

const COLUNAS = `
  c.id, c.estado, c.prioridade, c.criada_em, c.atribuida_em, c.encerrada_em,
  c.ultima_mensagem_em, c.ultima_mensagem_de, c.fila_id, f.nome as fila_nome,
  c.atendente_id, u.nome as atendente_nome, u.email as atendente_email,
  ct.id as contato_id, ct.nome as contato_nome, ct.telefone_e164 as contato_telefone,
  ca.tipo as canal_tipo,
  (select m.conteudo from mensagem m
    where m.conversa_id = c.id order by m.criada_em desc limit 1) as ultima_mensagem_texto,
  (select count(*)::int from mensagem m
    where m.conversa_id = c.id and m.direcao = 'entrada' and m.lida_em is null) as nao_lidas
`;

const DE = `
  from conversa c
  join contato ct on ct.id = c.contato_id
  join inbox ib on ib.id = c.inbox_id
  join canal ca on ca.id = ib.canal_id
  left join fila f on f.id = c.fila_id
  left join usuario u on u.id = c.atendente_id
`;


const ABERTAS = `c.estado in ('na_fila','atribuida','em_atendimento','em_espera')`;

async function conversationsOpen(session: Session, limite = 100): Promise<ConversationRow[]> {
  return noTenant(session.tenantId, async (tx) => {
    const { rows } = await tx.execute<ConversationRow>(sql`
      select ${sql.raw(COLUNAS)} ${sql.raw(DE)}
       where ${sql.raw(ABERTAS)}
       order by c.ultima_mensagem_em desc nulls last, c.criada_em desc
       limit ${limite}
    `);
    return rows;
  });
}

/*
 * Routes containing slashes use `new RegExp` with a character class, rather than regex literals. Escaped slashes did not survive the scripts editing this file and broke it three times.
 */
const ROTA_PING = new RegExp('^[/]ping');
const ROTA_AGORA = new RegExp('^[/]now');
const ROTA_RECIBO = new RegExp('^[/]receipt');
/* Anchor this route so it cannot also match `/accounts/{email}`, a different resource. */
const ROUTE_ACCOUNT = new RegExp('^[/]account(\\?|$)');
const ROTA_INFO_AGENTE = new RegExp('^[/]agents[/]info');
const ROUTE_QUEUES = new RegExp('^[/]attendance-teams');
const ROTA_TICKETS = new RegExp('^[/]tickets(\\?|$)');
const ROTA_TICKETS_ATIVOS = new RegExp('^[/]tickets[/]active');
const ROUTE_MESSAGES = new RegExp('^[/]tickets[/][^/]*[/]messages');
const ROTA_TICKET = new RegExp('^[/]tickets[/][^/]+');

const ROUTE_FLOW_DRAFT = new RegExp('^[/]buckets[/]blip_portal:builder_working_flow');
const ROUTE_ACTIONS_GLOBAL = new RegExp('^[/]buckets[/]blip_portal:builder_working_global_actions');
const ROUTE_FLOW_PUBLISHED = new RegExp('^[/]buckets[/]blip_portal:builder_published_flow');

/*
 * Agent action URIs are observed screen calls from the bundle, recorded in `referencias-blip/pesquisa/blip-desk-regras-tecnicas.md`.
 */
const ROTA_ASSUMIR = new RegExp('^[/]tickets[/]claim');
const ROTA_CONFIRMA = new RegExp('^[/]tickets[/][^/]+[/]confirm-received');
const ROTA_ENCERRAR = new RegExp('^[/]tickets[/][^/]+[/]close');
const ROTA_MUDAR_STATUS = new RegExp('^[/]tickets[/]change-status');
const ROTA_TRANSFERIR = new RegExp('^[/]tickets[/][^/]+[/]transfer');
/*
 * Replying is not a command: the screen calls `sendMessage` on the client, and the lab converts that call to this bridge-specific URI.
 */
const ROTA_RESPONDER = new RegExp('^[/]pipe[/]responder');

const rotas: Rota[] = [

  [ROTA_PING, async () => ok({})],
  [ROTA_AGORA, async () => ok({ now: new Date().toISOString() })],
  [ROTA_RECIBO, async () => ok({})],

  /*
   * Place agent actions before ticket read routes: `/tickets/{id}/close` also matches `/tickets/{id}`, so the first matching handler wins.
   */
  [
    ROTA_ASSUMIR,
    async ({ session }) => {
      const id = await assumirProximo(session);
      // When the queue is empty, the screen expects an empty collection rather than an error.
      return id ? ok({ id }, TIPO_TICKET) : collection([], TIPO_TICKET);
    },
    ['get', 'set'],
  ],
  [ROTA_CONFIRMA, async () => ok({}), ['set']],
  [
    ROTA_ENCERRAR,
    async ({ session, path, cmd }) => {
      const id = path.split('/')[2] ?? '';
      const r = (cmd.resource ?? {}) as { tags?: string[] };
      await encerrar(session, id, r.tags ?? []);
      return ok({});
    },
    ['set'],
  ],
  [
    ROTA_MUDAR_STATUS,
    async ({ session, cmd }) => {
      const r = (cmd.resource ?? {}) as { id?: string; status?: string; tags?: string[] };
      /*
       * The screen uses this command to close when status begins with `Closed`, and for other changes not yet translated. Return an empty response for non-close changes rather than performing the wrong database operation.
       */
      if (!r.id || !String(r.status ?? '').startsWith('Closed')) return ok({});
      await encerrar(session, r.id, r.tags ?? []);
      return ok({});
    },
    ['set'],
  ],
  [
    ROTA_TRANSFERIR,
    async ({ session, path, cmd }) => {
      const id = path.split('/')[2] ?? '';
      const r = (cmd.resource ?? {}) as { team?: string; agentIdentity?: string };
      // Transfer to a specific agent is not supported yet; only queue transfer is.
      if (!r.team || r.team === 'DIRECT_TRANSFER') {
        return falha(4, 'transferência para atendente específico ainda não');
      }
      await transferForQueue(session, id, r.team);
      return ok({});
    },
    ['set'],
  ],
  [
    ROTA_RESPONDER,
    async ({ session, cmd }) => {
      const r = (cmd.resource ?? {}) as { conversationId?: string; para?: string; texto?: string };
      if (!r.texto) return falha(5, 'faltou o texto');
      /*
       * The screen addresses an identity, not a conversation; resolve its open conversation by phone number.
       */
      const conversationId = r.conversationId ?? (r.para ? await identityConversation(session, r.para) : null);
      if (!conversationId) return falha(6, 'não achei conversa aberta para este contato');
      return ok(await responder(session, conversationId, r.texto));
    },
    ['set'],
  ],


  [
    ROUTE_ACCOUNT,
    async ({ session }) => {
      const data = await noTenant(session.tenantId, async (tx) => {
        const { rows: state } = await tx.execute<{ state: string }>(sql`
          select estado as "state" from status_atendente where usuario_id = ${session.userId}::uuid limit 1
        `);
        const { rows: queues } = await tx.execute<{ nome: string }>(sql`
          select f.nome from fila f
            join fila_atendente fa on fa.fila_id = f.id
           where fa.usuario_id = ${session.userId}::uuid
           order by f.nome
        `);
        /*
         * The screen uses `isOwner` to enable administration items in the sidebar. Returning `false` for an administrator hides half the navigation.
         */
        const { rows: admin } = await tx.execute<{ existe: number }>(sql`
          select 1 as existe from usuario_papel up
            join papel p on p.id = up.papel_id
           where up.usuario_id = ${session.userId}::uuid and p.nome = 'administrador'
           limit 1
        `);
        return {
          estado: state[0]?.state ?? 'offline',
          filas: queues.map((f) => f.nome),
          ehAdministrador: admin.length > 0,
        };
      });
      return ok(
        asAccount(
          {
            id: session.userId,
            nome: session.name,
            email: session.email,
            state: data.estado,
            ehAdministrador: data.ehAdministrador,
          },
          data.filas,
        ),
      );
    },
  ],

  /* ---- o contador do topo da lista ---- */
  [
    ROTA_INFO_AGENTE,
    async ({ session }) => {
      const linhas = await conversationsOpen(session, 500);
      const inQueue = linhas.filter((l) => l.state === 'na_fila').length;
      const minhas = linhas.filter((l) => l.agentId === session.userId);
      return ok(
        {
          status: 'Online',
          waitingTicketsCount: inQueue,
          waitingClaimableTicketsCount: inQueue,
          readingTime: '00:00:00',
          openedTicketsIdsList: minhas.map((l) => l.id),
        },
        'application/vnd.iris.desk.attendant-tickets-info+json',
      );
    },
  ],

  /* ---- as filas do cliente ---- */
  [
    ROUTE_QUEUES,
    async ({ session }) => {
      const queues = await noTenant(session.tenantId, async (tx) => {
        const { rows } = await tx.execute<{ id: string; nome: string }>(
          sql`select id, nome from fila order by nome`,
        );
        return rows;
      });
      return collection(queues.map(comoTime));
    },
  ],

  /*
   * On opening a conversation, Desk briefly asks for `/tickets//messages` with an empty ID. The source returns an empty collection rather than an error, so the screen continues.
   */
  [
    ROUTE_MESSAGES,
    async ({ session, path }) => {
      const id = path.split('/')[2];
      if (!id) return collection([], TYPE_DOCUMENT);
      const linhas = await noTenant(session.tenantId, async (tx) => {
        const { rows } = await tx.execute<MessageRow>(sql`
          select id, criada_em, direcao as direction, autor_tipo, tipo, conteudo
            from mensagem
           where conversa_id = ${id}::uuid
           order by criada_em
           limit 200
        `);
        return rows;
      });
      return collection(asDocuments(linhas), TYPE_DOCUMENT);
    },
  ],

  /* ---- as listas ---- */
  [
    ROTA_TICKETS_ATIVOS,
    async ({ session }) => {
      const linhas = await conversationsOpen(session);
      const minhas = linhas.filter((l) => l.agentId === session.userId);
      return collection(
        minhas.map((l) => comoTicket(l)),
        TIPO_TICKET,
      );
    },
  ],
  [
    ROTA_TICKETS,
    async ({ session }) => {
      const linhas = await conversationsOpen(session);
      return collection(
        linhas.map((l) => comoTicket(l)),
        TIPO_TICKET,
      );
    },
  ],
  [
    ROTA_TICKET,
    async ({ session, path }) => {
      const id = path.split('/')[2] ?? '';
      const linha = await noTenant(session.tenantId, async (tx) => {
        const { rows } = await tx.execute<ConversationRow>(sql`
          select ${sql.raw(COLUNAS)} ${sql.raw(DE)} where c.id = ${id}::uuid limit 1
        `);
        return rows[0] ?? null;
      });
      return ok(linha ? comoTicket(linha) : {}, TIPO_TICKET);
    },
  ],


  [
    ROUTE_FLOW_DRAFT,
    async ({ session, cmd }) => {
      if (cmd.method === 'get') {
        const mapa = await carregarRascunho(session);
        return mapa ? ok(mapa) : ausente();
      }
      const global = await loadGlobal(session);
      const r = await saveFlow(session, cmd.resource as Record<string, unknown>, global, false);
      return ok({
        versao: r.versao,
        naoSuportado: r.naoSuportado,
        erroDeValidacao: r.validationError,
      });
    },
    ['get', 'set'],
  ],
  [
    ROUTE_ACTIONS_GLOBAL,
    async ({ session, cmd }) => {
      if (cmd.method === 'get') {
        const global = await loadGlobal(session);
        return global ? ok(global) : ausente();
      }
      const mapa = await carregarRascunho(session);
      if (!mapa) return ok({});
      await saveFlow(session, mapa, cmd.resource as Record<string, unknown>, false);
      return ok({});
    },
    ['get', 'set'],
  ],
  [
    ROUTE_FLOW_PUBLISHED,
    async ({ session, cmd }) => {
      if (cmd.method === 'get') {
        const mapa = await carregarRascunho(session);
        return mapa ? ok(mapa) : ausente();
      }
      const global = await loadGlobal(session);
      const r = await saveFlow(session, cmd.resource as Record<string, unknown>, global, true);
      /*
       * Do not silently publish an invalid flow: the engine would refuse to run it, and the person who published it needs the reason.
       */
      if (r.validationError) return ok({ publicado: false, erro: r.validationError });
      return ok({ publicado: r.publicado, versao: r.versao });
    },
    ['get', 'set'],
  ],
];

/**
 * Return `null` when the bridge cannot answer yet, so the lab uses its mock. Never substitute fabricated data.
 */
export async function despachar(cmd: ComandoLime, session: Session): Promise<RespostaLime | null> {
  const { caminho, query } = partirUri(cmd.uri);
  for (const [padrao, manipulador, metodos] of rotas) {
    if (!padrao.test(caminho)) continue;
    if (!(metodos ?? ['get']).includes(cmd.method)) return null;
    return manipulador({ session, path: caminho, query, cmd });
  }
  return null;
}

export const CAMINHOS_ATENDIDOS = rotas.map(([p]) => p.source);
