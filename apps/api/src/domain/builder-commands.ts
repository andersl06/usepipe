import { sql } from 'drizzle-orm';
import type { CommandRequest } from '@pipe/core';
import type { TransactionPipe } from '@pipe/db';

/**
 * Builder and core bot commands that need tenant data, answered in Blip's command shape
 * (`{method, status, type, resource}`). The ones whose data lives in the execution (context
 * variables, Master-State, buckets, resources, the contact, `get /flow-id` without `shortname`) run
 * in the engine (`packages/core/src/flow/builder-commands.ts`) and never reach here.
 *
 * Imported router flows chain the two: `get /configuration/caller` lists the router's services
 * (`settings.children[].{service, shortName}`), a script maps service → short name, and
 * `get /flow-id?shortname=` turns that into the flow id used by `set /contexts/{contact}/stateid@{id}`.
 */

export type BuilderCommandResponse = Record<string, unknown>;
export type BuilderCommandHandler = (
  tx: TransactionPipe,
  tenantId: string,
  request: CommandRequest,
) => Promise<BuilderCommandResponse>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BOT_DOMAIN = 'msging.net';

const success = (type: string, resource: unknown): BuilderCommandResponse => ({ method: 'get', status: 'success', type, resource });

/** LIME reasons: 67 = resource not found, 1 = general error. */
const failure = (code: 1 | 67, description: string): BuilderCommandResponse => ({
  method: 'get',
  status: 'failure',
  reason: { code, description },
});

/** `get /flow-id?shortname={x}`: the id of the tenant's live flow with that short name. */
async function flowIdOfShortName(tx: TransactionPipe, tenantId: string, request: CommandRequest): Promise<BuilderCommandResponse> {
  const query = request.command.query;
  if (!query.has('shortname')) {
    return request.flowId ? success('text/plain', request.flowId) : failure(1, 'O fluxo que enviou o comando é desconhecido.');
  }
  const shortName = (query.get('shortname') ?? '').trim();
  if (!shortName) return failure(67, 'Informe o shortname do fluxo.');
  const { rows } = await tx.execute<{ id: string }>(sql`
    select id from fluxo
     where tenant_id = ${tenantId}::uuid and lower(short_name) = lower(${shortName}) and estado <> 'arquivado'
     limit 1
  `);
  return rows[0] ? success('text/plain', rows[0].id) : failure(67, `O fluxo '${shortName}' não existe neste Pipe.`);
}

type FlowRow = { id: string; shortName: string; tipo: string; usesContext: boolean };
type ChildRow = { service: string; shortName: string; longName: string; isDefault: boolean };

/**
 * `get /configuration/caller`: the caller's `Application` configuration. For a router service it is
 * the router's, whose `settings.children` lists every service; Blip keeps the value as a JSON string.
 */
async function configurationOfCaller(tx: TransactionPipe, tenantId: string, request: CommandRequest): Promise<BuilderCommandResponse> {
  const flowId = request.flowId ?? '';
  if (!UUID.test(flowId)) return failure(1, 'O fluxo que enviou o comando é desconhecido.');
  const { rows: flows } = await tx.execute<FlowRow>(sql`
    select f.id, f.short_name as "shortName", f.tipo, f.usa_contexto_do_roteador as "usesContext"
      from fluxo f
     where f.tenant_id = ${tenantId}::uuid
       and (f.id = ${flowId}::uuid or f.id = (
         select rs.roteador_id from roteador_servico rs
          where rs.tenant_id = ${tenantId}::uuid and rs.servico_id = ${flowId}::uuid
          order by rs.criado_em asc limit 1
       ))
  `);
  const caller = flows.find((f) => f.id === flowId);
  if (!caller) return failure(67, 'O fluxo que enviou o comando não existe neste Pipe.');
  const router = caller.tipo === 'roteador' ? caller : flows.find((f) => f.id !== flowId);
  let application: Record<string, unknown>;
  if (router) {
    const { rows: children } = await tx.execute<ChildRow>(sql`
      select rs.nome as service, f.short_name as "shortName", f.nome as "longName", rs.principal as "isDefault"
        from roteador_servico rs
        join fluxo f on f.id = rs.servico_id and f.tenant_id = ${tenantId}::uuid
       where rs.tenant_id = ${tenantId}::uuid and rs.roteador_id = ${router.id}::uuid
       order by rs.principal desc, rs.nome asc
    `);
    application = { identifier: router.shortName, settings: { children } };
  } else {
    application = {
      identifier: caller.shortName,
      settings: { flow: { configuration: caller.usesContext ? { 'builder:useTunnelOwnerContext': 'true' } : {} } },
    };
  }
  const identity = `${(router ?? caller).shortName}@${BOT_DOMAIN}`;
  const items = [{ owner: identity, caller: identity, name: 'Application', value: JSON.stringify(application) }];
  return success('application/vnd.lime.collection+json', {
    total: items.length,
    itemType: 'application/vnd.iris.configuration+json',
    items,
  });
}

/** Handlers by `COMMAND_ROUTES` name; `executeCommand` runs them before the Desk and ticket routes. */
export const BUILDER_COMMANDS: Readonly<Record<string, BuilderCommandHandler>> = Object.freeze({
  'builder.flowId': flowIdOfShortName,
  'core.configuration.caller': configurationOfCaller,
});
