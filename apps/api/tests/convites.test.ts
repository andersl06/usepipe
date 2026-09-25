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
process.env['GOOGLE_URL_RETORNO'] = 'http://127.0.0.1:3100/v1/auth/google/callback';

const { NOME_DO_COOKIE, createTokencriarTokencreateToken, hashDoToken } = await import('@pipe/authentication');
const { upApi } = await import('../src/servidor.js');
const { aceitarInvitation, createInvitation, readInvitation } = await import('../src/domain/convites.js');
const { normalizeDomain, logDomain, checkDomain } =
  await import('../src/domain/dominios.js');
const { asLogin, provisionCustomer } = await import('../src/provision.js');
const { codigoDaRecusa } = await import('../src/controllers/login.js');
const { PipeError } = await import('../src/errors.js');
const { montarCenario } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof upApi>>;

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
/** Sessão de quem administra o tenant A: tem `conta.membros.escrever` e `tenant.configurar`. */
let sessionAdmin: string;
/** Sessão de quem só atende: prova que a permissão é conferida de verdade. */
let sessionWithoutPoder: string;

const PERMISSIONS_OF_ADMIN = ['conta.membros.escrever', 'usuario.gerenciar', 'tenant.configurar'];

async function seedPapeis(
  cenario: Cenario,
  nome: string,
  permissions: string[],
  scope: 'conta' | 'atendimento' = 'atendimento',
): Promise<string> {
  const dono = cenario.dono;
  for (const codigo of permissions) {
    await dono.execute(sql`
      insert into permissao (codigo, descricao, grupo)
      values (${codigo}, ${codigo}, 'teste') on conflict (codigo) do nothing
    `);
  }
  const { rows } = await dono.execute<{ id: string }>(sql`
    insert into papel (tenant_id, nome, escopo)
    values (${cenario.tenantId}, ${nome}, ${scope}) returning id
  `);
  const roleId = rows[0]!.id;
  for (const codigo of permissions) {
    await dono.execute(sql`
      insert into papel_permissao (tenant_id, papel_id, permissao_codigo)
      values (${cenario.tenantId}, ${roleId}, ${codigo})
    `);
  }
  return roleId;
}

