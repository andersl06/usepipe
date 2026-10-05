import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env['PIPE_FILAS'] = 'memoria';
process.env['PIPE_WHATSAPP_CLIENTE'] = 'duble';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';

const { upApi } = await import('../src/servidor.js');
const { noTenant } = await import('../src/database.js');
const { listConversations, listHistoryOfContact, carregarTicketAntigo } = await import('../src/domain/desk/consultas.js');
const { loadHistory } = await import('../src/domain/management/history.js');
const { loadMonitoring } = await import('../src/domain/management/monitoring.js');
const { montarCenario } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof upApi>>;

/**
 * The ticket's own numbers (`numero_sequencial`, and the origin ticket of a transfer) reach every
 * read surface: the public API, the Desk list and history, and Management's monitoring and history.
 * The public API also tells a ticket in standby from one in attendance (a flag on `Open`) and
 * filters by it.
 */

let cenario: Cenario;
let api: ApiNoAr;
let contatoId: string;
let pai: { id: string; numero: number };
let filho: { id: string; numero: number };
let emStandby: { id: string; numero: number };

async function ticket(
  estado: string,
  options: { paiId?: string; standby?: boolean; atendente?: boolean; encerrada?: boolean } = {},
): Promise<{ id: string; numero: number }> {
  const { rows } = await cenario.dono.execute<{ id: string; numero: number }>(sql`
    insert into conversa (
      tenant_id, inbox_id, contato_id, fila_id, atendente_id, estado, conversa_pai_id,
      em_espera_desde, encerrada_em, janela_expira_em
    ) values (
      ${cenario.tenantId}, ${cenario.inboxId}, ${contatoId}, ${cenario.queueId},
      ${options.atendente ? cenario.agentId : null}, ${estado}, ${options.paiId ?? null}::uuid,
      ${options.standby ? sql`now() - interval '60 seconds'` : null},
      ${options.encerrada ? sql`now()` : null}, now() + interval '20 hours'
    )
    returning id, numero_sequencial::int as numero
  `);
  return rows[0]!;
}

type Conversa = { id: string; emStandby: boolean; emEsperaDesde: string | null };
type Corpo = Conversa & { data: Conversa[] };

async function chamar(caminho: string): Promise<{ status: number; corpo: Corpo }> {
  const resposta = await fetch(`${api.url}${caminho}`, { headers: { authorization: `Bearer ${cenario.token}` } });
  return { status: resposta.status, corpo: (await resposta.json()) as Corpo };
}

beforeAll(async () => {
  cenario = await montarCenario(`ids-leituras-${randomUUID().slice(0, 8)}`);
  api = await upApi(0);
  const { rows } = await cenario.dono.execute<{ id: string }>(sql`
    insert into contato (tenant_id, nome, telefone_e164)
    values (${cenario.tenantId}, 'Cliente dos ids', '+5511911112222') returning id
  `);
  contatoId = rows[0]!.id;
  pai = await ticket('Transferred', { encerrada: true, atendente: true });
  filho = await ticket('Open', { paiId: pai.id, atendente: true });
  emStandby = await ticket('Open', { standby: true, atendente: true });
}, 180_000);

afterAll(async () => {
  await api?.fechar();
  await cenario?.encerrar();
});

