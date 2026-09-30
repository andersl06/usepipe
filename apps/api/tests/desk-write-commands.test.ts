import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

process.env['PIPE_FILAS'] = 'memoria';
process.env['PIPE_WHATSAPP_CLIENTE'] = 'duble';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';

const { matchCommand } = await import('@pipe/core');
const { upApi } = await import('../src/servidor.js');
const { noTenant } = await import('../src/database.js');
const { importFlowOfBlip } = await import('../src/domain/flow.js');
const { DESK_READ_COMMANDS } = await import('../src/domain/desk-commands.js');
const { assinar, montarCenario, payloadOfMessage } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type Response = { method: string; status: string; type?: string; resource?: Record<string, unknown>; reason?: { code: number } };

/**
 * Desk write commands (`postmaster@desk.msging.net`) run by a published flow on a real inbound:
 * they change the bot's own conversation through the production effects (`enterQueue`,
 * `closeInTransaction`, `pesquisa_satisfacao_resposta`) and answer in Blip's shape.
 */

const DESK = 'postmaster@desk.msging.net';
const PHONE = '5511955550001';

let api: Awaited<ReturnType<typeof upApi>>;
let cenario: Cenario;

beforeAll(async () => {
  api = await upApi(0);
}, 180_000);

afterAll(async () => {
  await api?.fechar();
});

beforeEach(async () => {
  cenario = await montarCenario(`desk-write-${randomUUID().slice(0, 8)}`);
}, 180_000);

afterEach(async () => {
  await cenario?.encerrar();
});

async function publicar(outputActions: unknown[]): Promise<void> {
  const r = await noTenant(cenario.tenantId, (tx) =>
    importFlowOfBlip(tx, {
      tenantId: cenario.tenantId,
      name: 'Comandos do Desk',
      channelId: cenario.channelId,
      json: { id: 'desk-escrita', states: [{ id: 'raiz', root: true, input: {}, outputActions, outputs: [] }] },
      publicar: true,
    }),
  );
  expect(r.errorOfValidation).toBeNull();
}

const deskSet = (uri: string, resource: unknown, variable: string) => ({
  type: 'ProcessCommand',
  settings: { to: DESK, method: 'set', uri, resource, type: 'application/json', variable },
});

