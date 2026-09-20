import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

// O modo tem que ser decidido antes de qualquer import que leia a variável.
process.env['PIPE_FILAS'] = 'memoria';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_COOKIE_SEGURO'] = 'false';
process.env['PIPE_COOKIE_DOMINIO'] = '';

const { NOME_DO_COOKIE, criarToken } = await import('@pipe/autenticacao');
const { subirApi } = await import('../src/servidor.js');
const { montarCenario } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof subirApi>>;

/**
 * `POST /v1/desk/acoes/:acao` (`controladores/desk.ts`, `dominio/desk/acoes.ts`).
 *
 * Nenhum teste existia para este controlador inteiro — nem as leituras, nem as
 * cinco ações (`definirStatus`, `cairPorInatividade`, `salvarNotaInterna`,
 * `atender`, `transferirEmMassa`). Este arquivo cobre as ações: elas GRAVAM,
 * o `atendenteId`/`tenantId` vêm sempre da SESSÃO (nunca do corpo), e a lista
 * de nomes aceitos é FECHADA.
 */

let a: Cenario;
let sessaoAtendente: string;
let colegaId: string;

async function abrirSessao(cenario: Cenario, usuarioId: string): Promise<string> {
  const novo = criarToken();
  await cenario.dono.execute(sql`
    insert into sessao (tenant_id, usuario_id, token_hash, expira_em, origem)
    values (${cenario.tenantId}, ${usuarioId}, ${novo.hash}, ${novo.expiraEm}, 'google')
  `);
  return novo.token;
}

function comCookie(token: string): Record<string, string> {
  return { cookie: `${NOME_DO_COOKIE}=${token}`, 'content-type': 'application/json' };
}

let api: ApiNoAr;

async function acao(
  sessao: string | null,
  nome: string,
  campos: Record<string, string | string[]> = {},
): Promise<{ status: number; corpo: Record<string, unknown> }> {
  const resposta = await fetch(`${api.url}/v1/desk/acoes/${nome}`, {
    method: 'POST',
    headers: sessao ? comCookie(sessao) : { 'content-type': 'application/json' },
    body: JSON.stringify({ campos }),
  });
  return { status: resposta.status, corpo: (await resposta.json()) as Record<string, unknown> };
}

async function statusDe(
  usuarioId: string,
): Promise<{ estado: string; desde: Date | string } | undefined> {
  const { rows } = await a.dono.execute<{ estado: string; desde: Date | string }>(
    sql`select estado, desde from status_atendente where usuario_id = ${usuarioId}::uuid`,
  );
  return rows[0];
}

async function pausaAbertaDe(usuarioId: string) {
  const { rows } = await a.dono.execute<{ id: string; motivo_id: string | null }>(sql`
    select id, motivo_id from pausa
     where usuario_id = ${usuarioId}::uuid and encerrada_em is null
  `);
  return rows[0] ?? null;
}

async function criarMotivoDePausa(nome = `Motivo ${randomUUID().slice(0, 6)}`): Promise<string> {
  const { rows } = await a.dono.execute<{ id: string }>(
    sql`insert into motivo_pausa (tenant_id, nome) values (${a.tenantId}, ${nome}) returning id`,
  );
  return rows[0]!.id;
}

async function criarContato(): Promise<string> {
  const { rows } = await a.dono.execute<{ id: string }>(sql`
    insert into contato (tenant_id, nome) values (${a.tenantId}, 'Cliente de teste') returning id
  `);
  return rows[0]!.id;
}

async function criarConversaNaFila(filaId: string | null = a.filaId): Promise<string> {
  const contatoId = await criarContato();
  const { rows } = await a.dono.execute<{ id: string }>(sql`
    insert into conversa (tenant_id, inbox_id, contato_id, fila_id, estado, criada_em)
    values (${a.tenantId}, ${a.inboxId}::uuid, ${contatoId}::uuid, ${filaId}, 'na_fila', now())
    returning id
  `);
  return rows[0]!.id;
}

