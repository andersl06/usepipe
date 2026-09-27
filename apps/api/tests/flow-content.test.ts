import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

// The mode must be decided before any import that reads the variable.
process.env['PIPE_FILAS'] = 'memoria';
process.env['PIPE_WHATSAPP_CLIENTE'] = 'duble';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';

const { dubleWhatsApp, processarOutbox } = await import('@pipe/workers');
const { upApi } = await import('../src/servidor.js');
const { noTenant } = await import('../src/database.js');
const { importFlowOfBlip, resolveDynamicContent, toChannelOutput } = await import('../src/domain/flow.js');
const { assinar, montarCenario, payloadOfMessage } = await import('./ajuda.js');
const { DYNAMIC_CONTENT_TYPE, dynamicContentRaw } = await import('@pipe/core');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof upApi>>;

/**
 * The bot delivers every `conteudo-midia` type (figurinha/áudio/imagem/vídeo/documento) approved
 * at the gate (D-18/D-24): `SendMessage` with `application/vnd.lime.media-link+json` reaches the
 * customer through the same WhatsApp double path an agent's attachment uses. All five share this
 * envelope in the reference — they differ only by the file's real MIME (`ref/inventario-conteudo.md`).
 */

const CLIENTE = '5511922220001';

/** Published-format flow (skips the editor-export shape; `blipReadFlow` reads this directly). */
function conteudoMidia(uri: string, mime: string): unknown {
  return { type: 'application/vnd.lime.media-link+json', content: { uri, type: mime } };
}

function estadoDeEnvio(id: string, settings: unknown): unknown {
  return {
    id,
    inputActions: [{ type: 'SendMessage', settings }],
    outputs: [{ order: 0, stateId: 'raiz' }],
  };
}

const FLOW: unknown = {
  id: 'flow-content',
  states: [
    {
      id: 'raiz',
      root: true,
      input: {},
      outputs: [
        { order: 0, stateId: 'envia-figurinha', conditions: [{ source: 'input', comparison: 'equals', values: ['figurinha'] }] },
        { order: 1, stateId: 'envia-audio', conditions: [{ source: 'input', comparison: 'equals', values: ['audio'] }] },
        { order: 2, stateId: 'envia-imagem', conditions: [{ source: 'input', comparison: 'equals', values: ['imagem'] }] },
        { order: 3, stateId: 'envia-video', conditions: [{ source: 'input', comparison: 'equals', values: ['video'] }] },
        { order: 4, stateId: 'envia-documento', conditions: [{ source: 'input', comparison: 'equals', values: ['documento'] }] },
        { order: 5, stateId: 'envia-inseguro', conditions: [{ source: 'input', comparison: 'equals', values: ['inseguro'] }] },
        { order: 6, stateId: 'envia-dinamico', conditions: [{ source: 'input', comparison: 'equals', values: ['dinamico'] }] },
        { order: 7, stateId: 'raiz' },
      ],
    },
    estadoDeEnvio('envia-figurinha', conteudoMidia('https://cdn.exemplo.com/fig.webp', 'image/webp')),
    estadoDeEnvio('envia-audio', conteudoMidia('https://cdn.exemplo.com/som.mp3', 'audio/mp3')),
    estadoDeEnvio('envia-imagem', conteudoMidia('https://cdn.exemplo.com/foto.png', 'image/png')),
    estadoDeEnvio('envia-video', conteudoMidia('https://cdn.exemplo.com/clipe.mp4', 'video/mp4')),
    estadoDeEnvio('envia-documento', conteudoMidia('https://cdn.exemplo.com/doc.pdf', 'application/pdf')),
    // Same shape, insecure scheme: `confirmarUrlSegura` must fail the action, not send half a message.
    estadoDeEnvio('envia-inseguro', conteudoMidia('http://cdn.exemplo.com/foto.png', 'image/png')),
    {
      // The "Conteúdo dinâmico" card exactly as the Builder writes it (the shared core contract).
      id: 'envia-dinamico',
      inputActions: [
        {
          type: 'SetVariable',
          settings: { variable: 'conteudoLime', value: JSON.stringify({ type: 'text/plain', content: 'Olá do conteúdo dinâmico' }) },
        },
        {
          type: 'SendRawMessage',
          settings: { id: 'd1', type: DYNAMIC_CONTENT_TYPE, rawContent: dynamicContentRaw('conteudoLime') },
        },
      ],
      outputs: [{ order: 0, stateId: 'raiz' }],
    },
  ],
};