/** Grava uma sessão viva para o atendente do cenário e devolve o token do cookie. */
async function openSession(cenario: Cenario): Promise<string> {
  const novo = createTokencriarTokencreateToken();
  await cenario.dono.execute(sql`
    insert into sessao (tenant_id, usuario_id, token_hash, expira_em, origem)
    values (${cenario.tenantId}, ${cenario.agentId}, ${novo.hash}, ${novo.expiresAt}, 'google')
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
    emailVerificado: true,
    nome: 'Convidada Teste',
    avatarUrl: undefined,
  };
}

beforeAll(async () => {
  a = await montarCenario(`conv-${randomUUID().slice(0, 8)}`);
  b = await montarCenario(`conv-${randomUUID().slice(0, 8)}`);

  const roleAdmin = await seedPapeis(a, 'Administrador e2e', PERMISSIONS_OF_ADMIN);
  await a.dono.execute(sql`
    insert into usuario_papel (tenant_id, usuario_id, papel_id)
    values (${a.tenantId}, ${a.agentId}, ${roleAdmin})
  `);
  // O papel de CONTA que os convites vão usar, um em cada tenant — e um de
  // atendimento no A, que o convite tem de recusar.
  await seedPapeis(a, 'guest', ['conta.resumo.ler'], 'conta');
  await seedPapeis(b, 'guest', ['conta.resumo.ler'], 'conta');
  await seedPapeis(a, 'atendente', ['conversa.ver']);

  api = await upApi(0);
  sessionAdmin = await openSession(a);
  sessionWithoutPoder = await openSession(b);
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

async function convidar(email: string, role = 'guest'): Promise<string> {
  const invitation = await createInvitation(a.tenantId, { email, role });
  return invitation.token;
}

describe('POST /v1/convites', () => {
  it('Return an invitation link while storing only its token hash', async () => {
    const email = `ana.${randomUUID().slice(0, 6)}@cliente.teste`;
    const resposta = await fetch(`${api.url}/v1/convites`, {
      method: 'POST',
      headers: comCookie(sessionAdmin),
      body: JSON.stringify({ email, role: 'guest' }),
    });
    expect(resposta.status).toBe(201);

    const corpo = (await resposta.json()) as {
      id: string;
      email: string;
      role: string;
      url: string;
      expiresAt: string;
    };
    expect(corpo.email).toBe(email);
    expect(corpo.role).toBe('guest');
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

  it('Reject a role absent from the tenant before saving an invitation', async () => {
    const resposta = await fetch(`${api.url}/v1/convites`, {
      method: 'POST',
      headers: comCookie(sessionAdmin),
      body: JSON.stringify({ email: 'x@cliente.teste', role: 'imperador' }),
    });
    expect(resposta.status).toBe(400);
    const corpo = (await resposta.json()) as { error: { code: string } };
    expect(corpo.error.codigo).toBe('role_invalid');
  });

  it('Reject attendance roles because invitations grant only account roles', async () => {
    const email = `atendente.${randomUUID().slice(0, 6)}@cliente.teste`;
    const resposta = await fetch(`${api.url}/v1/convites`, {
      method: 'POST',
      headers: comCookie(sessionAdmin),
      body: JSON.stringify({ email, role: 'atendente' }),
    });
    expect(resposta.status).toBe(400);
    const corpo = (await resposta.json()) as { error: { code: string; message: string } };
    expect(corpo.erro.codigo).toBe('role_of_attendance');
    expect(corpo.erro.message).toContain('admin, member ou guest');

    const { rows } = await a.dono.execute<{ n: string }>(
      sql`select count(*)::text as n from convite where email = ${email}`,
    );
    expect(rows[0]?.n).toBe('0');
  });

  it('Report an existing member\'s email as a conflict instead of duplicating an invitation', async () => {
    const { rows } = await a.dono.execute<{ email: string }>(
      sql`select email from usuario where id = ${a.agentId}::uuid`,
    );
    const resposta = await fetch(`${api.url}/v1/convites`, {
      method: 'POST',
      headers: comCookie(sessionAdmin),
      body: JSON.stringify({ email: rows[0]!.email, role: 'guest' }),
    });
    expect(resposta.status).toBe(409);
  });

  it('Return 403 without `conta.membros.escrever` even with an active session', async () => {
    const resposta = await fetch(`${api.url}/v1/convites`, {
      method: 'POST',
      headers: comCookie(sessionWithoutPoder),
      body: JSON.stringify({ email: 'y@cliente.teste', role: 'guest' }),
    });
    expect(resposta.status).toBe(403);
    const corpo = (await resposta.json()) as { error: { code: string } };
    expect(corpo.erro.codigo).toBe('without_permission');
  });

  it('Return 401 without a session', async () => {
    const resposta = await fetch(`${api.url}/v1/convites`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'z@cliente.teste', role: 'guest' }),
    });
    expect(resposta.status).toBe(401);
  });

  it('convidar de novo invalida o link anterior', async () => {
    const email = `renovada.${randomUUID().slice(0, 6)}@cliente.teste`;
    const first = await convidar(email);
    const segundo = await convidar(email);

    await expect(readInvitation(first)).rejects.toMatchObject({ codigo: 'convite_expirado' });
    await expect(readInvitation(segundo)).resolves.toMatchObject({ email });
  });
});

describe('GET /v1/convites/:token', () => {
  it('Show the invitation recipient with minimal details without requiring a session', async () => {
    const email = `bruna.${randomUUID().slice(0, 6)}@cliente.teste`;
    const token = await convidar(email);

    const resposta = await fetch(`${api.url}/v1/convites/${token}`);
    expect(resposta.status).toBe(200);
    const corpo = (await resposta.json()) as {
      email: string;
      role: string;
      tenant: { name: string; slug: string };
    };
    expect(corpo.email).toBe(email);
    expect(corpo.papel).toBe('guest');
    expect(corpo.tenant.slug).toContain('e2e-conv-');
    // O id do tenant não é assunto de quem ainda está do lado de fora.
    expect(JSON.stringify(corpo)).not.toContain(a.tenantId);
  });

  it('Return 404 for an unknown token without revealing similar invitations', async () => {
    const resposta = await fetch(`${api.url}/v1/convites/nunca-existiu`);
    expect(resposta.status).toBe(404);
  });

  it('Return 410 with the reason for an expired invitation', async () => {
    const token = await convidar(`vencida.${randomUUID().slice(0, 6)}@cliente.teste`);
    await a.dono.execute(
      sql`update convite set expira_em = now() - interval '1 minute'
           where token_hash = ${hashDoToken(token)}`,
    );
    const resposta = await fetch(`${api.url}/v1/convites/${token}`);
    expect(resposta.status).toBe(410);
    const corpo = (await resposta.json()) as { error: { code: string } };
    expect(corpo.erro.codigo).toBe('invitation_expired');
  });
});

describe('POST /v1/convites/:token/aceitar', () => {
  it('Create the user with the invited role and consume the token', async () => {
    const email = `carla.${randomUUID().slice(0, 6)}@cliente.teste`;
    const token = await convidar(email);

    const resposta = await fetch(`${api.url}/v1/convites/${token}/aceitar`, { method: 'POST' });
    expect(resposta.status).toBe(200);
    const corpo = (await resposta.json()) as {
      userId: string;
      email: string;
      role: string;
      joinedAt: string;
    };
    expect(corpo.email).toBe(email);
    expect(corpo.joinedAt).toBe(`/v1/auth/google?invite=${encodeURIComponent(token)}`);

    const { rows } = await a.dono.execute<{ tenant_id: string; role: string }>(sql`
      select u.tenant_id, p.nome as papel
        from usuario u
        join usuario_papel up on up.usuario_id = u.id
        join papel p on p.id = up.papel_id
       where u.id = ${corpo.userId}::uuid
    `);
    expect(rows[0]?.tenant_id).toBe(a.tenantId);
    expect(rows[0]?.papel).toBe('guest');

    // Uso único: o segundo clique no mesmo link não cria um segundo usuário.
    const repetido = await fetch(`${api.url}/v1/convites/${token}/aceitar`, { method: 'POST' });
    expect(repetido.status).toBe(410);
    const error = (await repetido.json()) as { error: { code: string } };
    expect(error.erro.codigo).toBe('invitation_used');

    const { rows: quantos } = await a.dono.execute<{ n: string }>(
      sql`select count(*)::text as n from usuario where email = ${email}`,
    );
    expect(quantos[0]?.n).toBe('1');
  });

  it('Create no user from an expired invitation', async () => {
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

  it('Add an invitee to the inviting tenant, never another tenant', async () => {
    const email = `daniela.${randomUUID().slice(0, 6)}@outrocliente.teste`;
    const convite = await createInvitation(b.tenantId, { email, papel: 'guest' });

    const aceito = await aceitarInvitation(convite.token);
    expect(aceito.tenantId).toBe(b.tenantId);

    const { rows } = await a.dono.execute<{ tenant_id: string }>(
      sql`select tenant_id from usuario where email = ${email}`,
    );
    expect(rows.map((l) => l.tenant_id)).toEqual([b.tenantId]);
  });

  it('Link a Google identity and open a session when accepting an invitation', async () => {
    const email = `elisa.${randomUUID().slice(0, 6)}@cliente.teste`;
    const token = await convidar(email);
    const pessoa = pessoaDoGoogle(email);

    const aceito = await aceitarInvitation(token, pessoa, { ip: '10.0.0.9' });
    expect(aceito.session).toBeDefined();

    // A sessão vale de verdade: é o mesmo cookie que as telas usam.
    const eu = await fetch(`${api.url}/v1/eu`, { headers: comCookie(aceito.session!.token) });
    expect(eu.status).toBe(200);
    const corpo = (await eu.json()) as { user: { email: string }; tenant: { id: string } };
    expect(corpo.user.email).toBe(email);
    expect(corpo.tenant.id).toBe(a.tenantId);

    // E a conta ficou ligada pelo par (emissor, sujeito) — nunca pelo e-mail.
    const { rows } = await a.dono.execute<{ n: string }>(sql`
      select count(*)::text as n from identidade_externa
       where emissor = ${pessoa.emissor} and sujeito = ${pessoa.sujeito}
    `);
    expect(rows[0]?.n).toBe('1');
  });

  it('Reject an invitation when a different Google account logs in', async () => {
    const token = await convidar(`fabiana.${randomUUID().slice(0, 6)}@cliente.teste`);
    await expect(
      aceitarInvitation(token, pessoaDoGoogle('intrusa@cliente.teste')),
    ).rejects.toMatchObject({ codigo: 'convite_de_outro_email' });
  });
});

describe('Carry an invitation through GET /v1/auth/google?invitation=', () => {
  it('Carry the invitation in the Google challenge so the callback identifies the tenant', async () => {
    const token = await convidar(`gabriela.${randomUUID().slice(0, 6)}@cliente.teste`);
    const resposta = await fetch(`${api.url}/v1/auth/google?invite=${encodeURIComponent(token)}`, {
      redirect: 'manual',
    });
    expect(resposta.status).toBe(302);

    const cookie = resposta.headers.get('set-cookie') ?? '';
    const value = /pipe_challenge=([^;]*)/.exec(cookie)?.[1] ?? '';
    const desafio = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as {
      invitation?: string;
    };
    expect(desafio.invitation).toBe(token);

    // E o token do convite NÃO vaza para o Google junto com o resto do desafio.
    expect(resposta.headers.get('location')).not.toContain(token);
  });

  it('Omit the invitation field from ordinary domain login challenges', async () => {
    const resposta = await fetch(`${api.url}/v1/auth/google`, { redirect: 'manual' });
    const valor = /pipe_challenge=([^;]*)/.exec(resposta.headers.get('set-cookie') ?? '')?.[1] ?? '';
    const desafio = JSON.parse(Buffer.from(valor, 'base64url').toString('utf8')) as {
      convite?: string;
    };
    expect(desafio.convite).toBeUndefined();
  });

  it('Show invalid invitations as a login refusal rather than a server error', () => {
    // O que a volta do Google faz com um convite vencido, usado ou de outro e-mail.
    expect(codigoDaRecusa(new PipeError(410, 'invitation_used', 'já foi'))).toBe('sem_convite');
    expect(codigoDaRecusa(PipeError.naoEncontrado('Convite'))).toBe('sem_convite');
    // Erro nosso continua sendo erro nosso: a saída é tentar de novo.
    expect(codigoDaRecusa(new PipeError(500, 'error_internal', 'caiu'))).toBe('falha_no_provedor');
  });
});

describe('POST /v1/dominios', () => {
  it('registra e diz qual TXT publicar', async () => {
    const domain = `acme-${randomUUID().slice(0, 8)}.teste`;
    const resposta = await fetch(`${api.url}/v1/dominios`, {
      method: 'POST',
      headers: comCookie(sessionAdmin),
      body: JSON.stringify({ domain }),
    });
    expect(resposta.status).toBe(201);

    const corpo = (await resposta.json()) as {
      id: string;
      domain: string;
      verifiedAt: string | null;
      registro: { name: string; tipo: string; value: string };
    };
    expect(corpo.domain).toBe(domain);
    expect(corpo.verificadoEm).toBeNull();
    expect(corpo.registro.nome).toBe(`_pipe-verificacao.${domain}`);
    expect(corpo.registro.value).toMatch(/^pipe-verificacao=[0-9a-f]{32}$/);

    // Idempotente: chamar de novo devolve o MESMO token, senão quem já publicou
    // veria a verificação falhar sem ter mexido em nada.
    const outra = await fetch(`${api.url}/v1/dominios`, {
      method: 'POST',
      headers: comCookie(sessionAdmin),
      body: JSON.stringify({ domain }),
    });
    const segunda = (await outra.json()) as { registro: { value: string } };
    expect(segunda.registro.valor).toBe(corpo.registro.value);
  });

  it('Reject public email domains that cannot identify a company (`gmail.com`)', async () => {
    for (const publico of ['gmail.com', 'Hotmail.com', 'uol.com.br']) {
      const resposta = await fetch(`${api.url}/v1/dominios`, {
        method: 'POST',
        headers: comCookie(sessionAdmin),
        body: JSON.stringify({ domain: publico }),
      });
      expect(resposta.status).toBe(400);
      const corpo = (await resposta.json()) as { error: { code: string } };
      expect(corpo.erro.codigo).toBe('domain_public');
    }
  });

  it('Reject strings that are not valid domains', async () => {
    for (const cru of ['', 'semponto', 'com espaço.com', '-inicio.com']) {
      expect(() => normalizeDomain(cru)).toThrowError(/não é um domínio/);
    }
    // O que dá para consertar sozinho, conserta.
    expect(normalizeDomain(' HTTPS://Acme.COM.br/entrar ')).toBe('acme.com.br');
    expect(normalizeDomain('@acme.com.br.')).toBe('acme.com.br');
  });

  it('Report a domain owned by another tenant as a conflict', async () => {
    const dominio = `disputado-${randomUUID().slice(0, 8)}.teste`;
    await logDomain(b.tenantId, dominio);
    await expect(logDomain(a.tenantId, dominio)).rejects.toMatchObject({
      codigo: 'dominio_em_uso',
    });
  });

  it('Return 403 without `tenant.configurar` permission', async () => {
    const resposta = await fetch(`${api.url}/v1/dominios`, {
      method: 'POST',
      headers: comCookie(sessionWithoutPoder),
      body: JSON.stringify({ domain: 'qualquer.teste' }),
    });
    expect(resposta.status).toBe(403);
  });
});

describe('Verify domains with TXT records', () => {
  it('Verify a published TXT record and allow domain-based login', async () => {
    const dominio = `verificavel-${randomUUID().slice(0, 8)}.teste`;
    const registrado = await logDomain(a.tenantId, dominio);

    // O DNS parte o TXT em pedaços de 255 bytes; o valor é a concatenação deles.
    const emPedacos = [registrado.registro.value.slice(0, 10), registrado.registro.value.slice(10)];
    const resultado = await checkDomain(a.tenantId, registrado.id, async (nome) => {
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

  it('Leave a domain unverified without its TXT record and explain what to publish', async () => {
    const dominio = `pendente-${randomUUID().slice(0, 8)}.teste`;
    const registrado = await logDomain(a.tenantId, dominio);

    await expect(
      checkDomain(a.tenantId, registrado.id, async () => [['outra-coisa']]),
    ).rejects.toMatchObject({ codigo: 'dominio_nao_verificado' });

    // DNS que nem responde é a mesma coisa: "ainda não", nunca 500.
    await expect(
      checkDomain(a.tenantId, registrado.id, () => Promise.reject(new Error('ENOTFOUND'))),
    ).rejects.toMatchObject({ codigo: 'dominio_nao_verificado' });

    const { rows } = await a.dono.execute<{ n: string }>(sql`
      select count(*)::text as n from dominio_tenant
       where id = ${registrado.id}::uuid and verificado_em is null
    `);
    expect(rows[0]?.n).toBe('1');
  });

  it('Prevent one tenant\'s verification token from verifying another\'s domain', async () => {
    const dominio = `alheio-${randomUUID().slice(0, 8)}.teste`;
    const registrado = await logDomain(b.tenantId, dominio);
    // O A nem enxerga a linha do B: a RLS filtra antes de qualquer conferência.
    await expect(checkDomain(a.tenantId, registrado.id)).rejects.toMatchObject({
      codigo: 'nao_encontrado',
    });
  });
});

describe('Provision a customer tenant', () => {
  async function provision(extra: Record<string, unknown> = {}) {
    const marca = randomUUID().slice(0, 8);
    const slug = `acme-${marca}`;
    provisionados.push(slug);
    return provisionCustomer({
      nome: `Acme ${marca}`,
      slug,
      plano: 'operacao',
      admin: `dono@acme-${marca}.teste`,
      ...extra,
    });
  }

  it('Provision a tenant and prepare its administrator to log in', async () => {
    const cliente = await provision();

    expect(cliente.plano).toBe('operacao');
    // O catálogo vem da semente base, não de uma segunda lista escrita aqui.
    // Três de conta (admin, member, guest) e cinco de atendimento.
    expect(cliente.papeis).toBe(8);
    expect(cliente.permissions).toBeGreaterThan(40);
    expect(cliente.queues).toBe(4);

    const { rows } = await a.dono.execute<{ plan: string; role: string; motivos: string }>(sql`
      select t.plano, p.nome as papel,
             (select count(*)::text from motivo_pausa where tenant_id = t.id) as motivos
        from tenant t
        join usuario u on u.id = ${cliente.adminId}::uuid
        join usuario_papel up on up.usuario_id = u.id
        join papel p on p.id = up.papel_id
       where t.id = ${cliente.tenantId}::uuid
       order by p.nome
    `);
    expect(rows[0]?.plano).toBe('operacao');
    // `admin` na conta e `administrador` no atendimento (migração 0021).
    expect(rows.map((l) => l.papel)).toEqual(['admin', 'administrador']);
    expect(rows[0]?.motivos).toBe(String(cliente.motivosDePausa));

    // Domínio nasce pendente: o DNS é do cliente, e o comando não inventa prova.
    const dominio = cliente.domain!;
    expect(dominio.verificado).toBe(false);
    expect(dominio.registro.nome).toBe(`_pipe-verificacao.${dominio.dominio}`);
    expect(asLogin(cliente)).toContain(dominio.registro.value);
  });

  it('Verify the TXT record during provisioning with --check and activate the domain', async () => {
    const cliente = await provision();
    const dominio = cliente.domain!;
    const verificado = await checkDomain(cliente.tenantId, dominio.id, async () => [
      [dominio.registro.value],
    ]);
    expect(verificado.verificadoEm).toBeInstanceOf(Date);
    expect(asLogin({ ...cliente, domain: { ...dominio, verificado: true } })).toContain(
      'VERIFICADO',
    );
  });

  it('plano fora do catálogo não passa: franquia não tem onde morar em texto livre', async () => {
    await expect(provision({ plano: 'ilimitado' })).rejects.toMatchObject({
      codigo: 'plano_invalido',
    });
  });

  it('Do not provision a company from a personal email domain', async () => {
    await expect(provision({ admin: 'fulano@gmail.com' })).rejects.toMatchObject({
      codigo: 'dominio_publico',
    });
  });

  it('slug repetido para o comando, para não juntar dois clientes num tenant só', async () => {
    const cliente = await provision();
    await expect(
      provisionCustomer({
        nome: 'Outra empresa, mesmo slug',
        slug: cliente.slug,
        plano: 'essencial',
        admin: 'outro@outraempresa.teste',
      }),
    ).rejects.toMatchObject({ codigo: 'slug_em_uso' });
  });
});
