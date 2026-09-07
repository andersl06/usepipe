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
process.env['PIPE_ORIGENS'] = 'http://telas.teste,http://gestao.teste';
process.env['GOOGLE_CLIENTE_ID'] = 'cliente-de-teste.apps.googleusercontent.com';
process.env['GOOGLE_CLIENTE_SEGREDO'] = 'segredo-de-teste';
process.env['GOOGLE_URL_RETORNO'] = 'http://127.0.0.1:3100/v1/auth/google/retorno';
process.env['PIPE_METRICS_TOKEN'] = 'token-de-metricas';

const { EntradaRecusada, LoginErro, NOME_DO_COOKIE, criarToken } =
  await import('@pipe/autenticacao');
const { subirApi } = await import('../src/servidor.js');
const { baseDoApp, codigoDaRecusa, destinoAbsoluto, urlDeErro } = await import(
  '../src/controladores/entrar.js',
);
const { montarCenario } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof subirApi>>;

/**
 * Entrar, `GET /v1/eu`, sair, `/saude` e `/metrics`.
 *
 * O que não está aqui e é de propósito: a conversa com o Google. `trocarCodigo` e
 * `entrarComGoogle` já têm teste em `packages/autenticacao`, e repetir a troca de
 * código aqui exigiria dublar o JWKS para provar de novo o que já está provado. O
 * que este arquivo cobre é a casca: o guarda, o formato do `Eu`, a tradução dos
 * códigos de recusa e o que sai em cookie e em redirecionamento.
 */

let cenario: Cenario;
let api: ApiNoAr;
let sessaoToken: string;
const PERMISSOES = ['conversa.responder', 'conversa.ver', 'relatorio.ver'];

/** Dois papéis com permissão em comum: prova que a união vem sem repetido. */
async function semearIdentidade(): Promise<void> {
  const dono = cenario.dono;
  for (const codigo of PERMISSOES) {
    await dono.execute(sql`
      insert into permissao (codigo, descricao, grupo)
      values (${codigo}, ${codigo}, 'teste') on conflict (codigo) do nothing
    `);
  }

  const papeis: string[] = [];
  for (const [nome, codigos] of [
    ['Atendente e2e', ['conversa.ver', 'conversa.responder']],
    ['Supervisor e2e', ['conversa.ver', 'relatorio.ver']],
  ] as const) {
    const { rows } = await dono.execute<{ id: string }>(sql`
      insert into papel (tenant_id, nome) values (${cenario.tenantId}, ${nome}) returning id
    `);
    const papelId = rows[0]!.id;
    papeis.push(papelId);
    for (const codigo of codigos) {
      await dono.execute(sql`
        insert into papel_permissao (tenant_id, papel_id, permissao_codigo)
        values (${cenario.tenantId}, ${papelId}, ${codigo})
      `);
    }
  }

  for (const papelId of papeis) {
    await dono.execute(sql`
      insert into usuario_papel (tenant_id, usuario_id, papel_id)
      values (${cenario.tenantId}, ${cenario.atendenteId}, ${papelId})
    `);
  }
}

/** Grava uma sessão viva e devolve o token que iria para o cookie. */
async function abrirSessao(duracaoMs?: number): Promise<string> {
  const novo = criarToken(duracaoMs);
  await cenario.dono.execute(sql`
    insert into sessao (tenant_id, usuario_id, token_hash, expira_em, origem)
    values (${cenario.tenantId}, ${cenario.atendenteId}, ${novo.hash}, ${novo.expiraEm},
            'google')
  `);
  return novo.token;
}

function comCookie(token: string | undefined): Record<string, string> {
  return token ? { cookie: `${NOME_DO_COOKIE}=${token}` } : {};
}

beforeAll(async () => {
  cenario = await montarCenario(randomUUID().slice(0, 8));
  await semearIdentidade();
  api = await subirApi(0);
  sessaoToken = await abrirSessao();
}, 180_000);

