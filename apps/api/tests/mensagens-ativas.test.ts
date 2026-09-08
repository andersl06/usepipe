import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env['PIPE_FILAS'] = 'memoria';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_CHAVES_SEGREDO'] ??= `teste:${Buffer.alloc(32, 19).toString('base64')}`;
process.env['PIPE_CHAVE_SEGREDO_ATUAL'] ??= 'teste';

const { NOME_DO_COOKIE, criarToken } = await import('@pipe/autenticacao');
const { subirApi } = await import('../src/servidor.js');
const { montarCenario } = await import('./ajuda.js');
const { telefoneValido, MAX_CONTATOS_POR_DISPARO } = await import('../src/dominio/mensagem-ativa.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof subirApi>>;

/**
 * Mensagem ativa: disparo de template para uma lista.
 *
 * Os números conferidos aqui são os da Blip (`docs/pesquisa/blip-desk-mensagens-ativas.md`):
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
  api = await subirApi(0);

  const novo = criarToken();
  await cenario.dono.execute(sql`
    insert into sessao (tenant_id, usuario_id, token_hash, expira_em, origem)
    values (${cenario.tenantId}, ${cenario.atendenteId}, ${novo.hash}, ${novo.expiraEm}, 'google')
  `);
  cookie = novo.token;

  const { rows } = await cenario.dono.execute<{ id: string }>(sql`
    insert into template_mensagem (tenant_id, canal_id, nome, idioma, categoria, corpo,
                                   status_meta, cabecalho_tipo)
    values (${cenario.tenantId}, ${cenario.canalId}, 'boas_vindas', 'pt_BR', 'utilidade',
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
  return fetch(`${api.url}/v1/mensagens-ativas`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: `${NOME_DO_COOKIE}=${cookie}` },
    body: JSON.stringify({ canal_id: cenario.canalId, template_id: templateId, ...corpo }),
  });
}

/** Um telefone brasileiro válido e único por chamada. */
let sequencia = 10_000_000;
function telefoneNovo(): string {
  sequencia += 1;
  return `+5511${String(sequencia).padStart(9, '9')}`.slice(0, 14);
}

describe('validação de telefone', () => {
  it('aceita E.164 brasileiro com 10 e 11 dígitos nacionais', () => {
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
  it('dispara para a lista e devolve o resultado POR contato', async () => {
    const a = telefoneNovo();
    const b = telefoneNovo();

    const resposta = await disparar({
      contatos: [{ telefone: a, nome: 'Ana' }, { telefone: b, nome: 'Bia' }],
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

  it('a mensagem entra no OUTBOX, como qualquer envio', async () => {
    const r = await disparar({ contatos: [{ telefone: telefoneNovo() }], parametros: ['x'] });
    const { data } = (await r.json()) as { data: { mensagem_id: string }[] };

    const { rows } = await cenario.dono.execute<{ estado: string }>(
      sql`select estado from outbox_mensagem where mensagem_id = ${data[0]!.mensagem_id}::uuid`,
    );
    expect(rows[0]?.estado).toBe('pendente');
  });

  it('cria a conversa já atribuída a quem disparou, com evento de origem', async () => {
    const r = await disparar({ contatos: [{ telefone: telefoneNovo() }], parametros: ['x'] });
    const { data } = (await r.json()) as { data: { conversa_id: string }[] };

    const { rows } = await cenario.dono.execute<{ atendente_id: string; estado: string }>(
      sql`select atendente_id, estado from conversa where id = ${data[0]!.conversa_id}::uuid`,
    );
    expect(rows[0]!.atendente_id).toBe(cenario.atendenteId);
    // Nasce `atribuida` e o próprio disparo já a leva a `em_atendimento` — o template
    // É a primeira mensagem do atendente.
    expect(rows[0]!.estado).toBe('em_atendimento');

    const { rows: ev } = await cenario.dono.execute<{ dados: Record<string, string> }>(sql`
      select dados from evento_atendimento
       where conversa_id = ${data[0]!.conversa_id}::uuid and tipo = 'criada' limit 1
    `);
    expect(ev[0]?.dados['origem']).toBe('mensagem_ativa');
  });

  it('NÃO marca a janela de 24h — quem abre é a resposta do cliente', async () => {
    const r = await disparar({ contatos: [{ telefone: telefoneNovo() }], parametros: ['x'] });
    const { data } = (await r.json()) as { data: { conversa_id: string }[] };

    const { rows } = await cenario.dono.execute<{ janela_expira_em: Date | null }>(
      sql`select janela_expira_em from conversa where id = ${data[0]!.conversa_id}::uuid`,
    );
    expect(rows[0]!.janela_expira_em).toBeNull();
  });

  it('NÃO conta como primeira resposta — senão o TMR ganharia zeros de graça', async () => {
    // Resposta pressupõe pergunta. Numa conversa aberta por disparo quem começou
    // fomos nós; carimbar `primeira_resposta` aqui cravaria TMR de zero segundo e
    // enfeitaria a média — exatamente o que a spec de métricas proíbe.
    const r = await disparar({ contatos: [{ telefone: telefoneNovo() }], parametros: ['x'] });
    const { data } = (await r.json()) as { data: { conversa_id: string }[] };

    const { rows } = await cenario.dono.execute<{ primeira_resposta_em: Date | null }>(
      sql`select primeira_resposta_em from conversa where id = ${data[0]!.conversa_id}::uuid`,
    );
    expect(rows[0]!.primeira_resposta_em).toBeNull();

    const { rows: ev } = await cenario.dono.execute<{ n: number }>(sql`
      select count(*)::int as n from evento_atendimento
       where conversa_id = ${data[0]!.conversa_id}::uuid and tipo = 'primeira_resposta'
    `);
    expect(ev[0]!.n).toBe(0);
  });

  it('reaproveita o contato existente em vez de duplicar', async () => {
    const telefone = telefoneNovo();
    const primeiro = await disparar({ contatos: [{ telefone }], parametros: ['x'] });
    const { data: d1 } = (await primeiro.json()) as { data: { contato_id: string }[] };

    // Encerra para não cair na recusa de "já em atendimento".
    await cenario.dono.execute(
      sql`update conversa set estado = 'encerrada', encerrada_em = now() where contato_id = ${d1[0]!.contato_id}::uuid`,
    );

    const segundo = await disparar({ contatos: [{ telefone }], parametros: ['x'] });
    const { data: d2 } = (await segundo.json()) as { data: { contato_id: string }[] };

    expect(d2[0]!.contato_id).toBe(d1[0]!.contato_id);
  });

  it('aceita parâmetros POR contato', async () => {
    const r = await disparar({
      contatos: [
        { telefone: telefoneNovo(), parametros: ['Ana'] },
        { telefone: telefoneNovo(), parametros: ['Bia'] },
      ],
    });
    const { data } = (await r.json()) as { data: { mensagem_id: string }[] };

    const { rows } = await cenario.dono.execute<{ conteudo: string }>(sql`
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
      recusadas: number;
      data: { enviada: boolean; motivo: string | null }[];
    };
    expect(corpo.enviadas).toBe(2);
    expect(corpo.recusadas).toBe(1);
    expect(corpo.data.find((d) => !d.enviada)?.motivo).toBe('numero_invalido');
  });

  it('recusa contato já em atendimento — o 1602 deles', async () => {
    const telefone = telefoneNovo();
    await disparar({ contatos: [{ telefone }], parametros: ['x'] });

    // A conversa do primeiro disparo continua aberta.
    const resposta = await disparar({ contatos: [{ telefone }], parametros: ['x'] });

    const corpo = (await resposta.json()) as { data: { enviada: boolean; motivo: string }[] };
    expect(corpo.data[0]!.enviada).toBe(false);
    expect(corpo.data[0]!.motivo).toBe('ja_em_atendimento');
  });

  it('recusa contato duplicado dentro do mesmo disparo', async () => {
    const telefone = telefoneNovo();
    const resposta = await disparar({
      contatos: [{ telefone }, { telefone }],
      parametros: ['x'],
    });
    const corpo = (await resposta.json()) as { data: { enviada: boolean; motivo: string }[] };
    expect(corpo.data[0]!.enviada).toBe(true);
    expect(corpo.data[1]!.motivo).toBe('contato_duplicado');
  });

  it('recusa o lote acima do teto de 15', async () => {
    const contatos = Array.from({ length: MAX_CONTATOS_POR_DISPARO + 1 }, () => ({
      telefone: telefoneNovo(),
    }));
    const resposta = await disparar({ contatos, parametros: ['x'] });
    expect(resposta.status).toBe(400);
    expect(((await resposta.json()) as { erro: { codigo: string } }).erro.codigo).toBe(
      'limite_de_contatos',
    );
  });

  it('recusa lista vazia e template ausente', async () => {
    expect((await disparar({ contatos: [] })).status).toBe(400);
    const semTemplate = await fetch(`${api.url}/v1/mensagens-ativas`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: `${NOME_DO_COOKIE}=${cookie}` },
      body: JSON.stringify({ canal_id: cenario.canalId, contatos: [{ telefone: telefoneNovo() }] }),
    });
    expect(semTemplate.status).toBe(400);
  });

  it('template não aprovado derruba o LOTE — é erro do disparo, não do contato', async () => {
    const { rows } = await cenario.dono.execute<{ id: string }>(sql`
      insert into template_mensagem (tenant_id, canal_id, nome, idioma, categoria, corpo,
                                     status_meta, cabecalho_tipo)
      values (${cenario.tenantId}, ${cenario.canalId}, 'reprovado', 'pt_BR', 'marketing',
              'oi', 'rejeitado', 'nenhum')
      returning id
    `);
    const resposta = await fetch(`${api.url}/v1/mensagens-ativas`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: `${NOME_DO_COOKIE}=${cookie}` },
      body: JSON.stringify({
        canal_id: cenario.canalId,
        template_id: rows[0]!.id,
        contatos: [{ telefone: telefoneNovo() }],
      }),
    });
    expect(resposta.status).toBe(409);
  });

  it('canal de outro tenant é 404, não disparo no número alheio', async () => {
    const outro = await montarCenario(`ativa-outro-${randomUUID().slice(0, 8)}`);
    try {
      const resposta = await fetch(`${api.url}/v1/mensagens-ativas`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: `${NOME_DO_COOKIE}=${cookie}` },
        body: JSON.stringify({
          canal_id: outro.canalId,
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

describe('painel das últimas 72 horas', () => {
  it('lista o que foi disparado, com estado de entrega', async () => {
    const telefone = telefoneNovo();
    await disparar({ contatos: [{ telefone }], parametros: ['x'] });

    const resposta = await fetch(`${api.url}/v1/mensagens-ativas`, {
      headers: { cookie: `${NOME_DO_COOKIE}=${cookie}` },
    });

    expect(resposta.status).toBe(200);
    const corpo = (await resposta.json()) as {
      janela_horas: number;
      data: { telefone: string; estado_entrega: string; template_nome: string }[];
    };
    expect(corpo.janela_horas).toBe(72);
    const linha = corpo.data.find((d) => d.telefone === telefone);
    expect(linha?.estado_entrega).toBe('pendente');
    expect(linha?.template_nome).toBe('boas_vindas');
  });

  it('devolve os limites em vigor, para a tela não repetir número mágico', async () => {
    const resposta = await fetch(`${api.url}/v1/mensagens-ativas/limites`, {
      headers: { cookie: `${NOME_DO_COOKIE}=${cookie}` },
    });
    const corpo = (await resposta.json()) as { max_contatos_por_disparo: number };
    expect(corpo.max_contatos_por_disparo).toBe(15);
  });
});