async function criarConversaAtribuida(atendenteId: string): Promise<string> {
  const contatoId = await criarContato();
  const { rows } = await a.dono.execute<{ id: string }>(sql`
    insert into conversa (tenant_id, inbox_id, contato_id, fila_id, atendente_id, estado, atribuida_em)
    values (${a.tenantId}, ${a.inboxId}::uuid, ${contatoId}::uuid, ${a.filaId}::uuid, ${atendenteId}::uuid,
            'atribuida', now())
    returning id
  `);
  return rows[0]!.id;
}

beforeAll(async () => {
  a = await montarCenario(`desk-acoes-${randomUUID().slice(0, 8)}`);
  api = await subirApi(0);
  sessaoAtendente = await abrirSessao(a, a.atendenteId);

  const { rows } = await a.dono.execute<{ id: string }>(sql`
    insert into usuario (tenant_id, nome, email)
    values (${a.tenantId}, 'Colega de Teste', ${`colega-${randomUUID().slice(0, 8)}@e2e.pipe.app`})
    returning id
  `);
  colegaId = rows[0]!.id;
}, 180_000);

afterAll(async () => {
  await api?.fechar();
  await a?.encerrar();
});

describe('POST /v1/desk/acoes/:acao — lista fechada e sessão obrigatória', () => {
  it('nome fora do mapa é 404', async () => {
    const { status } = await acao(sessaoAtendente, 'naoExiste');
    expect(status).toBe(404);
  });

  it('sem sessão é 401', async () => {
    const { status } = await acao(null, 'definirStatus', { estado: 'online' });
    expect(status).toBe(401);
  });
});

describe('definirStatus', () => {
  it('recusa estado desconhecido', async () => {
    const { status, corpo } = await acao(sessaoAtendente, 'definirStatus', { estado: 'sonolento' });
    expect(status).toBe(200);
    expect(corpo).toMatchObject({ ok: false, erro: 'Estado desconhecido.' });
  });

  it('pausa sem motivo é recusada; não muda o status atual', async () => {
    await acao(sessaoAtendente, 'definirStatus', { estado: 'online' });
    const { corpo } = await acao(sessaoAtendente, 'definirStatus', { estado: 'pausa' });
    expect(corpo).toMatchObject({ ok: false, erro: 'Escolha o motivo da pausa.' });
    expect((await statusDe(a.atendenteId))?.estado).toBe('online');
  });

  it('pausa com motivo grava o estado e abre uma linha em `pausa`', async () => {
    const motivoId = await criarMotivoDePausa();
    const { corpo } = await acao(sessaoAtendente, 'definirStatus', { estado: 'pausa', motivoId });
    expect(corpo).toMatchObject({ ok: true });
    expect((await statusDe(a.atendenteId))?.estado).toBe('pausa');
    expect((await pausaAbertaDe(a.atendenteId))?.motivo_id).toBe(motivoId);
  });

  it('sair da pausa para online fecha a pausa anterior — sem isso o relatório soma o minuto duas vezes', async () => {
    const motivoId = await criarMotivoDePausa();
    await acao(sessaoAtendente, 'definirStatus', { estado: 'pausa', motivoId });
    expect(await pausaAbertaDe(a.atendenteId)).not.toBeNull();

    await acao(sessaoAtendente, 'definirStatus', { estado: 'online' });
    expect((await statusDe(a.atendenteId))?.estado).toBe('online');
    expect(await pausaAbertaDe(a.atendenteId)).toBeNull();
  });

  it('invisível e offline também são aceitos', async () => {
    const invisivel = await acao(sessaoAtendente, 'definirStatus', { estado: 'invisivel' });
    expect(invisivel.corpo).toMatchObject({ ok: true });
    expect((await statusDe(a.atendenteId))?.estado).toBe('invisivel');

    const offline = await acao(sessaoAtendente, 'definirStatus', { estado: 'offline' });
    expect(offline.corpo).toMatchObject({ ok: true });
    expect((await statusDe(a.atendenteId))?.estado).toBe('offline');

    // Devolve o cenário para online — outros testes deste arquivo dependem disso.
    await acao(sessaoAtendente, 'definirStatus', { estado: 'online' });
  });
});

