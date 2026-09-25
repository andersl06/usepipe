import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env['PIPE_FILAS'] = 'memoria';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_CHAVES_SEGREDO'] ??= `teste:${Buffer.alloc(32, 19).toString('base64')}`;
process.env['PIPE_CHAVE_SEGREDO_ATUAL'] ??= 'teste';

const { NOME_DO_COOKIE, createTokencriarTokencreateToken } = await import('@pipe/authentication');
const { upApi } = await import('../src/servidor.js');
const { montarCenario } = await import('./ajuda.js');
const { telefoneValido, MAX_CONTACTS_BY_TRIGGER } = await import('../src/dominio/mensagem-ativa.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof upApi>>;

/**
 * Mensagem ativa: disparo de template para uma lista.
 *
 * Os números conferidos aqui são os da Blip (`referencias-blip/pesquisa/blip-desk-mensagens-ativas.md`):
 * teto de 15 contatos, recusa por contato já em atendimento (código 1602 deles) e por
 * número inválido. O que estes testes mais protegem é a regra de que **o disparo não é
 * tudo-ou-nada**.
 */

let cenario: Cenario;
let api: ApiNoAr;
let cookie: string;
let templateId: string;

beforeAll(async () => {
  cenario = await montarCenario(`ativa-${randomUUID().slice(0, 8)}`);
  api = await upApi(0);

  const novo = createTokencriarTokencreateToken();
  await cenario.dono.execute(sql`
    insert into sessao (tenant_id, usuario_id, token_hash, expira_em, origem)
    values (${cenario.tenantId}, ${cenario.agentId}, ${novo.hash}, ${novo.expiresAt}, 'google')
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
    body: JSON.stringify({ canal_id: cenario.channelId, template_id: templateId, ...corpo }),
  });
}

/** Um telefone brasileiro válido e único por chamada. */
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
      contatos: [{ telefone: a, nome: 'Ana' }, { telefone: b, nome: 'Bia' }],
      parametros: ['cliente'],
    });

    expect(resposta.status).toBe(201);
    const corpo = (await resposta.json()) as {
      enviadas: number;
      refused: number;
      data: { phone: string; enviada: boolean; messageId: string | null }[];
    };
    expect(corpo.enviadas).toBe(2);
    expect(corpo.recusadas).toBe(0);
    expect(corpo.data.every((d) => d.messageId !== null)).toBe(true);
  });

  it('Queue active messages in the outbox like other sends', async () => {
    const r = await disparar({ contatos: [{ telefone: telefoneNovo() }], parametros: ['x'] });
    const { data } = (await r.json()) as { data: { messageId: string }[] };

    const { rows } = await cenario.dono.execute<{ state: string }>(
      sql`select estado from outbox_mensagem where mensagem_id = ${data[0]!.mensagem_id}::uuid`,
    );
    expect(rows[0]?.state).toBe('pendente');
  });

  it('Create an assigned conversation with an origin event for each send', async () => {
    const r = await disparar({ contatos: [{ telefone: telefoneNovo() }], parametros: ['x'] });
    const { data } = (await r.json()) as { data: { conversationId: string }[] };

    const { rows } = await cenario.dono.execute<{ agentId: string; state: string }>(
      sql`select atendente_id, estado from conversa where id = ${data[0]!.conversationId}::uuid`,
    );
    expect(rows[0]!.agentId).toBe(cenario.agentId);
    // Nasce `atribuida` e o próprio disparo já a leva a `em_atendimento` — o template
    // É a primeira mensagem do atendente.
    expect(rows[0]!.estado).toBe('em_atendimento');

    const { rows: ev } = await cenario.dono.execute<{ data: Record<string, string> }>(sql`
      select dados from evento_atendimento
       where conversa_id = ${data[0]!.conversationId}::uuid and tipo = 'criada' limit 1
    `);
    expect(ev[0]?.data['origem']).toBe('mensagem_ativa');
  });

  it('Leave the 24-hour window closed until the customer replies', async () => {
    const r = await disparar({ contatos: [{ telefone: telefoneNovo() }], parametros: ['x'] });
    const { data } = (await r.json()) as { data: { conversa_id: string }[] };

    const { rows } = await cenario.dono.execute<{ windowExpiresAt: Date | null }>(
      sql`select janela_expira_em from conversa where id = ${data[0]!.conversa_id}::uuid`,
    );
    expect(rows[0]!.windowExpiresAt).toBeNull();
  });

  it('Do not count an outbound active message as the first response', async () => {
    // Resposta pressupõe pergunta. Numa conversa aberta por disparo quem começou
    // fomos nós; carimbar `primeira_resposta` aqui cravaria TMR de zero segundo e
    // enfeitaria a média — exatamente o que a spec de métricas proíbe.
    const r = await disparar({ contatos: [{ telefone: telefoneNovo() }], parametros: ['x'] });
    const { data } = (await r.json()) as { data: { conversa_id: string }[] };

    const { rows } = await cenario.dono.execute<{ firstResponseAt: Date | null }>(
      sql`select primeira_resposta_em from conversa where id = ${data[0]!.conversa_id}::uuid`,
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
    const first = await disparar({ contatos: [{ telefone }], parametros: ['x'] });
    const { data: d1 } = (await first.json()) as { data: { contactId: string }[] };

    // Encerra para não cair na recusa de "já em atendimento".
    await cenario.dono.execute(
      sql`update conversa set estado = 'encerrada', encerrada_em = now() where contato_id = ${d1[0]!.contactId}::uuid`,
    );

    const segundo = await disparar({ contatos: [{ telefone }], parametros: ['x'] });
    const { data: d2 } = (await segundo.json()) as { data: { contactId: string }[] };

    expect(d2[0]!.contato_id).toBe(d1[0]!.contactId);
  });

  it('Accept different template parameters for each contact', async () => {
    const r = await disparar({
      contatos: [
        { telefone: telefoneNovo(), parametros: ['Ana'] },
        { telefone: telefoneNovo(), parametros: ['Bia'] },
      ],
    });
    const { data } = (await r.json()) as { data: { messageId: string }[] };

    const { rows } = await cenario.dono.execute<{ content: string }>(sql`
      select conteudo from mensagem where id in
        (${data[0]!.mensagem_id}::uuid, ${data[1]!.mensagem_id}::uuid)
      order by conteudo
    `);
    expect(rows.map((x) => x.conteudo)).toEqual([
      'Olá Ana, tudo bem?',
      'Olá Bia, tudo bem?',
    ]);
  });
});

describe('recusas — e o disparo nunca é tudo-ou-nada', () => {
  it('um número inválido no meio não derruba os bons', async () => {
    const bom = telefoneNovo();

    const resposta = await disparar({
      contatos: [{ telefone: bom }, { telefone: '+5511' }, { telefone: telefoneNovo() }],
      parametros: ['x'],
    });

    const corpo = (await resposta.json()) as {
      enviadas: number;
      refused: number;
      data: { enviada: boolean; reason: string | null }[];
    };
    expect(corpo.enviadas).toBe(2);
    expect(corpo.recusadas).toBe(1);
    expect(corpo.data.find((d) => !d.enviada)?.motivo).toBe('numero_invalido');
  });

  it('Reject contacts already in an active ticket with error 1602', async () => {
    const telefone = telefoneNovo();
    await disparar({ contatos: [{ telefone }], parametros: ['x'] });

    // A conversa do primeiro disparo continua aberta.
    const resposta = await disparar({ contatos: [{ telefone }], parametros: ['x'] });

    const corpo = (await resposta.json()) as { data: { enviada: boolean; reason: string }[] };
    expect(corpo.data[0]!.enviada).toBe(false);
    expect(corpo.data[0]!.motivo).toBe('ja_em_atendimento');
  });

  it('Reject duplicate contacts within one send', async () => {
    const telefone = telefoneNovo();
    const resposta = await disparar({
      contatos: [{ telefone }, { telefone }],
      parametros: ['x'],
    });
    const corpo = (await resposta.json()) as { data: { enviada: boolean; reason: string }[] };
    expect(corpo.data[0]!.enviada).toBe(true);
    expect(corpo.data[1]!.motivo).toBe('contato_duplicado');
  });

  it('recusa o lote acima do teto de 15', async () => {
    const contacts = Array.from({ length: MAX_CONTACTS_BY_TRIGGER + 1 }, () => ({
      telefone: telefoneNovo(),
    }));
    const resposta = await disparar({ contacts, parametros: ['x'] });
    expect(resposta.status).toBe(400);
    expect(((await resposta.json()) as { error: { code: string } }).error.codigo).toBe(
      'limit_of_contacts',
    );
  });

  it('recusa lista vazia e template ausente', async () => {
    expect((await disparar({ contatos: [] })).status).toBe(400);
    const semTemplate = await fetch(`${api.url}/v1/messages-active`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: `${NOME_DO_COOKIE}=${cookie}` },
      body: JSON.stringify({ canal_id: cenario.channelId, contatos: [{ telefone: telefoneNovo() }] }),
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
        canal_id: cenario.channelId,
        template_id: rows[0]!.id,
        contatos: [{ telefone: telefoneNovo() }],
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
          canal_id: outro.channelId,
          template_id: templateId,
          contatos: [{ telefone: telefoneNovo() }],
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
    await disparar({ contatos: [{ telefone }], parametros: ['x'] });

    const resposta = await fetch(`${api.url}/v1/messages-active`, {
      headers: { cookie: `${NOME_DO_COOKIE}=${cookie}` },
    });

    expect(resposta.status).toBe(200);
    const corpo = (await resposta.json()) as {
      windowHours: number;
      data: { phone: string; stateDelivery: string; templateName: string }[];
    };
    expect(corpo.windowHours).toBe(72);
    const linha = corpo.data.find((d) => d.telefone === telefone);
    expect(linha?.stateDelivery).toBe('pendente');
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
