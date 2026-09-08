import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env['PIPE_FILAS'] = 'memoria';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_CHAVES_SEGREDO'] ??= `teste:${Buffer.alloc(32, 17).toString('base64')}`;
process.env['PIPE_CHAVE_SEGREDO_ATUAL'] ??= 'teste';

const { NOME_DO_COOKIE, criarToken } = await import('@pipe/autenticacao');
const { subirApi } = await import('../src/servidor.js');
const { montarCenario } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof subirApi>>;

/**
 * Transferência: encerra a conversa e abre outra no destino.
 *
 * Não é transição de estado — está decidido em `packages/core/src/conversa/maquina.ts`
 * ("Transferência não é transição: ela encerra a conversa … e abre outra no destino"),
 * que é a regra da Blip. Estes testes trancam as consequências que doem se forem
 * esquecidas: a janela de 24h herdada, o evento de encerramento com
 * `encerrada_por = transferencia`, e a linha em `atribuicao` que costura as duas.
 */

let cenario: Cenario;
let api: ApiNoAr;
let cookie: string;
let contatoId: string;
let outroAtendenteId: string;
let outraFilaId: string;

beforeAll(async () => {
  cenario = await montarCenario(`transf-${randomUUID().slice(0, 8)}`);
  api = await subirApi(0);

  const novo = criarToken();
  await cenario.dono.execute(sql`
    insert into sessao (tenant_id, usuario_id, token_hash, expira_em, origem)
    values (${cenario.tenantId}, ${cenario.atendenteId}, ${novo.hash}, ${novo.expiraEm}, 'google')
  `);
  cookie = novo.token;

  const { rows: c } = await cenario.dono.execute<{ id: string }>(sql`
    insert into contato (tenant_id, nome, telefone_e164)
    values (${cenario.tenantId}, 'Cliente Transf', '+5511933332222') returning id
  `);
  contatoId = c[0]!.id;

  const { rows: u } = await cenario.dono.execute<{ id: string }>(sql`
    insert into usuario (tenant_id, nome, email)
    values (${cenario.tenantId}, 'Davi Destino', ${`davi-${randomUUID().slice(0, 8)}@e2e.pipe.app`})
    returning id
  `);
  outroAtendenteId = u[0]!.id;

  const { rows: f } = await cenario.dono.execute<{ id: string }>(sql`
    insert into fila (tenant_id, nome) values (${cenario.tenantId}, ${`Financeiro ${randomUUID().slice(0, 6)}`})
    returning id
  `);
  outraFilaId = f[0]!.id;
});

afterAll(async () => {
  await api.fechar();
  await cenario.encerrar();
});

async function novaConversa(
  atendenteId: string | null = cenario.atendenteId,
  estado = 'em_atendimento',
): Promise<string> {
  const { rows } = await cenario.dono.execute<{ id: string }>(sql`
    insert into conversa (
      tenant_id, inbox_id, contato_id, fila_id, atendente_id, estado, prioridade,
      janela_expira_em, ultima_mensagem_em, ultima_mensagem_de, atribuida_em,
      primeira_resposta_em, em_espera_desde
    ) values (
      ${cenario.tenantId}, ${cenario.inboxId}, ${contatoId}, ${cenario.filaId},
      ${atendenteId}, ${estado}, 'alta',
      now() + interval '20 hours', now() - interval '5 minutes', 'contato',
      now() - interval '10 minutes', now() - interval '8 minutes',
      ${estado === 'em_espera' ? sql`now() - interval '30 seconds'` : null}
    ) returning id
  `);
  return rows[0]!.id;
}

function transferir(conversaId: string, corpo: Record<string, unknown>): Promise<Response> {
  return fetch(`${api.url}/v1/conversas/${conversaId}/transferir`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: `${NOME_DO_COOKIE}=${cookie}` },
    body: JSON.stringify(corpo),
  });
}

async function conversa(id: string) {
  const { rows } = await cenario.dono.execute<{
    estado: string;
    fila_id: string | null;
    atendente_id: string | null;
    prioridade: string;
    encerrada_em: Date | null;
    motivo_encerramento: string | null;
    janela_expira_em: Date | null;
    primeira_resposta_em: Date | null;
    ultima_mensagem_de: string | null;
  }>(sql`
    select estado, fila_id, atendente_id, prioridade, encerrada_em, motivo_encerramento,
           janela_expira_em, primeira_resposta_em, ultima_mensagem_de
      from conversa where id = ${id}::uuid
  `);
  return rows[0]!;
}