describe('cairPorInatividade', () => {
  it('derruba o atendente Online para offline e fecha a pausa em aberto', async () => {
    const motivoId = await criarMotivoDePausa();
    await acao(sessaoAtendente, 'definirStatus', { estado: 'pausa', motivoId });

    const { corpo } = await acao(sessaoAtendente, 'cairPorInatividade');
    expect(corpo).toMatchObject({ ok: true });
    expect((await statusDe(a.atendenteId))?.estado).toBe('offline');
    expect(await pausaAbertaDe(a.atendenteId)).toBeNull();

    // Devolve o cenário para online.
    await acao(sessaoAtendente, 'definirStatus', { estado: 'online' });
  });

  it('é um no-op se já está offline: não reescreve `desde`', async () => {
    await acao(sessaoAtendente, 'cairPorInatividade');
    const antes = await statusDe(a.atendenteId);

    await new Promise((r) => setTimeout(r, 10));
    await acao(sessaoAtendente, 'cairPorInatividade');
    const depois = await statusDe(a.atendenteId);
    expect(new Date(depois!.desde).getTime()).toBe(new Date(antes!.desde).getTime());

    await acao(sessaoAtendente, 'definirStatus', { estado: 'online' });
  });
});

describe('salvarNotaInterna', () => {
  it('grava a nota, assinada pelo atendente da sessão', async () => {
    const conversaId = await criarConversaAtribuida(a.atendenteId);
    const { corpo } = await acao(sessaoAtendente, 'salvarNotaInterna', {
      conversaId,
      texto: '  Cliente pediu retorno amanhã.  ',
    });
    expect(corpo).toMatchObject({ ok: true });

    const { rows } = await a.dono.execute<{ corpo: string; usuario_id: string }>(sql`
      select corpo, usuario_id from nota_interna where conversa_id = ${conversaId}::uuid
    `);
    expect(rows[0]?.corpo).toBe('Cliente pediu retorno amanhã.');
    expect(rows[0]?.usuario_id).toBe(a.atendenteId);
  });

  it('recusa sem conversaId e sem texto', async () => {
    const semConversa = await acao(sessaoAtendente, 'salvarNotaInterna', { texto: 'oi' });
    expect(semConversa.corpo).toMatchObject({ ok: false, erro: 'Conversa não informada.' });

    const conversaId = await criarConversaAtribuida(a.atendenteId);
    const semTexto = await acao(sessaoAtendente, 'salvarNotaInterna', { conversaId, texto: '   ' });
    expect(semTexto.corpo).toMatchObject({
      ok: false,
      erro: 'Escreva alguma coisa antes de enviar.',
    });
  });
});

describe('atender', () => {
  it('recusa quem não está online', async () => {
    await acao(sessaoAtendente, 'definirStatus', { estado: 'invisivel' });
    const { corpo } = await acao(sessaoAtendente, 'atender');
    expect(corpo).toMatchObject({ ok: false, erro: 'Fique online para atender.' });
    await acao(sessaoAtendente, 'definirStatus', { estado: 'online' });
  });

  it('sem ninguém na fila, recusa', async () => {
    // Esvazia qualquer sobra de outro teste: consome a fila antes de checar o vazio.
    for (;;) {
      const { corpo } = await acao(sessaoAtendente, 'atender');
      if (corpo['ok'] !== true) {
        expect(corpo).toMatchObject({ ok: false, erro: 'Não há clientes aguardando.' });
        break;
      }
    }
  });

  it('puxa a conversa mais antiga da fila do atendente, atribui e registra o evento', async () => {
    const conversaId = await criarConversaNaFila();
    const { corpo } = await acao(sessaoAtendente, 'atender');
    expect(corpo).toMatchObject({ ok: true, conversaId });

    const { rows: conversas } = await a.dono.execute<{ estado: string; atendente_id: string }>(
      sql`select estado, atendente_id from conversa where id = ${conversaId}::uuid`,
    );
    expect(conversas[0]).toMatchObject({ estado: 'atribuida', atendente_id: a.atendenteId });

    const { rows: atribuicoes } = await a.dono.execute<{ motivo: string }>(
      sql`select motivo from atribuicao where conversa_id = ${conversaId}::uuid`,
    );
    expect(atribuicoes[0]?.motivo).toBe('assumida_pelo_atendente');

    const { rows: eventos } = await a.dono.execute<{ tipo: string }>(
      sql`select tipo from evento_atendimento where conversa_id = ${conversaId}::uuid`,
    );
    expect(eventos.map((e) => e.tipo)).toContain('atribuida');
  });

  it('não puxa conversa de uma fila em que o atendente não está', async () => {
    const { rows: outraFila } = await a.dono.execute<{ id: string }>(
      sql`insert into fila (tenant_id, nome) values (${a.tenantId}, ${`Outra ${randomUUID().slice(0, 6)}`}) returning id`,
    );
    await criarConversaNaFila(outraFila[0]!.id);

    const { corpo } = await acao(sessaoAtendente, 'atender');
    expect(corpo).toMatchObject({ ok: false, erro: 'Não há clientes aguardando.' });
  });
});

