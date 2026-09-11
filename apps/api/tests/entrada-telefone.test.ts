import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

// O modo tem que ser decidido antes de qualquer import que leia a variável.
process.env['PIPE_FILAS'] = 'memoria';
process.env['PIPE_WHATSAPP_CLIENTE'] = 'duble';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';

const { subirApi } = await import('../src/servidor.js');
const { assinar, montarCenario, payloadDeMensagem } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof subirApi>>;

/**
 * O nono dígito na entrada. A Meta ainda entrega celular brasileiro antigo sem o 9
 * (`553199998888`), e o importador de contatos grava a forma canônica, com o 9
 * (`5531999998888`). Sem casar as duas, o cliente importado que escreve abre uma
 * ficha nova e perde o histórico e os dados que a empresa subiu.
 */

let cenario: Cenario;
let api: ApiNoAr;

beforeAll(async () => {
  cenario = await montarCenario(`telefone-${randomUUID().slice(0, 8)}`);
  api = await subirApi(0);
}, 180_000);

afterAll(async () => {
  await api?.fechar();
  await cenario?.encerrar();
});

async function falar(de: string, texto: string): Promise<void> {
  const corpo = JSON.stringify(payloadDeMensagem(de, texto));
  const resposta = await fetch(`${api.url}/webhooks/whatsapp/${cenario.canalId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': assinar(corpo) },
    body: corpo,
  });
  expect(resposta.status).toBe(200);
}

async function contatosComTelefone(...telefones: string[]): Promise<string[]> {
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

describe('nono dígito na entrada', () => {
  it('contato importado com o 9 recebe a mensagem que chega sem o 9', async () => {
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

    expect(await contatosComTelefone('+5531999998888', '+553199998888')).toEqual([importado]);
    const { rows: conversas } = await cenario.dono.execute<{ n: number }>(sql`
      select count(*)::int as n from conversa where contato_id = ${importado}::uuid
    `);
    expect(conversas[0]!.n).toBe(1);
  });

  it('contato novo que chega sem o 9 é gravado na forma canônica', async () => {
    await falar('552188887777', 'primeira vez');

    expect(await contatosComTelefone('+552188887777')).toEqual([]);
    expect(await contatosComTelefone('+5521988887777')).toHaveLength(1);
  });

  it('fixo não ganha 9: só a faixa de celular é normalizada', async () => {
    await falar('551133334444', 'do escritório');

    expect(await contatosComTelefone('+551133334444')).toHaveLength(1);
    expect(await contatosComTelefone('+5511933334444')).toEqual([]);
  });
});
