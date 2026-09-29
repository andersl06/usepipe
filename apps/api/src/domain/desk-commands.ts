import { sql, type SQL } from 'drizzle-orm';
import type { CommandMatch } from '@pipe/core';
import type { TransactionPipe } from '@pipe/db';

/**
 * Desk read commands a bot sends to `postmaster@desk.msging.net`, answered from Pipe data in Blip's
 * shapes (`application/vnd.iris.ticket+json`, `…desk.team+json`, `…desk.attendant+json`) because
 * imported flows parse the response JSON directly (`resource.items[0]`, `agentsOnline`). A conversation
 * is the ticket; a queue is the team; a queue member is the attendant. Every query filters by tenant
 * explicitly in addition to RLS.
 */

export type CommandResponse = Record<string, unknown>;
export type CommandHandler = (tx: TransactionPipe, tenantId: string, command: CommandMatch) => Promise<CommandResponse>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const success = (type: string, resource: unknown): CommandResponse => ({ method: 'get', status: 'success', type, resource });

const collection = (itemType: string, items: unknown[]): CommandResponse =>
  success('application/vnd.lime.collection+json', { total: items.length, itemType, items });

/** LIME `Resource not found` (reason 67), which Blip answers instead of throwing. */
const notFound = (description: string): CommandResponse => ({
  method: 'get',
  status: 'failure',
  reason: { code: 67, description },
});

/** Blip agent identity: the e-mail with `@` escaped, on the `blip.ai` domain. */
export const agentIdentity = (email: string): string => `${email.replace('@', '%40')}@blip.ai`;

const AGENT_STATUS: Readonly<Record<string, string>> = {
  online: 'Online',
  pausa: 'Pause',
  invisivel: 'Invisible',
  offline: 'Offline',
};

type TicketRow = {
  id: string;
  sequentialId: number;
  customerIdentity: string;
  agentEmail: string | null;
  closedByEmail: string | null;
  status: string;
  closed: boolean;
  team: string | null;
  tags: string[];
  storageDate: Date | string | null;
  openDate: Date | string | null;
  firstResponseDate: Date | string | null;
  closeDate: Date | string | null;
};

const iso = (v: Date | string | null): string | undefined => (v ? new Date(v).toISOString() : undefined);

export function ticketOf(row: TicketRow): Record<string, unknown> {
  const ticket: Record<string, unknown> = {
    id: row.id,
    sequentialId: row.sequentialId,
    customerIdentity: row.customerIdentity,
    agentIdentity: row.agentEmail ? agentIdentity(row.agentEmail) : undefined,
    status: row.status,
    team: row.team ?? undefined,
    storageDate: iso(row.storageDate),
    openDate: iso(row.openDate),
    firstResponseDate: iso(row.firstResponseDate),
    closeDate: iso(row.closeDate),
    closed: row.closed,
    closedBy: row.closedByEmail ? agentIdentity(row.closedByEmail) : undefined,
    tags: row.tags,
  };
  // Blip omits absent fields; flows test them with `exists` (e.g. `ticket@openDate`).
  for (const key of Object.keys(ticket)) if (ticket[key] === undefined) delete ticket[key];
  return ticket;
}

/**
 * Tickets in Blip's vocabulary. Status: `na_fila` → Waiting, `atribuida` → Assigned, `em_atendimento`/
 * `em_espera` → Open, `encerrada` → the closing actor (the same map the `desk:` block uses).
 * ponytail: `sequentialId` counts the tenant's conversations up to this one (same as the `desk:` block's
 * ticket); a per-tenant sequence column is the upgrade when lists get large.
 */