describe('atender — o limite de vagas, como na distribuição automática', () => {
  /** Zera o atendente: encerra o que ele tem e fixa o limite da fila em `limite`. */
  async function zerarComLimite(limite: number): Promise<void> {
    await a.dono.execute(sql`
      update conversa set estado = 'encerrada', encerrada_em = now()
       where atendente_id = ${a.atendenteId}::uuid and estado <> 'encerrada'
    `);
    await a.dono.execute(sql`
      update fila_atendente set capacidade_override = ${limite}
       where usuario_id = ${a.atendenteId}::uuid and fila_id = ${a.filaId}::uuid
    `);
  }

  async function ativasDoAtendente(): Promise<number> {
    const { rows } = await a.dono.execute<{ n: string }>(sql`
      select count(*)::text as n from conversa
       where atendente_id = ${a.atendenteId}::uuid and estado <> 'encerrada'
    `);
    return Number(rows[0]?.n ?? 0);
  }

  it('com limite 1, a segunda puxada é recusada com a mensagem de limite — e a fila continua com gente', async () => {
    await zerarComLimite(1);
    await criarConversaNaFila();
    await criarConversaNaFila();

    const primeira = await acao(sessaoAtendente, 'atender');
    expect(primeira.corpo['ok']).toBe(true);

    const segunda = await acao(sessaoAtendente, 'atender');
    expect(segunda.corpo['ok']).toBe(false);
    expect(String(segunda.corpo['erro'])).toContain('limite de atendimentos simultâneos');
    expect(String(segunda.corpo['erro'])).toContain('(1 em andamento)');
    expect(await ativasDoAtendente()).toBe(1);
  });

  it('liberar uma vaga (encerrar) volta a deixar puxar', async () => {
    await a.dono.execute(sql`
      update conversa set estado = 'encerrada', encerrada_em = now()
       where atendente_id = ${a.atendenteId}::uuid and estado <> 'encerrada'
    `);
    const { corpo } = await acao(sessaoAtendente, 'atender');
    expect(corpo['ok']).toBe(true);
    expect(await ativasDoAtendente()).toBe(1);
  });

  it('a corrida: duas puxadas simultâneas com uma vaga só não furam o limite', async () => {
    await zerarComLimite(1);
    await criarConversaNaFila();
    await criarConversaNaFila();

    const [r1, r2] = await Promise.all([
      acao(sessaoAtendente, 'atender'),
      acao(sessaoAtendente, 'atender'),
    ]);
    const oks = [r1, r2].filter((r) => r.corpo['ok'] === true);
    const recusas = [r1, r2].filter((r) => r.corpo['ok'] === false);
    expect(oks).toHaveLength(1);
    expect(recusas).toHaveLength(1);
    expect(String(recusas[0]!.corpo['erro'])).toContain('limite de atendimentos simultâneos');
    expect(await ativasDoAtendente()).toBe(1);
  });

  it('o limite maior (capacidade da fila) deixa puxar várias; sem ninguém na fila, a mensagem é a de fila vazia', async () => {
    await zerarComLimite(3);
    await a.dono.execute(sql`
      update conversa set estado = 'encerrada', encerrada_em = now()
       where estado = 'na_fila' and fila_id = ${a.filaId}::uuid
    `);
    await criarConversaNaFila();
    await criarConversaNaFila();
    expect((await acao(sessaoAtendente, 'atender')).corpo['ok']).toBe(true);
    expect((await acao(sessaoAtendente, 'atender')).corpo['ok']).toBe(true);
    const vazia = await acao(sessaoAtendente, 'atender');
    expect(vazia.corpo).toMatchObject({ ok: false, erro: 'Não há clientes aguardando.' });

    // Devolve o cenário: sem override e sem conversa presa no atendente.
    await a.dono.execute(sql`
      update fila_atendente set capacidade_override = null
       where usuario_id = ${a.atendenteId}::uuid and fila_id = ${a.filaId}::uuid
    `);
  });
});

