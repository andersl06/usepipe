import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

// O modo tem que ser decidido antes de qualquer import que leia a variável.
process.env['PIPE_FILAS'] = 'memoria';
process.env['PIPE_WHATSAPP_CLIENTE'] = 'duble';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';

const { agregarDia, dubleWhatsApp, payloadDeStatus, processarOutbox } =
  await import('@pipe/workers');
const { subirApi } = await import('../src/servidor.js');
const { assinar, montarCenario, payloadDeMensagem, VERIFY_TOKEN } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof subirApi>>;

/**
 * Caminho inteiro, com o dublê ligado:
 * webhook de entrada → conversa e mensagem → resposta pela API → outbox → worker
 * entrega → `entregue` → status de leitura → `lida`. E o caminho da falha: mídia em
 * formato recusado nunca chega a chamar a Meta.
 *
 * Nada aqui é atalho: o dublê entra no lugar da Cloud API, e os status que ele gera
 * voltam pelo **mesmo** endpoint de webhook que a Meta usaria, com assinatura.
 */

let cenario: Cenario;
let api: ApiNoAr;
const CLIENTE = '5511988887777';

beforeAll(async () => {
  cenario = await montarCenario(randomUUID().slice(0, 8));
  api = await subirApi(0);
  dubleWhatsApp.reiniciar();
}, 180_000);

afterAll(async () => {
  await api?.fechar();
  await cenario?.encerrar();
});

