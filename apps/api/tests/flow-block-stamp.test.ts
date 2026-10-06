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

/**
 * Cada resposta do bot sai carimbada com o bloco atual e o anterior (id, nome e código); o código é o stateId do Builder e
 * sobrevive a novas publicações, ao contrário do id da linha `bloco`. A execução guarda o anterior. Na transferência, o ticket
 * adota só as mensagens da passagem atual pelo bot.
 */
const FIXTURE: unknown = JSON.parse(
  readFileSync(new URL('../../../packages/core/src/flow/fixtures/editor-sintetico.json', import.meta.url), 'utf8'),
);
const FIXTURE_SUBFLUXO: unknown = JSON.parse(
  readFileSync(new URL('../../../packages/core/src/flow/fixtures/export-with-subflows.json', import.meta.url), 'utf8'),
);
const ANA = '5511911110021';
const BIA = '5511911110022';
const CAIO = '5511911110023';
const DORA = '5511911110024';

let cenario: Cenario;
let api: ApiNoAr;

beforeAll(async () => {
  cenario = await montarCenario(`carimbo-${randomUUID().slice(0, 8)}`);
  api = await upApi(0);
  dubleWhatsApp.reiniciar();
  await publicar('Carimbo', FIXTURE);
}, 180_000);

afterAll(async () => {
  await api?.fechar();
  await cenario?.encerrar();
});

async function publicar(nome: string, json: unknown): Promise<string> {
  const r = await noTenant(cenario.tenantId, (tx) =>
    importFlowOfBlip(tx, { tenantId: cenario.tenantId, name: nome, channelId: cenario.channelId, json, publicar: true }),
  );
  await adotarFilas(cenario, r.flowId);
  return r.versaoId;
}

