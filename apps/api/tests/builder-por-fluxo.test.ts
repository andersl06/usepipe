import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

// O modo tem que ser decidido antes de qualquer import que leia a variável.
process.env['PIPE_FILAS'] = 'memoria';
process.env['PIPE_WHATSAPP_CLIENTE'] = 'duble';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_COOKIE_SEGURO'] = 'false';
process.env['PIPE_COOKIE_DOMINIO'] = '';

const { NOME_DO_COOKIE, criarToken } = await import('@pipe/autenticacao');
const { ID_DA_RAIZ_PADRAO, ID_DO_ATENDIMENTO_PADRAO } = await import('@pipe/core');
const { subirApi } = await import('../src/servidor.js');
const { noTenant } = await import('../src/banco.js');
const { fluxoPublicadoDoCanal } = await import('../src/dominio/fluxo.js');
const { assinar, montarCenario, payloadDeMensagem } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof subirApi>>;

/**
 * O ciclo EDITAR → SALVAR RASCUNHO → PUBLICAR do Builder, POR FLUXO
 * (`/v1/gestao/fluxos/:id/builder`, `dominio/gestao/builder-do-fluxo.ts`).
 *
 * O que vale a pena provar: fluxo novo abre com o fluxo padrão publicável; o
 * salvar grava POR CIMA do rascunho (uma versão, não uma por tecla) e devolve
 * os erros do motor bloco a bloco mesmo gravando; publicar numera a seguir,
 * arquiva a anterior e recusa fluxo inválido com a lista; o motor
 * (`fluxoPublicadoDoCanal`/`rodarFluxoNaEntrada`, pelo webhook) passa a usar a
 * nova enquanto a conversa que já estava com o robô continua apontando para a
 * antiga — que não foi apagada nem alterada; restaurar traz uma versão antiga
 * como rascunho sem tirar a publicada do ar; e as portas: 403 sem
 * `automacao.fluxo.publicar`, 404 de outro tenant, 409 no roteador.
 */

let a: Cenario;
let b: Cenario;
let api: ApiNoAr;
/** Quem cria e edita, mas não publica. */
let sessaoEditor: string;
/** Quem também publica. */
let sessaoPublicador: string;
/** Gente do tenant A sem permissão nenhuma sobre fluxo. */
let sessaoSemPoder: string;
/** Quem tudo pode no tenant B: prova que o tenant vem da sessão, nunca da URL. */
let sessaoDoOutroTenant: string;

const RECADOS = {
  tamanho: 'recado: tamanho',
  comecoInvalido: 'recado: começo',
  nomeEmUso: 'recado: em uso',
  semPermissao: 'recado: sem permissão',
};

const ANA = '5511922220001';
const BIA = '5511922220002';

async function pessoaCom(cenario: Cenario, permissoes: string[]): Promise<string> {
  const marca = randomUUID().slice(0, 8);
  const { rows: usuarios } = await cenario.dono.execute<{ id: string }>(sql`
    insert into usuario (tenant_id, nome, email)
    values (${cenario.tenantId}, ${`Pessoa ${marca}`}, ${`pessoa-${marca}@e2e.pipe.app`})
    returning id
  `);
  const usuarioId = usuarios[0]!.id;
  if (permissoes.length === 0) return usuarioId;

  for (const codigo of permissoes) {
    await cenario.dono.execute(sql`
      insert into permissao (codigo, descricao, grupo)
      values (${codigo}, ${codigo}, 'teste') on conflict (codigo) do nothing
    `);
  }
  const { rows: papeis } = await cenario.dono.execute<{ id: string }>(sql`
    insert into papel (tenant_id, nome, escopo)
    values (${cenario.tenantId}, ${`papel ${marca}`}, 'atendimento') returning id
  `);
  const papelId = papeis[0]!.id;
  for (const codigo of permissoes) {
    await cenario.dono.execute(sql`
      insert into papel_permissao (tenant_id, papel_id, permissao_codigo)
      values (${cenario.tenantId}, ${papelId}, ${codigo})
    `);
  }
  await cenario.dono.execute(sql`
    insert into usuario_papel (tenant_id, usuario_id, papel_id)
    values (${cenario.tenantId}, ${usuarioId}, ${papelId})
  `);
  return usuarioId;
}

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