async function falar(texto: string): Promise<void> {
  const corpo = JSON.stringify(payloadOfMessage(PHONE, texto));
  const resposta = await fetch(`${api.url}/webhooks/whatsapp/${cenario.channelId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': assinar(corpo) },
    body: corpo,
  });
  expect(resposta.status).toBe(200);
}

type Conversa = { id: string; estado: string; fila_id: string | null; encerrada_em: Date | null };

async function conversaAtual(): Promise<Conversa> {
  const { rows } = await cenario.dono.execute<Conversa>(sql`
    select id, estado, fila_id, encerrada_em from conversa where tenant_id = ${cenario.tenantId}::uuid
  `);
  expect(rows).toHaveLength(1);
  return rows[0]!;
}

/** The command responses the flow stored in its variables. */
async function resposta(conversaId: string, variable: string): Promise<Response> {
  const { rows } = await cenario.dono.execute<{ contexto: Record<string, string> }>(sql`
    select contexto from execucao_fluxo where conversa_id = ${conversaId}::uuid order by iniciada_em desc limit 1
  `);
  return JSON.parse(rows[0]!.contexto[variable]!) as Response;
}

async function statusDoTicket(conversaId: string): Promise<string> {
  const command = matchCommand({ to: DESK, method: 'get', uri: `/ticket/${conversaId}` })!;
  const read = DESK_READ_COMMANDS[command.route]!;
  const r = (await noTenant(cenario.tenantId, (tx) => read(tx, cenario.tenantId, command))) as { resource: { status: string } };
  return r.resource.status;
}

async function etiquetasDa(conversaId: string): Promise<string[]> {
  const { rows } = await cenario.dono.execute<{ nome: string }>(sql`
    select e.nome from conversa_etiqueta ce join etiqueta e on e.id = ce.etiqueta_id
     where ce.conversa_id = ${conversaId}::uuid order by e.nome
  `);
  return rows.map((r) => r.nome);
}

describe('Desk write commands in a published flow', () => {
  it("runs the export's 'Atendimento finalizado pelo cliente' chain: change-status by sequentialId, then /close", async () => {
    // Settings verbatim from the export, except `{{tunnel.identity}}` → `{{contact.identity}}`:
    // this flow is not behind a router, where Pipe fills `tunnel.*`.
    await publicar([
      {
        type: 'ProcessCommand',
        settings: {
          to: DESK,
          method: 'get',
          uri: "/tickets?$filter=customerIdentity%20eq%20'{{contact.identity}}'",
          from: '{{application.identity}}',
          variable: 'getTicketResponse',
        },
      },
      {
        type: 'ExecuteScript',
        settings: {
          function: 'run',
          source: 'function run(response) {\n    try {\n        const tickets = JSON.parse(response);\n        return tickets.resource.items[0]\n    } catch (err) {\n        return "error set ticket";\n    }\n}',
          inputVariables: ['getTicketResponse'],
          outputVariable: 'ticket',
          LocalTimeZoneEnabled: false,
        },
      },
      { type: 'SetVariable', settings: { value: '{{ticket@sequentialId}}', variable: 'sequentialIdFromTicket' } },
      deskSet('/tickets/change-status', { id: '{{sequentialIdFromTicket}}', status: 'ClosedClient' }, 'getCloseResponse'),
      deskSet(
        '/tickets/{{ticketId}}/close',
        {
          id: '{{random.guid}}',
          customerIdentity: '{{contact.identity}}',
          ownerIdentity: '{{application.identifier}}@msging.net',
          status: 'ClosedClient',
          tags: ['Encerrado pelo Cliente'],
        },
        'finalizarResponse',
      ),
    ]);
    await falar('sair');
    const conversa = await conversaAtual();
    expect(conversa.estado).toBe('encerrada');
    expect(conversa.encerrada_em).not.toBeNull();
    expect(await statusDoTicket(conversa.id)).toBe('ClosedClient');
    expect(await etiquetasDa(conversa.id)).toEqual(['Encerrado pelo Cliente']);
    expect(await resposta(conversa.id, 'getCloseResponse')).toMatchObject({
      method: 'set',
      status: 'success',
      type: 'application/vnd.iris.ticket+json',
      resource: { id: conversa.id, status: 'ClosedClient', closed: true },
    });
    expect(await resposta(conversa.id, 'finalizarResponse')).toMatchObject({ status: 'success', resource: { tags: ['Encerrado pelo Cliente'] } });
  });

  it("change-status refuses another ticket and 'Open': LIME failures, the conversation untouched", async () => {
    await publicar([
      deskSet('/tickets/change-status', { id: '999999', status: 'ClosedClient' }, 'outro'),
      deskSet('/tickets/change-status', { id: '', status: 'Open', agentIdentity: 'ana%40e2e.pipe.app@blip.ai' }, 'aberto'),
    ]);
    await falar('oi');
    const conversa = await conversaAtual();
    expect(conversa.estado).not.toBe('encerrada');
    expect(conversa.fila_id).toBeNull();
    expect(await resposta(conversa.id, 'outro')).toMatchObject({ status: 'failure', reason: { code: 66 } });
    expect(await resposta(conversa.id, 'aberto')).toMatchObject({ status: 'failure', reason: { code: 66 } });
  });

  it('/transfer by team name enters that queue; an unknown or foreign team is resource-not-found', async () => {
    const outro = await montarCenario(`desk-write-outro-${randomUUID().slice(0, 8)}`);
    try {
      const { rows: fila } = await cenario.dono.execute<{ id: string }>(sql`
        insert into fila (tenant_id, fluxo_id, nome) values (${cenario.tenantId}, ${cenario.flowId}, 'Vendas') returning id
      `);
      const { rows: estrangeira } = await outro.dono.execute<{ nome: string }>(sql`
        select nome from fila where id = ${outro.queueId}::uuid
      `);
      await publicar([
        deskSet('/tickets//transfer', { team: estrangeira[0]!.nome }, 'estrangeira'),
        deskSet('/tickets//transfer', { team: 'Inexistente' }, 'inexistente'),
        deskSet('/tickets/{{ticketId}}/transfer', { team: 'vendas' }, 'vendas'),
      ]);
      await falar('oi');
      const conversa = await conversaAtual();
      expect(conversa.fila_id).toBe(fila[0]!.id);
      expect(conversa.estado).toBe('na_fila');
      expect(await resposta(conversa.id, 'estrangeira')).toMatchObject({ status: 'failure', reason: { code: 67 } });
      expect(await resposta(conversa.id, 'inexistente')).toMatchObject({ status: 'failure', reason: { code: 67 } });
      expect(await resposta(conversa.id, 'vendas')).toMatchObject({
        status: 'success',
        resource: { id: conversa.id, team: 'Vendas', status: 'Waiting' },
      });
    } finally {
      await outro.encerrar();
    }
  });

  it('set /tickets/{customerIdentity} opens the ticket through the queue entry; a second one is a no-op', async () => {
    await publicar([
      { type: 'ProcessCommand', settings: { to: DESK, method: 'set', uri: `/tickets/${PHONE}%40wa.gw.msging.net`, type: 'text/plain', resource: 'Preciso de ajuda', variable: 'aberto' } },
      { type: 'ProcessCommand', settings: { to: DESK, method: 'set', uri: '/tickets', type: 'text/plain', resource: 'De novo', variable: 'denovo' } },
    ]);
    await falar('oi');
    const conversa = await conversaAtual();
    expect(conversa.fila_id).toBe(cenario.queueId);
    expect(conversa.estado).not.toBe('encerrada');
    const { rows } = await cenario.dono.execute<{ tipo: string }>(sql`
      select tipo from evento_atendimento where conversa_id = ${conversa.id}::uuid and tipo = 'enfileirada'
    `);
    expect(rows).toHaveLength(1);
    expect(await resposta(conversa.id, 'aberto')).toMatchObject({
      status: 'success',
      type: 'application/vnd.iris.ticket+json',
      resource: { id: conversa.id },
    });
    expect((await resposta(conversa.id, 'denovo')).resource?.['id']).toBe(conversa.id);
  });

  it('set /attendance-survey-answer records the answer in pesquisa_satisfacao_resposta; an invalid rating is refused', async () => {
    await publicar([
      deskSet('/attendance-survey-answer', { rating: 9 }, 'invalida'),
      deskSet('/attendance-survey-answer', { rating: '4', comment: 'bom' }, 'valida'),
    ]);
    await falar('oi');
    const conversa = await conversaAtual();
    const { rows } = await cenario.dono.execute<{ nota: number; comentario: string | null; estado: string }>(sql`
      select nota, comentario, estado from pesquisa_satisfacao_resposta where tenant_id = ${cenario.tenantId}::uuid
    `);
    expect(rows).toEqual([{ nota: 4, comentario: 'bom', estado: 'completa' }]);
    expect(await resposta(conversa.id, 'invalida')).toMatchObject({ status: 'failure', reason: { code: 64 } });
    expect(await resposta(conversa.id, 'valida')).toMatchObject({ status: 'success' });
  });
});
