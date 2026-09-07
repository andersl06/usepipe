import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

// O modo tem que ser decidido antes de qualquer import que leia a variável.
process.env['PIPE_FILAS'] = 'memoria';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_COOKIE_SEGURO'] = 'false';
process.env['PIPE_COOKIE_DOMINIO'] = '';
process.env['PIPE_URL_APP'] = 'http://telas.teste';
process.env['PIPE_URL_ENTRADA'] = 'http://telas.teste/entrar';
process.env['GOOGLE_CLIENTE_ID'] = 'cliente-de-teste.apps.googleusercontent.com';
process.env['GOOGLE_CLIENTE_SEGREDO'] = 'segredo-de-teste';
process.env['GOOGLE_URL_RETORNO'] = 'http://127.0.0.1:3100/v1/auth/google/retorno';

const { NOME_DO_COOKIE, criarToken, hashDoToken } = await import('@pipe/autenticacao');
const { subirApi } = await import('../src/servidor.js');
const { aceitarConvite, criarConvite, lerConvite } = await import('../src/dominio/convites.js');
const { normalizarDominio, registrarDominio, verificarDominio } = await import(
  '../src/dominio/dominios.js'
);
const { comoEntrar, provisionarCliente } = await import('../src/provisionar.js');
const { codigoDaRecusa } = await import('../src/controladores/entrar.js');
const { ErroPipe } = await import('../src/erros.js');
const { montarCenario } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof subirApi>>;

/**
 * Convite e verificação de domínio: as duas portas por onde gente nova entra.
 *
 * O que este arquivo persegue não é o caminho feliz — é o conjunto de recusas, que
 * é onde mora o valor: convite vencido, convite reusado, convite de outro tenant,
 * papel que não existe, domínio público e TXT ausente. Cada um deles, se passar,
 * é alguém entrando num cliente que não é dele.
 *
 * A conversa com o Google não está aqui, pelo mesmo motivo de `entrada.test.ts`:
 * dublar o JWKS provaria de novo o que `packages/autenticacao` já prova. A parte
 * do convite que depende dela — ligar a `identidade_externa` e abrir sessão — é
 * exercitada chamando `aceitarConvite` com uma `PessoaDoGoogle` montada à mão, que
 * é exatamente o que a volta do Google entrega.
 */

let a: Cenario;
let b: Cenario;
let api: ApiNoAr;
/** Sessão de quem administra o tenant A: tem `usuario.gerenciar` e `tenant.configurar`. */
let sessaoAdmin: string;
/** Sessão de quem só atende: prova que a permissão é conferida de verdade. */
let sessaoSemPoder: string;

const PERMISSOES_DO_ADMIN = ['usuario.gerenciar', 'tenant.configurar'];

async function semearPapeis(cenario: Cenario, nome: string, permissoes: string[]): Promise<string> {
  const dono = cenario.dono;
  for (const codigo of permissoes) {
    await dono.execute(sql`
      insert into permissao (codigo, descricao, grupo)
      values (${codigo}, ${codigo}, 'teste') on conflict (codigo) do nothing
    `);
  }
  const { rows } = await dono.execute<{ id: string }>(sql`
    insert into papel (tenant_id, nome) values (${cenario.tenantId}, ${nome}) returning id
  `);
  const papelId = rows[0]!.id;
  for (const codigo of permissoes) {
    await dono.execute(sql`
      insert into papel_permissao (tenant_id, papel_id, permissao_codigo)
      values (${cenario.tenantId}, ${papelId}, ${codigo})
    `);
  }
  return papelId;
}

/** Grava uma sessão viva para o atendente do cenário e devolve o token do cookie. */
async function abrirSessao(cenario: Cenario): Promise<string> {
  const novo = criarToken();
  await cenario.dono.execute(sql`
    insert into sessao (tenant_id, usuario_id, token_hash, expira_em, origem)
    values (${cenario.tenantId}, ${cenario.atendenteId}, ${novo.hash}, ${novo.expiraEm}, 'google')
  `);
  return novo.token;
}

function comCookie(token: string): Record<string, string> {
  return { cookie: `${NOME_DO_COOKIE}=${token}`, 'content-type': 'application/json' };
}

function pessoaDoGoogle(email: string, sujeito = randomUUID()) {
  return {
    emissor: 'https://accounts.google.com',
    sujeito,
    email,
    nome: 'Convidada Teste',
    avatarUrl: undefined,
  };
}

