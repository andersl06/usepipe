import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env['PIPE_FILAS'] = 'memoria';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_CHAVES_SEGREDO'] ??= `teste:${Buffer.alloc(32, 13).toString('base64')}`;
process.env['PIPE_CHAVE_SEGREDO_ATUAL'] ??= 'teste';
process.env['PIPE_COOKIE_SEGURO'] = 'false';
process.env['PIPE_COOKIE_DOMINIO'] = '';

const { NOME_DO_COOKIE, createToken } = await import('@pipe/authentication');
const { upApi } = await import('../src/servidor.js');
const { montarCenario } = await import('./ajuda.js');
const { useStorage } = await import('../src/domain/attachment.js');
const { MAX_FILES_BY_MESSAGE, MAX_BYTES_BY_FILE } = await import('@pipe/storage');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof upApi>>;

/**
 * `POST /v1/conversas/:id/mensagens/anexos` — several files in one send (`enviarAnexos`, `dominio/envio.ts`; Desk audit, item 2).
 *
 * The model follows the source: ONE message per file, in sequence, up to 10. What this file proves is "all or nothing": the whole batch is validated BEFORE the first message goes out — more than 10, a nonexistent attachment, a file over the type's ceiling, a closed window, or a conversation belonging to another agent leave NO message behind.
 */

let cenario: Cenario;
let api: ApiNoAr;
let sessionAgent: string;
let colegaId: string;

const objetos = new Map<string, Uint8Array>();

beforeAll(async () => {
  useStorage({
    guardar: async (key, data) => {
      objetos.set(key, data);
      return { key, bytes: data.byteLength };
    },
    ler: async (chave) => {
      const data = objetos.get(chave);
      return data ? { data, bytes: data.byteLength } : null;
    },
    remover: async (chave) => {
      objetos.delete(chave);
    },
  });
  cenario = await montarCenario(`anexos-lote-${randomUUID().slice(0, 8)}`);
  api = await upApi(0);
  process.env['PIPE_STORAGE_URL_BASE'] = api.url;

  const novo = createToken();
  await cenario.dono.execute(sql`
    insert into sessao (tenant_id, usuario_id, token_hash, expira_em, origem)
    values (${cenario.tenantId}, ${cenario.agentId}, ${novo.hash}, ${novo.expiraEm}, 'google')
  `);
  sessionAgent = novo.token;

  const { rows } = await cenario.dono.execute<{ id: string }>(sql`
    insert into usuario (tenant_id, nome, email)
    values (${cenario.tenantId}, 'Colega', ${`colega-${randomUUID().slice(0, 8)}@e2e.pipe.app`})
    returning id
  `);
  colegaId = rows[0]!.id;
}, 180_000);

afterAll(async () => {
  await api.fechar();
  await cenario.encerrar();
  useStorage(null);
});

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
const PDF = Buffer.from('%PDF-1.4\n%teste\n');

function withKey(): Record<string, string> {
  return { authorization: `Bearer ${cenario.token}`, 'content-type': 'application/json' };
}

function comCookie(): Record<string, string> {
  return { cookie: `pipe_session=${sessionAgent}`, 'content-type': 'application/json' };
}

async function up(dados: Buffer, mime: string, nome: string): Promise<string> {
  const resposta = await fetch(`${api.url}/v1/attachments?nome=${encodeURIComponent(nome)}`, {
    method: 'POST',
    headers: { 'content-type': mime, authorization: `Bearer ${cenario.token}` },
    body: new Uint8Array(dados),
  });
  expect(resposta.status).toBe(201);
  return ((await resposta.json()) as { id: string }).id;
}

