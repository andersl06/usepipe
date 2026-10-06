import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env['PIPE_FILAS'] = 'memoria';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_CHAVES_SEGREDO'] ??= `teste:${Buffer.alloc(32, 19).toString('base64')}`;
process.env['PIPE_CHAVE_SEGREDO_ATUAL'] ??= 'teste';

const { createToken } = await import('@pipe/authentication');
const { SESSION_COOKIE_NAME: NOME_DO_COOKIE } = await import('../src/session.js');
const { upApi } = await import('../src/servidor.js');
const { montarCenario } = await import('./ajuda.js');
const { telefoneValido, MAX_CONTACTS_BY_TRIGGER } = await import('../src/domain/message-active.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof upApi>>;

/**
 * Active message: template dispatch to a list. The numbers checked here are Blip's own (`referencias-blip/pesquisa/blip-desk-mensagens-ativas.md`): a cap of 15 contacts, rejection for a contact already in service (their code 1602) and for an invalid number. What these tests protect above all is the rule that **the dispatch is not all-or-nothing**.
 */

let cenario: Cenario;
let api: ApiNoAr;
let cookie: string;
let templateId: string;

beforeAll(async () => {
  cenario = await montarCenario(`ativa-${randomUUID().slice(0, 8)}`);
  api = await upApi(0);

  const novo = createToken();
  await cenario.dono.execute(sql`
    insert into sessao (tenant_id, usuario_id, token_hash, expira_em, origem)
    values (${cenario.tenantId}, ${cenario.agentId}, ${novo.hash}, ${novo.expiraEm}, 'google')
  `);
  cookie = novo.token;

  const { rows } = await cenario.dono.execute<{ id: string }>(sql`
    insert into template_mensagem (tenant_id, canal_id, nome, idioma, categoria, corpo,
                                   status_meta, cabecalho_tipo)
    values (${cenario.tenantId}, ${cenario.channelId}, 'boas_vindas', 'pt_BR', 'utilidade',
            'Olá {{1}}, tudo bem?', 'aprovado', 'nenhum')
    returning id
  `);
  templateId = rows[0]!.id;
});

afterAll(async () => {
  await api.fechar();
  await cenario.encerrar();
});

function disparar(corpo: Record<string, unknown>): Promise<Response> {
  return fetch(`${api.url}/v1/messages-active`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: `${NOME_DO_COOKIE}=${cookie}` },
    body: JSON.stringify({ channelId: cenario.channelId, template_id: templateId, ...corpo }),
  });
}

/** A valid Brazilian phone number, unique per call. */
let sequencia = 10_000_000;
function telefoneNovo(): string {
  sequencia += 1;
  return `+5511${String(sequencia).padStart(9, '9')}`.slice(0, 14);
}

describe('Validate Brazilian phone numbers', () => {
  it('Accept Brazilian E.164 numbers with ten or eleven national digits', () => {
    expect(telefoneValido('+5511988887777')).toBe(true);
    expect(telefoneValido('+551188887777')).toBe(true);
  });

  it('recusa o que a Meta recusaria', () => {
    expect(telefoneValido('11988887777')).toBe(false); // sem DDI
    expect(telefoneValido('+55119')).toBe(false); // curto
    expect(telefoneValido('+55119888877771234')).toBe(false); // longo
    expect(telefoneValido('+5511988887777a')).toBe(false);
  });
});