beforeAll(async () => {
  a = await montarCenario(`conv-${randomUUID().slice(0, 8)}`);
  b = await montarCenario(`conv-${randomUUID().slice(0, 8)}`);

  const papelAdmin = await semearPapeis(a, 'Administrador e2e', PERMISSOES_DO_ADMIN);
  await a.dono.execute(sql`
    insert into usuario_papel (tenant_id, usuario_id, papel_id)
    values (${a.tenantId}, ${a.atendenteId}, ${papelAdmin})
  `);
  // Papéis que os convites vão usar, um em cada tenant.
  await semearPapeis(a, 'atendente', ['conversa.ver']);
  await semearPapeis(b, 'atendente', ['conversa.ver']);

  api = await subirApi(0);
  sessaoAdmin = await abrirSessao(a);
  sessaoSemPoder = await abrirSessao(b);
}, 180_000);

/** Tenants nascidos do comando de provisionamento, para a limpeza levar embora. */
const provisionados: string[] = [];

afterAll(async () => {
  for (const slug of provisionados) {
    await a.dono.execute(sql`delete from tenant where slug = ${slug}`);
  }
  await api?.fechar();
  await a?.encerrar();
  await b?.encerrar();
});

async function convidar(email: string, papel = 'atendente'): Promise<string> {
  const convite = await criarConvite(a.tenantId, { email, papel });
  return convite.token;
}

describe('POST /v1/convites', () => {
  it('cria o convite e devolve o link — e o banco só guarda o hash', async () => {
    const email = `ana.${randomUUID().slice(0, 6)}@cliente.teste`;
    const resposta = await fetch(`${api.url}/v1/convites`, {
      method: 'POST',
      headers: comCookie(sessaoAdmin),
      body: JSON.stringify({ email, papel: 'atendente' }),
    });
    expect(resposta.status).toBe(201);

    const corpo = (await resposta.json()) as {
      id: string;
      email: string;
      papel: string;
      url: string;
      expiraEm: string;
    };
    expect(corpo.email).toBe(email);
    expect(corpo.papel).toBe('atendente');
    expect(corpo.url).toContain('http://telas.teste/convite/');

    const token = corpo.url.split('/').pop() ?? '';
    expect(token.length).toBeGreaterThan(20);

    // O token não pode estar no banco em lugar nenhum: só o hash.
    const { rows } = await a.dono.execute<{ n: string }>(
      sql`select count(*)::text as n from convite where token_hash = ${token}`,
    );
    expect(rows[0]?.n).toBe('0');

    // Sete dias, não oito horas: convite não é sessão.
    const dias = (new Date(corpo.expiraEm).getTime() - Date.now()) / 86_400_000;
    expect(dias).toBeGreaterThan(6.9);
    expect(dias).toBeLessThan(7.1);
  });

  it('papel que não existe no tenant é recusado antes de gravar', async () => {
    const resposta = await fetch(`${api.url}/v1/convites`, {
      method: 'POST',
      headers: comCookie(sessaoAdmin),
      body: JSON.stringify({ email: 'x@cliente.teste', papel: 'imperador' }),
    });
    expect(resposta.status).toBe(400);
    const corpo = (await resposta.json()) as { erro: { codigo: string } };
    expect(corpo.erro.codigo).toBe('papel_invalido');
  });

  it('e-mail que já é membro é conflito, não convite duplicado', async () => {
    const { rows } = await a.dono.execute<{ email: string }>(
      sql`select email from usuario where id = ${a.atendenteId}::uuid`,
    );
    const resposta = await fetch(`${api.url}/v1/convites`, {
      method: 'POST',
      headers: comCookie(sessaoAdmin),
      body: JSON.stringify({ email: rows[0]!.email, papel: 'atendente' }),
    });
    expect(resposta.status).toBe(409);
  });

  it('sem a permissão usuario.gerenciar, 403 — sessão viva não basta', async () => {
    const resposta = await fetch(`${api.url}/v1/convites`, {
      method: 'POST',
      headers: comCookie(sessaoSemPoder),
      body: JSON.stringify({ email: 'y@cliente.teste', papel: 'atendente' }),
    });
    expect(resposta.status).toBe(403);
    const corpo = (await resposta.json()) as { erro: { codigo: string } };
    expect(corpo.erro.codigo).toBe('sem_permissao');
  });

  it('sem sessão, 401', async () => {
    const resposta = await fetch(`${api.url}/v1/convites`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'z@cliente.teste', papel: 'atendente' }),
    });
    expect(resposta.status).toBe(401);
  });

  it('convidar de novo invalida o link anterior', async () => {
    const email = `renovada.${randomUUID().slice(0, 6)}@cliente.teste`;
    const primeiro = await convidar(email);
    const segundo = await convidar(email);

    await expect(lerConvite(primeiro)).rejects.toMatchObject({ codigo: 'convite_expirado' });
    await expect(lerConvite(segundo)).resolves.toMatchObject({ email });
  });
});

