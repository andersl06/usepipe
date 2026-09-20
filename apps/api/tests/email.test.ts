import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// O modo tem que ser decidido antes de qualquer import que leia a variável.
process.env['PIPE_FILAS'] = 'memoria';
process.env['PIPE_EMAIL_MODO'] = 'duble';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_CHAVES_SEGREDO'] ??= `teste:${Buffer.alloc(32, 9).toString('base64')}`;
process.env['PIPE_CHAVE_SEGREDO_ATUAL'] ??= 'teste';
process.env['PIPE_URL_APP'] = 'http://telas.teste';

const { RemetenteDuble, RemetenteHttp, definirRemetente, enviarEmailSemDerrubar, remetente } =
  await import('../src/dominio/email.js');
const { criarConvite, reenviarConvite } = await import('../src/dominio/convites.js');
const { aplicarEventosDeModelo } = await import('../src/dominio/whatsapp/eventos-de-modelo.js');
const { esquecerCanal, fecharBancos, resolverCanal } = await import('../src/banco.js');
const { montarCenario } = await import('./ajuda.js');
import type { Email, RemetenteDeEmail } from '../src/dominio/email.js';

type Cenario = Awaited<ReturnType<typeof montarCenario>>;

/**
 * E-mail: o dublê registra, o convite dispara com o link, a recategorização
 * dispara para a lista do canal (e não dispara desligada), e a falha do
 * provedor NÃO derruba nenhuma das duas operações.
 *
 * Sem servidor HTTP: `criarConvite` e `aplicarEventosDeModelo` são chamados
 * direto, como `convites.test.ts` e `canais.test.ts` já fazem. O remetente real
 * é exercitado com um `fetch` falso, para provar o contrato do POST sem rede.
 */

let cenario: Cenario;

/** Um remetente que sempre falha — o provedor fora do ar. */
class RemetenteQueFalha implements RemetenteDeEmail {
  readonly nome = 'real' as const;
  enviar(): Promise<void> {
    return Promise.reject(new Error('provedor fora do ar'));
  }
}

async function semearPapelDeConta(nome: string): Promise<void> {
  await cenario.dono.execute(sql`
    insert into permissao (codigo, descricao, grupo)
    values ('conta.resumo.ler', 'conta.resumo.ler', 'teste') on conflict (codigo) do nothing
  `);
  const { rows } = await cenario.dono.execute<{ id: string }>(sql`
    insert into papel (tenant_id, nome, escopo)
    values (${cenario.tenantId}, ${nome}, 'conta') returning id
  `);
  await cenario.dono.execute(sql`
    insert into papel_permissao (tenant_id, papel_id, permissao_codigo)
    values (${cenario.tenantId}, ${rows[0]!.id}, 'conta.resumo.ler')
  `);
}

/** Uma pessoa do tenant com a permissão dada — quem o alerta acha quando a lista está vazia. */
async function pessoaCom(permissao: string, email: string): Promise<string> {
  const marca = randomUUID().slice(0, 8);
  const { rows: usuarios } = await cenario.dono.execute<{ id: string }>(sql`
    insert into usuario (tenant_id, nome, email)
    values (${cenario.tenantId}, ${`Pessoa ${marca}`}, ${email})
    returning id
  `);
  await cenario.dono.execute(sql`
    insert into permissao (codigo, descricao, grupo)
    values (${permissao}, ${permissao}, 'teste') on conflict (codigo) do nothing
  `);
  const { rows: papeis } = await cenario.dono.execute<{ id: string }>(sql`
    insert into papel (tenant_id, nome, escopo)
    values (${cenario.tenantId}, ${`papel ${marca}`}, 'atendimento') returning id
  `);
  await cenario.dono.execute(sql`
    insert into papel_permissao (tenant_id, papel_id, permissao_codigo)
    values (${cenario.tenantId}, ${papeis[0]!.id}, ${permissao})
  `);
  await cenario.dono.execute(sql`
    insert into usuario_papel (tenant_id, usuario_id, papel_id)
    values (${cenario.tenantId}, ${usuarios[0]!.id}, ${papeis[0]!.id})
  `);
  return usuarios[0]!.id;
}