/** A conversation with the 24h window open (or closed), assigned to `atendenteId`. */
async function createConversation(
  agentId: string | null,
  window: 'aberta' | 'fechada' = 'aberta',
): Promise<string> {
  const { rows: contacts } = await cenario.dono.execute<{ id: string }>(sql`
    insert into contato (tenant_id, nome, telefone_e164)
    values (${cenario.tenantId}, 'Cliente', ${`+55119${Math.floor(Math.random() * 1e8)}`})
    returning id
  `);
  const expira = window === 'aberta' ? sql`now() + interval '1 hour'` : sql`now() - interval '1 hour'`;
  const { rows } = await cenario.dono.execute<{ id: string }>(sql`
    insert into conversa (tenant_id, inbox_id, contato_id, fila_id, atendente_id, estado,
                          atribuida_em, janela_expira_em, ultima_mensagem_em, ultima_mensagem_de)
    values (${cenario.tenantId}, ${cenario.inboxId}::uuid, ${contacts[0]!.id}::uuid,
            ${cenario.queueId}::uuid, ${agentId}, 'atribuida', now(), ${expira},
            now() - interval '5 minutes', 'contato')
    returning id
  `);
  return rows[0]!.id;
}

async function enviarLote(
  conversationId: string,
  corpo: unknown,
  cabecalhos: Record<string, string> = withKey(),
): Promise<{ status: number; corpo: Record<string, unknown> }> {
  const resposta = await fetch(`${api.url}/v1/conversations/${conversationId}/messages/anexos`, {
    method: 'POST',
    headers: cabecalhos,
    body: JSON.stringify(corpo),
  });
  return { status: resposta.status, corpo: (await resposta.json()) as Record<string, unknown> };
}

async function messagesOf(conversaId: string) {
  const { rows } = await cenario.dono.execute<{
    id: string;
    type: string;
    attachmentId: string | null;
    content: string | null;
    stateDelivery: string;
  }>(sql`
    select id, tipo, anexo_id, conteudo, estado_entrega from mensagem
     where conversa_id = ${conversaId}::uuid and direcao = 'saida'
     order by criada_em asc, id asc
  `);
  return rows;
}