describe('disparo', () => {
  it('Send to a list and return a result for each contact', async () => {
    const a = telefoneNovo();
    const b = telefoneNovo();

    const resposta = await disparar({
      contacts: [{ phone: a, name: 'Ana' }, { phone: b, name: 'Bia' }],
      parametros: ['cliente'],
    });

    expect(resposta.status).toBe(201);
    const corpo = (await resposta.json()) as {
      enviadas: number;
      recusadas: number;
      data: { telefone: string; enviada: boolean; mensagem_id: string | null }[];
    };
    expect(corpo.enviadas).toBe(2);
    expect(corpo.recusadas).toBe(0);
    expect(corpo.data.every((d) => d.mensagem_id !== null)).toBe(true);
  });

  it('Queue active messages in the outbox like other sends', async () => {
    const r = await disparar({ contacts: [{ phone: telefoneNovo() }], parametros: ['x'] });
    const { data } = (await r.json()) as { data: { mensagem_id: string }[] };

    const { rows } = await cenario.dono.execute<{ state: string }>(
      sql`select estado as "state" from outbox_mensagem where mensagem_id = ${data[0]!.mensagem_id}::uuid`,
    );
    expect(rows[0]?.state).toBe('pendente');
  });

  it('Create an assigned conversation with an origin event for each send', async () => {
    const r = await disparar({ contacts: [{ phone: telefoneNovo() }], parametros: ['x'] });
    const { data } = (await r.json()) as { data: { conversa_id: string }[] };

    const { rows } = await cenario.dono.execute<{ agentId: string; state: string }>(
      sql`select atendente_id as "agentId", estado as state from conversa where id = ${data[0]!.conversa_id}::uuid`,
    );
    expect(rows[0]!.agentId).toBe(cenario.agentId);
    // It is created as `Assigned`, and the dispatch itself already moves it to `Open` — the template
    // is the agent's first message.
    expect(rows[0]!.state).toBe('Open');

    const { rows: ev } = await cenario.dono.execute<{ data: Record<string, string> }>(sql`
      select dados as "data" from evento_atendimento
       where conversa_id = ${data[0]!.conversa_id}::uuid and tipo = 'criada' limit 1
    `);
    expect(ev[0]?.data['origem']).toBe('mensagem_ativa');
  });

  it('Leave the 24-hour window closed until the customer replies', async () => {
    const r = await disparar({ contacts: [{ phone: telefoneNovo() }], parametros: ['x'] });
    const { data } = (await r.json()) as { data: { conversa_id: string }[] };

    const { rows } = await cenario.dono.execute<{ windowExpiresAt: Date | null }>(
      sql`select janela_expira_em as "windowExpiresAt" from conversa where id = ${data[0]!.conversa_id}::uuid`,
    );
    expect(rows[0]!.windowExpiresAt).toBeNull();
  });

  it('Do not count an outbound active message as the first response', async () => {
    // A reply presupposes a question. In a conversation opened by a dispatch, whoever started it
    // was us; stamping `primeira_resposta` here would record a zero-second TMR and
    // would flatter the average — exactly what the metrics spec forbids.
    const r = await disparar({ contacts: [{ phone: telefoneNovo() }], parametros: ['x'] });
    const { data } = (await r.json()) as { data: { conversa_id: string }[] };

    const { rows } = await cenario.dono.execute<{ firstResponseAt: Date | null }>(
      sql`select primeira_resposta_em as "firstResponseAt" from conversa where id = ${data[0]!.conversa_id}::uuid`,
    );
    expect(rows[0]!.firstResponseAt).toBeNull();

    const { rows: ev } = await cenario.dono.execute<{ n: number }>(sql`
      select count(*)::int as n from evento_atendimento
       where conversa_id = ${data[0]!.conversa_id}::uuid and tipo = 'primeira_resposta'
    `);
    expect(ev[0]!.n).toBe(0);
  });

  it('Reuse an existing contact instead of creating a duplicate', async () => {
    const telefone = telefoneNovo();
    const first = await disparar({ contacts: [{ phone: telefone }], parametros: ['x'] });
    const { data: d1 } = (await first.json()) as { data: { contato_id: string }[] };

    // Closes it so as not to hit the "already in service" rejection.
    await cenario.dono.execute(
      sql`update conversa set estado = 'ClosedAttendant', encerrada_em = now() where contato_id = ${d1[0]!.contato_id}::uuid`,
    );

    const segundo = await disparar({ contacts: [{ phone: telefone }], parametros: ['x'] });
    const { data: d2 } = (await segundo.json()) as { data: { contato_id: string }[] };

    expect(d2[0]!.contato_id).toBe(d1[0]!.contato_id);
  });

  it('Accept different template parameters for each contact', async () => {
    const r = await disparar({
      contacts: [
        { phone: telefoneNovo(), parametros: ['Ana'] },
        { phone: telefoneNovo(), parametros: ['Bia'] },
      ],
    });
    const { data } = (await r.json()) as { data: { mensagem_id: string }[] };

    const { rows } = await cenario.dono.execute<{ content: string }>(sql`
      select conteudo as "content" from mensagem where id in
        (${data[0]!.mensagem_id}::uuid, ${data[1]!.mensagem_id}::uuid)
      order by conteudo
    `);
    expect(rows.map((x) => x.content)).toEqual([
      'Olá Ana, tudo bem?',
      'Olá Bia, tudo bem?',
    ]);
  });
});