describe('public API /v1/conversations', () => {
  it('detail carries standby and the ticket numbers', async () => {
    const aberto = await chamar(`/v1/conversations/${filho.id}`);
    expect(aberto.status).toBe(200);
    expect(aberto.corpo).toMatchObject({
      state: 'Open',
      emStandby: false,
      emEsperaDesde: null,
      sequentialId: filho.numero,
      parentSequentialId: pai.numero,
    });

    const espera = await chamar(`/v1/conversations/${emStandby.id}`);
    expect(espera.corpo).toMatchObject({ state: 'Open', emStandby: true, sequentialId: emStandby.numero, parentSequentialId: null });
    expect(typeof espera.corpo.emEsperaDesde).toBe('string');
  });

  it('list filters by standby=true and standby=false', async () => {
    const em = await chamar('/v1/conversations?standby=true&limit=100');
    expect(em.status).toBe(200);
    expect(em.corpo.data.map((c) => c.id)).toEqual([emStandby.id]);

    const fora = await chamar('/v1/conversations?standby=false&limit=100');
    const ids = fora.corpo.data.map((c) => c.id);
    expect(ids).toContain(filho.id);
    expect(ids).toContain(pai.id);
    expect(ids).not.toContain(emStandby.id);
    expect(fora.corpo.data.every((c) => c.emStandby === false)).toBe(true);
  });

  it('list combines standby with the state filter and refuses anything but true or false', async () => {
    const abertas = await chamar('/v1/conversations?estado=Open&standby=true&limit=100');
    expect(abertas.corpo.data).toHaveLength(1);
    const nenhuma = await chamar('/v1/conversations?estado=Transferred&standby=true&limit=100');
    expect(nenhuma.corpo.data).toHaveLength(0);

    const invalida = await chamar('/v1/conversations?standby=talvez');
    expect(invalida.status).toBe(400);
  });
});

describe('Desk reads', () => {
  it('the queue list carries sequentialId and parentSequentialId', async () => {
    const lista = await noTenant(cenario.tenantId, (tx) => listConversations(tx, cenario.agentId));
    const doFilho = lista.find((c) => c.id === filho.id);
    expect(doFilho).toMatchObject({ sequentialId: filho.numero, parentSequentialId: pai.numero });
    expect(lista.find((c) => c.id === emStandby.id)).toMatchObject({ sequentialId: emStandby.numero, parentSequentialId: null });
  });

  it("the contact's history and an old ticket carry the numbers", async () => {
    const historico = await noTenant(cenario.tenantId, (tx) => listHistoryOfContact(tx, contatoId, null));
    expect(historico.find((h) => h.id === pai.id)).toMatchObject({ sequentialId: pai.numero, parentSequentialId: null });
    expect(historico.find((h) => h.id === filho.id)).toMatchObject({ sequentialId: filho.numero, parentSequentialId: pai.numero });

    const antigo = await noTenant(cenario.tenantId, (tx) => carregarTicketAntigo(tx, filho.id));
    expect(antigo).toMatchObject({ sequentialId: filho.numero, parentSequentialId: pai.numero });
  });
});

describe('Management reads', () => {
  const janela = { start: new Date(Date.now() - 86_400_000), end: new Date(Date.now() + 86_400_000) };

  it('monitoring rows show the sequential number as the ticket', async () => {
    const monitoramento = await noTenant(cenario.tenantId, (tx) => loadMonitoring(tx, janela, 'America/Sao_Paulo'));
    const linha = monitoramento.abertas.find((l) => l.id === filho.id);
    expect(linha).toMatchObject({ ticket: `#${filho.numero}`, sequentialId: filho.numero, parentSequentialId: pai.numero });
    expect(monitoramento.abertas.find((l) => l.id === emStandby.id)?.ticket).toBe(`#${emStandby.numero}`);
  });

  it('history rows show the sequential number and the filter finds a ticket by it', async () => {
    const historico = await noTenant(cenario.tenantId, (tx) => loadHistory(tx, janela, {}));
    const linha = historico.linhas.find((l) => l.id === pai.id);
    expect(linha).toMatchObject({ ticket: `#${pai.numero}`, sequentialId: pai.numero, parentSequentialId: null });

    const porNumero = await noTenant(cenario.tenantId, (tx) => loadHistory(tx, janela, { tickets: [`#${pai.numero}`] }));
    expect(porNumero.linhas.map((l) => l.id)).toEqual([pai.id]);
    const outroNumero = await noTenant(cenario.tenantId, (tx) => loadHistory(tx, janela, { tickets: [`${pai.numero + 1000}`] }));
    expect(outroNumero.linhas).toEqual([]);
  });
});
