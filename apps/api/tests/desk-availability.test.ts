import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

process.env['PIPE_FILAS'] = 'memoria';
process.env['PIPE_WHATSAPP_CLIENTE'] = 'duble';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';

const { upApi } = await import('../src/servidor.js');
const { noTenant } = await import('../src/database.js');
const { importFlowOfBlip } = await import('../src/domain/flow.js');
const { chooseQueue, queueUnavailability } = await import('../src/domain/queue-entry.js');
const { assinar, montarCenario, payloadOfMessage } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;

/**
 * P6 (02-45), full human attendance: the queue of a bot handoff also comes from
 * `contact.extras.teams` (Blip flows `MergeContact` the queue name there before `ForwardToDesk`),
 * and an attendance block with the Builder's availability exits opens no ticket when that queue is
 * closed (`OutOfAttendanceHour`, its `horario_id` schedule) or has nobody online
 * (`NoAgentAvailable`, `status_atendente`), following the matching exit instead.
 */

let api: Awaited<ReturnType<typeof upApi>>;
let cenario: Cenario;
/** A queue with no agent at all. */
let vaziaId: string;

beforeAll(async () => {
  api = await upApi(0);
}, 180_000);

afterAll(async () => {
  await api?.fechar();
});

beforeEach(async () => {
  cenario = await montarCenario(`p6-${randomUUID().slice(0, 8)}`);
  const { rows } = await cenario.dono.execute<{ id: string }>(sql`
    insert into fila (tenant_id, nome) values (${cenario.tenantId}, 'Vazia') returning id
  `);
  vaziaId = rows[0]!.id;
}, 180_000);

afterEach(async () => {
  await cenario?.encerrar();
});

/** A schedule without ranges: the queue is never open. */
async function fecharFila(queueId: string): Promise<void> {
  const { rows } = await cenario.dono.execute<{ id: string }>(sql`
    insert into horario_atendimento (tenant_id, nome, fuso)
    values (${cenario.tenantId}, ${`Fechado ${randomUUID().slice(0, 6)}`}, 'America/Sao_Paulo') returning id
  `);
  await cenario.dono.execute(sql`update fila set horario_id = ${rows[0]!.id}::uuid where id = ${queueId}::uuid`);
}

async function nomeDaFila(queueId: string): Promise<string> {
  const { rows } = await cenario.dono.execute<{ nome: string }>(sql`select nome from fila where id = ${queueId}::uuid`);
  return rows[0]!.nome;
}

const sendMessage = (content: string) => ({ type: 'SendMessage', settings: { type: 'text/plain', content } });
const exit = (status: string, stateId: string) => ({
  stateId,
  conditions: [{ source: 'context', variable: 'desk_forwardToDeskState_status', comparison: 'equals', values: [status] }],
});

/**
 * The export's attendance block: optional `MergeContact extras.teams`, then `ForwardToDesk` with
 * empty settings, entered only on `Success`; `withExits` adds the Builder's availability exits.
 */
async function publicar({ teams, withExits }: { teams?: string; withExits: boolean }): Promise<void> {
  const inputActions = [
    ...(teams ? [{ type: 'MergeContact', settings: { extras: { teams } } }] : []),
    { type: 'ForwardToDesk', settings: {} },
  ];
  const r = await noTenant(cenario.tenantId, (tx) =>
    importFlowOfBlip(tx, {
      tenantId: cenario.tenantId,
      name: 'Atendimento humano',
      channelId: cenario.channelId,
      json: {
        id: 'p6',
        states: [
          { id: 'raiz', root: true, input: {}, outputs: [{ stateId: 'desk:suporte' }] },
          {
            id: 'desk:suporte',
            inputActions,
            input: { conditions: [{ source: 'context', variable: 'desk_forwardToDeskState_status', values: ['Success'] }] },
            outputs: [
              ...(withExits ? [exit('OutOfAttendanceHour', 'fechado'), exit('NoAgentAvailable', 'ninguem')] : []),
              exit('Error', 'erro'),
            ],
          },
          { id: 'fechado', inputActions: [sendMessage('Estamos fora do horário.')], input: {} },
          { id: 'ninguem', inputActions: [sendMessage('Ninguém online agora.')], input: {} },
          { id: 'erro', inputActions: [sendMessage('Erro no transbordo.')], input: {} },
        ],
      },
      publicar: true,
    }),
  );
  expect(r.errorOfValidation).toBeNull();
}