describe('GET /v1/convites/:token', () => {
  it('mostra para quem é sem exigir sessão, e só o mínimo', async () => {
    const email = `bruna.${randomUUID().slice(0, 6)}@cliente.teste`;
    const token = await convidar(email);

    const resposta = await fetch(`${api.url}/v1/convites/${token}`);
    expect(resposta.status).toBe(200);
    const corpo = (await resposta.json()) as {
      email: string;
      papel: string;
      tenant: { nome: string; slug: string };
    };
    expect(corpo.email).toBe(email);
    expect(corpo.papel).toBe('atendente');
    expect(corpo.tenant.slug).toContain('e2e-conv-');
    // O id do tenant não é assunto de quem ainda está do lado de fora.
    expect(JSON.stringify(corpo)).not.toContain(a.tenantId);
  });

  it('token inexistente é 404, e não conta que existe convite parecido', async () => {
    const resposta = await fetch(`${api.url}/v1/convites/nunca-existiu`);
    expect(resposta.status).toBe(404);
  });

  it('convite vencido é 410, com o motivo — quem tem o link merece saber', async () => {
    const token = await convidar(`vencida.${randomUUID().slice(0, 6)}@cliente.teste`);
    await a.dono.execute(
      sql`update convite set expira_em = now() - interval '1 minute'
           where token_hash = ${hashDoToken(token)}`,
    );
    const resposta = await fetch(`${api.url}/v1/convites/${token}`);
    expect(resposta.status).toBe(410);
    const corpo = (await resposta.json()) as { erro: { codigo: string } };
    expect(corpo.erro.codigo).toBe('convite_expirado');
  });
});

