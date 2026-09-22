import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env['PIPE_FILAS'] = 'memoria';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_CHAVES_SEGREDO'] ??= `teste:${Buffer.alloc(32, 11).toString('base64')}`;
process.env['PIPE_CHAVE_SEGREDO_ATUAL'] ??= 'teste';

const { NOME_DO_COOKIE, criarToken } = await import('@pipe/autenticacao');
const { subirApi } = await import('../src/servidor.js');
const { montarCenario } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof subirApi>>;

/**
 * Encerrar e pausar têm de gravar `evento_atendimento`.
 *
 * O defeito que estes testes trancam: o Desk escrevia direto na tabela `conversa` e
 * não gravava evento nenhum. TMR, SLA e esforço ficavam cegos para tudo que o
 * atendente fazia — a Gestão mostrava número errado com cara de certo.
 *
 * Métrica sai de `evento_atendimento`, que é imutável (modelo de dados §4); o estado
 * da conversa é cache. Por isso a asserção é sempre sobre o evento, não sobre a coluna.
 */

let cenario: Cenario;
let api: ApiNoAr;
let cookie: string;
let etiquetaId: string;
let contatoId: string;
let outroAtendenteId: string;

beforeAll(async () => {
  cenario = await montarCenario(`eventos-${randomUUID().slice(0, 8)}`);
  api = await subirApi(0);

  const novo = criarToken();
  await cenario.dono.execute(sql`
    insert into sessao (tenant_id, usuario_id, token_hash, expira_em, origem)
    values (${cenario.tenantId}, ${cenario.atendenteId}, ${novo.hash}, ${novo.expiraEm}, 'google')
  `);
  cookie = novo.token;

  const { rows: e } = await cenario.dono.execute<{ id: string }>(sql`
    insert into etiqueta (tenant_id, nome) values (${cenario.tenantId}, 'Resolvido') returning id
  `);
  etiquetaId = e[0]!.id;

  const { rows: c } = await cenario.dono.execute<{ id: string }>(sql`
    insert into contato (tenant_id, nome, telefone_e164)
    values (${cenario.tenantId}, 'Cliente Eventos', '+5511944443333')
    returning id
  `);
  contatoId = c[0]!.id;

  const { rows: o } = await cenario.dono.execute<{ id: string }>(sql`
    insert into usuario (tenant_id, nome, email)
    values (${cenario.tenantId}, 'Carla Colega', ${`carla-${randomUUID().slice(0, 8)}@e2e.pipe.app`})
    returning id
  `);
  outroAtendenteId = o[0]!.id;
});

afterAll(async () => {
  await api.fechar();
  await cenario.encerrar();
});

async function novaConversa(
  estado: string,
  atendenteId: string | null = cenario.atendenteId,
): Promise<string> {
  const { rows } = await cenario.dono.execute<{ id: string }>(sql`
    insert into conversa (
      tenant_id, inbox_id, contato_id, fila_id, atendente_id, estado,
      em_espera_desde, janela_expira_em
    ) values (
      ${cenario.tenantId}, ${cenario.inboxId}, ${contatoId}, ${cenario.filaId},
      ${atendenteId}, ${estado},
      ${estado === 'em_espera' ? sql`now() - interval '30 seconds'` : null},
      now() + interval '20 hours'
    )
    returning id
  `);
  return rows[0]!.id;
}