/** Grava a preferência de alerta no canal do cenário e limpa o cache de canal. */
async function configurarAlerta(ativo: boolean, emails: string[]): Promise<void> {
  const preferencias = JSON.stringify({ alertaRecategorizacao: { ativo, emails } });
  await cenario.dono.execute(sql`
    update canal set config = config || jsonb_build_object('preferencias', ${preferencias}::jsonb)
     where id = ${cenario.canalId}::uuid
  `);
  esquecerCanal(cenario.canalId);
}

/** O evento de recategorização como a Meta manda, para o modelo do cenário. */
function recategorizacao(nome: string, de: string, para: string): unknown {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'waba-e2e',
        changes: [
          {
            field: 'template_category_update',
            value: {
              message_template_name: nome,
              message_template_language: 'pt_BR',
              previous_category: de,
              new_category: para,
            },
          },
        ],
      },
    ],
  };
}

async function criarModelo(nome: string, categoria: string): Promise<string> {
  const { rows } = await cenario.dono.execute<{ id: string }>(sql`
    insert into template_mensagem (tenant_id, canal_id, nome, idioma, categoria, status_meta, corpo)
    values (${cenario.tenantId}, ${cenario.canalId}::uuid, ${nome}, 'pt_BR', ${categoria}, 'aprovado', 'Oi')
    returning id
  `);
  return rows[0]!.id;
}

async function categoriaDoModelo(id: string): Promise<string> {
  const { rows } = await cenario.dono.execute<{ categoria: string }>(
    sql`select categoria from template_mensagem where id = ${id}::uuid`,
  );
  return rows[0]!.categoria;
}

beforeAll(async () => {
  cenario = await montarCenario(`email-${randomUUID().slice(0, 8)}`);
  await semearPapelDeConta('guest');
}, 180_000);

afterAll(async () => {
  definirRemetente(null);
  await cenario?.encerrar();
  await fecharBancos();
});

beforeEach(() => {
  definirRemetente(new RemetenteDuble());
  RemetenteDuble.reiniciar();
});

afterEach(() => {
  definirRemetente(null);
});

describe('o remetente', () => {
  it('no modo padrão é o dublê, e o dublê registra o que enviou', async () => {
    definirRemetente(null);
    expect(remetente().nome).toBe('duble');

    const email: Email = { para: ['ana@cliente.teste'], assunto: 'Oi', texto: 'Corpo' };
    expect(await enviarEmailSemDerrubar(email, 'teste')).toBe(true);
    expect(RemetenteDuble.enviados).toEqual([email]);

    // Ninguém para avisar não é erro, e não registra nada.
    expect(await enviarEmailSemDerrubar({ ...email, para: [] }, 'teste')).toBe(false);
    expect(RemetenteDuble.enviados).toHaveLength(1);
  });

  it('o real faz o POST no formato do provedor, com o token no cabeçalho — e sem credencial recusa antes', async () => {
    const chamadas: { url: string; init: RequestInit }[] = [];
    const buscarFalso = ((url: string, init: RequestInit) => {
      chamadas.push({ url, init });
      return Promise.resolve(new Response('{"id":"x"}', { status: 200 }));
    }) as unknown as typeof fetch;

    const antes = {
      token: process.env['PIPE_EMAIL_TOKEN'],
      de: process.env['PIPE_EMAIL_REMETENTE'],
      url: process.env['PIPE_EMAIL_URL'],
    };
    try {
      delete process.env['PIPE_EMAIL_TOKEN'];
      delete process.env['PIPE_EMAIL_REMETENTE'];
      await expect(
        new RemetenteHttp(buscarFalso).enviar({ para: ['x@y.z'], assunto: 'a', texto: 'b' }),
      ).rejects.toMatchObject({ codigo: 'email_sem_credencial' });
      expect(chamadas).toHaveLength(0);

      process.env['PIPE_EMAIL_TOKEN'] = 'token-de-teste-bem-comprido';
      process.env['PIPE_EMAIL_REMETENTE'] = 'Pipe <nao-responda@pipe.teste>';
      process.env['PIPE_EMAIL_URL'] = 'https://provedor.teste/emails';
      await new RemetenteHttp(buscarFalso).enviar({
        para: ['ana@cliente.teste', 'bia@cliente.teste'],
        assunto: 'Assunto',
        texto: 'Texto',
        html: '<p>Texto</p>',
      });
      expect(chamadas).toHaveLength(1);
      expect(chamadas[0]!.url).toBe('https://provedor.teste/emails');
      expect(chamadas[0]!.init.method).toBe('POST');
      expect((chamadas[0]!.init.headers as Record<string, string>)['authorization']).toBe(
        'Bearer token-de-teste-bem-comprido',
      );
      expect(JSON.parse(String(chamadas[0]!.init.body))).toEqual({
        from: 'Pipe <nao-responda@pipe.teste>',
        to: ['ana@cliente.teste', 'bia@cliente.teste'],
        subject: 'Assunto',
        text: 'Texto',
        html: '<p>Texto</p>',
      });

      // Recusa do provedor vira erro com o status — e o token não vaza na mensagem.
      const recusa = (() =>
        Promise.resolve(new Response('token-de-teste-bem-comprido invalido', { status: 401 }))) as unknown as typeof fetch;
      await expect(
        new RemetenteHttp(recusa).enviar({ para: ['x@y.z'], assunto: 'a', texto: 'b' }),
      ).rejects.toMatchObject({ codigo: 'email_recusado', detalhe: { http: 401 } });
      await new RemetenteHttp(recusa)
        .enviar({ para: ['x@y.z'], assunto: 'a', texto: 'b' })
        .catch((erro: Error) => expect(erro.message).not.toContain('token-de-teste-bem-comprido'));
    } finally {
      if (antes.token === undefined) delete process.env['PIPE_EMAIL_TOKEN'];
      else process.env['PIPE_EMAIL_TOKEN'] = antes.token;
      if (antes.de === undefined) delete process.env['PIPE_EMAIL_REMETENTE'];
      else process.env['PIPE_EMAIL_REMETENTE'] = antes.de;
      if (antes.url === undefined) delete process.env['PIPE_EMAIL_URL'];
      else process.env['PIPE_EMAIL_URL'] = antes.url;
    }
  });
});