describe('recusas — e o disparo nunca é tudo-ou-nada', () => {
  it('um número inválido no meio não derruba os bons', async () => {
    const bom = telefoneNovo();

    const resposta = await disparar({
      contacts: [{ phone: bom }, { phone: '+5511' }, { phone: telefoneNovo() }],
      parametros: ['x'],
    });

    const corpo = (await resposta.json()) as {
      enviadas: number;
      recusadas: number;
      data: { enviada: boolean; motivo: string | null }[];
    };
    expect(corpo.enviadas).toBe(2);
    expect(corpo.recusadas).toBe(1);
    expect(corpo.data.find((d) => !d.enviada)?.motivo).toBe('numero_invalido');
  });

  it('Reject contacts already in an active ticket with error 1602', async () => {
    const telefone = telefoneNovo();
    await disparar({ contacts: [{ phone: telefone }], parametros: ['x'] });

    // A conversa do primeiro disparo continua aberta.
    const resposta = await disparar({ contacts: [{ phone: telefone }], parametros: ['x'] });

    const corpo = (await resposta.json()) as { data: { enviada: boolean; motivo: string }[] };
    expect(corpo.data[0]!.enviada).toBe(false);
    expect(corpo.data[0]!.motivo).toBe('ja_em_atendimento');
  });

  it('Reject duplicate contacts within one send', async () => {
    const telefone = telefoneNovo();
    const resposta = await disparar({
      contacts: [{ phone: telefone }, { phone: telefone }],
      parametros: ['x'],
    });
    const corpo = (await resposta.json()) as { data: { enviada: boolean; motivo: string }[] };
    expect(corpo.data[0]!.enviada).toBe(true);
    expect(corpo.data[1]!.motivo).toBe('contact_duplicated');
  });

  it('recusa o lote acima do teto de 15', async () => {
    const contacts = Array.from({ length: MAX_CONTACTS_BY_TRIGGER + 1 }, () => ({
      phone: telefoneNovo(),
    }));
    const resposta = await disparar({ contacts, parametros: ['x'] });
    expect(resposta.status).toBe(400);
    expect(((await resposta.json()) as { error: { code: string } }).error.code).toBe(
      'limit_of_contacts',
    );
  });

  it('recusa lista vazia e template ausente', async () => {
    expect((await disparar({ contacts: [] })).status).toBe(400);
    const semTemplate = await fetch(`${api.url}/v1/messages-active`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: `${NOME_DO_COOKIE}=${cookie}` },
      body: JSON.stringify({ channelId: cenario.channelId, contacts: [{ phone: telefoneNovo() }] }),
    });
    expect(semTemplate.status).toBe(400);
  });

  it('Reject the entire send batch when its template is unapproved', async () => {
    const { rows } = await cenario.dono.execute<{ id: string }>(sql`
      insert into template_mensagem (tenant_id, canal_id, nome, idioma, categoria, corpo,
                                     status_meta, cabecalho_tipo)
      values (${cenario.tenantId}, ${cenario.channelId}, 'reprovado', 'pt_BR', 'marketing',
              'oi', 'rejeitado', 'nenhum')
      returning id
    `);
    const resposta = await fetch(`${api.url}/v1/messages-active`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: `${NOME_DO_COOKIE}=${cookie}` },
      body: JSON.stringify({
        channelId: cenario.channelId,
        template_id: rows[0]!.id,
        contacts: [{ phone: telefoneNovo() }],
      }),
    });
    expect(resposta.status).toBe(409);
  });

  it('Return 404 for another tenant\'s channel without sending to its number', async () => {
    const outro = await montarCenario(`ativa-outro-${randomUUID().slice(0, 8)}`);
    try {
      const resposta = await fetch(`${api.url}/v1/messages-active`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: `${NOME_DO_COOKIE}=${cookie}` },
        body: JSON.stringify({
          channelId: outro.channelId,
          template_id: templateId,
          contacts: [{ phone: telefoneNovo() }],
        }),
      });
      expect(resposta.status).toBe(404);
    } finally {
      await outro.encerrar();
    }
  });
});

describe('List sends from the last 72 hours with delivery status', () => {
  it('List sent active messages with delivery status', async () => {
    const telefone = telefoneNovo();
    await disparar({ contacts: [{ phone: telefone }], parametros: ['x'] });

    const resposta = await fetch(`${api.url}/v1/messages-active`, {
      headers: { cookie: `${NOME_DO_COOKIE}=${cookie}` },
    });

    expect(resposta.status).toBe(200);
    const corpo = (await resposta.json()) as {
      windowHours: number;
      data: { telefone: string; estado_entrega: string; template_nome: string }[];
    };
    expect(corpo.windowHours).toBe(72);
    const linha = corpo.data.find((d) => d.telefone === telefone);
    expect(linha?.estado_entrega).toBe('pendente');
    expect(linha?.template_nome).toBe('boas_vindas');
  });

  it('devolve os limites em vigor, para a tela não repetir número mágico', async () => {
    const resposta = await fetch(`${api.url}/v1/messages-active/limits`, {
      headers: { cookie: `${NOME_DO_COOKIE}=${cookie}` },
    });
    const corpo = (await resposta.json()) as { maxContactsByTrigger: number };
    expect(corpo.maxContactsByTrigger).toBe(15);
  });
});