async function selectTickets(
  tx: TransactionPipe,
  tenantId: string,
  where: SQL,
  page: { take: number; skip: number },
): Promise<TicketRow[]> {
  const { rows } = await tx.execute<TicketRow>(sql`
    select * from (
      select c.id,
             (select count(*)::int from conversa c2
               where c2.tenant_id = c.tenant_id and (c2.criada_em, c2.id) <= (c.criada_em, c.id)) as "sequentialId",
             c.contato_id::text as "customerIdentity",
             u.email as "agentEmail",
             closer.email as "closedByEmail",
             case c.estado
               when 'na_fila' then 'Waiting'
               when 'atribuida' then 'Assigned'
               when 'encerrada' then case ev.closer_role
                 when 'cliente' then 'ClosedClient'
                 when 'inatividade' then 'ClosedClientInactivity'
                 when 'transferencia' then 'Transferred'
                 else 'ClosedAttendant' end
               else 'Open' end as status,
             c.estado = 'encerrada' as closed,
             q.nome as team,
             coalesce(
               (select array_agg(et.nome order by et.nome) from conversa_etiqueta ce
                  join etiqueta et on et.id = ce.etiqueta_id and et.tenant_id = c.tenant_id
                 where ce.conversa_id = c.id and ce.tenant_id = c.tenant_id),
               '{}'
             ) as tags,
             c.criada_em as "storageDate",
             c.atribuida_em as "openDate",
             c.primeira_resposta_em as "firstResponseDate",
             c.encerrada_em as "closeDate",
             c.contato_id, c.criada_em
        from conversa c
        left join fila q on q.id = c.fila_id and q.tenant_id = c.tenant_id
        left join usuario u on u.id = c.atendente_id and u.tenant_id = c.tenant_id
        left join usuario closer on closer.id = c.encerrada_por and closer.tenant_id = c.tenant_id
        left join lateral (
          select e.dados->>'encerrada_por' as closer_role from evento_atendimento e
           where e.conversa_id = c.id and e.tenant_id = c.tenant_id and e.tipo = 'encerrada'
           order by e.em desc limit 1
        ) ev on true
       where c.tenant_id = ${tenantId}::uuid
    ) t
    where ${where}
    order by t.criada_em desc, t.id desc
    limit ${page.take} offset ${page.skip}
  `);
  return rows;
}

/** Contact by Pipe id (`contact.identity`) or by channel identity (`5511…@wa.gw.msging.net` or bare). */
function customerIs(tenantId: string, identity: string): SQL {
  if (UUID.test(identity)) return sql`t.contato_id = ${identity}::uuid`;
  const local = identity.includes('@') ? identity.slice(0, identity.indexOf('@')) : identity;
  return sql`t.contato_id in (
    select ci.contato_id from contato_identidade ci
     where ci.tenant_id = ${tenantId}::uuid and ci.identificador in (${identity}, ${local})
  )`;
}

/** `field eq 'value'` clauses joined by `and`, optionally in parentheses — the forms Blip documents. */
function parseFilter(filter: string): Array<{ field: string; value: string }> {
  const clauses = filter.replace(/[()]/g, ' ').trim().split(/\s+and\s+/i);
  return clauses.map((clause) => {
    const match = clause.trim().match(/^(\w+)\s+eq\s+'((?:[^']|'')*)'$/i);
    if (!match) throw new Error(`O filtro '${filter}' não é suportado no Pipe.`);
    return { field: match[1]!.toLowerCase(), value: match[2]!.replace(/''/g, "'") };
  });
}

function pageOf(query: URLSearchParams): { take: number; skip: number } {
  const take = Number(query.get('$take') ?? 20);
  const skip = Number(query.get('$skip') ?? 0);
  return {
    take: Number.isInteger(take) && take > 0 ? Math.min(take, 100) : 20,
    skip: Number.isInteger(skip) && skip > 0 ? skip : 0,
  };
}

const listTickets: CommandHandler = async (tx, tenantId, { query }) => {
  const conditions: SQL[] = [];
  const filter = query.get('$filter');
  for (const { field, value } of filter ? parseFilter(filter) : []) {
    if (field === 'customeridentity') conditions.push(customerIs(tenantId, value));
    else if (field === 'status') conditions.push(sql`lower(t.status) = lower(${value})`);
    else if (field === 'team') conditions.push(sql`t.team = ${value}`);
    else if (field === 'id') conditions.push(UUID.test(value) ? sql`t.id = ${value}::uuid` : sql`false`);
    else throw new Error(`O filtro '${filter}' não é suportado no Pipe.`);
  }
  // Blip lists open tickets unless `$closed=true` is passed as its own parameter.
  if ((query.get('$closed') ?? '').toLowerCase() !== 'true') conditions.push(sql`not t.closed`);
  const where = conditions.length ? sql.join(conditions, sql` and `) : sql`true`;
  const rows = await selectTickets(tx, tenantId, where, pageOf(query));
  return collection('application/vnd.iris.ticket+json', rows.map(ticketOf));
};