describe('POST /v1/convites/:token/aceitar', () => {
  it('cria o usuário com o papel do convite e queima o token', async () => {
    const email = `carla.${randomUUID().slice(0, 6)}@cliente.teste`;
    const token = await convidar(email);

    const resposta = await fetch(`${api.url}/v1/convites/${token}/aceitar`, { method: 'POST' });
    expect(resposta.status).toBe(200);
    const corpo = (await resposta.json()) as {
      usuarioId: string;
      email: string;
      papel: string;
      entrarEm: string;
    };
    expect(corpo.email).toBe(email);
    expect(corpo.entrarEm).toBe(`/v1/auth/google?convite=${encodeURIComponent(token)}`);

    const { rows } = await a.dono.execute<{ tenant_id: string; papel: string }>(sql`
      select u.tenant_id, p.nome as papel
        from usuario u
        join usuario_papel up on up.usuario_id = u.id
        join papel p on p.id = up.papel_id
       where u.id = ${corpo.usuarioId}::uuid
    `);
    expect(rows[0]?.tenant_id).toBe(a.tenantId);
    expect(rows[0]?.papel).toBe('atendente');

    // Uso único: o segundo clique no mesmo link não cria um segundo usuário.
    const repetido = await fetch(`${api.url}/v1/convites/${token}/aceitar`, { method: 'POST' });
    expect(repetido.status).toBe(410);
    const erro = (await repetido.json()) as { erro: { codigo: string } };
    expect(erro.erro.codigo).toBe('convite_usado');

    const { rows: quantos } = await a.dono.execute<{ n: string }>(
      sql`select count(*)::text as n from usuario where email = ${email}`,
    );
    expect(quantos[0]?.n).toBe('1');
  });

  it('convite vencido não cria ninguém', async () => {
    const email = `tarde.${randomUUID().slice(0, 6)}@cliente.teste`;
    const token = await convidar(email);
    await a.dono.execute(
      sql`update convite set expira_em = now() - interval '1 second'
           where token_hash = ${hashDoToken(token)}`,
    );

    const resposta = await fetch(`${api.url}/v1/convites/${token}/aceitar`, { method: 'POST' });
    expect(resposta.status).toBe(410);

    const { rows } = await a.dono.execute<{ n: string }>(
      sql`select count(*)::text as n from usuario where email = ${email}`,
    );
    expect(rows[0]?.n).toBe('0');
  });

  it('o convite do tenant B põe a pessoa no B, nunca no A', async () => {
    const email = `daniela.${randomUUID().slice(0, 6)}@outrocliente.teste`;
    const convite = await criarConvite(b.tenantId, { email, papel: 'atendente' });

    const aceito = await aceitarConvite(convite.token);
    expect(aceito.tenantId).toBe(b.tenantId);

    const { rows } = await a.dono.execute<{ tenant_id: string }>(
      sql`select tenant_id from usuario where email = ${email}`,
    );
    expect(rows.map((l) => l.tenant_id)).toEqual([b.tenantId]);
  });

  it('com a conta do Google em mãos, liga a identidade externa e abre a sessão', async () => {
    const email = `elisa.${randomUUID().slice(0, 6)}@cliente.teste`;
    const token = await convidar(email);
    const pessoa = pessoaDoGoogle(email);

    const aceito = await aceitarConvite(token, pessoa, { ip: '10.0.0.9' });
    expect(aceito.sessao).toBeDefined();

    // A sessão vale de verdade: é o mesmo cookie que as telas usam.
    const eu = await fetch(`${api.url}/v1/eu`, { headers: comCookie(aceito.sessao!.token) });
    expect(eu.status).toBe(200);
    const corpo = (await eu.json()) as { usuario: { email: string }; tenant: { id: string } };
    expect(corpo.usuario.email).toBe(email);
    expect(corpo.tenant.id).toBe(a.tenantId);

    // E a conta ficou ligada pelo par (emissor, sujeito) — nunca pelo e-mail.
    const { rows } = await a.dono.execute<{ n: string }>(sql`
      select count(*)::text as n from identidade_externa
       where emissor = ${pessoa.emissor} and sujeito = ${pessoa.sujeito}
    `);
    expect(rows[0]?.n).toBe('1');
  });

  it('entrar com outra conta do Google não vale o convite de alguém', async () => {
    const token = await convidar(`fabiana.${randomUUID().slice(0, 6)}@cliente.teste`);
    await expect(
      aceitarConvite(token, pessoaDoGoogle('intrusa@cliente.teste')),
    ).rejects.toMatchObject({ codigo: 'convite_de_outro_email' });
  });
});

describe('GET /v1/auth/google?convite=', () => {
  it('leva o convite no desafio: é assim que a volta do Google sabe de que cliente é', async () => {
    const token = await convidar(`gabriela.${randomUUID().slice(0, 6)}@cliente.teste`);
    const resposta = await fetch(
      `${api.url}/v1/auth/google?convite=${encodeURIComponent(token)}`,
      { redirect: 'manual' },
    );
    expect(resposta.status).toBe(302);

    const cookie = resposta.headers.get('set-cookie') ?? '';
    const valor = /pipe_desafio=([^;]*)/.exec(cookie)?.[1] ?? '';
    const desafio = JSON.parse(Buffer.from(valor, 'base64url').toString('utf8')) as {
      convite?: string;
    };
    expect(desafio.convite).toBe(token);

    // E o token do convite NÃO vaza para o Google junto com o resto do desafio.
    expect(resposta.headers.get('location')).not.toContain(token);
  });

  it('login sem convite continua sem o campo — nada muda para quem entra por domínio', async () => {
    const resposta = await fetch(`${api.url}/v1/auth/google`, { redirect: 'manual' });
    const valor = /pipe_desafio=([^;]*)/.exec(resposta.headers.get('set-cookie') ?? '')?.[1] ?? '';
    const desafio = JSON.parse(Buffer.from(valor, 'base64url').toString('utf8')) as {
      convite?: string;
    };
    expect(desafio.convite).toBeUndefined();
  });

  it('convite que não serve vira recusa na tela de entrada, nunca 500', () => {
    // O que a volta do Google faz com um convite vencido, usado ou de outro e-mail.
    expect(codigoDaRecusa(new ErroPipe(410, 'convite_usado', 'já foi'))).toBe('sem_convite');
    expect(codigoDaRecusa(ErroPipe.naoEncontrado('Convite'))).toBe('sem_convite');
    // Erro nosso continua sendo erro nosso: a saída é tentar de novo.
    expect(codigoDaRecusa(new ErroPipe(500, 'erro_interno', 'caiu'))).toBe('falha_no_provedor');
  });
});