describe('fixar e marcarNaoLida — o menu do cartão, por atendente', () => {
  async function marcacaoDe(conversaId: string) {
    const { rows } = await a.dono.execute<{
      fixada_em: Date | string | null;
      nao_lida_em: Date | string | null;
    }>(sql`
      select fixada_em, nao_lida_em from marcacao_conversa
       where usuario_id = ${a.atendenteId}::uuid and conversa_id = ${conversaId}::uuid
    `);
    return rows[0] ?? null;
  }

  async function filaDoDesk(): Promise<{ id: string; fixadaEm: string | null; naoLidaEm: string | null }[]> {
    const resposta = await fetch(`${api.url}/v1/desk/fila`, { headers: comCookie(sessaoAtendente) });
    const corpo = (await resposta.json()) as {
      conversas: { id: string; fixadaEm: string | null; naoLidaEm: string | null }[];
    };
    return corpo.conversas;
  }

  it('fixa, aparece na fila com `fixadaEm`, refixar mantém o carimbo, desafixar apaga a linha', async () => {
    const conversaId = await criarConversaAtribuida(a.atendenteId);
    const fixada = await acao(sessaoAtendente, 'fixar', { conversaId, fixada: 'true' });
    expect(fixada.corpo).toMatchObject({ ok: true, fixada: true });
    const primeira = await marcacaoDe(conversaId);
    expect(primeira?.fixada_em).not.toBeNull();

    await new Promise((r) => setTimeout(r, 10));
    await acao(sessaoAtendente, 'fixar', { conversaId, fixada: 'true' });
    expect(new Date((await marcacaoDe(conversaId))!.fixada_em!).getTime()).toBe(
      new Date(primeira!.fixada_em!).getTime(),
    );

    const naFila = (await filaDoDesk()).find((c) => c.id === conversaId);
    expect(naFila?.fixadaEm).not.toBeNull();
    expect(naFila?.naoLidaEm).toBeNull();

    const desafixada = await acao(sessaoAtendente, 'fixar', { conversaId, fixada: 'false' });
    expect(desafixada.corpo).toMatchObject({ ok: true, fixada: false });
    expect(await marcacaoDe(conversaId)).toBeNull();
  });

  it('marca como não lida e como lida; as duas marcações convivem na mesma linha', async () => {
    const conversaId = await criarConversaAtribuida(a.atendenteId);
    await acao(sessaoAtendente, 'fixar', { conversaId, fixada: 'true' });
    const naoLida = await acao(sessaoAtendente, 'marcarNaoLida', { conversaId, naoLida: 'true' });
    expect(naoLida.corpo).toMatchObject({ ok: true, naoLida: true });
    const ambas = await marcacaoDe(conversaId);
    expect(ambas?.fixada_em).not.toBeNull();
    expect(ambas?.nao_lida_em).not.toBeNull();
    expect((await filaDoDesk()).find((c) => c.id === conversaId)?.naoLidaEm).not.toBeNull();

    await acao(sessaoAtendente, 'marcarNaoLida', { conversaId, naoLida: 'false' });
    const soFixada = await marcacaoDe(conversaId);
    expect(soFixada?.fixada_em).not.toBeNull();
    expect(soFixada?.nao_lida_em).toBeNull();

    await acao(sessaoAtendente, 'fixar', { conversaId, fixada: 'false' });
    expect(await marcacaoDe(conversaId)).toBeNull();
  });

  it('recusa sem o valor, conversa de outro atendente e conversa encerrada', async () => {
    const minha = await criarConversaAtribuida(a.atendenteId);
    const semValor = await acao(sessaoAtendente, 'fixar', { conversaId: minha });
    expect(semValor.corpo).toMatchObject({ ok: false });

    const doColega = await criarConversaAtribuida(colegaId);
    const alheia = await acao(sessaoAtendente, 'fixar', { conversaId: doColega, fixada: 'true' });
    expect(alheia.corpo).toMatchObject({ ok: false, erro: 'Esta conversa não está com você.' });
    expect(await marcacaoDe(doColega)).toBeNull();

    await a.dono.execute(
      sql`update conversa set estado = 'encerrada', encerrada_em = now() where id = ${minha}::uuid`,
    );
    const fechada = await acao(sessaoAtendente, 'marcarNaoLida', { conversaId: minha, naoLida: 'true' });
    expect(fechada.corpo).toMatchObject({ ok: false, erro: 'A conversa já foi encerrada.' });

    const inexistente = await acao(sessaoAtendente, 'fixar', { conversaId: randomUUID(), fixada: 'true' });
    expect(inexistente.corpo).toMatchObject({ ok: false, erro: 'Conversa não encontrada.' });
  });

  it('o teto de 50 fixadas da origem', async () => {
    const outras: string[] = [];
    for (let i = 0; i < 50; i += 1) outras.push(await criarConversaAtribuida(a.atendenteId));
    for (const id of outras) {
      await a.dono.execute(sql`
        insert into marcacao_conversa (tenant_id, usuario_id, conversa_id, fixada_em)
        values (${a.tenantId}, ${a.atendenteId}::uuid, ${id}::uuid, now())
      `);
    }
    const aMais = await criarConversaAtribuida(a.atendenteId);
    const recusa = await acao(sessaoAtendente, 'fixar', { conversaId: aMais, fixada: 'true' });
    expect(recusa.corpo).toMatchObject({
      ok: false,
      erro: 'Você já tem 50 conversas fixadas. Desafixe uma para fixar outra.',
    });
    // Refixar uma das 50 não bate no teto.
    const refixa = await acao(sessaoAtendente, 'fixar', { conversaId: outras[0]!, fixada: 'true' });
    expect(refixa.corpo).toMatchObject({ ok: true });

    await a.dono.execute(
      sql`delete from marcacao_conversa where usuario_id = ${a.atendenteId}::uuid`,
    );
  });
});