async function falar(de: string, texto: string): Promise<void> {
  const corpo = JSON.stringify(payloadOfMessage(de, texto));
  const resposta = await fetch(`${api.url}/webhooks/whatsapp/${cenario.channelId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': assinar(corpo) },
    body: corpo,
  });
  expect(resposta.status).toBe(200);
}

type Resultado = { id: string; fila_id: string | null; estado: string; status: string | null; bot: string[]; entrouNaFila: boolean };

async function resultadoDe(telefone: string): Promise<Resultado> {
  const { rows } = await cenario.dono.execute<{ id: string; fila_id: string | null; estado: string }>(sql`
    select c.id, c.fila_id, c.estado
      from conversa c join contato ct on ct.id = c.contato_id
     where c.tenant_id = ${cenario.tenantId}::uuid and ct.telefone_e164 = ${`+${telefone}`}
     order by c.criada_em desc limit 1
  `);
  const conversa = rows[0]!;
  expect(conversa).toBeDefined();
  const { rows: bot } = await cenario.dono.execute<{ conteudo: string }>(sql`
    select conteudo from mensagem where conversa_id = ${conversa.id}::uuid and autor_tipo = 'bot' order by criada_em
  `);
  const { rows: contexto } = await cenario.dono.execute<{ contexto: Record<string, string> }>(sql`
    select contexto from execucao_fluxo where conversa_id = ${conversa.id}::uuid order by iniciada_em desc limit 1
  `);
  const { rows: entradas } = await cenario.dono.execute<{ n: number }>(sql`
    select count(*)::int as n from evento_atendimento where conversa_id = ${conversa.id}::uuid and tipo = 'enfileirada'
  `);
  return {
    ...conversa,
    status: contexto[0]?.contexto['desk_forwardToDeskState_status'] ?? null,
    bot: bot.map((m) => m.conteudo),
    entrouNaFila: (entradas[0]?.n ?? 0) > 0,
  };
}

describe('queue chosen by contact.extras.teams', () => {
  it('a MergeContact extras.teams before the handoff sends the ticket to that queue', async () => {
    await publicar({ teams: 'vazia', withExits: false });
    await falar('5511955550001', 'quero atendimento');
    const r = await resultadoDe('5511955550001');
    expect(r.fila_id).toBe(vaziaId);
    expect(r.status).toBe('Success');
  });

  it('an unknown team falls back to the inbox default queue', async () => {
    await publicar({ teams: 'Não existe', withExits: false });
    await falar('5511955550002', 'quero atendimento');
    expect((await resultadoDe('5511955550002')).fila_id).toBe(cenario.queueId);
  });
});

describe('ForwardToDesk availability exits', () => {
  it('a queue with nobody online follows NoAgentAvailable and opens no ticket', async () => {
    await publicar({ teams: 'Vazia', withExits: true });
    await falar('5511955550003', 'quero atendimento');
    const r = await resultadoDe('5511955550003');
    expect(r.status).toBe('NoAgentAvailable');
    expect(r.bot).toEqual(['Ninguém online agora.']);
    expect(r.entrouNaFila).toBe(false);
  });

  it('a closed queue follows OutOfAttendanceHour before checking agents', async () => {
    await fecharFila(cenario.queueId);
    await publicar({ withExits: true });
    await falar('5511955550004', 'quero atendimento');
    const r = await resultadoDe('5511955550004');
    expect(r.status).toBe('OutOfAttendanceHour');
    expect(r.bot).toEqual(['Estamos fora do horário.']);
    expect(r.entrouNaFila).toBe(false);
  });

  it('an open queue with an agent online opens the ticket as before', async () => {
    await publicar({ teams: await nomeDaFila(cenario.queueId), withExits: true });
    await falar('5511955550005', 'quero atendimento');
    const r = await resultadoDe('5511955550005');
    expect(r.status).toBe('Success');
    expect(r.fila_id).toBe(cenario.queueId);
    expect(r.entrouNaFila).toBe(true);
    expect(r.bot).toEqual([]);
  });

  it('a block without those exits keeps opening the ticket in an empty queue (Blip behaviour)', async () => {
    await publicar({ teams: 'Vazia', withExits: false });
    await falar('5511955550006', 'quero atendimento');
    const r = await resultadoDe('5511955550006');
    expect(r.status).toBe('Success');
    expect(r.fila_id).toBe(vaziaId);
    expect(r.entrouNaFila).toBe(true);
  });
});

describe('queue-entry helpers', () => {
  it('chooseQueue: explicit, then teams (case-insensitive, active only), then the default', async () => {
    const choose = (queueId: string | null, teams: string | null) =>
      noTenant(cenario.tenantId, (tx) =>
        chooseQueue(tx, cenario.tenantId, {
          queueId,
          defaultQueueId: cenario.queueId,
          message: 'oi',
          contact: { name: null, email: null, phone: null, extras: teams === null ? null : { teams } },
        }),
      );
    expect((await choose(cenario.queueId, 'Vazia')).queueId).toBe(cenario.queueId);
    expect((await choose(null, ' VAZIA ')).queueId).toBe(vaziaId);
    expect((await choose(null, null)).queueId).toBe(cenario.queueId);
    await cenario.dono.execute(sql`update fila set ativa = false where id = ${vaziaId}::uuid`);
    expect((await choose(null, 'Vazia')).queueId).toBe(cenario.queueId);
  });

  it('queueUnavailability: only the requested checks, schedule first, no queue means available', async () => {
    const check = (queueId: string | null, checks: ('OutOfAttendanceHour' | 'NoAgentAvailable')[]) =>
      noTenant(cenario.tenantId, (tx) => queueUnavailability(tx, cenario.tenantId, queueId, new Date(), checks));
    expect(await check(vaziaId, ['NoAgentAvailable'])).toBe('NoAgentAvailable');
    expect(await check(vaziaId, ['OutOfAttendanceHour'])).toBeNull();
    expect(await check(cenario.queueId, ['OutOfAttendanceHour', 'NoAgentAvailable'])).toBeNull();
    expect(await check(null, ['OutOfAttendanceHour', 'NoAgentAvailable'])).toBeNull();
    await fecharFila(vaziaId);
    expect(await check(vaziaId, ['OutOfAttendanceHour', 'NoAgentAvailable'])).toBe('OutOfAttendanceHour');
    // An agent that is offline does not count.
    await cenario.dono.execute(sql`update status_atendente set estado = 'offline' where usuario_id = ${cenario.agentId}::uuid`);
    expect(await check(cenario.queueId, ['NoAgentAvailable'])).toBe('NoAgentAvailable');
  });
});