/* O corpo cru das respostas: `any` como em `cadastros-atendimento.test.ts`, para
   navegar `corpo.erro.detalhe.erros` sem um tipo por rota. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Corpo = Record<string, any>;

async function pedir(
  sessao: string,
  metodo: string,
  caminho: string,
  corpo?: unknown,
): Promise<{ status: number; corpo: Corpo }> {
  const resposta = await fetch(`${api.url}${caminho}`, {
    method: metodo,
    headers: comCookie(sessao),
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const texto = await resposta.text();
  return { status: resposta.status, corpo: texto ? (JSON.parse(texto) as Corpo) : {} };
}

/** Cria o contato pela rota de criar e devolve o id. */
async function criado(nome: string, tipo: 'fluxo' | 'roteador' = 'fluxo'): Promise<string> {
  const { status, corpo } = await pedir(sessaoEditor, 'POST', '/v1/gestao/fluxos', {
    recados: RECADOS,
    nome,
    tipo,
  });
  expect(status).toBe(200);
  expect(corpo['erro']).toBeUndefined();
  return corpo['id'] as string;
}

const builder = (sessao: string, id: string) => pedir(sessao, 'GET', `/v1/gestao/fluxos/${id}/builder`);
const salvar = (sessao: string, id: string, desenho: unknown) =>
  pedir(sessao, 'PUT', `/v1/gestao/fluxos/${id}/builder`, desenho);
const publicar = (sessao: string, id: string) =>
  pedir(sessao, 'POST', `/v1/gestao/fluxos/${id}/builder/publicar`);
const versoes = (sessao: string, id: string) =>
  pedir(sessao, 'GET', `/v1/gestao/fluxos/${id}/builder/versoes`);
const restaurar = (sessao: string, id: string, versao: string | number) =>
  pedir(sessao, 'POST', `/v1/gestao/fluxos/${id}/builder/versoes/${versao}/restaurar`);

/**
 * Um desenho no formato do editor da Blip, como a cópia manda: a raiz espera a
 * primeira mensagem, o bloco seguinte pergunta o nome e espera, e o de
 * atendimento transborda. `texto` muda entre versões para o teste ver qual
 * versão o motor rodou.
 */
function desenho(texto: string): { fluxo: Record<string, unknown>; globais: Record<string, unknown> } {
  return {
    fluxo: {
      inicio: {
        id: 'inicio',
        root: true,
        $title: 'Início',
        $position: { top: '40px', left: '40px' },
        $contentActions: [{ input: { bypass: false } }],
        $conditionOutputs: [],
        $enteringCustomActions: [],
        $leavingCustomActions: [],
        $defaultOutput: { stateId: 'pergunta' },
      },
      pergunta: {
        id: 'pergunta',
        $title: 'Pergunta',
        $position: { top: '200px', left: '40px' },
        $contentActions: [
          { action: { type: 'SendMessage', settings: { type: 'text/plain', content: texto } } },
          { input: { bypass: false, variable: 'nome' } },
        ],
        $conditionOutputs: [],
        $enteringCustomActions: [],
        $leavingCustomActions: [],
        $defaultOutput: { stateId: 'desk:atendimento' },
      },
      'desk:atendimento': {
        id: 'desk:atendimento',
        $title: 'Atendimento humano',
        $position: { top: '360px', left: '40px' },
        $contentActions: [
          {
            input: {
              bypass: false,
              conditions: [
                {
                  source: 'context',
                  variable: 'desk_forwardToDeskState_status',
                  comparison: 'equals',
                  values: ['Success'],
                },
              ],
            },
          },
        ],
        $conditionOutputs: [],
        $enteringCustomActions: [{ type: 'ForwardToDesk', settings: {}, conditions: [] }],
        $leavingCustomActions: [],
        $afterStateChangedActions: [{ type: 'LeavingFromDesk', settings: {}, conditions: [] }],
        $defaultOutput: { stateId: 'inicio' },
      },
    },
    globais: {},
  };
}