let cenario: Cenario;
let api: ApiNoAr;

async function falar(texto: string): Promise<void> {
  const corpo = JSON.stringify(payloadOfMessage(CLIENTE, texto));
  const resposta = await fetch(`${api.url}/webhooks/whatsapp/${cenario.channelId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': assinar(corpo) },
    body: corpo,
  });
  expect(resposta.status).toBe(200);
}

type LinhaMensagem = { id: string; tipo: string; conteudo: string | null; dados: unknown };

async function ultimaMensagemDoBot(conversationId: string): Promise<LinhaMensagem> {
  const { rows } = await cenario.dono.execute<LinhaMensagem>(sql`
    select id, tipo, conteudo, dados from mensagem
     where conversa_id = ${conversationId}::uuid and autor_tipo = 'bot'
     order by criada_em desc limit 1
  `);
  expect(rows[0]).toBeDefined();
  return rows[0]!;
}

async function conversationId(): Promise<string> {
  const { rows } = await cenario.dono.execute<{ id: string }>(sql`
    select c.id from conversa c join contato ct on ct.id = c.contato_id
     where c.tenant_id = ${cenario.tenantId}::uuid and ct.telefone_e164 = ${`+${CLIENTE}`}
       and c.estado <> 'encerrada'
     order by c.criada_em desc limit 1
  `);
  expect(rows[0]).toBeDefined();
  return rows[0]!.id;
}

beforeAll(async () => {
  cenario = await montarCenario(`flow-content-${randomUUID().slice(0, 8)}`);
  api = await upApi(0);
  dubleWhatsApp.reiniciar();
  const r = await noTenant(cenario.tenantId, (tx) =>
    importFlowOfBlip(tx, {
      tenantId: cenario.tenantId,
      name: 'Conteúdo de mídia',
      channelId: cenario.channelId,
      json: FLOW,
      publicar: true,
    }),
  );
  expect(r.errorOfValidation).toBeNull();
}, 180_000);

afterAll(async () => {
  await api?.fechar();
  await cenario?.encerrar();
});

describe('bot entrega os cinco tipos do slot conteudo-midia', () => {
  it.each([
    ['figurinha', 'imagem', 'https://cdn.exemplo.com/fig.webp', 'image/webp'],
    ['audio', 'audio', 'https://cdn.exemplo.com/som.mp3', 'audio/mp3'],
    ['imagem', 'imagem', 'https://cdn.exemplo.com/foto.png', 'image/png'],
    ['video', 'video', 'https://cdn.exemplo.com/clipe.mp4', 'video/mp4'],
    ['documento', 'documento', 'https://cdn.exemplo.com/doc.pdf', 'application/pdf'],
  ])('%s: grava tipo=%s, entrega via WhatsApp com o link', async (gatilho, tipoEsperado, url, mime) => {
    await falar(gatilho);
    const conversaId = await conversationId();
    const linha = await ultimaMensagemDoBot(conversaId);
    expect(linha.tipo).toBe(tipoEsperado);
    expect(linha.conteudo).toBeNull();
    expect(linha.dados).toEqual({ midia: { url, mime, titulo: null, nomeArquivo: null } });

    const antes = dubleWhatsApp.chamadas.length;
    const resultados = await processarOutbox();
    expect(resultados.some((r) => r.messageId === linha.id && r.state === 'enviada')).toBe(true);
    expect(
      dubleWhatsApp.chamadas.slice(antes).some((c) => c.para === CLIENTE && c.tipo === tipoEsperado),
    ).toBe(true);
  });

  it('Conteúdo dinâmico escrito pelo Builder resolve e chega ao cliente como texto (CR-04)', async () => {
    await falar('dinamico');
    const linha = await ultimaMensagemDoBot(await conversationId());
    expect(linha.tipo).toBe('texto');
    expect(linha.conteudo).toBe('Olá do conteúdo dinâmico');
  });

  it('URL insegura (não https) falha a ação sem gravar mensagem pela metade, e transfere a conversa', async () => {
    const conversaId = await conversationId();
    const contarMensagensDoBot = async (): Promise<number> => {
      const { rows } = await cenario.dono.execute<{ n: string }>(sql`
        select count(*)::text as n from mensagem
         where conversa_id = ${conversaId}::uuid and autor_tipo = 'bot'
      `);
      return Number(rows[0]?.n ?? 0);
    };
    const antes = await contarMensagensDoBot();

    await falar('inseguro');

    // The action fails before recording anything: no half-sent message for this trigger.
    expect(await contarMensagensDoBot()).toBe(antes);

    const { rows: execucao } = await cenario.dono.execute<{ estado: string }>(sql`
      select estado from execucao_fluxo where conversa_id = ${conversaId}::uuid
       order by iniciada_em desc limit 1
    `);
    expect(execucao[0]?.estado).toBe('falhou');

    const { rows: conversa } = await cenario.dono.execute<{ fila_id: string | null }>(sql`
      select fila_id from conversa where id = ${conversaId}::uuid
    `);
    expect(conversa[0]?.fila_id).not.toBeNull();
  });
});

describe('interactive content channel output', () => {
  it('serializes confirmed interactive content and rejects an insecure web link', () => {
    expect(
      toChannelOutput({
        tipo: 'application/vnd.lime.location+json',
        conteudo: { latitude: -19.9, longitude: -43.9 },
      }),
    ).toMatchObject({ tipo: 'localizacao', dados: { localizacao: { latitude: -19.9, longitude: -43.9 } } });
    expect(
      toChannelOutput({
        tipo: 'application/vnd.lime.web-link+json',
        conteudo: { uri: 'https://example.com', text: 'Abrir' },
      }),
    ).toMatchObject({ tipo: 'texto', texto: 'Abrir\nhttps://example.com', dados: { webLink: { uri: 'https://example.com' } } });
    expect(() =>
      toChannelOutput({
        tipo: 'application/vnd.lime.web-link+json',
        conteudo: { uri: 'http://example.com' },
      }),
    ).toThrow('A URL precisa usar HTTPS.');
  });
});

describe('dynamic content', () => {
  const http = (uri: string) => ({
    tipo: 'application/vnd.pipe.http-content+json',
    conteudo: { uri, type: 'text/plain', headers: {}, requestTimeout: 60 },
  });

  it('resolves HTTP content through the safe outbound boundary', async () => {
    const resolved = await resolveDynamicContent(http('https://content.example/test'), 'tenant', {
      callHttp: async () => ({ ok: true, status: 200, texto: async () => 'Resposta HTTP' }),
    });
    expect(toChannelOutput(resolved)).toMatchObject({ tipo: 'texto', texto: 'Resposta HTTP' });
  });

  it.each(['http://localhost/test', 'https://169.254.169.254/latest/meta-data'])('refuses unsafe HTTP URL %s', async (uri) => {
    await expect(resolveDynamicContent(http(uri), 'tenant')).rejects.toThrow();
  });

  it('fails HTTP timeout and invalid dynamic JSON without a partial output', async () => {
    await expect(
      resolveDynamicContent(http('https://content.example/slow'), 'tenant', {
        callHttp: async () => { throw new Error('timeout'); },
      }),
    ).rejects.toThrow('Conteúdo HTTP');
    await expect(
      resolveDynamicContent(
        { tipo: 'application/vnd.pipe.dynamic-content+json', conteudo: '{not json', bruto: true },
        'tenant',
      ),
    ).rejects.toThrow('JSON LIME válido');
  });
});
