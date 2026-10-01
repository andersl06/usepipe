import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env['PIPE_FILAS'] = 'memoria';
process.env['PIPE_WHATSAPP_CLIENTE'] = 'duble';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_CHAVES_SEGREDO'] ??= `teste:${Buffer.alloc(32, 23).toString('base64')}`;
process.env['PIPE_CHAVE_SEGREDO_ATUAL'] ??= 'teste';

const { createToken } = await import('@pipe/authentication');
const { SESSION_COOKIE_NAME: NOME_DO_COOKIE } = await import('../src/session.js');
const { dubleWhatsApp, processarOutbox } = await import('@pipe/workers');
const { upApi } = await import('../src/servidor.js');
const { montarCenario } = await import('./ajuda.js');

/**
 * The bot conversation lives in `execucao_fluxo`: a message may belong only to the execution (no
 * `conversa`), and delivery, reports and the constraint must all cope with that.
 */

const FUSO = 'America/Sao_Paulo';
const HOJE = new Date().toLocaleDateString('en-CA', { timeZone: FUSO });

let cenario: Awaited<ReturnType<typeof montarCenario>>;
let api: Awaited<ReturnType<typeof upApi>>;
let flowId: string;
let executionId: string;
let cookie: string;

async function um<T extends Record<string, unknown>>(query: ReturnType<typeof sql>): Promise<T> {
  const { rows } = await cenario.dono.execute<T>(query);
  return rows[0]! as T;
}

beforeAll(async () => {
  cenario = await montarCenario(`ticket-${randomUUID().slice(0, 8)}`);
  api = await upApi(0);
  dubleWhatsApp.reiniciar();
  const t = cenario.tenantId;
  const novo = createToken();
  await cenario.dono.execute(sql`
    insert into sessao (tenant_id, usuario_id, token_hash, expira_em, origem)
    values (${t}, ${cenario.agentId}, ${novo.hash}, ${novo.expiraEm}, 'google')
  `);
  cookie = `${NOME_DO_COOKIE}=${novo.token}`;

  flowId = (
    await um<{ id: string }>(sql`
      insert into fluxo (tenant_id, nome, tipo, estado, canal_id, short_name)
      values (${t}, 'Bot sem ticket', 'fluxo', 'publicado', ${cenario.channelId}, 'bot-sem-ticket')
      returning id`)
  ).id;
  const versaoId = (
    await um<{ id: string }>(sql`
      insert into fluxo_versao (tenant_id, fluxo_id, versao, estado)
      values (${t}, ${flowId}, 1, 'publicada') returning id`)
  ).id;
  const contactId = (
    await um<{ id: string }>(sql`
      insert into contato (tenant_id, nome, telefone_e164)
      values (${t}, 'Cliente do bot', '+5511977776666') returning id`)
  ).id;
  executionId = (
    await um<{ id: string }>(sql`
      insert into execucao_fluxo (tenant_id, fluxo_versao_id, contato_id, inbox_id, estado)
      values (${t}, ${versaoId}, ${contactId}, ${cenario.inboxId}, 'aguardando') returning id`)
  ).id;
}, 180_000);

afterAll(async () => {
  await api?.fechar();
  await cenario?.encerrar();
});

describe('Message that belongs only to the bot execution', () => {
  it('the database rejects a message with neither conversation nor execution', async () => {
    await expect(
      cenario.dono.execute(sql`
        insert into mensagem (tenant_id, direcao, autor_tipo, tipo, conteudo)
        values (${cenario.tenantId}, 'saida', 'bot', 'texto', 'orfa')`),
    ).rejects.toThrow();
  });

  it('the worker delivers a conversation-less bot message to the execution contact', async () => {
    const t = cenario.tenantId;
    const msg = await um<{ id: string }>(sql`
      insert into mensagem (tenant_id, execucao_id, direcao, autor_tipo, tipo, conteudo, estado_entrega)
      values (${t}, ${executionId}, 'saida', 'bot', 'texto', 'Ola, sou o bot', 'pendente') returning id`);
    await cenario.dono.execute(sql`
      insert into outbox_mensagem (tenant_id, mensagem_id) values (${t}, ${msg.id}::uuid)`);

    const antes = dubleWhatsApp.chamadas.length;
    const resultados = await processarOutbox();
    expect(resultados.find((r) => r.messageId === msg.id)?.state).toBe('enviada');
    expect(dubleWhatsApp.chamadas.length).toBe(antes + 1);
    const chamada = dubleWhatsApp.chamadas.at(-1)!;
    expect(JSON.stringify(chamada)).toContain('5511977776666');
  });

  it('flow reports count the execution-only messages once', async () => {
    const t = cenario.tenantId;
    await cenario.dono.execute(sql`
      insert into mensagem (tenant_id, execucao_id, direcao, autor_tipo, tipo, conteudo, criada_em)
      values (${t}, ${executionId}, 'entrada', 'contato', 'texto', 'Oi bot', now())`);
    const r = await fetch(
      `${api.url}/v1/management/flows/${flowId}/analytics/view-overview?from=${HOJE}&to=${HOJE}`,
      { headers: { cookie } },
    );
    expect(r.status).toBe(200);
    const corpo = (await r.json()) as {
      dados: { contagens: { ativos: number; recebidas: number; enviadas: number } };
    };
    expect(corpo.dados.contagens).toMatchObject({ ativos: 1, recebidas: 1, enviadas: 1 });
  });
});