describe('Active messages follow the WhatsApp template settings', () => {
  async function newTemplate(name: string, category: string, status: string, active: boolean, channelId = cenario.channelId) {
    const { rows } = await cenario.dono.execute<{ id: string }>(sql`
      insert into template_mensagem (tenant_id, canal_id, nome, idioma, categoria, corpo,
                                     status_meta, cabecalho_tipo, ativo)
      values (${cenario.tenantId}, ${channelId}, ${name}, 'pt_BR', ${category},
              'oi', ${status}, 'nenhum', ${active})
      returning id
    `);
    return rows[0]!.id;
  }

  it('template_inativo: refuses an approved template that is switched off', async () => {
    const id = await newTemplate(`inativo_${randomUUID().slice(0, 6)}`, 'utilidade', 'aprovado', false);
    const r = await disparar({ template_id: id, contacts: [{ phone: telefoneNovo() }] });
    expect(r.status).toBe(409);
    expect(JSON.stringify(await r.json())).toContain('template_inativo');
  });

  it('template_nao_aprovado: refuses a pending template with the matching code', async () => {
    const id = await newTemplate(`pendente_${randomUUID().slice(0, 6)}`, 'marketing', 'pendente', true);
    const r = await disparar({ template_id: id, contacts: [{ phone: telefoneNovo() }] });
    expect(r.status).toBe(409);
    expect(JSON.stringify(await r.json())).toContain('template_nao_aprovado');
  });

  it('stores the billing category (categoria) of the template on the message', async () => {
    for (const category of ['marketing', 'utilidade', 'autenticacao']) {
      const id = await newTemplate(`cat_${category}_${randomUUID().slice(0, 6)}`, category, 'aprovado', true);
      const r = await disparar({ template_id: id, contacts: [{ phone: telefoneNovo() }] });
      const { data } = (await r.json()) as { data: { enviada: boolean; mensagem_id: string }[] };
      expect(data[0]!.enviada).toBe(true);
      const { rows } = await cenario.dono.execute<{ categoria: string | null }>(
        sql`select categoria_cobranca as categoria from mensagem where id = ${data[0]!.mensagem_id}::uuid`,
      );
      expect(rows[0]?.categoria).toBe(category);
    }
  });

  it('sends through a router extra channel (roteador_canal) when the router has no own channel', async () => {
    const suffix = randomUUID().slice(0, 6);
    const one = async <T extends Record<string, unknown>>(q: ReturnType<typeof sql>) =>
      (await cenario.dono.execute<T>(q)).rows[0]!;
    const extra = await one<{ id: string }>(sql`
      insert into canal (tenant_id, tipo, nome, config)
      values (${cenario.tenantId}, 'whatsapp_cloud', ${`Extra ${suffix}`}, ${JSON.stringify({
        phoneNumberId: `extra-${suffix}`,
        tokenAcesso: 'token-falso',
      })}::jsonb) returning id`);
    const router = await one<{ id: string }>(sql`
      insert into fluxo (tenant_id, nome, short_name, tipo, canal_id)
      values (${cenario.tenantId}, ${`Router ${suffix}`}, ${`rt${suffix}`}, 'roteador', null) returning id`);
    const queue = await one<{ id: string }>(
      sql`insert into fila (tenant_id, fluxo_id, nome) values (${cenario.tenantId}, ${router.id}, ${`Fila ${suffix}`}) returning id`,
    );
    await cenario.dono.execute(sql`
      insert into inbox (tenant_id, canal_id, nome, fila_padrao_id)
      values (${cenario.tenantId}, ${extra.id}, 'Entrada extra', ${queue.id})`);
    await cenario.dono.execute(sql`
      insert into roteador_canal (tenant_id, roteador_id, canal_id) values (${cenario.tenantId}, ${router.id}, ${extra.id})`);
    const id = await newTemplate(`router_${suffix}`, 'utilidade', 'aprovado', true, extra.id);

    const r = await fetch(`${api.url}/v1/messages-active`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: `${NOME_DO_COOKIE}=${cookie}` },
      body: JSON.stringify({ channelId: extra.id, template_id: id, contacts: [{ phone: telefoneNovo() }] }),
    });
    const { data } = (await r.json()) as { data: { enviada: boolean; mensagem_id: string; motivo?: string }[] };
    expect(data[0]!.enviada).toBe(true);
    const { rows } = await cenario.dono.execute<{ state: string; fila: string }>(sql`
      select o.estado as state, c.fila_id as fila
        from outbox_mensagem o join mensagem m on m.id = o.mensagem_id join conversa c on c.id = m.conversa_id
       where o.mensagem_id = ${data[0]!.mensagem_id}::uuid`);
    expect(rows[0]?.state).toBe('pendente');
    expect(rows[0]?.fila).toBe(queue.id);
  });
});
