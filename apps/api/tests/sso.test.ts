import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env['PIPE_FILAS'] = 'memoria';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_CHAVES_SEGREDO'] ??= `teste:${Buffer.alloc(32, 7).toString('base64')}`;
process.env['PIPE_CHAVE_SEGREDO_ATUAL'] ??= 'teste';
process.env['PIPE_URL_API'] = 'https://api.teste';

const { InboundRefusedEntradaRecusadaInboundRefused, loginWithGoogleentrarComGoogleloginWithGoogle, loginWithSsoentrarComSsologinWithSso } = await import('@pipe/autenticacao');
const { estaCifrado } = await import('@pipe/db');
const {
  connectionForFlow,
  defineState,
  discoverInbound,
  lerConexao,
  marcarTestada,
  salvarConexao,
  tenantBySlug,
} = await import('../src/dominio/sso.js');
const { montarCenario } = await import('./ajuda.js');
const { fecharBancos } = await import('../src/banco.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;

/**
 * A conexão de SSO por tenant, e as armadilhas de
 * `referencias-blip/pesquisa/sso-multi-tenant.md` que só aparecem com banco de verdade:
 * a máquina de estados, o segredo cifrado em repouso, a descoberta por domínio e
 * a política conferida no servidor.
 *
 * O que NÃO está aqui, de propósito: a conversa com o IdP. Ela tem teste em
 * `packages/autenticacao/tests/oidc.test.ts`, e repeti-la aqui exigiria dublar o
 * JWKS para provar de novo o que já está provado.
 */

const SUFIXO = randomUUID().slice(0, 8);
const DOMAIN = `sso-${SUFIXO}.teste`;
const EMISSOR = 'https://acme.okta.example';

let cenario: Cenario;
let admin: string;
let ana: string;

/** Um IdP de mentira: só o `.well-known`, que é tudo que `conexaoParaFluxo` lê. */
const buscarDescoberta = (async () =>
  ({
    ok: true,
    status: 200,
    json: async () => ({
      issuer: EMISSOR,
      authorization_endpoint: `${EMISSOR}/authorize`,
      token_endpoint: `${EMISSOR}/token`,
      jwks_uri: `${EMISSOR}/keys`,
    }),
  }) as Response) as unknown as typeof fetch;

function pessoa(email: string, verificado = true, sujeito = randomUUID()) {
  return {
    emissor: EMISSOR,
    sujeito,
    email,
    emailVerificado: verificado,
    nome: 'Ana Ribeiro',
    avatarUrl: undefined,
  };
}

beforeAll(async () => {
  cenario = await montarCenario(`sso-${SUFIXO}`);

  // Domínio verificado do tenant: é ele que liga e-mail a empresa.
  await cenario.dono.execute(sql`
    insert into dominio_tenant (tenant_id, dominio, token_verificacao, verificado_em)
    values (${cenario.tenantId}, ${DOMAIN}, 'tok', now())
  `);

  const { rows } = await cenario.dono.execute<{ id: string }>(sql`
    insert into usuario (tenant_id, nome, email)
    values (${cenario.tenantId}, 'Ana Ribeiro', ${`ana@${DOMAIN}`})
    returning id
  `);
  ana = rows[0]!.id;
  admin = cenario.agentId;
});

afterAll(async () => {
  await cenario?.encerrar();
  await fecharBancos();
});

async function configurar(): Promise<void> {
  await salvarConexao(cenario.tenantId, admin, {
    provedor: 'okta',
    emissor: EMISSOR,
    clienteId: 'cliente-do-pipe',
    customerSecret: 'segredo-do-cliente',
  });
}

describe('configuração da conexão', () => {
  it('salva em rascunho e guarda o segredo CIFRADO, nunca em claro', async () => {
    await configurar();

    const { rows } = await cenario.dono.execute<{ config: Record<string, unknown> }>(
      sql`select config from conexao_sso where tenant_id = ${cenario.tenantId}::uuid`,
    );
    const guardado = rows[0]!.config['clientSecret'];
    // O risco que isto fecha não é um cliente ler o outro — a RLS cuida disso.
    // É o `pg_dump`, que entregaria a credencial de TODOS os clientes de uma vez.
    expect(typeof guardado).toBe('string');
    expect(guardado).not.toBe('segredo-do-cliente');
    expect(estaCifrado(guardado as string)).toBe(true);

    const visivel = await lerConexao(cenario.tenantId);
    expect(visivel?.estado).toBe('rascunho');
    expect(visivel?.politica).toBe('desligado');
    // O que a tela mostra não tem segredo nenhum, nem campo para ele.
    expect(JSON.stringify(visivel)).not.toContain('segredo-do-cliente');
  });

  it('devolve a URL de retorno para o cliente colar no IdP dele', async () => {
    const visivel = await lerConexao(cenario.tenantId);
    expect(visivel?.callbackUrl).toBe('https://api.teste/v1/auth/sso/retorno');
  });

  it('recusa emissor que não é https', async () => {
    await expect(
      salvarConexao(cenario.tenantId, admin, {
        emissor: 'http://acme.example',
        clienteId: 'x',
        customerSecret: 'y',
      }),
    ).rejects.toMatchObject({ codigo: 'emissor_invalido' });
  });

  it('recusa emissor `common` do Entra: com ele qualquer diretório entraria', async () => {
    await salvarConexao(cenario.tenantId, admin, {
      provedor: 'entra',
      emissor: 'https://login.microsoftonline.com/common/v2.0',
      clienteId: 'cliente',
      customerSecret: 'segredo',
    });
    await expect(
      connectionForFlow(cenario.tenantId, { exigirActive: false }, buscarDescoberta),
    ).rejects.toMatchObject({ codigo: 'emissor_multi_tenant' });
    await configurar();
  });
});

describe('estado e política são dois botões', () => {
  it('não ativa sem teste verde — "salvei e liguei" manda todo mundo para um IdP mudo', async () => {
    await configurar();
    await expect(defineState(cenario.tenantId, admin, { state: 'ativa' })).rejects.toMatchObject({
      codigo: 'sem_teste_valido',
    });
  });

  it('não exige SSO com a conexão desligada — é o incidente clássico', async () => {
    await expect(
      defineState(cenario.tenantId, admin, { politica: 'obrigatorio' }),
    ).rejects.toMatchObject({ codigo: 'conexao_inativa' });
  });

  it('o teste destrava a ativação, e a ativação destrava a política', async () => {
    await marcarTestada(cenario.tenantId);
    expect((await lerConexao(cenario.tenantId))?.estado).toBe('testada');

    const active = await defineState(cenario.tenantId, admin, { state: 'ativa' });
    expect(active.estado).toBe('ativa');
    expect(active.ativadaEm).toBeInstanceOf(Date);
    // Ativar NÃO exige SSO: a senha e o Google continuam valendo.
    expect(active.politica).toBe('desligado');

    const exigindo = await defineState(cenario.tenantId, admin, { politica: 'obrigatorio' });
    expect(exigindo.politica).toBe('obrigatorio');
  });

  it('regravar a configuração rebaixa a conexão para rascunho', async () => {
    // Trocar o emissor de uma conexão ativa sem rebaixar o estado apontaria todo
    // o cliente para um diretório que ninguém testou.
    await defineState(cenario.tenantId, admin, { politica: 'desligado' });
    await configurar();
    const visivel = await lerConexao(cenario.tenantId);
    expect(visivel?.estado).toBe('rascunho');
    expect(visivel?.testadaEm).toBeNull();
  });

  it('cada mudança deixa registro em log_auditoria, e sem o segredo', async () => {
    const { rows } = await cenario.dono.execute<{ acao: string; depois: unknown }>(sql`
      select acao, depois from log_auditoria
       where tenant_id = ${cenario.tenantId}::uuid and objeto_tipo = 'conexao_sso'
       order by em
    `);
    expect(rows.length).toBeGreaterThan(0);
    expect(JSON.stringify(rows)).not.toContain('segredo-do-cliente');
    expect(rows.map((r) => r.acao)).toContain('ativou');
  });
});

describe('descoberta do tenant no login', () => {
  beforeAll(async () => {
    await configurar();
    await marcarTestada(cenario.tenantId);
    await defineState(cenario.tenantId, admin, { state: 'ativa', politica: 'opcional' });
  });

  it('domínio verificado com SSO ativo vai para o IdP da empresa', async () => {
    const achado = await discoverInbound(`ana@${DOMAIN}`);
    expect(achado.metodo).toBe('sso');
    expect(achado.irPara).toBe(`/v1/auth/sso/e2e-sso-${SUFIXO}`);
  });

  it('domínio desconhecido responde igualzinho a um conhecido sem SSO', async () => {
    // Sem essa simetria o endpoint vira catálogo de "quais empresas usam Pipe".
    expect(await discoverInbound('alguem@empresa-que-nao-existe.teste')).toEqual({
      metodo: 'google',
    });
  });

  it('domínio público NUNCA roteia, mesmo se alguém conseguir mapeá-lo', async () => {
    // Quem mapeasse `gmail.com` capturaria o login de meio Brasil. A trava está
    // no código, e não só no cadastro — por isso o teste força a linha no banco.
    await cenario.dono.execute(sql`
      insert into dominio_tenant (tenant_id, dominio, token_verificacao, verificado_em)
      values (${cenario.tenantId}, ${'gmail.com'}, 'tok', now())
      on conflict (dominio) do nothing
    `);
    try {
      expect(await discoverInbound('alguem@gmail.com')).toEqual({ metodo: 'google' });
    } finally {
      await cenario.dono.execute(sql`delete from dominio_tenant where dominio = 'gmail.com'`);
    }
  });

  it('o link direto /e/<slug> resolve o tenant pela URL', async () => {
    expect(await tenantBySlug(`e2e-sso-${SUFIXO}`)).toBe(cenario.tenantId);
    await expect(tenantBySlug('empresa-que-nao-existe')).rejects.toMatchObject({ status: 404 });
  });
});

describe('entrada pelo IdP do cliente', () => {
  it('liga a conta por (emissor, sujeito) e marca a sessão como sso', async () => {
    const inbound = await loginWithSsoentrarComSsologinWithSso(
      cenario.dono,
      cenario.dono,
      pessoa(`ana@${DOMAIN}`),
      cenario.tenantId,
    );
    expect(inbound.usuarioId).toBe(ana);

    const { rows } = await cenario.dono.execute<{ origem: string }>(
      sql`select origem from sessao where usuario_id = ${ana}::uuid order by criado_em desc limit 1`,
    );
    expect(rows[0]?.origem).toBe('sso');
  });

  it('recusa quem o IdP não confirmou o e-mail — é o caminho de escalada', async () => {
    // Quem conseguir um IdP a emitir o e-mail da vítima entraria como ela, com os
    // papéis dela. No Entra é a ausência de `xms_edov` que cai aqui.
    await expect(
      loginWithSsoentrarComSsologinWithSso(
        cenario.dono,
        cenario.dono,
        pessoa(`chefe@${DOMAIN}`, false),
        cenario.tenantId,
      ),
    ).rejects.toMatchObject({ codigo: 'email_nao_verificado' });
  });

  it('recusa e-mail de domínio que não é do tenant que iniciou o fluxo', async () => {
    // O IdP de um cliente não autentica gente de outro só por mandar o e-mail
    // certo: o domínio continua tendo de estar verificado, e verificado aqui.
    await expect(
      loginWithSsoentrarComSsologinWithSso(
        cenario.dono,
        cenario.dono,
        pessoa('ana@outra-empresa.teste'),
        cenario.tenantId,
      ),
    ).rejects.toMatchObject({ codigo: 'dominio_desconhecido' });
  });

  it('recusa quem nunca foi convidado: descobrir domínio não é entrar no cliente', async () => {
    await expect(
      loginWithSsoentrarComSsologinWithSso(cenario.dono, cenario.dono, pessoa(`novato@${DOMAIN}`), cenario.tenantId),
    ).rejects.toMatchObject({ codigo: 'sem_convite' });
  });
});

describe('convivência: SSO obrigatório não tem porta dos fundos', () => {
  it('com politica=obrigatorio o login pelo Google é recusado no SERVIDOR', async () => {
    // Não é a tela que esconde o botão. A identidade já está ligada, o usuário
    // está ativo, e mesmo assim a entrada por outro caminho recusa.
    await defineState(cenario.tenantId, admin, { politica: 'obrigatorio' });
    try {
      await expect(
        loginWithGoogleentrarComGoogleloginWithGoogle(cenario.dono, cenario.dono, {
          emissor: 'https://accounts.google.com',
          sujeito: 'google-da-ana',
          email: `ana@${DOMAIN}`,
          emailVerificado: true,
          nome: 'Ana',
          avatarUrl: undefined,
        }),
      ).rejects.toBeInstanceOf(InboundRefusedEntradaRecusadaInboundRefused);

      // ...e o SSO continua passando, que é o ponto da política.
      const entrada = await loginWithSsoentrarComSsologinWithSso(
        cenario.dono,
        cenario.dono,
        pessoa(`ana@${DOMAIN}`),
        cenario.tenantId,
      );
      expect(entrada.usuarioId).toBe(ana);
    } finally {
      await defineState(cenario.tenantId, admin, { politica: 'opcional' });
    }
  });

  it('com politica=opcional os dois caminhos valem — é o que permite migrar', async () => {
    const entrada = await loginWithGoogleentrarComGoogleloginWithGoogle(cenario.dono, cenario.dono, {
      emissor: 'https://accounts.google.com',
      sujeito: `google-${randomUUID()}`,
      email: `ana@${DOMAIN}`,
      emailVerificado: true,
      nome: 'Ana',
      avatarUrl: undefined,
    });
    expect(entrada.usuarioId).toBe(ana);
  });
});