afterAll(async () => {
  await api?.fechar();
  await cenario?.encerrar();
});

describe('guarda de sessão', () => {
  it('sem cookie, 401', async () => {
    const resposta = await fetch(`${api.url}/v1/eu`);
    expect(resposta.status).toBe(401);
    const corpo = (await resposta.json()) as { erro: { codigo: string } };
    expect(corpo.erro.codigo).toBe('nao_autorizado');
  });

  it('cookie com token inexistente, 401', async () => {
    const resposta = await fetch(`${api.url}/v1/eu`, {
      headers: comCookie('token-que-nunca-existiu'),
    });
    expect(resposta.status).toBe(401);
  });

  it('sessão expirada, 401 — e a mesma resposta de quem não mandou nada', async () => {
    const vencida = await abrirSessao(-1_000);
    const resposta = await fetch(`${api.url}/v1/eu`, { headers: comCookie(vencida) });
    expect(resposta.status).toBe(401);
  });
});

describe('GET /v1/eu', () => {
  it('devolve o Eu do contrato, com as permissões dos papéis', async () => {
    const resposta = await fetch(`${api.url}/v1/eu`, { headers: comCookie(sessaoToken) });
    expect(resposta.status).toBe(200);

    const eu = (await resposta.json()) as {
      usuario: { id: string; nome: string; email: string; avatarUrl: string | null };
      tenant: { id: string; nome: string; slug: string; plano: string };
      permissoes: string[];
      origem: string;
    };

    expect(eu.usuario.id).toBe(cenario.atendenteId);
    expect(eu.usuario.nome).toBe('Ana Ribeiro');
    expect(eu.usuario.avatarUrl).toBeNull();
    expect(eu.tenant.id).toBe(cenario.tenantId);
    expect(eu.tenant.plano).toBe('essencial');
    expect(eu.origem).toBe('google');

    // União dos dois papéis, sem repetir `conversa.ver`.
    expect(eu.permissoes).toEqual(PERMISSOES);
  });

  it('sessão de usuário desativado não entra', async () => {
    const token = await abrirSessao();
    await cenario.dono.execute(
      sql`update usuario set ativo = false where id = ${cenario.atendenteId}::uuid`,
    );
    try {
      const resposta = await fetch(`${api.url}/v1/eu`, { headers: comCookie(token) });
      expect(resposta.status).toBe(401);
    } finally {
      await cenario.dono.execute(
        sql`update usuario set ativo = true where id = ${cenario.atendenteId}::uuid`,
      );
    }
  });
});

describe('POST /v1/auth/sair', () => {
  it('encerra a sessão, apaga o cookie e o token não vale mais', async () => {
    const token = await abrirSessao();
    const resposta = await fetch(`${api.url}/v1/auth/sair`, {
      method: 'POST',
      headers: comCookie(token),
    });
    expect(resposta.status).toBe(204);
    expect(resposta.headers.get('set-cookie')).toContain('Max-Age=0');

    expect((await fetch(`${api.url}/v1/eu`, { headers: comCookie(token) })).status).toBe(401);
  });

  it('sair sem cookie não é erro', async () => {
    const resposta = await fetch(`${api.url}/v1/auth/sair`, { method: 'POST' });
    expect(resposta.status).toBe(204);
  });
});