describe('convite', () => {
  it('cria o convite e manda o link por e-mail — e o link continua na resposta', async () => {
    const email = `ana.${randomUUID().slice(0, 6)}@cliente.teste`;
    const convite = await criarConvite(cenario.tenantId, { email, papel: 'guest' });
    expect(convite.url).toContain('http://telas.teste/convite/');

    expect(RemetenteDuble.enviados).toHaveLength(1);
    const enviado = RemetenteDuble.enviados[0]!;
    expect(enviado.para).toEqual([email]);
    expect(enviado.assunto).toContain('Convite');
    expect(enviado.texto).toContain(convite.url);
    // Diz onde a pessoa está entrando e com que acesso.
    expect(enviado.texto).toContain(`e2e email-`);
    expect(enviado.texto).toContain('Pode visualizar');
  });

  it('reenviar manda o link NOVO, que é o que passa a valer', async () => {
    const email = `bia.${randomUUID().slice(0, 6)}@cliente.teste`;
    const primeiro = await criarConvite(cenario.tenantId, { email, papel: 'guest' });
    RemetenteDuble.reiniciar();

    const segundo = await reenviarConvite(cenario.tenantId, primeiro.id);
    expect(segundo.url).not.toBe(primeiro.url);
    expect(RemetenteDuble.enviados).toHaveLength(1);
    expect(RemetenteDuble.enviados[0]!.para).toEqual([email]);
    expect(RemetenteDuble.enviados[0]!.texto).toContain(segundo.url);
    expect(RemetenteDuble.enviados[0]!.texto).not.toContain(primeiro.url);
  });

  it('o provedor fora do ar NÃO derruba o convite: ele existe e a resposta traz o link', async () => {
    definirRemetente(new RemetenteQueFalha());
    const email = `carla.${randomUUID().slice(0, 6)}@cliente.teste`;
    const convite = await criarConvite(cenario.tenantId, { email, papel: 'guest' });
    expect(convite.url).toContain('/convite/');

    const { rows } = await cenario.dono.execute<{ n: string }>(
      sql`select count(*)::text as n from convite where email = ${email} and aceito_em is null`,
    );
    expect(rows[0]?.n).toBe('1');
  });
});