/** One ticket of this tenant in Blip's shape, or null (the Desk writes answer with it too). */
export async function ticketById(tx: TransactionPipe, tenantId: string, id: string): Promise<Record<string, unknown> | null> {
  const rows = UUID.test(id) ? await selectTickets(tx, tenantId, sql`t.id = ${id}::uuid`, { take: 1, skip: 0 }) : [];
  return rows[0] ? ticketOf(rows[0]) : null;
}

const getTicket: CommandHandler = async (tx, tenantId, { params }) => {
  const id = params['id'] ?? '';
  const ticket = await ticketById(tx, tenantId, id);
  return ticket ? success('application/vnd.iris.ticket+json', ticket) : notFound(`O ticket '${id}' não existe.`);
};

/** Active queues with how many of their agents are online right now (`status_atendente`). */
export async function teamsWithAgentsOnline(
  tx: TransactionPipe,
  tenantId: string,
): Promise<{ id: string; name: string; agentsOnline: number }[]> {
  const { rows } = await tx.execute<{ id: string; name: string; agentsOnline: number }>(sql`
    select f.id, f.nome as name,
           count(distinct u.id) filter (where s.estado = 'online')::int as "agentsOnline"
      from fila f
      left join fila_atendente fa on fa.fila_id = f.id and fa.tenant_id = f.tenant_id
      left join usuario u on u.id = fa.usuario_id and u.tenant_id = f.tenant_id and u.ativo
      left join status_atendente s on s.usuario_id = u.id and s.tenant_id = f.tenant_id
     where f.tenant_id = ${tenantId}::uuid and f.ativa
     group by f.id
     order by f.ordem, f.nome
  `);
  return rows;
}

const listTeams: CommandHandler = async (tx, tenantId) =>
  collection(
    'application/vnd.iris.desk.team+json',
    (await teamsWithAgentsOnline(tx, tenantId)).map(({ name, agentsOnline }) => ({ name, agentsOnline })),
  );

/** Active users that belong to at least one queue. */
const listAttendants: CommandHandler = async (tx, tenantId) => {
  const { rows } = await tx.execute<{
    fullName: string;
    email: string;
    state: string | null;
    teams: string[];
    ticketsInService: number;
  }>(sql`
    select u.nome as "fullName", u.email, s.estado as state,
           array_agg(distinct f.nome order by f.nome) as teams,
           (select count(*)::int from conversa c
             where c.tenant_id = u.tenant_id and c.atendente_id = u.id and c.estado <> 'encerrada') as "ticketsInService"
      from usuario u
      join fila_atendente fa on fa.usuario_id = u.id and fa.tenant_id = u.tenant_id
      join fila f on f.id = fa.fila_id and f.tenant_id = u.tenant_id and f.ativa
      left join status_atendente s on s.usuario_id = u.id and s.tenant_id = u.tenant_id
     where u.tenant_id = ${tenantId}::uuid and u.ativo
     group by u.id, s.estado
     order by u.nome
  `);
  return collection(
    'application/vnd.iris.desk.attendant+json',
    rows.map((r) => ({
      identity: agentIdentity(r.email),
      fullName: r.fullName,
      email: r.email,
      teams: r.teams,
      status: AGENT_STATUS[r.state ?? 'offline'] ?? 'Offline',
      ticketsInService: r.ticketsInService,
    })),
  );
};

/** Handlers by `COMMAND_ROUTES` name. Read-only, so the builder test run uses them too. */
export const DESK_READ_COMMANDS: Readonly<Record<string, CommandHandler>> = {
  'desk.tickets.list': listTickets,
  'desk.tickets.get': getTicket,
  'desk.teams.list': listTeams,
  'desk.teams.agentsOnline': listTeams,
  'desk.attendants.list': listAttendants,
};