async function postarWebhook(payload: unknown, assinatura?: string): Promise<Response> {
  const corpo = JSON.stringify(payload);
  return fetch(`${api.url}/webhooks/whatsapp/${cenario.canalId}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-hub-signature-256': assinatura ?? assinar(corpo),
    },
    body: corpo,
  });
}

async function comApi(caminho: string, init: RequestInit = {}, token?: string): Promise<Response> {
  return fetch(`${api.url}${caminho}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token ?? cenario.token}`,
      ...(init.headers ?? {}),
    },
  });
}

async function umaLinha<T extends Record<string, unknown>>(
  consulta: ReturnType<typeof sql>,
): Promise<T | null> {
  const { rows } = await cenario.dono.execute(consulta);
  return (rows[0] as T | undefined) ?? null;
}

/** Entrega os status que o dublê acumulou, pelo webhook, como a Meta faria. */
async function entregarStatusDoDuble(): Promise<void> {
  for (const status of dubleWhatsApp.drenarStatus()) {
    const resposta = await postarWebhook(payloadDeStatus(status));
    expect(resposta.status).toBe(200);
  }
}

describe('webhook de entrada', () => {
  it('responde ao desafio de inscrição da Meta', async () => {
    const url =
      `${api.url}/webhooks/whatsapp/${cenario.canalId}` +
      `?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=1234567890`;
    const resposta = await fetch(url);
    expect(resposta.status).toBe(200);
    expect(await resposta.text()).toBe('1234567890');
  });

  it('recusa desafio com verify_token errado', async () => {
    const url =
      `${api.url}/webhooks/whatsapp/${cenario.canalId}` +
      `?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=1`;
    const resposta = await fetch(url);
    expect(resposta.status).toBe(403);
  });

  it('recusa payload com assinatura inválida', async () => {
    const resposta = await postarWebhook(payloadDeMensagem(CLIENTE, 'oi'), 'sha256=00');
    expect(resposta.status).toBe(401);
    const corpo = (await resposta.json()) as { erro: { codigo: string } };
    expect(corpo.erro.codigo).toBe('assinatura_invalida');
  });
});

describe('caminho inteiro com o dublê', () => {
  let conversaId: string;
  let mensagemSaidaId: string;

  it('mensagem de entrada cria contato, conversa e mensagem, e abre a janela', async () => {
    const resposta = await postarWebhook(
      payloadDeMensagem(CLIENTE, 'Bom dia, preciso da segunda via'),
    );
    expect(resposta.status).toBe(200);

    const conversa = await umaLinha<{
      id: string;
      estado: string;
      atendente_id: string | null;
      janela_expira_em: Date | string | null;
      ultima_mensagem_de: string | null;
    }>(sql`
      select c.id, c.estado, c.atendente_id, c.janela_expira_em, c.ultima_mensagem_de
        from conversa c
        join contato ct on ct.id = c.contato_id
       where c.tenant_id = ${cenario.tenantId}::uuid and ct.telefone_e164 = ${`+${CLIENTE}`}
       limit 1
    `);
    expect(conversa).not.toBeNull();
    conversaId = conversa!.id;

    // Distribuição por carga: o único atendente online da fila recebeu a conversa.
    expect(conversa!.atendente_id).toBe(cenario.atendenteId);
    expect(conversa!.estado).toBe('atribuida');
    expect(conversa!.ultima_mensagem_de).toBe('contato');

    // A janela abre em 24h a partir da mensagem do cliente.
    const expira = new Date(String(conversa!.janela_expira_em)).getTime();
    const daquiA24h = Date.now() + 24 * 60 * 60 * 1000;
    expect(Math.abs(expira - daquiA24h)).toBeLessThan(60_000);

    const mensagem = await umaLinha<{ direcao: string; conteudo: string }>(sql`
      select direcao, conteudo from mensagem
       where conversa_id = ${conversaId}::uuid and direcao = 'entrada' limit 1
    `);
    expect(mensagem?.conteudo).toBe('Bom dia, preciso da segunda via');
  });

  it('reentrega do mesmo evento não duplica a mensagem', async () => {
    const idProvedor = `wamid.REPETIDA.${randomUUID()}`;
    const payload = payloadDeMensagem(CLIENTE, 'mensagem repetida', { id: idProvedor });
    expect((await postarWebhook(payload)).status).toBe(200);
    expect((await postarWebhook(payload)).status).toBe(200);

    const contagem = await umaLinha<{ total: string }>(
      sql`select count(*)::text as total from mensagem where id_provedor = ${idProvedor}`,
    );
    expect(Number(contagem?.total)).toBe(1);
  });

  it('o atendente responde pela API e a mensagem nasce pendente no outbox', async () => {
    const resposta = await comApi(`/v1/conversas/${conversaId}/mensagens`, {
      method: 'POST',
      body: JSON.stringify({
        texto: 'Bom dia! Já vou providenciar.',
        atendente_id: cenario.atendenteId,
      }),
    });
    expect(resposta.status).toBe(201);
    const corpo = (await resposta.json()) as {
      id: string;
      estado_entrega: string;
      dentro_da_janela: boolean;
      categoria_cobranca: string;
    };
    mensagemSaidaId = corpo.id;

    // O ponto do trabalho: não nasce mais `enviada`.
    expect(corpo.estado_entrega).toBe('pendente');
    expect(corpo.dentro_da_janela).toBe(true);
    expect(corpo.categoria_cobranca).toBe('livre');

    const outbox = await umaLinha<{ estado: string; tentativas: number }>(
      sql`select estado, tentativas from outbox_mensagem where mensagem_id = ${mensagemSaidaId}::uuid`,
    );
    expect(outbox?.estado).toBe('pendente');
    expect(Number(outbox?.tentativas)).toBe(0);
  });

  it('o worker drena o outbox e a Meta (dublê) é chamada uma vez', async () => {
    const antes = dubleWhatsApp.chamadas.length;
    const resultados = await processarOutbox();
    const meu = resultados.find((r) => r.mensagemId === mensagemSaidaId);
    expect(meu?.estado).toBe('enviada');
    expect(dubleWhatsApp.chamadas.length).toBe(antes + 1);

    const mensagem = await umaLinha<{ estado_entrega: string; id_provedor: string | null }>(
      sql`select estado_entrega, id_provedor from mensagem where id = ${mensagemSaidaId}::uuid`,
    );
    expect(mensagem?.estado_entrega).toBe('enviada');
    expect(mensagem?.id_provedor).toMatch(/^wamid\.DUBLE/);
  });

  it('o status de entrega chega por webhook e a mensagem vira entregue', async () => {
    await entregarStatusDoDuble();

    const mensagem = await umaLinha<{ estado_entrega: string; entregue_em: string | null }>(
      sql`select estado_entrega, entregue_em from mensagem where id = ${mensagemSaidaId}::uuid`,
    );
    expect(mensagem?.estado_entrega).toBe('entregue');
    expect(mensagem?.entregue_em).not.toBeNull();

    const outbox = await umaLinha<{ estado: string }>(
      sql`select estado from outbox_mensagem where mensagem_id = ${mensagemSaidaId}::uuid`,
    );
    expect(outbox?.estado).toBe('entregue');
  });

  it('o status de leitura chega por webhook e a mensagem vira lida', async () => {
    const idProvedor = (
      await umaLinha<{ id_provedor: string }>(
        sql`select id_provedor from mensagem where id = ${mensagemSaidaId}::uuid`,
      )
    )?.id_provedor;
    expect(idProvedor).toBeTruthy();

    dubleWhatsApp.marcarLida(idProvedor!);
    await entregarStatusDoDuble();

    const mensagem = await umaLinha<{ estado_entrega: string; lida_em: string | null }>(
      sql`select estado_entrega, lida_em from mensagem where id = ${mensagemSaidaId}::uuid`,
    );
    expect(mensagem?.estado_entrega).toBe('lida');
    expect(mensagem?.lida_em).not.toBeNull();
  });

  it('status fora de ordem não faz a mensagem regredir', async () => {
    const idProvedor = (
      await umaLinha<{ id_provedor: string }>(
        sql`select id_provedor from mensagem where id = ${mensagemSaidaId}::uuid`,
      )
    )!.id_provedor;

    // `delivered` depois de `read` é rotina na Meta. Tem que ser descartado.
    await postarWebhook(
      payloadDeStatus({
        phoneNumberId: '555000111',
        id: idProvedor,
        status: 'delivered',
        recipientId: CLIENTE,
        em: new Date(),
      }),
    );
    const mensagem = await umaLinha<{ estado_entrega: string }>(
      sql`select estado_entrega from mensagem where id = ${mensagemSaidaId}::uuid`,
    );
    expect(mensagem?.estado_entrega).toBe('lida');
  });

  it('a conversa e as mensagens aparecem na REST, com cursor', async () => {
    const lista = await comApi('/v1/conversas?limit=1&order_by=criada_em[desc]');
    expect(lista.status).toBe(200);
    const pagina = (await lista.json()) as {
      data: { id: string; contato: { telefone_e164: string } }[];
      page_info: { has_next_page: boolean; end_cursor: string | null };
    };
    expect(pagina.data).toHaveLength(1);
    expect(pagina.page_info.end_cursor).toBeTruthy();

    const mensagens = await comApi(`/v1/conversas/${conversaId}/mensagens?limit=50`);
    const corpo = (await mensagens.json()) as { data: { direcao: string; estado_entrega: string | null }[] };
    expect(corpo.data.some((m) => m.direcao === 'entrada')).toBe(true);
    expect(corpo.data.some((m) => m.direcao === 'saida' && m.estado_entrega === 'lida')).toBe(true);
  });
});

describe('caminho da falha', () => {
  let conversaId: string;

  beforeAll(async () => {
    await postarWebhook(payloadDeMensagem('5521955554444', 'segue o arquivo', { nome: 'Bruno' }));
    const conversa = await umaLinha<{ id: string }>(sql`
      select c.id from conversa c
        join contato ct on ct.id = c.contato_id
       where c.tenant_id = ${cenario.tenantId}::uuid and ct.telefone_e164 = '+5521955554444'
       limit 1
    `);
    conversaId = conversa!.id;
  });

  it('mídia em formato recusado nunca chega a chamar a Meta e termina em falhou', async () => {
    const anexo = await umaLinha<{ id: string }>(sql`
      insert into anexo (tenant_id, chave_storage, mime, bytes, nome_original)
      values (${cenario.tenantId}, 'e2e/instalador.exe', 'application/x-msdownload', 4096,
              'instalador.exe')
      returning id
    `);

    const resposta = await comApi(`/v1/conversas/${conversaId}/mensagens`, {
      method: 'POST',
      body: JSON.stringify({
        tipo: 'documento',
        texto: 'segue o instalador',
        anexo_id: anexo!.id,
        atendente_id: cenario.atendenteId,
      }),
    });
    expect(resposta.status).toBe(201);
    const criada = (await resposta.json()) as { id: string; estado_entrega: string };
    expect(criada.estado_entrega).toBe('pendente');

    const chamadasAntes = dubleWhatsApp.chamadas.length;
    const resultados = await processarOutbox();
    const meu = resultados.find((r) => r.mensagemId === criada.id);

    expect(meu?.estado).toBe('falhou');
    expect(meu?.erroCodigo).toBe('midia_formato_recusado');
    // A prova de que a validação aconteceu antes da chamada.
    expect(dubleWhatsApp.chamadas.length).toBe(chamadasAntes);

    const mensagem = await umaLinha<{
      estado_entrega: string;
      erro_codigo: string;
      erro_texto: string;
    }>(sql`select estado_entrega, erro_codigo, erro_texto from mensagem where id = ${criada.id}::uuid`);
    expect(mensagem?.estado_entrega).toBe('falhou');
    expect(mensagem?.erro_codigo).toBe('midia_formato_recusado');
    // O texto é o que o Desk mostra na tela: precisa ser legível, não um código.
    expect(mensagem?.erro_texto).toContain('application/x-msdownload');
    expect(mensagem?.erro_texto).toContain('não é aceito');

    const outbox = await umaLinha<{ estado: string; ultimo_erro: string }>(
      sql`select estado, ultimo_erro from outbox_mensagem where mensagem_id = ${criada.id}::uuid`,
    );
    expect(outbox?.estado).toBe('falhou');
    expect(outbox?.ultimo_erro).toContain('midia_formato_recusado');
  });

  it('texto livre fora da janela é recusado com o motivo escrito', async () => {
    await cenario.dono.execute(sql`
      update conversa set janela_expira_em = now() - interval '1 hour'
       where id = ${conversaId}::uuid
    `);

    const chamadasAntes = dubleWhatsApp.chamadas.length;
    const resposta = await comApi(`/v1/conversas/${conversaId}/mensagens`, {
      method: 'POST',
      body: JSON.stringify({ texto: 'oi de novo', atendente_id: cenario.atendenteId }),
    });

    expect(resposta.status).toBe(409);
    const corpo = (await resposta.json()) as {
      erro: { codigo: string; mensagem: string; detalhe: { modo: string } };
    };
    expect(corpo.erro.codigo).toBe('janela_fechada');
    expect(corpo.erro.mensagem).toContain('template aprovado pela Meta');
    expect(corpo.erro.detalhe.modo).toBe('somente_template');
    expect(dubleWhatsApp.chamadas.length).toBe(chamadasAntes);
  });
});

describe('agregação diária', () => {
  it('fecha metrica_diaria a partir dos eventos e é idempotente', async () => {
    // O dia corrente no fuso do tenant — os eventos deste teste acabaram de acontecer.
    const hoje = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    const primeira = await agregarDia(cenario.tenantId, hoje);
    expect(primeira.linhas).toBeGreaterThan(0);

    const linha = await umaLinha<{
      conversas_criadas: number;
      mensagens_entrada: number;
      mensagens_saida: number;
      primeira_resposta_n: number;
    }>(sql`
      select conversas_criadas, mensagens_entrada, mensagens_saida, primeira_resposta_n
        from metrica_diaria
       where tenant_id = ${cenario.tenantId}::uuid and dia = ${hoje}::date
         and dimensao_tipo = 'fila' and dimensao_id = ${cenario.filaId}::uuid
    `);
    expect(Number(linha?.conversas_criadas)).toBeGreaterThanOrEqual(2);
    expect(Number(linha?.mensagens_entrada)).toBeGreaterThanOrEqual(3);
    expect(Number(linha?.mensagens_saida)).toBeGreaterThanOrEqual(1);
    expect(Number(linha?.primeira_resposta_n)).toBeGreaterThanOrEqual(1);

    // Rodar de novo sobrescreve, nunca soma em cima — é o que permite recalcular
    // o passado quando a definição de uma métrica muda.
    await agregarDia(cenario.tenantId, hoje);
    const depois = await umaLinha<{ conversas_criadas: number }>(sql`
      select conversas_criadas from metrica_diaria
       where tenant_id = ${cenario.tenantId}::uuid and dia = ${hoje}::date
         and dimensao_tipo = 'fila' and dimensao_id = ${cenario.filaId}::uuid
    `);
    expect(Number(depois?.conversas_criadas)).toBe(Number(linha?.conversas_criadas));
  });
});

describe('autenticação por chave de API', () => {
  it('sem Bearer, 401', async () => {
    const resposta = await fetch(`${api.url}/v1/conversas`);
    expect(resposta.status).toBe(401);
  });

  it('token inexistente, 401', async () => {
    const resposta = await comApi('/v1/conversas', {}, 'pipe_naoexiste_segredo');
    expect(resposta.status).toBe(401);
  });

  it('chave sem o escopo do recurso, 403', async () => {
    const resposta = await comApi('/v1/conversas', {}, cenario.tokenSemEscopo);
    expect(resposta.status).toBe(403);
    const corpo = (await resposta.json()) as { erro: { codigo: string } };
    expect(corpo.erro.codigo).toBe('sem_escopo');

    // A mesma chave lê fila, porque esse escopo ela tem.
    expect((await comApi('/v1/filas', {}, cenario.tokenSemEscopo)).status).toBe(200);
  });
});