describe('GET /v1/auth/google', () => {
  it('guarda o desafio em cookie curto e manda para o Google com PKCE', async () => {
    const resposta = await fetch(`${api.url}/v1/auth/google?destino=/conversas/42`, {
      redirect: 'manual',
    });
    expect(resposta.status).toBe(302);

    const destino = new URL(resposta.headers.get('location') ?? '');
    expect(destino.origin + destino.pathname).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth',
    );
    expect(destino.searchParams.get('code_challenge_method')).toBe('S256');
    expect(destino.searchParams.get('code_challenge')).toBeTruthy();
    expect(destino.searchParams.get('state')).toBeTruthy();

    const cookie = resposta.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('pipe_desafio=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Max-Age=300');
    expect(cookie).toContain('Path=/v1/auth');

    // O `state` do cookie tem que ser o mesmo que foi para o Google, senão a volta
    // nunca confere.
    const desafio = lerDesafioDoCookie(cookie);
    expect(desafio.state).toBe(destino.searchParams.get('state'));
    expect(desafio.destino).toBe('/conversas/42');
  });

  it('destino absoluto é descartado: redirecionamento aberto é phishing com o nosso domínio', async () => {
    const resposta = await fetch(
      `${api.url}/v1/auth/google?destino=${encodeURIComponent('https://malvado.example/roubar')}`,
      { redirect: 'manual' },
    );
    expect(lerDesafioDoCookie(resposta.headers.get('set-cookie') ?? '').destino).toBe('/');
  });
});

describe('GET /v1/auth/google/retorno', () => {
  it('sem o cookie do desafio, volta para a tela de entrada — nunca 500', async () => {
    const resposta = await fetch(`${api.url}/v1/auth/google/retorno?code=qualquer`, {
      redirect: 'manual',
    });
    expect(resposta.status).toBe(302);
    expect(resposta.headers.get('location')).toBe(
      'http://telas.teste/entrar?erro=falha_no_provedor',
    );
  });

  it('cookie corrompido também vira recusa, não erro interno', async () => {
    const resposta = await fetch(`${api.url}/v1/auth/google/retorno?code=x`, {
      redirect: 'manual',
      headers: { cookie: 'pipe_desafio=nao-e-base64-de-json' },
    });
    expect(resposta.status).toBe(302);
    expect(resposta.headers.get('location')).toContain('erro=falha_no_provedor');
  });
});

describe('códigos de recusa', () => {
  it('recusa de entrada mantém o próprio código', () => {
    for (const codigo of [
      'dominio_publico',
      'dominio_desconhecido',
      'sem_convite',
      'usuario_inativo',
    ] as const) {
      expect(codigoDaRecusa(new EntradaRecusada(codigo, 'motivo'))).toBe(codigo);
    }
  });

  it('e-mail não verificado pelo Google tem código próprio', () => {
    expect(codigoDaRecusa(new LoginErro('email_nao_verificado', 'sem confirmação'))).toBe(
      'email_nao_verificado',
    );
  });

  it('tudo o mais vira falha_no_provedor', () => {
    expect(codigoDaRecusa(new LoginErro('state_invalido', 'forjado'))).toBe('falha_no_provedor');
    expect(codigoDaRecusa(new LoginErro('troca_falhou', 'timeout'))).toBe('falha_no_provedor');
    expect(codigoDaRecusa(new Error('qualquer coisa'))).toBe('falha_no_provedor');
    expect(codigoDaRecusa(undefined)).toBe('falha_no_provedor');
  });
});