async function falar(texto: string, telefone = ANA): Promise<void> {
  const corpo = JSON.stringify(payloadOfMessage(telefone, texto));
  const r = await fetch(`${api.url}/webhooks/whatsapp/${cenario.channelId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': assinar(corpo) },
    body: corpo,
  });
  expect(r.status).toBe(200);
}

const esperar = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

interface LinhaDoBot extends Record<string, string | null> {
  conteudo: string;
  bloco_atual_id: string | null;
  bloco_atual_nome: string | null;
  bloco_atual_codigo: string | null;
  bloco_anterior_id: string | null;
  bloco_anterior_nome: string | null;
  bloco_anterior_codigo: string | null;
}

async function mensagensDoBot(execucaoId: string): Promise<LinhaDoBot[]> {
  const { rows } = await cenario.dono.execute<LinhaDoBot>(sql`
    select m.conteudo, m.bloco_atual_id, m.bloco_atual_nome, m.bloco_atual_codigo,
           m.bloco_anterior_id, m.bloco_anterior_nome, m.bloco_anterior_codigo
      from mensagem m
     where m.execucao_id = ${execucaoId}::uuid and m.autor_tipo = 'bot' order by m.criada_em
  `);
  return rows;
}

describe('carimbo de bloco', () => {
  it('grava bloco atual e anterior (id, nome e código) em cada mensagem do bot e o anterior na execução', async () => {
    await falar('oi');
    await falar('Ana');
    const sessao = await sessaoDoBot(cenario, ANA);
    const { rows } = await cenario.dono.execute<Record<string, string | null>>(sql`
      select m.conteudo, m.bloco_atual_id, m.bloco_atual_nome, m.bloco_atual_codigo,
             m.bloco_anterior_id, m.bloco_anterior_nome, m.bloco_anterior_codigo,
             ba.nome as atual_real, bp.nome as anterior_real
        from mensagem m
        left join bloco ba on ba.id = m.bloco_atual_id
        left join bloco bp on bp.id = m.bloco_anterior_id
       where m.execucao_id = ${sessao.id}::uuid and m.autor_tipo = 'bot' order by m.criada_em
    `);
    expect(rows).toHaveLength(2);
    // primeira mensagem: o bloco inicial ("Início") é o anterior de "Boas-vindas"
    expect(rows[0]!.bloco_atual_nome).toBe('Boas-vindas');
    expect(rows[0]!.bloco_atual_codigo).toBe('boas-vindas');
    expect(rows[0]!.bloco_anterior_nome).toBe('Início');
    expect(rows[0]!.bloco_anterior_codigo).toBe('onboarding');
    expect(rows[0]!.anterior_real).toBe('Início');
    // segunda: o bloco da primeira vira o anterior
    expect(rows[1]!.bloco_atual_id).not.toBe(rows[0]!.bloco_atual_id);
    expect(rows[1]!.bloco_atual_codigo).toBe('menu');
    expect(rows[1]!.bloco_anterior_id).toBe(rows[0]!.bloco_atual_id);
    expect(rows[1]!.bloco_anterior_nome).toBe(rows[0]!.bloco_atual_nome);
    expect(rows[1]!.bloco_anterior_codigo).toBe(rows[0]!.bloco_atual_codigo);
    expect(rows[1]!.bloco_atual_nome).toBe(rows[1]!.atual_real);

    const { rows: ex } = await cenario.dono.execute<{ atual: string | null; anterior: string | null; anterior_codigo: string | null }>(
      sql`select bloco_atual_id as atual, bloco_anterior_id as anterior, bloco_anterior_codigo as anterior_codigo from execucao_fluxo where id = ${sessao.id}::uuid`,
    );
    expect(ex[0]!.atual).toBe(rows[1]!.bloco_atual_id);
    expect(ex[0]!.anterior).not.toBeNull();
    expect(ex[0]!.anterior_codigo).toBe('boas-vindas');
  });

  it('o código do bloco é o mesmo em duas versões publicadas, enquanto o id muda', async () => {
    const sessao = await sessaoDoBot(cenario, ANA);
    const antes = await mensagensDoBot(sessao.id);
    const v1 = await versaoDa(sessao.id);

    // Mesma fluxo, nova publicação: as linhas `bloco` são novas, os códigos não.
    const v2 = await publicar('Carimbo', FIXTURE);
    expect(v2).not.toBe(v1);

    await falar('1');
    const depois = await mensagensDoBot(sessao.id);
    const financeiro = depois[depois.length - 1]!;
    expect(financeiro.conteudo).toBe('A segunda via está no site.');
    expect(financeiro.bloco_atual_codigo).toBe('financeiro');
    expect(financeiro.bloco_anterior_codigo).toBe('menu');
    // A mensagem anterior ("Menu", versão 1) e o anterior desta ("Menu", versão 2): mesmo código, ids diferentes.
    const menuV1 = antes[antes.length - 1]!;
    expect(menuV1.bloco_atual_codigo).toBe('menu');
    expect(financeiro.bloco_anterior_codigo).toBe(menuV1.bloco_atual_codigo);
    expect(financeiro.bloco_anterior_id).not.toBeNull();
    expect(financeiro.bloco_anterior_id).not.toBe(menuV1.bloco_atual_id);
    expect(await blocoDaVersao(financeiro.bloco_anterior_id!)).toBe(v2);
  });

  it('em subfluxo grava o código (sem id de bloco, com o código também no nome)', async () => {
    await publicar('Carimbo de subfluxo', FIXTURE_SUBFLUXO);
    await falar('oi', BIA);
    const sessao = await sessaoDoBot(cenario, BIA);
    const linhas = await mensagensDoBot(sessao.id);
    expect(linhas.length).toBeGreaterThanOrEqual(2);
    // O bloco chamador (no fluxo) tem linha e código; a pergunta de dentro do subfluxo não tem linha, e o nome repete o código.
    for (const linha of linhas) expect(linha.bloco_atual_codigo).not.toBeNull();
    expect(linhas[0]!.bloco_atual_id).not.toBeNull();
    const dentro = linhas[linhas.length - 1]!;
    expect(dentro.conteudo).toBe('Qual é o seu nome?');
    expect(dentro.bloco_atual_id).toBeNull();
    expect(dentro.bloco_atual_nome).toBe(dentro.bloco_atual_codigo);
  });
});

describe('ticket só com a passagem atual pelo bot', () => {
  it('uma sessão completa sem pedir atendimento não vai para o ticket da sessão seguinte, que transfere', async () => {
    // Volta ao fluxo do menu (a publicação do subfluxo o arquivou).
    await publicar('Carimbo', FIXTURE);

    // Passagem 1: percorre o menu até o Financeiro e termina no bloco raiz, sem pedir atendimento.
    await falar('oi', CAIO);
    await falar('Caio', CAIO);
    await falar('1', CAIO);
    const sessao = await sessaoDoBot(cenario, CAIO);
    const passagem1 = await idsDe(sessao.id);
    expect(passagem1.length).toBeGreaterThanOrEqual(6);
    expect(sessao.conversa_id).toBeNull();

    // O relógio do canal tem resolução de segundo: a segunda passagem começa em outro segundo.
    await esperar(1200);

    // Passagem 2: volta ao bloco raiz e agora pede atendimento.
    await falar('oi', CAIO);
    await falar('Caio', CAIO);
    await falar('2', CAIO);

    const depois = await sessaoDoBot(cenario, CAIO);
    expect(depois.id).toBe(sessao.id);
    expect(depois.conversa_id).not.toBeNull();
    const doTicket = await idsDoTicket(depois.conversa_id!);
    const antigas = new Set(passagem1);

    expect(doTicket.length).toBeGreaterThanOrEqual(5);
    expect(doTicket.filter((id) => antigas.has(id))).toEqual([]);
    // As anteriores seguem ligadas só à execução (histórico do contato), sem ticket.
    const { rows } = await cenario.dono.execute<{ n: string }>(sql`
      select count(*)::text as n from mensagem
       where execucao_id = ${sessao.id}::uuid and conversa_id is null and id in (${sql.join(passagem1.map((id) => sql`${id}::uuid`), sql`, `)})
    `);
    expect(Number(rows[0]!.n)).toBe(passagem1.length);
  });

  it('com uma única passagem, o ticket leva toda a conversa do bot', async () => {
    await falar('oi', DORA);
    await falar('Dora', DORA);
    await falar('2', DORA);
    const sessao = await sessaoDoBot(cenario, DORA);
    expect(sessao.conversa_id).not.toBeNull();
    expect(await semTicket(sessao.id)).toEqual([]);
  });
});

async function versaoDa(execucaoId: string): Promise<string> {
  const { rows } = await cenario.dono.execute<{ v: string }>(sql`select fluxo_versao_id as v from execucao_fluxo where id = ${execucaoId}::uuid`);
  return rows[0]!.v;
}

async function blocoDaVersao(blocoId: string): Promise<string> {
  const { rows } = await cenario.dono.execute<{ v: string }>(sql`select versao_id as v from bloco where id = ${blocoId}::uuid`);
  return rows[0]!.v;
}

async function idsDe(execucaoId: string): Promise<string[]> {
  const { rows } = await cenario.dono.execute<{ id: string }>(sql`select id from mensagem where execucao_id = ${execucaoId}::uuid`);
  return rows.map((r) => r.id);
}

async function idsDoTicket(conversaId: string): Promise<string[]> {
  const { rows } = await cenario.dono.execute<{ id: string }>(sql`select id from mensagem where conversa_id = ${conversaId}::uuid`);
  return rows.map((r) => r.id);
}

async function semTicket(execucaoId: string): Promise<string[]> {
  const { rows } = await cenario.dono.execute<{ id: string }>(sql`select id from mensagem where execucao_id = ${execucaoId}::uuid and conversa_id is null`);
  return rows.map((r) => r.id);
}