describe('transferirEmMassa', () => {
  it('recusa sem conversas selecionadas, e sem destino', async () => {
    const semConversa = await acao(sessaoAtendente, 'transferirEmMassa', { paraAtendenteId: colegaId });
    expect(semConversa.corpo).toMatchObject({
      ok: false,
      erro: 'Selecione ao menos um atendimento.',
    });

    const conversaId = await criarConversaAtribuida(a.atendenteId);
    const semDestino = await acao(sessaoAtendente, 'transferirEmMassa', { conversaId: [conversaId] });
    expect(semDestino.corpo).toMatchObject({
      ok: false,
      erro: 'Escolha a fila ou o atendente de destino.',
    });
  });

  it('transfere várias conversas do atendente para um colega', async () => {
    const c1 = await criarConversaAtribuida(a.atendenteId);
    const c2 = await criarConversaAtribuida(a.atendenteId);

    const { corpo } = await acao(sessaoAtendente, 'transferirEmMassa', {
      conversaId: [c1, c2],
      paraAtendenteId: colegaId,
    });
    expect(corpo).toMatchObject({ ok: true, transferidas: 2 });

    const { rows } = await a.dono.execute<{ id: string; estado: string }>(sql`
      select id, estado from conversa where id in (${c1}::uuid, ${c2}::uuid)
    `);
    expect(rows.every((r) => r.estado === 'encerrada')).toBe(true);

    const { rows: novas } = await a.dono.execute<{ n: string }>(sql`
      select count(*)::text as n from conversa
       where atendente_id = ${colegaId}::uuid and estado = 'atribuida'
    `);
    expect(Number(novas[0]?.n)).toBeGreaterThanOrEqual(2);
  });

  it('conversa inexistente no meio do lote não derruba as demais — devolve o primeiro erro', async () => {
    const c1 = await criarConversaAtribuida(a.atendenteId);
    const { corpo } = await acao(sessaoAtendente, 'transferirEmMassa', {
      conversaId: [c1, randomUUID()],
      paraAtendenteId: colegaId,
    });
    expect(corpo['ok']).toBe(true);
    expect(corpo['transferidas']).toBe(1);
    expect(typeof corpo['erro']).toBe('string');
  });
});
