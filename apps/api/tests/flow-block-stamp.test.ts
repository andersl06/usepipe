import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

process.env['PIPE_FILAS'] = 'memoria';
process.env['PIPE_WHATSAPP_CLIENTE'] = 'duble';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';

const { dubleWhatsApp } = await import('@pipe/workers');
const { upApi } = await import('../src/servidor.js');
const { noTenant } = await import('../src/database.js');
const { importFlowOfBlip } = await import('../src/domain/flow.js');
const { adotarFilas, assinar, montarCenario, payloadOfMessage, sessaoDoBot } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof upApi>>;

/** D-06: cada resposta do bot sai carimbada com o bloco atual e o anterior; a execução guarda o anterior. */
const FIXTURE: unknown = JSON.parse(
  readFileSync(new URL('../../../packages/core/src/flow/fixtures/editor-sintetico.json', import.meta.url), 'utf8'),
);
const ANA = '5511911110021';

let cenario: Cenario;
let api: ApiNoAr;

beforeAll(async () => {
  cenario = await montarCenario(`carimbo-${randomUUID().slice(0, 8)}`);
  api = await upApi(0);
  dubleWhatsApp.reiniciar();
  const r = await noTenant(cenario.tenantId, (tx) =>
    importFlowOfBlip(tx, {
      tenantId: cenario.tenantId,
      name: 'Carimbo',
      channelId: cenario.channelId,
      json: FIXTURE,
      publicar: true,
    }),
  );
  await adotarFilas(cenario, r.flowId);
}, 180_000);

afterAll(async () => {
  await api?.fechar();
  await cenario?.encerrar();
});

async function falar(texto: string): Promise<void> {
  const corpo = JSON.stringify(payloadOfMessage(ANA, texto));
  const r = await fetch(`${api.url}/webhooks/whatsapp/${cenario.channelId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': assinar(corpo) },
    body: corpo,
  });
  expect(r.status).toBe(200);
}

describe('carimbo de bloco', () => {
  it('grava bloco atual e anterior em cada mensagem do bot e o anterior na execução', async () => {
    await falar('oi');
    await falar('Ana');
    const sessao = await sessaoDoBot(cenario, ANA);
    const { rows } = await cenario.dono.execute<Record<string, string | null>>(sql`
      select m.conteudo, m.bloco_atual_id, m.bloco_atual_nome, m.bloco_anterior_id, m.bloco_anterior_nome,
             ba.nome as atual_real, bp.nome as anterior_real
        from mensagem m
        left join bloco ba on ba.id = m.bloco_atual_id
        left join bloco bp on bp.id = m.bloco_anterior_id
       where m.execucao_id = ${sessao.id}::uuid and m.autor_tipo = 'bot' order by m.criada_em
    `);
    expect(rows).toHaveLength(2);
    // primeira mensagem: o bloco inicial ("Início") é o anterior de "Boas-vindas"
    expect(rows[0]!.bloco_atual_nome).toBe('Boas-vindas');
    expect(rows[0]!.bloco_anterior_nome).toBe('Início');
    expect(rows[0]!.anterior_real).toBe('Início');
    // segunda: o bloco da primeira vira o anterior
    expect(rows[1]!.bloco_atual_id).not.toBe(rows[0]!.bloco_atual_id);
    expect(rows[1]!.bloco_anterior_id).toBe(rows[0]!.bloco_atual_id);
    expect(rows[1]!.bloco_anterior_nome).toBe(rows[0]!.bloco_atual_nome);
    expect(rows[1]!.bloco_atual_nome).toBe(rows[1]!.atual_real);

    const { rows: ex } = await cenario.dono.execute<{ atual: string | null; anterior: string | null }>(
      sql`select bloco_atual_id as atual, bloco_anterior_id as anterior from execucao_fluxo where id = ${sessao.id}::uuid`,
    );
    expect(ex[0]!.atual).toBe(rows[1]!.bloco_atual_id);
    expect(ex[0]!.anterior).not.toBeNull();
  });
});