describe('POST /v1/dominios', () => {
  it('registra e diz qual TXT publicar', async () => {
    const dominio = `acme-${randomUUID().slice(0, 8)}.teste`;
    const resposta = await fetch(`${api.url}/v1/dominios`, {
      method: 'POST',
      headers: comCookie(sessaoAdmin),
      body: JSON.stringify({ dominio }),
    });
    expect(resposta.status).toBe(201);

    const corpo = (await resposta.json()) as {
      id: string;
      dominio: string;
      verificadoEm: string | null;
      registro: { nome: string; tipo: string; valor: string };
    };
    expect(corpo.dominio).toBe(dominio);
    expect(corpo.verificadoEm).toBeNull();
    expect(corpo.registro.nome).toBe(`_pipe-verificacao.${dominio}`);
    expect(corpo.registro.valor).toMatch(/^pipe-verificacao=[0-9a-f]{32}$/);

    // Idempotente: chamar de novo devolve o MESMO token, senão quem já publicou
    // veria a verificação falhar sem ter mexido em nada.
    const outra = await fetch(`${api.url}/v1/dominios`, {
      method: 'POST',
      headers: comCookie(sessaoAdmin),
      body: JSON.stringify({ dominio }),
    });
    const segunda = (await outra.json()) as { registro: { valor: string } };
    expect(segunda.registro.valor).toBe(corpo.registro.valor);
  });

  it('domínio público é recusado: gmail.com não identifica empresa nenhuma', async () => {
    for (const publico of ['gmail.com', 'Hotmail.com', 'uol.com.br']) {
      const resposta = await fetch(`${api.url}/v1/dominios`, {
        method: 'POST',
        headers: comCookie(sessaoAdmin),
        body: JSON.stringify({ dominio: publico }),
      });
      expect(resposta.status).toBe(400);
      const corpo = (await resposta.json()) as { erro: { codigo: string } };
      expect(corpo.erro.codigo).toBe('dominio_publico');
    }
  });

  it('o que não é domínio não entra', async () => {
    for (const cru of ['', 'semponto', 'com espaço.com', '-inicio.com']) {
      expect(() => normalizarDominio(cru)).toThrowError(/não é um domínio/);
    }
    // O que dá para consertar sozinho, conserta.
    expect(normalizarDominio(' HTTPS://Acme.COM.br/entrar ')).toBe('acme.com.br');
    expect(normalizarDominio('@acme.com.br.')).toBe('acme.com.br');
  });

  it('domínio de outro tenant é conflito, não sequestro', async () => {
    const dominio = `disputado-${randomUUID().slice(0, 8)}.teste`;
    await registrarDominio(b.tenantId, dominio);
    await expect(registrarDominio(a.tenantId, dominio)).rejects.toMatchObject({
      codigo: 'dominio_em_uso',
    });
  });

  it('sem a permissão tenant.configurar, 403', async () => {
    const resposta = await fetch(`${api.url}/v1/dominios`, {
      method: 'POST',
      headers: comCookie(sessaoSemPoder),
      body: JSON.stringify({ dominio: 'qualquer.teste' }),
    });
    expect(resposta.status).toBe(403);
  });
});

describe('verificação por TXT', () => {
  it('com o TXT publicado, marca verificado — e o login por domínio passa a valer', async () => {
    const dominio = `verificavel-${randomUUID().slice(0, 8)}.teste`;
    const registrado = await registrarDominio(a.tenantId, dominio);

    // O DNS parte o TXT em pedaços de 255 bytes; o valor é a concatenação deles.
    const emPedacos = [
      registrado.registro.valor.slice(0, 10),
      registrado.registro.valor.slice(10),
    ];
    const resultado = await verificarDominio(a.tenantId, registrado.id, async (nome) => {
      expect(nome).toBe(`_pipe-verificacao.${dominio}`);
      return [['pipe-verificacao=de-outra-pessoa'], emPedacos];
    });
    expect(resultado.verificadoEm).toBeInstanceOf(Date);

    const { rows } = await a.dono.execute<{ n: string }>(sql`
      select count(*)::text as n from dominio_tenant
       where id = ${registrado.id}::uuid and verificado_em is not null
    `);
    expect(rows[0]?.n).toBe('1');
  });

  it('sem o TXT, não verifica — e o erro diz o que publicar', async () => {
    const dominio = `pendente-${randomUUID().slice(0, 8)}.teste`;
    const registrado = await registrarDominio(a.tenantId, dominio);

    await expect(
      verificarDominio(a.tenantId, registrado.id, async () => [['outra-coisa']]),
    ).rejects.toMatchObject({ codigo: 'dominio_nao_verificado' });

    // DNS que nem responde é a mesma coisa: "ainda não", nunca 500.
    await expect(
      verificarDominio(a.tenantId, registrado.id, () => Promise.reject(new Error('ENOTFOUND'))),
    ).rejects.toMatchObject({ codigo: 'dominio_nao_verificado' });

    const { rows } = await a.dono.execute<{ n: string }>(sql`
      select count(*)::text as n from dominio_tenant
       where id = ${registrado.id}::uuid and verificado_em is null
    `);
    expect(rows[0]?.n).toBe('1');
  });

  it('token de verificação de um tenant não verifica o domínio do outro', async () => {
    const dominio = `alheio-${randomUUID().slice(0, 8)}.teste`;
    const registrado = await registrarDominio(b.tenantId, dominio);
    // O A nem enxerga a linha do B: a RLS filtra antes de qualquer conferência.
    await expect(verificarDominio(a.tenantId, registrado.id)).rejects.toMatchObject({
      codigo: 'nao_encontrado',
    });
  });
});

