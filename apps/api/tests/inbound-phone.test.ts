import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

// // The mode has to be decided before any import that reads the variable.
process.env['PIPE_FILAS'] = 'memoria';
process.env['PIPE_WHATSAPP_CLIENTE'] = 'duble';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';

const { upApi } = await import('../src/servidor.js');
const { assinar, montarCenario, payloadOfMessage } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof upApi>>;

/**
 * The ninth digit on input. Meta still delivers old-style Brazilian mobile numbers without the 9 (`553199998888`), and the contact importer records the canonical form, with the 9 (`5531999998888`). Without matching the two, an imported customer who writes in opens a new record and loses the history and data the company uploaded.
 */

let cenario: Cenario;
let api: ApiNoAr;

beforeAll(async () => {
  cenario = await montarCenario(`telefone-${randomUUID().slice(0, 8)}`);
  api = await upApi(0);
}, 180_000);

afterAll(async () => {
  await api?.fechar();
  await cenario?.encerrar();
});

async function falar(de: string, texto: string): Promise<void> {
  const corpo = JSON.stringify(payloadOfMessage(de, texto));
  const resposta = await fetch(`${api.url}/webhooks/whatsapp/${cenario.channelId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': assinar(corpo) },
    body: corpo,
  });
  expect(resposta.status).toBe(200);
}

async function contactsWithPhone(...telefones: string[]): Promise<string[]> {
  const { rows } = await cenario.dono.execute<{ id: string }>(sql`
    select id from contato
     where tenant_id = ${cenario.tenantId}::uuid
       and telefone_e164 in (${sql.join(
         telefones.map((t) => sql`${t}`),
         sql`, `,
       )})
  `);
  return rows.map((r) => r.id);
}

describe('Match inbound phone numbers across Brazilian ninth-digit variants', () => {
  it('Deliver a message without the ninth digit to an imported contact with it', async () => {
    // Exatamente o que o importador de CSV grava.
    const { rows } = await cenario.dono.execute<{ id: string }>(sql`
      insert into contato (tenant_id, nome, telefone_e164)
      values (${cenario.tenantId}::uuid, 'Importada', '+5531999998888') returning id
    `);
    const importado = rows[0]!.id;
    await cenario.dono.execute(sql`
      insert into contato_identidade (tenant_id, contato_id, canal_tipo, identificador)
      values (${cenario.tenantId}::uuid, ${importado}::uuid, 'whatsapp_cloud', '5531999998888')
    `);

    await falar('553199998888', 'oi, sou eu');

    expect(await contactsWithPhone('+5531999998888', '+553199998888')).toEqual([importado]);
    const { rows: conversations } = await cenario.dono.execute<{ n: number }>(sql`
      select count(*)::int as n from conversa where contato_id = ${importado}::uuid
    `);
    expect(conversations[0]!.n).toBe(1);
  });

  it('Normalize new inbound contacts missing the ninth mobile digit', async () => {
    await falar('552188887777', 'primeira vez');

    expect(await contactsWithPhone('+552188887777')).toEqual([]);
    expect(await contactsWithPhone('+5521988887777')).toHaveLength(1);
  });

  it('fixo não ganha 9: só a faixa de celular é normalizada', async () => {
    await falar('551133334444', 'do escritório');

    expect(await contactsWithPhone('+551133334444')).toHaveLength(1);
    expect(await contactsWithPhone('+5511933334444')).toEqual([]);
  });
});