describe('CORS', () => {
  it('libera origem da lista, com credencial', async () => {
    const resposta = await fetch(`${api.url}/v1/eu`, {
      headers: { origin: 'http://telas.teste', ...comCookie(sessaoToken) },
    });
    expect(resposta.headers.get('access-control-allow-origin')).toBe('http://telas.teste');
    expect(resposta.headers.get('access-control-allow-credentials')).toBe('true');
  });

  it('origem de fora da lista não recebe o cabeçalho — e nunca curinga', async () => {
    const resposta = await fetch(`${api.url}/v1/eu`, {
      headers: { origin: 'http://malvado.example', ...comCookie(sessaoToken) },
    });
    expect(resposta.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('GET /saude', () => {
  it('com banco no ar, 200', async () => {
    const resposta = await fetch(`${api.url}/saude`);
    expect(resposta.status).toBe(200);
    const corpo = (await resposta.json()) as {
      ok: boolean;
      versao: string;
      banco: string;
      redis: string;
    };
    expect(corpo.ok).toBe(true);
    expect(corpo.banco).toBe('ok');
    expect(corpo.versao).toBeTruthy();
    expect(['ok', 'falha']).toContain(corpo.redis);
  });

  it('não exige autenticação', async () => {
    expect((await fetch(`${api.url}/saude`)).status).toBe(200);
  });
});

describe('GET /metrics', () => {
  it('sem o token, 401 — métrica aberta vaza volume de cliente', async () => {
    const resposta = await fetch(`${api.url}/metrics`);
    expect(resposta.status).toBe(401);
  });

  it('com o token, devolve o formato do Prometheus', async () => {
    const resposta = await fetch(`${api.url}/metrics`, {
      headers: { authorization: 'Bearer token-de-metricas' },
    });
    expect(resposta.status).toBe(200);
    expect(resposta.headers.get('content-type')).toContain('text/plain');

    const texto = await resposta.text();
    expect(texto).toContain('# TYPE pipe_http_requisicoes_total counter');
    expect(texto).toContain('# TYPE http_request_duration_seconds histogram');
    expect(texto).toContain('http_request_duration_seconds_bucket{');
    expect(texto).toContain('le="+Inf"');
    // O rótulo é o PADRÃO da rota, nunca o caminho com o uuid dentro.
    expect(texto).toContain('rota="/v1/eu"');
    expect(texto).not.toContain(`rota="/v1/conversas/${cenario.tenantId}`);

    // O balde acumulado nunca pode passar da contagem total da mesma série.
    const infinito = /http_request_duration_seconds_bucket\{[^}]*le="\+Inf"\} (\d+)/.exec(texto);
    const contagem = /http_request_duration_seconds_count\{[^}]*\} (\d+)/.exec(texto);
    expect(Number(infinito?.[1])).toBe(Number(contagem?.[1]));
  });
});

function lerDesafioDoCookie(cabecalho: string): {
  state: string;
  destino: string;
  origem?: string;
} {
  const valor = /pipe_desafio=([^;]*)/.exec(cabecalho)?.[1] ?? '';
  return JSON.parse(Buffer.from(valor, 'base64url').toString('utf8')) as {
    state: string;
    destino: string;
    origem?: string;
  };
}

/**
 * A volta do login com TRÊS fronts.
 *
 * `PIPE_URL_APP` é um valor só e a API atende Gestão, Desk e CRM. Sem a origem
 * viajando no desafio, quem entra pelo CRM volta na Gestão — e o sintoma na VPS
 * seria "o login funciona, mas me joga no aplicativo errado".
 */
describe('a origem de quem começou o login', () => {
  it('origem da lista manda a volta para o aplicativo certo', () => {
    expect(destinoAbsoluto('/leads', 'http://gestao.teste')).toBe('http://gestao.teste/leads');
    expect(urlDeErro('sem_convite', 'http://gestao.teste')).toBe(
      'http://gestao.teste/entrar?erro=sem_convite',
    );
  });

  it('origem fora da lista é ignorada — senão o login vira redirecionamento aberto', () => {
    expect(baseDoApp('https://malvado.example')).toBe('http://telas.teste');
    expect(destinoAbsoluto('/', 'https://malvado.example')).toBe('http://telas.teste/');
  });

  it('sem origem, cai no fallback do ambiente', () => {
    expect(destinoAbsoluto('/conversas')).toBe('http://telas.teste/conversas');
  });

  it('a barra final não separa a mesma origem em duas', () => {
    expect(baseDoApp('http://gestao.teste/')).toBe('http://gestao.teste');
  });

  it('a ida guarda a origem no cookie do desafio', async () => {
    const resposta = await fetch(
      `${api.url}/v1/auth/google?origem=${encodeURIComponent('http://gestao.teste')}`,
      { redirect: 'manual' },
    );
    expect(lerDesafioDoCookie(resposta.headers.get('set-cookie') ?? '').origem).toBe(
      'http://gestao.teste',
    );
  });
});
