import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

process.env['PIPE_FILAS'] = 'memoria';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';

const { montarCenario } = await import('./ajuda.js');
const { runAutoClose, realEffects } = await import('../src/domain/management/auto-close.js');
const { isDueForAlert } = await import('../src/domain/management/auto-close-alerta.js');
const { PipeError } = await import('../src/errors.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Corpo = Record<string, any>;

/**
 * Alerta de inatividade com relógio falso e canal falso: o alerta só é anotado, nada é enviado. Só o último teste usa o envio real de domínio, que no modo memória grava a mensagem e a outbox mas não entrega a ninguém. A varredura é restrita aos tenants do próprio teste.
 */
let a: Cenario;
let b: Cenario;
const MIN = 60_000;
const T0 = new Date();
const depois = (min: number) => new Date(T0.getTime() + min * MIN);

const efeitos = {
  alertas: [] as { conversa: string; texto: string }[],
  falha: null as Error | null,
  fechadas: [] as string[],
  afterCommit: async (_t: string, id: string) => void efeitos.fechadas.push(id),
  sendAlert: async (_t: string, conversa: string, texto: string) => {
    if (efeitos.falha) throw efeitos.falha;
    efeitos.alertas.push({ conversa, texto });
  },
};

beforeAll(async () => {
  a = await montarCenario(`al-${randomUUID().slice(0, 8)}`);
  b = await montarCenario(`al-${randomUUID().slice(0, 8)}`);
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
  alerta: { ativo: true, mensagem: 'Ainda está aí?', antecedencia: 5, unidade: 'minutos' },
  tags: { ativo: false, tags: [] },
  ...over,
});

async function setConfig(c: Cenario, valor: Corpo | null) {
  await c.dono.execute(sql`
    update fila set encerramento_automatico = ${valor === null ? null : JSON.stringify(valor)}::jsonb
     where id = ${c.queueId}::uuid
  `);
}

async function conversa(c: Cenario, o: { ultima: Date; de?: string; estado?: string }): Promise<string> {
  const { rows: ct } = await c.dono.execute<{ id: string }>(sql`
    insert into contato (tenant_id, nome) values (${c.tenantId}::uuid, 'Cliente') returning id
  `);
  const { rows } = await c.dono.execute<{ id: string }>(sql`
    insert into conversa (tenant_id, inbox_id, contato_id, fila_id, estado, criada_em,
                          ultima_mensagem_em, ultima_mensagem_de)
    values (${c.tenantId}::uuid, ${c.inboxId}::uuid, ${ct[0]!.id}::uuid, ${c.queueId}::uuid,
            ${o.estado ?? 'em_atendimento'}, ${depois(-600)}, ${o.ultima}, ${o.de ?? 'atendente'})
    returning id
  `);
  return rows[0]!.id;
}

const estado = async (c: Cenario, id: string) =>
  (await c.dono.execute<{ estado: string }>(sql`select estado from conversa where id = ${id}::uuid`)).rows[0]!.estado;

const marca = async (c: Cenario, id: string) =>
  (await c.dono.execute<{ m: Date | null }>(sql`select alerta_inatividade_em as m from conversa where id = ${id}::uuid`)).rows[0]!.m;

const alertasDe = (id: string) => efeitos.alertas.filter((x) => x.conversa === id);
const tick = (agora: Date) => runAutoClose(agora, efeitos, 100, [a.tenantId, b.tenantId]);

describe('alerta de inatividade', () => {
  it('regra pura: só dentro da janela da antecedência e uma vez por ciclo', () => {
    const cfg = config() as Parameters<typeof isDueForAlert>[0];
    const alvo = { state: 'em_atendimento', lastMessageAt: T0, lastMessageOf: 'atendente', firstResponseAt: T0, alertAt: null };
    expect(isDueForAlert(cfg, alvo, depois(24))).toBe(false);
    expect(isDueForAlert(cfg, alvo, depois(25))).toBe(true);
    expect(isDueForAlert(cfg, alvo, depois(30))).toBe(false);
    expect(isDueForAlert(cfg, { ...alvo, alertAt: depois(25) }, depois(26))).toBe(false);
    expect(isDueForAlert(cfg, { ...alvo, alertAt: depois(-5) }, depois(26))).toBe(true);
    expect(isDueForAlert({ ...cfg, alerta: { ...cfg.alerta, ativo: false } }, alvo, depois(26))).toBe(false);
    expect(isDueForAlert({ ...cfg, alerta: { ...cfg.alerta, antecedencia: 30 } }, alvo, depois(26))).toBe(false);
  });

  it('envia o alerta uma única vez e não reinicia a contagem; depois encerra', async () => {
    await setConfig(a, config());
    const id = await conversa(a, { ultima: depois(-26) });
    expect((await tick(depois(0))).alerted).toBeGreaterThanOrEqual(1);
    expect(alertasDe(id)).toEqual([{ conversa: id, texto: 'Ainda está aí?' }]);
    expect(await marca(a, id)).not.toBeNull();
    await tick(depois(1));
    await tick(depois(2));
    expect(alertasDe(id)).toHaveLength(1);
    expect(await estado(a, id)).toBe('em_atendimento');
    await tick(depois(5));
    expect(await estado(a, id)).toBe('encerrada');
    expect(alertasDe(id)).toHaveLength(1);
  });

  it('resposta do cliente depois do alerta mantém aberto e abre um novo ciclo', async () => {
    await setConfig(a, config());
    const id = await conversa(a, { ultima: depois(-26) });
    await tick(depois(0));
    expect(alertasDe(id)).toHaveLength(1);
    await a.dono.execute(sql`update conversa set ultima_mensagem_em = ${depois(1)}, ultima_mensagem_de = 'contato' where id = ${id}::uuid`);
    await tick(depois(20));
    expect(await estado(a, id)).toBe('em_atendimento');
    expect(alertasDe(id)).toHaveLength(1);
    await tick(depois(27));
    expect(alertasDe(id)).toHaveLength(2);
    expect(await estado(a, id)).toBe('em_atendimento');
  });

  it('sem alerta ativo, ou com a fila desligada, nada é enviado', async () => {
    await setConfig(a, config({ alerta: { ativo: false, mensagem: 'x', antecedencia: 5, unidade: 'minutos' } }));
    const id1 = await conversa(a, { ultima: depois(-26) });
    await tick(depois(0));
    await setConfig(a, config({ ativo: false }));
    const id2 = await conversa(a, { ultima: depois(-26) });
    await tick(depois(0));
    expect(alertasDe(id1)).toHaveLength(0);
    expect(alertasDe(id2)).toHaveLength(0);
  });

  it('respeita as opções do encerramento; não alerta encerrada nem conversa de outro tenant', async () => {
    await setConfig(a, config({ naoSeAguardandoAtendente: true }));
    await setConfig(b, null);
    const aguardando = await conversa(a, { ultima: depois(-26), de: 'contato' });
    const encerrada = await conversa(a, { ultima: depois(-26), estado: 'encerrada' });
    const doB = await conversa(b, { ultima: depois(-26) });
    await tick(depois(0));
    expect(alertasDe(aguardando)).toHaveLength(0);
    expect(alertasDe(encerrada)).toHaveLength(0);
    expect(alertasDe(doB)).toHaveLength(0);
  });

  it('falha do sistema devolve a marca e tenta de novo; recusa por regra do canal não repete', async () => {
    await setConfig(a, config());
    const id1 = await conversa(a, { ultima: depois(-26) });
    efeitos.falha = new Error('fora do ar');
    await tick(depois(0));
    expect(await marca(a, id1)).toBeNull();
    efeitos.falha = null;
    await tick(depois(1));
    expect(alertasDe(id1)).toHaveLength(1);

    const id2 = await conversa(a, { ultima: depois(-26) });
    efeitos.falha = new PipeError(409, 'janela_fechada', 'janela fechada');
    await tick(depois(0));
    efeitos.falha = null;
    expect(await marca(a, id2)).not.toBeNull();
    await tick(depois(1));
    expect(alertasDe(id2)).toHaveLength(0);
  });

  it('o envio real grava mensagem automática do sistema na outbox sem tocar na conversa', async () => {
    await setConfig(a, config());
    const id = await conversa(a, { ultima: depois(-26) });
    await a.dono.execute(sql`update conversa set janela_expira_em = now() + interval '1 hour' where id = ${id}::uuid`);
    const leitura = () =>
      a.dono.execute<{ em: Date; de: string; estado: string }>(sql`
        select ultima_mensagem_em as em, ultima_mensagem_de as de, estado from conversa where id = ${id}::uuid`);
    const antes = (await leitura()).rows[0];
    await runAutoClose(depois(0), { ...efeitos, sendAlert: realEffects.sendAlert }, 100, [a.tenantId]);
    const { rows } = await a.dono.execute<Corpo>(sql`
      select m.autor_tipo, m.direcao, m.dados, m.conteudo, o.estado as estado_outbox
        from mensagem m join outbox_mensagem o on o.mensagem_id = m.id
       where m.conversa_id = ${id}::uuid`);
    expect(rows).toEqual([
      { autor_tipo: 'sistema', direcao: 'saida', dados: { automatica: 'alerta_inatividade' }, conteudo: 'Ainda está aí?', estado_outbox: 'pendente' },
    ]);
    expect((await leitura()).rows[0]).toEqual(antes);
    expect(await marca(a, id)).not.toBeNull();
    const { rows: ev } = await a.dono.execute(sql`
      select 1 from evento_atendimento where conversa_id = ${id}::uuid and tipo = 'mensagem_saida'`);
    expect(ev).toHaveLength(0);
  });
});