async function eventosDe(id: string): Promise<string[]> {
  const { rows } = await cenario.dono.execute<{ tipo: string }>(
    sql`select tipo from evento_atendimento where conversa_id = ${id}::uuid order by em, tipo`,
  );
  return rows.map((r) => r.tipo);
}

describe('transferir para fila', () => {
  it('encerra a conversa e abre outra na fila de destino', async () => {
    const antiga = await novaConversa();

    const resposta = await transferir(antiga, { para_fila_id: outraFilaId, motivo: 'Setor errado' });

    expect(resposta.status).toBe(201);
    const corpo = (await resposta.json()) as { de_conversa_id: string; para_conversa_id: string; estado: string };
    expect(corpo.de_conversa_id).toBe(antiga);
    expect(corpo.estado).toBe('na_fila');

    expect((await conversa(antiga)).estado).toBe('encerrada');
    const nova = await conversa(corpo.para_conversa_id);
    expect(nova.estado).toBe('na_fila');
    expect(nova.fila_id).toBe(outraFilaId);
    expect(nova.atendente_id).toBeNull();
  });

  it('a conversa encerrada carimba `encerrada_por = transferencia`', async () => {
    const antiga = await novaConversa();
    await transferir(antiga, { para_fila_id: outraFilaId });

    expect((await conversa(antiga)).motivo_encerramento).toBe('Transferida');
    const { rows } = await cenario.dono.execute<{ dados: Record<string, string> }>(sql`
      select dados from evento_atendimento
       where conversa_id = ${antiga}::uuid and tipo = 'encerrada' limit 1
    `);
    // É o que separa, no relatório, a conversa que ACABOU da que só mudou de mãos.
    expect(rows[0]?.dados['encerrada_por']).toBe('transferencia');
  });

  it('HERDA a janela de 24 horas — sem isso quem recebe não manda texto livre', async () => {
    const antiga = await novaConversa();
    const antes = await conversa(antiga);

    const r = await transferir(antiga, { para_fila_id: outraFilaId });
    const { para_conversa_id } = (await r.json()) as { para_conversa_id: string };

    const nova = await conversa(para_conversa_id);
    expect(nova.janela_expira_em).not.toBeNull();
    expect(new Date(nova.janela_expira_em!).getTime()).toBe(
      new Date(antes.janela_expira_em!).getTime(),
    );
    // E a última mensagem, senão o fechamento automático trataria a nova como recém-nascida.
    expect(nova.ultima_mensagem_de).toBe('contato');
  });

  it('herda a prioridade e NÃO herda a primeira resposta', async () => {
    const antiga = await novaConversa();

    const r = await transferir(antiga, { para_fila_id: outraFilaId });
    const { para_conversa_id } = (await r.json()) as { para_conversa_id: string };
    const nova = await conversa(para_conversa_id);

    expect(nova.prioridade).toBe('alta');
    // O TMR de quem recebe mede quem recebe — o preço do modelo da Blip.
    expect(nova.primeira_resposta_em).toBeNull();
  });

  it('grava a linha em `atribuicao`, que costura as duas conversas', async () => {
    const antiga = await novaConversa();
    await transferir(antiga, { para_fila_id: outraFilaId, motivo: 'Setor errado' });

    const { rows } = await cenario.dono.execute<{
      de_fila_id: string;
      para_fila_id: string;
      de_usuario_id: string | null;
      motivo: string | null;
      por_usuario_id: string;
    }>(sql`select * from atribuicao where conversa_id = ${antiga}::uuid`);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.para_fila_id).toBe(outraFilaId);
    expect(rows[0]!.de_fila_id).toBe(cenario.filaId);
    expect(rows[0]!.de_usuario_id).toBe(cenario.atendenteId);
    expect(rows[0]!.motivo).toBe('Setor errado');
    expect(rows[0]!.por_usuario_id).toBe(cenario.atendenteId);
  });

  it('a conversa nova nasce com `criada` e `transferida_fila`', async () => {
    const antiga = await novaConversa();
    const r = await transferir(antiga, { para_fila_id: outraFilaId });
    const { para_conversa_id } = (await r.json()) as { para_conversa_id: string };

    const eventos = await eventosDe(para_conversa_id);
    expect(eventos).toContain('criada');
    expect(eventos).toContain('transferida_fila');
  });
});

