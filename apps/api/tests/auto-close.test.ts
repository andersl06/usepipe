import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

process.env['PIPE_FILAS'] = 'memoria';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';

const { montarCenario } = await import('./ajuda.js');
const { runAutoClose, isDueForAutoClose, AUTO_CLOSE_REASON } = await import('../src/domain/management/auto-close.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Corpo = Record<string, any>;

/**
 * Encerramento automático com relógio falso e efeitos falsos: nada é enviado (sem webhook, sem Redis) e a varredura é restrita aos tenants do próprio teste, então nenhuma conversa de outro tenant do banco local é tocada.
 */
let a: Cenario;
let b: Cenario;
const MIN = 60_000;
// Relógio falso fixo, perto de hoje: `evento_atendimento` só tem partições para os meses próximos.
const T0 = new Date();
const depois = (min: number) => new Date(T0.getTime() + min * MIN);

const efeitos = {
  chamadas: [] as string[],
  afterCommit: async (_t: string, id: string) => void efeitos.chamadas.push(id),
  sendAlert: async () => undefined,
};

beforeAll(async () => {
  a = await montarCenario(`ec-${randomUUID().slice(0, 8)}`);
  b = await montarCenario(`ec-${randomUUID().slice(0, 8)}`);
}, 180_000);

afterAll(async () => {
  await a?.encerrar();
  await b?.encerrar();
});

const config = (over: Corpo = {}) => ({
  ativo: true,
  tempo: 30,
  unidade: 'minutos',
  soSePrimeiroAtendimento: false,
  naoSeAguardandoAtendente: false,
  removerDaTela: false,
  alerta: { ativo: false, mensagem: '', antecedencia: 1, unidade: 'minutos' },
  tags: { ativo: false, tags: [] },
  ...over,
});

async function setConfig(c: Cenario, valor: Corpo | null) {
  await c.dono.execute(sql`
    update fila set encerramento_automatico = ${valor === null ? null : JSON.stringify(valor)}::jsonb
     where id = ${c.queueId}::uuid
  `);
}

async function conversa(
  c: Cenario,
  o: { ultima: Date | null; de?: string | null; primeira?: Date | null; estado?: string },
): Promise<string> {
  const { rows: ct } = await c.dono.execute<{ id: string }>(sql`
    insert into contato (tenant_id, nome) values (${c.tenantId}::uuid, 'Cliente') returning id
  `);
  const { rows } = await c.dono.execute<{ id: string }>(sql`
    insert into conversa (tenant_id, inbox_id, contato_id, fila_id, estado, criada_em,
                          ultima_mensagem_em, ultima_mensagem_de, primeira_resposta_em)
    values (${c.tenantId}::uuid, ${c.inboxId}::uuid, ${ct[0]!.id}::uuid, ${c.queueId}::uuid,
            ${o.estado ?? 'em_atendimento'}, ${depois(-600)}, ${o.ultima}, ${o.de ?? 'atendente'}, ${o.primeira ?? null})
    returning id
  `);
  return rows[0]!.id;
}

async function estado(c: Cenario, id: string) {
  const { rows } = await c.dono.execute<{ estado: string; motivo: string | null; por: string | null }>(sql`
    select estado, motivo_encerramento as motivo, encerrada_por as por from conversa where id = ${id}::uuid
  `);
  return rows[0]!;
}

async function eventosEncerrada(c: Cenario, id: string): Promise<Corpo[]> {
  const { rows } = await c.dono.execute<{ dados: Corpo }>(sql`
    select dados from evento_atendimento where conversa_id = ${id}::uuid and tipo = 'encerrada'
  `);
  return rows.map((r) => r.dados);
}

const tick = (agora: Date, limite?: number) => runAutoClose(agora, efeitos, limite, [a.tenantId, b.tenantId]);

describe('regra pura', () => {
  const alvo = { state: 'em_atendimento', lastMessageAt: T0, lastMessageOf: 'atendente', firstResponseAt: T0 };
  it('vence só depois do tempo e respeita as opções', () => {
    const cfg = config() as Parameters<typeof isDueForAutoClose>[0];
    expect(isDueForAutoClose(cfg, alvo, depois(29))).toBe(false);
    expect(isDueForAutoClose(cfg, alvo, depois(30))).toBe(true);
    expect(isDueForAutoClose({ ...cfg, unidade: 'horas', tempo: 1 }, alvo, depois(59))).toBe(false);
    expect(isDueForAutoClose({ ...cfg, ativo: false }, alvo, depois(500))).toBe(false);
    expect(isDueForAutoClose(cfg, { ...alvo, state: 'encerrada' }, depois(500))).toBe(false);
    expect(isDueForAutoClose({ ...cfg, naoSeAguardandoAtendente: true }, { ...alvo, lastMessageOf: 'contato' }, depois(500))).toBe(false);
    expect(isDueForAutoClose({ ...cfg, soSePrimeiroAtendimento: true }, { ...alvo, firstResponseAt: null }, depois(500))).toBe(false);
  });
});

describe('varredura de encerramento automático', () => {
  it('desligado ou nunca configurado: não encerra nada', async () => {
    await setConfig(a, null);
    const c1 = await conversa(a, { ultima: depois(-1000) });
    expect((await tick(depois(0))).closed).toBe(0);
    await setConfig(a, config({ ativo: false }));
    expect((await tick(depois(0))).closed).toBe(0);
    expect((await estado(a, c1)).estado).toBe('em_atendimento');
  });

  it('encerra a vencida, não a recente, e registra motivo e evento de inatividade', async () => {
    await setConfig(a, config());
    const velha = await conversa(a, { ultima: depois(-31) });
    const recente = await conversa(a, { ultima: depois(-10) });
    const r = await tick(depois(0));
    expect(r.closed).toBeGreaterThanOrEqual(1);
    const e = await estado(a, velha);
    expect(e).toMatchObject({ estado: 'encerrada', motivo: AUTO_CLOSE_REASON, por: null });
    expect((await eventosEncerrada(a, velha))[0]).toMatchObject({ encerrada_por: 'inatividade' });
    expect((await estado(a, recente)).estado).toBe('em_atendimento');
    expect(efeitos.chamadas).toContain(velha);
    expect(efeitos.chamadas).not.toContain(recente);
  });

  it('é idempotente: rodar de novo não encerra nem registra de novo', async () => {
    await setConfig(a, config());
    const id = await conversa(a, { ultima: depois(-100) });
    await tick(depois(0));
    const antes = efeitos.chamadas.filter((x) => x === id).length;
    expect(antes).toBe(1);
    await tick(depois(1));
    await tick(depois(2));
    expect(efeitos.chamadas.filter((x) => x === id).length).toBe(1);
    expect(await eventosEncerrada(a, id)).toHaveLength(1);
  });

  it('nunca reabre nem mexe em conversa já encerrada', async () => {
    await setConfig(a, config());
    const id = await conversa(a, { ultima: depois(-100), estado: 'encerrada' });
    await a.dono.execute(sql`update conversa set encerrada_em = ${depois(-90)}, motivo_encerramento = 'Resolvido' where id = ${id}::uuid`);
    await tick(depois(0));
    expect(await estado(a, id)).toMatchObject({ estado: 'encerrada', motivo: 'Resolvido' });
    expect(await eventosEncerrada(a, id)).toHaveLength(0);
  });

  it('honra "só se o primeiro atendimento já ocorreu" e "não se aguardando o atendente"', async () => {
    await setConfig(a, config({ soSePrimeiroAtendimento: true, naoSeAguardandoAtendente: true }));
    const semPrimeira = await conversa(a, { ultima: depois(-100), de: 'atendente', primeira: null });
    const aguardando = await conversa(a, { ultima: depois(-100), de: 'contato', primeira: depois(-200) });
    const elegivel = await conversa(a, { ultima: depois(-100), de: 'atendente', primeira: depois(-200) });
    await tick(depois(0));
    expect((await estado(a, semPrimeira)).estado).toBe('em_atendimento');
    expect((await estado(a, aguardando)).estado).toBe('em_atendimento');
    expect((await estado(a, elegivel)).estado).toBe('encerrada');
  });

  it('unidade em horas', async () => {
    await setConfig(a, config({ tempo: 2, unidade: 'horas' }));
    const aos90 = await conversa(a, { ultima: depois(-90) });
    const aos130 = await conversa(a, { ultima: depois(-130) });
    await tick(depois(0));
    expect((await estado(a, aos90)).estado).toBe('em_atendimento');
    expect((await estado(a, aos130)).estado).toBe('encerrada');
  });

  it('Modo de Espera pausa o encerramento e a contagem recomeça na retomada', async () => {
    await setConfig(a, config());
    const emEspera = await conversa(a, { ultima: depois(-300), estado: 'em_espera' });
    const retomada = await conversa(a, { ultima: depois(-300) });
    const semRetomada = await conversa(a, { ultima: depois(-300) });
    await a.dono.execute(sql`
      insert into evento_atendimento (tenant_id, conversa_id, tipo, em)
      values (${a.tenantId}::uuid, ${retomada}::uuid, 'espera_encerrada', ${depois(-10)})
    `);
    expect(isDueForAutoClose(config() as Parameters<typeof isDueForAutoClose>[0], { state: 'em_espera', lastMessageAt: depois(-300), lastMessageOf: 'atendente', firstResponseAt: T0 }, depois(0))).toBe(false);
    await tick(depois(0));
    expect((await estado(a, emEspera)).estado).toBe('em_espera');
    expect((await estado(a, retomada)).estado).toBe('em_atendimento');
    expect((await estado(a, semRetomada)).estado).toBe('encerrada');
    // 30 minutos depois da retomada (-10 + 30), vence.
    await tick(depois(21));
    expect((await estado(a, retomada)).estado).toBe('encerrada');
    expect((await estado(a, emEspera)).estado).toBe('em_espera');
  });

  it('aplica as tags de encerramento que existem no tenant e ignora as demais', async () => {
    await a.dono.execute(sql`insert into etiqueta (tenant_id, nome, escopo) values (${a.tenantId}::uuid, 'Inativo', 'conversa')`);
    await setConfig(a, config({ tags: { ativo: true, tags: ['Inativo', 'NaoExiste'] } }));
    const id = await conversa(a, { ultima: depois(-100) });
    await tick(depois(0));
    const { rows } = await a.dono.execute<{ nome: string }>(sql`
      select e.nome from conversa_etiqueta ce join etiqueta e on e.id = ce.etiqueta_id where ce.conversa_id = ${id}::uuid
    `);
    expect(rows.map((r) => r.nome)).toEqual(['Inativo']);
    expect((await eventosEncerrada(a, id))[0]).toMatchObject({ etiquetas: ['Inativo'] });
  });

  it('casa a tag sem diferenciar maiúsculas, mantém o motivo da tag e registra a que não existe', async () => {
    await a.dono.execute(sql`insert into etiqueta (tenant_id, nome, escopo) values (${a.tenantId}::uuid, 'Sem Retorno', 'conversa')`);
    await setConfig(a, config({ tags: { ativo: true, tags: ['sem retorno', 'Fantasma'] } }));
    const id = await conversa(a, { ultima: depois(-100) });
    await tick(depois(0));
    expect(await estado(a, id)).toMatchObject({ estado: 'encerrada', motivo: 'Sem Retorno' });
    expect((await eventosEncerrada(a, id))[0]).toMatchObject({ etiquetas: ['Sem Retorno'], tags_nao_encontradas: ['Fantasma'] });
  });

  it('sem nenhuma tag existente o motivo genérico continua', async () => {
    await setConfig(a, config({ tags: { ativo: true, tags: ['Fantasma'] } }));
    const id = await conversa(a, { ultima: depois(-100) });
    await tick(depois(0));
    expect((await estado(a, id)).motivo).toBe(AUTO_CLOSE_REASON);
    expect((await eventosEncerrada(a, id))[0]).toMatchObject({ tags_nao_encontradas: ['Fantasma'] });
  });

  it('respeita o limite do lote e termina o restante no tick seguinte', async () => {
    await setConfig(a, config());
    const ids = [await conversa(a, { ultima: depois(-300) }), await conversa(a, { ultima: depois(-299) }), await conversa(a, { ultima: depois(-298) })];
    const primeiro = await tick(depois(0), 2);
    expect(primeiro.candidates).toBe(2);
    expect(primeiro.closed).toBe(2);
    const segundo = await tick(depois(0), 2);
    expect(segundo.closed).toBe(1);
    for (const id of ids) expect((await estado(a, id)).estado).toBe('encerrada');
  });

  it('a configuração de um tenant não encerra conversas de outro', async () => {
    await setConfig(a, config());
    await setConfig(b, null);
    const doB = await conversa(b, { ultima: depois(-1000) });
    await conversa(a, { ultima: depois(-1000) });
    await tick(depois(0));
    expect((await estado(b, doB)).estado).toBe('em_atendimento');
  });

  it('o escopo de tenants é respeitado: tenant fora da lista não é varrido', async () => {
    await setConfig(b, config());
    const doB = await conversa(b, { ultima: depois(-1000) });
    await runAutoClose(depois(0), efeitos, 100, [a.tenantId]);
    expect((await estado(b, doB)).estado).toBe('em_atendimento');
    await tick(depois(0));
    expect((await estado(b, doB)).estado).toBe('encerrada');
  });
});