/** O texto que o bloco `pergunta` manda, lido do desenho que a `api` devolve. */
function falaDaPergunta(corpo: Corpo): string {
  const pergunta = corpo['desenho']['fluxo']['pergunta'];
  return pergunta['$contentActions'][0]['action']['settings']['content'] as string;
}

type LinhaVersao = { id: string; versao: number; estado: string; blocos: number };

async function versoesNoBanco(fluxoId: string): Promise<LinhaVersao[]> {
  const { rows } = await a.dono.execute<LinhaVersao>(sql`
    select v.id, v.versao, v.estado,
           (select count(*)::int from bloco b where b.versao_id = v.id) as blocos
      from fluxo_versao v where v.fluxo_id = ${fluxoId}::uuid
     order by v.versao
  `);
  return rows;
}

async function falar(de: string, texto: string): Promise<void> {
  const corpo = JSON.stringify(payloadDeMensagem(de, texto));
  const resposta = await fetch(`${api.url}/webhooks/whatsapp/${a.canalId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': assinar(corpo) },
    body: corpo,
  });
  expect(resposta.status).toBe(200);
}

async function conversaDe(telefone: string): Promise<{ id: string; contato_id: string }> {
  const { rows } = await a.dono.execute<{ id: string; contato_id: string }>(sql`
    select c.id, c.contato_id from conversa c join contato ct on ct.id = c.contato_id
     where c.tenant_id = ${a.tenantId}::uuid and ct.telefone_e164 = ${`+${telefone}`}
     order by c.criada_em desc limit 1
  `);
  expect(rows[0]).toBeDefined();
  return rows[0]!;
}

async function doBot(conversaId: string): Promise<string[]> {
  const { rows } = await a.dono.execute<{ conteudo: string }>(sql`
    select conteudo from mensagem
     where conversa_id = ${conversaId}::uuid and autor_tipo = 'bot' order by criada_em
  `);
  return rows.map((r) => r.conteudo);
}

type LinhaExecucao = { estado: string; fluxo_versao_id: string; bloco_versao_id: string | null };

async function execucaoDe(conversaId: string): Promise<LinhaExecucao> {
  const { rows } = await a.dono.execute<LinhaExecucao>(sql`
    select e.estado, e.fluxo_versao_id, b.versao_id as bloco_versao_id
      from execucao_fluxo e left join bloco b on b.id = e.bloco_atual_id
     where e.conversa_id = ${conversaId}::uuid
     order by e.iniciada_em desc limit 1
  `);
  expect(rows[0]).toBeDefined();
  return rows[0]!;
}

beforeAll(async () => {
  a = await montarCenario(`bd-${randomUUID().slice(0, 8)}`);
  b = await montarCenario(`bd-${randomUUID().slice(0, 8)}`);

  const editor = await pessoaCom(a, ['automacao.fluxo.editar']);
  const publicador = await pessoaCom(a, ['automacao.fluxo.editar', 'automacao.fluxo.publicar']);
  const semPoder = await pessoaCom(a, []);
  const doB = await pessoaCom(b, ['automacao.fluxo.editar', 'automacao.fluxo.publicar']);

  api = await subirApi(0);
  sessaoEditor = await abrirSessao(a, editor);
  sessaoPublicador = await abrirSessao(a, publicador);
  sessaoSemPoder = await abrirSessao(a, semPoder);
  sessaoDoOutroTenant = await abrirSessao(b, doB);

  // Sem ninguém online: a conversa transferida fica NA FILA, sem atendente.
  await a.dono.execute(
    sql`update status_atendente set estado = 'offline' where usuario_id = ${a.atendenteId}::uuid`,
  );
}, 180_000);

afterAll(async () => {
  await api?.fechar();
  await a?.encerrar();
  await b?.encerrar();
});

describe('GET /v1/gestao/fluxos/:id/builder', () => {
  it('fluxo novo abre com o fluxo padrão — publicável, e sem nada gravado', async () => {
    const id = await criado(`Novo ${randomUUID().slice(0, 6)}`);
    const { status, corpo } = await builder(sessaoEditor, id);
    expect(status).toBe(200);
    expect(corpo).toMatchObject({ fluxoId: id, origem: 'padrao', versao: null, publicada: null });
    expect(corpo['erros']).toEqual([]);
    expect(Object.keys(corpo['desenho']['fluxo']).sort()).toEqual(
      [ID_DA_RAIZ_PADRAO, ID_DO_ATENDIMENTO_PADRAO].sort(),
    );
    expect(corpo['desenho']['globais']).toMatchObject({ id: 'global-actions' });
    expect(await versoesNoBanco(id)).toHaveLength(0);
  });

  it('roteador não tem Builder: 409 em todas as rotas', async () => {
    const id = await criado(`Roteador ${randomUUID().slice(0, 6)}`, 'roteador');
    const respostas = [
      await builder(sessaoPublicador, id),
      await salvar(sessaoPublicador, id, desenho('x')),
      await publicar(sessaoPublicador, id),
      await versoes(sessaoPublicador, id),
      await restaurar(sessaoPublicador, id, 1),
    ];
    for (const { status, corpo } of respostas) {
      expect(status).toBe(409);
      expect(corpo['erro']['codigo']).toBe('roteador_sem_builder');
      expect(corpo['erro']['mensagem']).toContain('Roteador não tem Builder');
    }
  });

  it('sem automacao.fluxo.editar é 403; de outro tenant e id malformado são 404', async () => {
    const id = await criado(`Guardado ${randomUUID().slice(0, 6)}`);

    const semPoder = await builder(sessaoSemPoder, id);
    expect(semPoder.status).toBe(403);
    expect(semPoder.corpo['erro']).toMatchObject({
      codigo: 'sem_permissao',
      detalhe: { permissao: 'automacao.fluxo.editar' },
    });

    expect((await builder(sessaoDoOutroTenant, id)).status).toBe(404);
    expect((await salvar(sessaoDoOutroTenant, id, desenho('x'))).status).toBe(404);
    expect((await versoes(sessaoDoOutroTenant, id)).status).toBe(404);
    expect((await builder(sessaoEditor, 'nao-e-uuid')).status).toBe(404);

    const semSessao = await fetch(`${api.url}/v1/gestao/fluxos/${id}/builder`);
    expect(semSessao.status).toBe(401);
  });
});

describe('PUT /v1/gestao/fluxos/:id/builder', () => {
  it('grava o rascunho como v1 e, salvando de novo, grava POR CIMA — uma versão, não uma por tecla', async () => {
    const id = await criado(`Rascunho ${randomUUID().slice(0, 6)}`);

    const primeira = await salvar(sessaoEditor, id, desenho('Olá! Qual é o seu nome?'));
    expect(primeira.status).toBe(200);
    expect(primeira.corpo['versao']).toMatchObject({ versao: 1, estado: 'rascunho', blocos: 3 });
    expect(primeira.corpo['erros']).toEqual([]);
    expect(primeira.corpo['naoSuportado']).toEqual({});

    const aberto = await builder(sessaoEditor, id);
    expect(aberto.corpo).toMatchObject({ origem: 'rascunho', publicada: null });
    expect(aberto.corpo['versao']['versao']).toBe(1);
    expect(falaDaPergunta(aberto.corpo)).toBe('Olá! Qual é o seu nome?');

    const segunda = await salvar(sessaoEditor, id, desenho('Oi! Como você se chama?'));
    expect(segunda.status).toBe(200);
    expect(segunda.corpo['versao']['id']).toBe(primeira.corpo['versao']['id']);
    expect(segunda.corpo['versao']['versao']).toBe(1);

    const noBanco = await versoesNoBanco(id);
    expect(noBanco).toHaveLength(1);
    expect(noBanco[0]).toMatchObject({ versao: 1, estado: 'rascunho', blocos: 3 });
    expect(falaDaPergunta((await builder(sessaoEditor, id)).corpo)).toBe('Oi! Como você se chama?');

    // O fluxo em si continua em rascunho: salvar não publica.
    const { rows } = await a.dono.execute<{ estado: string }>(
      sql`select estado from fluxo where id = ${id}::uuid`,
    );
    expect(rows[0]?.estado).toBe('rascunho');
  });

  it('desenho inválido grava mesmo assim e devolve os erros do motor, bloco a bloco', async () => {
    const id = await criado(`Invalido ${randomUUID().slice(0, 6)}`);
    const quebrado = {
      fluxo: {
        inicio: {
          id: 'inicio',
          root: true,
          $title: 'Início',
          // Sem entrada na raiz, e a saída aponta para um bloco que não existe.
          $contentActions: [],
          $conditionOutputs: [],
          $defaultOutput: { stateId: 'fantasma' },
        },
      },
      globais: {},
    };

    const { status, corpo } = await salvar(sessaoEditor, id, quebrado);
    expect(status).toBe(200);
    expect(corpo['versao']).toMatchObject({ versao: 1, estado: 'rascunho', blocos: 1 });
    const erros = corpo['erros'] as { bloco: string | null; mensagem: string }[];
    expect(erros).toEqual(
      expect.arrayContaining([
        { bloco: 'inicio', mensagem: "O estado de destino 'fantasma' da saída não existe." },
        { bloco: 'inicio', mensagem: 'O estado raiz precisa esperar uma entrada.' },
      ]),
    );
    expect(erros.every((e) => e.bloco === 'inicio')).toBe(true);

    // A leitura devolve os mesmos erros — a tela abre já sabendo o que falta.
    const aberto = await builder(sessaoEditor, id);
    expect(aberto.corpo['origem']).toBe('rascunho');
    expect(aberto.corpo['erros']).toEqual(erros);

    // E publicar recusa com a lista, sem mexer em nada.
    const recusa = await publicar(sessaoPublicador, id);
    expect(recusa.status).toBe(409);
    expect(recusa.corpo['erro']['codigo']).toBe('fluxo_invalido');
    expect(recusa.corpo['erro']['detalhe']['erros']).toEqual(erros);
    expect((await versoesNoBanco(id))[0]?.estado).toBe('rascunho');

    // Corpo que não é o mapa do editor é 400, e não 500.
    const torto = await salvar(sessaoEditor, id, { fluxo: 'isto não é um mapa' });
    expect(torto.status).toBe(400);
    expect(torto.corpo['erro']['codigo']).toBe('desenho_invalido');
  });

  it('sem automacao.fluxo.editar, salvar é 403 e nada é gravado', async () => {
    const id = await criado(`Trancado ${randomUUID().slice(0, 6)}`);
    const { status, corpo } = await salvar(sessaoSemPoder, id, desenho('x'));
    expect(status).toBe(403);
    expect(corpo['erro']['codigo']).toBe('sem_permissao');
    expect(await versoesNoBanco(id)).toHaveLength(0);
  });
});

describe('POST /v1/gestao/fluxos/:id/builder/publicar', () => {
  it('publica v1; a v2 arquiva a v1, o motor passa a usar a nova e a conversa em andamento continua apontando para a antiga', async () => {
    const id = await criado(`Publicado ${randomUUID().slice(0, 6)}`);
    // O canal do cenário passa a ser deste fluxo: é por ele que o webhook chega ao motor.
    await a.dono.execute(sql`update fluxo set canal_id = ${a.canalId}::uuid where id = ${id}::uuid`);

    // Sem rascunho não há o que publicar.
    const semRascunho = await publicar(sessaoPublicador, id);
    expect(semRascunho.status).toBe(409);
    expect(semRascunho.corpo['erro']['codigo']).toBe('sem_rascunho');

    await salvar(sessaoEditor, id, desenho('Olá! Qual é o seu nome? (v1)'));
    const v1 = await publicar(sessaoPublicador, id);
    expect(v1.status).toBe(200);
    expect(v1.corpo['versao']).toMatchObject({ versao: 1, estado: 'publicada', blocos: 3 });
    expect(v1.corpo['versao']['publicadaEm']).toEqual(expect.any(String));
    expect(v1.corpo['versao']['publicadaPor']).toMatch(/^Pessoa /);
    expect(v1.corpo['arquivada']).toBeNull();
    const v1Id = v1.corpo['versao']['id'] as string;

    const { rows: fluxos } = await a.dono.execute<{ estado: string }>(
      sql`select estado from fluxo where id = ${id}::uuid`,
    );
    expect(fluxos[0]?.estado).toBe('publicado');

    // Sem rascunho, o Builder abre a publicada.
    const aberto = await builder(sessaoEditor, id);
    expect(aberto.corpo['origem']).toBe('publicada');
    expect(aberto.corpo['versao']['versao']).toBe(1);
    expect(aberto.corpo['publicada']['versao']).toBe(1);

    // O motor responde com a v1, e a conversa da Ana fica esperando o nome — em andamento.
    await falar(ANA, 'oi');
    const conversaDaAna = await conversaDe(ANA);
    expect(await doBot(conversaDaAna.id)).toEqual(['Olá! Qual é o seu nome? (v1)']);
    const emAndamento = await execucaoDe(conversaDaAna.id);
    expect(emAndamento).toMatchObject({ estado: 'aguardando', fluxo_versao_id: v1Id });

    // Salvar de novo cria o rascunho v2 (a v1 publicada é imutável) e publicar promove.
    const rascunho = await salvar(sessaoEditor, id, desenho('Olá! Qual é o seu nome? (v2)'));
    expect(rascunho.corpo['versao']).toMatchObject({ versao: 2, estado: 'rascunho' });
    expect(rascunho.corpo['versao']['id']).not.toBe(v1Id);

    const v2 = await publicar(sessaoPublicador, id);
    expect(v2.status).toBe(200);
    expect(v2.corpo['versao']).toMatchObject({ versao: 2, estado: 'publicada' });
    expect(v2.corpo['arquivada']).toMatchObject({ id: v1Id, versao: 1, estado: 'arquivada' });
    const v2Id = v2.corpo['versao']['id'] as string;

    const noBanco = await versoesNoBanco(id);
    expect(noBanco.map((v) => [v.versao, v.estado, v.blocos])).toEqual([
      [1, 'arquivada', 3],
      [2, 'publicada', 3],
    ]);

    // A execução da Ana continua na v1 — a versão e os blocos dela ficaram intactos.
    const aindaNaV1 = await execucaoDe(conversaDaAna.id);
    expect(aindaNaV1.fluxo_versao_id).toBe(v1Id);
    expect(aindaNaV1.bloco_versao_id).toBe(v1Id);

    // Conversa nova é da v2: pelo motor de verdade, e pela consulta que o motor usa.
    await falar(BIA, 'oi');
    const conversaDaBia = await conversaDe(BIA);
    expect(await doBot(conversaDaBia.id)).toEqual(['Olá! Qual é o seu nome? (v2)']);
    expect((await execucaoDe(conversaDaBia.id)).fluxo_versao_id).toBe(v2Id);
    const publicado = await noTenant(a.tenantId, (tx) =>
      fluxoPublicadoDoCanal(tx, a.canalId, conversaDaBia.contato_id),
    );
    expect(publicado).toEqual({ fluxoId: id, versaoId: v2Id });

    // O histórico lista as duas, da mais nova para a mais antiga.
    const historico = await versoes(sessaoEditor, id);
    expect(historico.status).toBe(200);
    const listadas = historico.corpo as unknown as { versao: number; estado: string }[];
    expect(listadas.map((v) => [v.versao, v.estado])).toEqual([
      [2, 'publicada'],
      [1, 'arquivada'],
    ]);

    // E ficou registrado quem publicou o quê.
    const { rows: log } = await a.dono.execute<{ acao: string; objeto_tipo: string }>(sql`
      select acao, objeto_tipo from log_auditoria
       where objeto_id = ${v2Id}::uuid order by em asc, id asc
    `);
    expect(log.map((l) => [l.acao, l.objeto_tipo])).toEqual([
      ['criou', 'fluxo_versao'],
      ['ativou', 'fluxo_versao'],
    ]);
  });

  it('só quem tem automacao.fluxo.publicar publica — editar não basta; de outro tenant é 404', async () => {
    const id = await criado(`Protegido ${randomUUID().slice(0, 6)}`);
    await salvar(sessaoEditor, id, desenho('x'));

    const editor = await publicar(sessaoEditor, id);
    expect(editor.status).toBe(403);
    expect(editor.corpo['erro']).toMatchObject({
      codigo: 'sem_permissao',
      detalhe: { permissao: 'automacao.fluxo.publicar' },
    });

    expect((await publicar(sessaoDoOutroTenant, id)).status).toBe(404);

    const noBanco = await versoesNoBanco(id);
    expect(noBanco).toHaveLength(1);
    expect(noBanco[0]?.estado).toBe('rascunho');
  });
});

describe('POST /v1/gestao/fluxos/:id/builder/versoes/:versao/restaurar', () => {
  it('traz uma versão antiga de volta como rascunho, sem tirar a publicada do ar', async () => {
    const id = await criado(`Restaurado ${randomUUID().slice(0, 6)}`);
    await salvar(sessaoEditor, id, desenho('primeira'));
    await publicar(sessaoPublicador, id);
    await salvar(sessaoEditor, id, desenho('segunda'));
    await publicar(sessaoPublicador, id);

    const { status, corpo } = await restaurar(sessaoEditor, id, 1);
    expect(status).toBe(200);
    expect(corpo['versao']).toMatchObject({ versao: 3, estado: 'rascunho', blocos: 3 });
    expect(corpo['erros']).toEqual([]);

    const aberto = await builder(sessaoEditor, id);
    expect(aberto.corpo['origem']).toBe('rascunho');
    expect(aberto.corpo['versao']['versao']).toBe(3);
    expect(falaDaPergunta(aberto.corpo)).toBe('primeira');
    // A segunda continua publicada: restaurar não publica.
    expect(aberto.corpo['publicada']).toMatchObject({ versao: 2, estado: 'publicada' });

    expect((await versoesNoBanco(id)).map((v) => [v.versao, v.estado])).toEqual([
      [1, 'arquivada'],
      [2, 'publicada'],
      [3, 'rascunho'],
    ]);

    // Restaurar de novo grava por cima do mesmo rascunho.
    const outra = await restaurar(sessaoEditor, id, 2);
    expect(outra.corpo['versao']['versao']).toBe(3);
    expect(falaDaPergunta((await builder(sessaoEditor, id)).corpo)).toBe('segunda');

    // Versão que não existe (ou que não é número) é 404.
    expect((await restaurar(sessaoEditor, id, 99)).status).toBe(404);
    expect((await restaurar(sessaoEditor, id, 'ultima')).status).toBe(404);
    // De outro tenant também.
    expect((await restaurar(sessaoDoOutroTenant, id, 1)).status).toBe(404);
  });
});