describe('transferir para atendente', () => {
  it('a conversa nova já nasce atribuída, com evento `atribuida`', async () => {
    const antiga = await novaConversa();

    const r = await transferir(antiga, { para_atendente_id: outroAtendenteId });
    const corpo = (await r.json()) as { para_conversa_id: string; estado: string };

    expect(corpo.estado).toBe('atribuida');
    const nova = await conversa(corpo.para_conversa_id);
    expect(nova.atendente_id).toBe(outroAtendenteId);
    expect(await eventosDe(corpo.para_conversa_id)).toContain('atribuida');
  });

  it('fecha a espera em aberto antes de transferir', async () => {
    const antiga = await novaConversa(cenario.atendenteId, 'em_espera');

    await transferir(antiga, { para_atendente_id: outroAtendenteId });

    expect(await eventosDe(antiga)).toContain('espera_encerrada');
    const { rows } = await cenario.dono.execute<{ pausado_seg: number }>(
      sql`select pausado_seg from conversa where id = ${antiga}::uuid`,
    );
    expect(rows[0]!.pausado_seg).toBeGreaterThan(0);
  });
});

describe('recusas', () => {
  it('exige exatamente um destino', async () => {
    const antiga = await novaConversa();
    expect((await transferir(antiga, {})).status).toBe(400);
    expect(
      (await transferir(antiga, { para_fila_id: outraFilaId, para_atendente_id: outroAtendenteId }))
        .status,
    ).toBe(400);
  });

  it('recusa transferir para o mesmo destino', async () => {
    const antiga = await novaConversa();
    const resposta = await transferir(antiga, { para_atendente_id: cenario.atendenteId });
    expect(resposta.status).toBe(409);
  });

  it('recusa fila e atendente inexistentes', async () => {
    const antiga = await novaConversa();
    expect((await transferir(antiga, { para_fila_id: randomUUID() })).status).toBe(404);
    expect((await transferir(antiga, { para_atendente_id: randomUUID() })).status).toBe(404);
  });

  it('recusa conversa já encerrada', async () => {
    const antiga = await novaConversa();
    await transferir(antiga, { para_fila_id: outraFilaId });
    expect((await transferir(antiga, { para_fila_id: cenario.filaId })).status).toBe(409);
  });

  it('sem a permissão `conversa.transferir`, não transfere conversa de outro', async () => {
    // É a diferença entre atendente e supervisor: quem transfere a própria não precisa
    // da permissão; quem transfere a alheia precisa.
    const deOutro = await novaConversa(outroAtendenteId);
    const resposta = await transferir(deOutro, { para_fila_id: outraFilaId });
    expect(resposta.status).toBe(403);
    expect((await conversa(deOutro)).estado).toBe('em_atendimento');
  });

  it('COM a permissão, o supervisor transfere a conversa de outro', async () => {
    const { rows: p } = await cenario.dono.execute<{ id: string }>(sql`
      insert into papel (tenant_id, nome) values (${cenario.tenantId}, ${`Supervisor ${randomUUID().slice(0, 6)}`})
      returning id
    `);
    const papelId = p[0]!.id;
    // `conversa.transferir` já vem da semente (`packages/db/src/semente.ts`): a
    // permissão é catálogo global, não dado de tenant.
    await cenario.dono.execute(sql`
      insert into papel_permissao (tenant_id, papel_id, permissao_codigo)
      values (${cenario.tenantId}, ${papelId}, 'conversa.transferir') on conflict do nothing
    `);
    await cenario.dono.execute(sql`
      insert into usuario_papel (tenant_id, usuario_id, papel_id)
      values (${cenario.tenantId}, ${cenario.atendenteId}, ${papelId}) on conflict do nothing
    `);

    const deOutro = await novaConversa(outroAtendenteId);
    const resposta = await transferir(deOutro, { para_fila_id: outraFilaId });

    expect(resposta.status).toBe(201);
    expect((await conversa(deOutro)).estado).toBe('encerrada');
  });
});