describe('alerta de recategorização de modelo', () => {
  it('dispara para os e-mails configurados no canal, um por modelo recategorizado', async () => {
    const modeloId = await criarModelo(`lembrete_${randomUUID().slice(0, 6)}`, 'utilidade');
    const { rows } = await cenario.dono.execute<{ nome: string }>(
      sql`select nome from template_mensagem where id = ${modeloId}::uuid`,
    );
    const nome = rows[0]!.nome;
    await configurarAlerta(true, ['ana@pipe.app', 'bia@pipe.app']);
    const canal = (await resolverCanal(cenario.canalId))!;

    expect(await aplicarEventosDeModelo(canal, recategorizacao(nome, 'UTILITY', 'MARKETING'))).toBe(1);
    expect(await categoriaDoModelo(modeloId)).toBe('marketing');

    expect(RemetenteDuble.enviados).toHaveLength(1);
    const enviado = RemetenteDuble.enviados[0]!;
    expect(enviado.para).toEqual(['ana@pipe.app', 'bia@pipe.app']);
    expect(enviado.assunto).toContain(nome);
    expect(enviado.assunto).toContain('Utilidade → Marketing');
    expect(enviado.texto).toContain('WhatsApp de teste');

    // Modelo que o Pipe não conhece não dispara nada.
    expect(await aplicarEventosDeModelo(canal, recategorizacao('nao_existe', 'UTILITY', 'MARKETING'))).toBe(0);
    expect(RemetenteDuble.enviados).toHaveLength(1);
  });

  it('não dispara quando o alerta está desligado — mas o modelo muda do mesmo jeito', async () => {
    const modeloId = await criarModelo(`aviso_${randomUUID().slice(0, 6)}`, 'utilidade');
    const { rows } = await cenario.dono.execute<{ nome: string }>(
      sql`select nome from template_mensagem where id = ${modeloId}::uuid`,
    );
    await configurarAlerta(false, ['ana@pipe.app']);
    const canal = (await resolverCanal(cenario.canalId))!;

    expect(await aplicarEventosDeModelo(canal, recategorizacao(rows[0]!.nome, 'UTILITY', 'MARKETING'))).toBe(1);
    expect(await categoriaDoModelo(modeloId)).toBe('marketing');
    expect(RemetenteDuble.enviados).toHaveLength(0);
  });

  it('lista vazia = quem gerencia canal no tenant, como diz a tela da origem', async () => {
    const emailDoGestor = `gestor.${randomUUID().slice(0, 6)}@cliente.teste`;
    await pessoaCom('canal.gerenciar', emailDoGestor);
    const modeloId = await criarModelo(`cobranca_${randomUUID().slice(0, 6)}`, 'marketing');
    const { rows } = await cenario.dono.execute<{ nome: string }>(
      sql`select nome from template_mensagem where id = ${modeloId}::uuid`,
    );
    await configurarAlerta(true, []);
    const canal = (await resolverCanal(cenario.canalId))!;

    expect(await aplicarEventosDeModelo(canal, recategorizacao(rows[0]!.nome, 'MARKETING', 'UTILITY'))).toBe(1);
    expect(RemetenteDuble.enviados).toHaveLength(1);
    expect(RemetenteDuble.enviados[0]!.para).toContain(emailDoGestor);
    // O atendente do cenário não gerencia canal: não entra na lista.
    const { rows: atendente } = await cenario.dono.execute<{ email: string }>(
      sql`select email from usuario where id = ${cenario.atendenteId}::uuid`,
    );
    expect(RemetenteDuble.enviados[0]!.para).not.toContain(atendente[0]!.email);
  });

  it('o provedor fora do ar NÃO derruba a recategorização', async () => {
    definirRemetente(new RemetenteQueFalha());
    const modeloId = await criarModelo(`falha_${randomUUID().slice(0, 6)}`, 'utilidade');
    const { rows } = await cenario.dono.execute<{ nome: string }>(
      sql`select nome from template_mensagem where id = ${modeloId}::uuid`,
    );
    await configurarAlerta(true, ['ana@pipe.app']);
    const canal = (await resolverCanal(cenario.canalId))!;

    expect(await aplicarEventosDeModelo(canal, recategorizacao(rows[0]!.nome, 'UTILITY', 'MARKETING'))).toBe(1);
    expect(await categoriaDoModelo(modeloId)).toBe('marketing');
  });
});