describe('POST /v1/conversations/:id/messages/anexos', () => {
  it('Create one message per file in order with the correct MIME-derived type', async () => {
    const conversationId = await createConversation(cenario.agentId);
    const foto = await up(PNG, 'image/png', 'foto.png');
    const contract = await up(PDF, 'application/pdf', 'contrato.pdf');
    const outra = await up(PNG, 'image/png', 'outra.png');

    const { status, corpo } = await enviarLote(conversationId, {
      anexo_ids: [foto, contract, outra],
      texto: 'Segue o material',
    });
    expect(status).toBe(201);
    const messages = corpo['mensagens'] as { id: string; stateDelivery: string }[];
    expect(messages).toHaveLength(3);
    expect(messages.every((m) => m.stateDelivery === 'pendente')).toBe(true);

    // // In the order the response says they went out (the batch's order), not the clock's.
    const todas = await messagesOf(conversationId);
    const gravadas = messages.map((m) => todas.find((g) => g.id === m.id)!);
    expect(gravadas.map((m) => m.attachmentId)).toEqual([foto, contract, outra]);
    expect(gravadas.map((m) => m.type)).toEqual(['imagem', 'documento', 'imagem']);
    // // The caption goes on the FIRST one, only.
    expect(gravadas.map((m) => m.content)).toEqual(['Segue o material', null, null]);

    const { rows: outbox } = await cenario.dono.execute<{ n: string }>(sql`
      select count(*)::text as n from outbox_mensagem
       where mensagem_id in (select id from mensagem where conversa_id = ${conversationId}::uuid)
    `);
    expect(Number(outbox[0]?.n)).toBe(3);

    const { rows: conversation } = await cenario.dono.execute<{ state: string }>(
      sql`select estado from conversa where id = ${conversationId}::uuid`,
    );
    expect(conversation[0]?.state).toBe('em_atendimento');
  });

  it('Reject a batch of more than ten files without sending any', async () => {
    const conversaId = await createConversation(cenario.agentId);
    const ids: string[] = [];
    for (let i = 0; i <= MAX_FILES_BY_MESSAGE; i += 1) {
      ids.push(await up(PNG, 'image/png', `f${i}.png`));
    }
    const { status, corpo } = await enviarLote(conversaId, { anexo_ids: ids });
    expect(status).toBe(400);
    expect((corpo['erro'] as { code: string }).code).toBe('attachments_excessive');
    expect(await messagesOf(conversaId)).toHaveLength(0);
  });

  it('Reject an entire batch containing a missing attachment without creating messages', async () => {
    const conversaId = await createConversation(cenario.agentId);
    const ok1 = await up(PNG, 'image/png', 'a.png');
    const ok2 = await up(PNG, 'image/png', 'b.png');
    const { status } = await enviarLote(conversaId, { anexo_ids: [ok1, randomUUID(), ok2] });
    expect(status).toBe(404);
    expect(await messagesOf(conversaId)).toHaveLength(0);
  });

  it('Reject the whole batch and identify a file exceeding its type limit', async () => {
    const conversaId = await createConversation(cenario.agentId);
    const ok = await up(PNG, 'image/png', 'ok.png');
    const grande = await up(PDF, 'application/pdf', 'enorme.pdf');
    // // The upload already blocks by size; to prove the per-file check in the BATCH, the
    // // line is tampered with the owner role, as if it had come in through another path.
    await cenario.dono.execute(sql`
      update anexo set bytes = ${MAX_BYTES_BY_FILE + 1} where id = ${grande}::uuid
    `);
    const { status, corpo } = await enviarLote(conversaId, { anexo_ids: [ok, grande] });
    expect(status).toBe(400);
    const error = corpo['erro'] as { code: string; message: string };
    expect(error.code).toBe('file_large_excessive');
    expect(error.message).toContain('enorme.pdf');
    expect(await messagesOf(conversaId)).toHaveLength(0);
  });

  it('Return 400 when `anexo_ids` is absent or empty', async () => {
    const conversaId = await createConversation(cenario.agentId);
    expect((await enviarLote(conversaId, {})).status).toBe(400);
    expect((await enviarLote(conversaId, { anexo_ids: [] })).status).toBe(400);
    expect((await enviarLote(conversaId, { anexo_ids: 'x' })).status).toBe(400);
  });

  it('Return 409 without sending attachments after the 24-hour window closes', async () => {
    const conversaId = await createConversation(cenario.agentId, 'fechada');
    const a1 = await up(PNG, 'image/png', 'a.png');
    const a2 = await up(PNG, 'image/png', 'b.png');
    const { status, corpo } = await enviarLote(conversaId, { anexo_ids: [a1, a2] });
    expect(status).toBe(409);
    expect((corpo['erro'] as { code: string }).code).toBe('janela_fechada');
    expect(await messagesOf(conversaId)).toHaveLength(0);
  });

  it('Allow the owning Desk agent to send attachments and return 403 for another agent', async () => {
    const minha = await createConversation(cenario.agentId);
    const a1 = await up(PNG, 'image/png', 'a.png');
    const a2 = await up(PNG, 'image/png', 'b.png');
    const ok = await enviarLote(minha, { anexo_ids: [a1, a2] }, comCookie());
    expect(ok.status).toBe(201);
    const gravadas = await messagesOf(minha);
    expect(gravadas).toHaveLength(2);

    const { rows } = await cenario.dono.execute<{ authorId: string | null }>(
      sql`select autor_id from mensagem where id = ${gravadas[0]!.id}::uuid`,
    );
    expect(rows[0]?.authorId).toBe(cenario.agentId);

    const doColega = await createConversation(colegaId);
    const recusa = await enviarLote(doColega, { anexo_ids: [a1] }, comCookie());
    expect(recusa.status).toBe(403);
    expect(await messagesOf(doColega)).toHaveLength(0);
  });

  it('Send a repeated attachment only once within a batch', async () => {
    const conversaId = await createConversation(cenario.agentId);
    const a1 = await up(PNG, 'image/png', 'a.png');
    const { status, corpo } = await enviarLote(conversaId, { anexo_ids: [a1, a1] });
    expect(status).toBe(201);
    expect(corpo['mensagens']).toHaveLength(1);
  });
});