describe('provisionar cliente', () => {
  async function provisionar(extra: Record<string, unknown> = {}) {
    const marca = randomUUID().slice(0, 8);
    const slug = `acme-${marca}`;
    provisionados.push(slug);
    return provisionarCliente({
      nome: `Acme ${marca}`,
      slug,
      plano: 'operacao',
      admin: `dono@acme-${marca}.teste`,
      ...extra,
    });
  }

  it('cria o tenant inteiro e deixa o administrador pronto para entrar', async () => {
    const cliente = await provisionar();

    expect(cliente.plano).toBe('operacao');
    // O catálogo vem da semente base, não de uma segunda lista escrita aqui.
    expect(cliente.papeis).toBe(5);
    expect(cliente.permissoes).toBeGreaterThan(40);
    expect(cliente.filas).toBe(4);

    const { rows } = await a.dono.execute<{ plano: string; papel: string; motivos: string }>(sql`
      select t.plano, p.nome as papel,
             (select count(*)::text from motivo_pausa where tenant_id = t.id) as motivos
        from tenant t
        join usuario u on u.id = ${cliente.adminId}::uuid
        join usuario_papel up on up.usuario_id = u.id
        join papel p on p.id = up.papel_id
       where t.id = ${cliente.tenantId}::uuid
    `);
    expect(rows[0]?.plano).toBe('operacao');
    expect(rows[0]?.papel).toBe('administrador');
    expect(rows[0]?.motivos).toBe(String(cliente.motivosDePausa));

    // Domínio nasce pendente: o DNS é do cliente, e o comando não inventa prova.
    expect(cliente.dominio.verificado).toBe(false);
    expect(cliente.dominio.registro.nome).toBe(`_pipe-verificacao.${cliente.dominio.dominio}`);
    expect(comoEntrar(cliente)).toContain(cliente.dominio.registro.valor);
  });

  it('com --verificar, confere o TXT e o domínio já nasce valendo', async () => {
    const cliente = await provisionar();
    const verificado = await verificarDominio(cliente.tenantId, cliente.dominio.id, async () => [
      [cliente.dominio.registro.valor],
    ]);
    expect(verificado.verificadoEm).toBeInstanceOf(Date);
    expect(comoEntrar({ ...cliente, dominio: { ...cliente.dominio, verificado: true } })).toContain(
      'VERIFICADO',
    );
  });

  it('plano fora do catálogo não passa: franquia não tem onde morar em texto livre', async () => {
    await expect(provisionar({ plano: 'ilimitado' })).rejects.toMatchObject({
      codigo: 'plano_invalido',
    });
  });

  it('e-mail pessoal não provisiona: o domínio dele não identifica empresa', async () => {
    await expect(provisionar({ admin: 'fulano@gmail.com' })).rejects.toMatchObject({
      codigo: 'dominio_publico',
    });
  });

  it('slug repetido para o comando, para não juntar dois clientes num tenant só', async () => {
    const cliente = await provisionar();
    await expect(
      provisionarCliente({
        nome: 'Outra empresa, mesmo slug',
        slug: cliente.slug,
        plano: 'essencial',
        admin: 'outro@outraempresa.teste',
      }),
    ).rejects.toMatchObject({ codigo: 'slug_em_uso' });
  });
});