function chamar(caminho: string, corpo?: unknown): Promise<Response> {
  return fetch(`${api.url}${caminho}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: `${NOME_DO_COOKIE}=${cookie}` },
    body: JSON.stringify(corpo ?? {}),
  });
}

async function eventosDe(conversaId: string): Promise<string[]> {
  const { rows } = await cenario.dono.execute<{ tipo: string }>(sql`
    select tipo from evento_atendimento where conversa_id = ${conversaId}::uuid order by em, tipo
  `);
  return rows.map((r) => r.tipo);
}

describe('encerrar conversa', () => {
  it('grava o evento `encerrada` — sem ele o relatório não sabe que fechou', async () => {
    const id = await novaConversa('em_atendimento');

    const resposta = await chamar(`/v1/conversas/${id}/encerrar`, { etiqueta_id: etiquetaId });

    expect(resposta.status).toBe(201);
    expect(await eventosDe(id)).toContain('encerrada');
  });

  it('carimba quem encerrou e com que etiqueta, nos dados do evento', async () => {
    const id = await novaConversa('em_atendimento');

    await chamar(`/v1/conversas/${id}/encerrar`, { etiqueta_id: etiquetaId });

    const { rows } = await cenario.dono.execute<{ usuario_id: string; dados: Record<string, string> }>(sql`
      select usuario_id, dados from evento_atendimento
       where conversa_id = ${id}::uuid and tipo = 'encerrada' limit 1
    `);
    expect(rows[0]?.usuario_id).toBe(cenario.atendenteId);
    expect(rows[0]?.dados['encerrada_por']).toBe('atendente');
    expect(rows[0]?.dados['etiqueta']).toBe('Resolvido');
  });

  it('exige etiqueta: conversa fechada sem motivo não explica nada depois', async () => {
    const id = await novaConversa('em_atendimento');
    const resposta = await chamar(`/v1/conversas/${id}/encerrar`, {});
    expect(resposta.status).toBe(400);
    expect(await eventosDe(id)).toHaveLength(0);
  });

  it('fecha a espera em aberto antes de encerrar, senão o pausado some do esforço', async () => {
    const id = await novaConversa('em_espera');

    await chamar(`/v1/conversas/${id}/encerrar`, { etiqueta_id: etiquetaId });

    const eventos = await eventosDe(id);
    expect(eventos).toContain('espera_encerrada');
    expect(eventos).toContain('encerrada');
    const { rows } = await cenario.dono.execute<{ pausado_seg: number }>(
      sql`select pausado_seg from conversa where id = ${id}::uuid`,
    );
    expect(rows[0]!.pausado_seg).toBeGreaterThan(0);
  });

  it('recusa transição inválida — encerrar o que já está encerrado', async () => {
    const id = await novaConversa('encerrada');
    const resposta = await chamar(`/v1/conversas/${id}/encerrar`, { etiqueta_id: etiquetaId });
    expect(resposta.status).toBe(409);
  });

  it('recusa conversa de outro atendente', async () => {
    const id = await novaConversa('em_atendimento', outroAtendenteId);
    const resposta = await chamar(`/v1/conversas/${id}/encerrar`, { etiqueta_id: etiquetaId });
    expect(resposta.status).toBe(403);
    expect(await eventosDe(id)).toHaveLength(0);
  });

  it('permite ao supervisor encerrar conversa de outro atendente', async () => {
    const { rows: p } = await cenario.dono.execute<{ id: string }>(sql`
      insert into papel (tenant_id, nome) values (${cenario.tenantId}, ${`Supervisor ${randomUUID().slice(0, 6)}`})
      returning id
    `);
    const papelId = p[0]!.id;
    await cenario.dono.execute(sql`
      insert into papel_permissao (tenant_id, papel_id, permissao_codigo)
      values (${cenario.tenantId}, ${papelId}, 'conversa.encerrar') on conflict do nothing
    `);
    await cenario.dono.execute(sql`
      insert into usuario_papel (tenant_id, usuario_id, papel_id)
      values (${cenario.tenantId}, ${cenario.atendenteId}, ${papelId}) on conflict do nothing
    `);

    const id = await novaConversa('em_atendimento', outroAtendenteId);
    expect((await chamar(`/v1/conversas/${id}/encerrar`, { etiqueta_id: etiquetaId })).status).toBe(201);
    expect(await eventosDe(id)).toContain('encerrada');
  });
});

describe('espera', () => {
  it('entrar em espera grava `espera_iniciada`', async () => {
    const id = await novaConversa('em_atendimento');

    const resposta = await chamar(`/v1/conversas/${id}/espera`);

    expect(resposta.status).toBe(201);
    expect(((await resposta.json()) as { estado: string }).estado).toBe('em_espera');
    expect(await eventosDe(id)).toContain('espera_iniciada');
  });

  it('sair da espera grava `espera_encerrada` com os segundos pausados', async () => {
    const id = await novaConversa('em_espera');

    const resposta = await chamar(`/v1/conversas/${id}/espera`);
    const corpo = (await resposta.json()) as { estado: string; pausado_seg: number };

    expect(corpo.estado).toBe('em_atendimento');
    // A conversa nasceu com `em_espera_desde` 30 segundos atrás.
    expect(corpo.pausado_seg).toBeGreaterThanOrEqual(29);
    const { rows } = await cenario.dono.execute<{ dados: Record<string, number> }>(sql`
      select dados from evento_atendimento
       where conversa_id = ${id}::uuid and tipo = 'espera_encerrada' limit 1
    `);
    expect(rows[0]?.dados['pausado_seg']).toBeGreaterThanOrEqual(29);
  });

  it('ida e volta deixam o par de eventos, e o acumulado na conversa', async () => {
    const id = await novaConversa('em_atendimento');

    await chamar(`/v1/conversas/${id}/espera`);
    await chamar(`/v1/conversas/${id}/espera`);

    const eventos = await eventosDe(id);
    expect(eventos.filter((t) => t === 'espera_iniciada')).toHaveLength(1);
    expect(eventos.filter((t) => t === 'espera_encerrada')).toHaveLength(1);
  });

  it('recusa conversa de outro atendente', async () => {
    const id = await novaConversa('em_atendimento', outroAtendenteId);
    const resposta = await chamar(`/v1/conversas/${id}/espera`);
    expect(resposta.status).toBe(403);
    expect(await eventosDe(id)).toHaveLength(0);
  });
});
