import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// // The mode has to be decided before any import that reads the variable.
process.env['PIPE_FILAS'] = 'memoria';
process.env['PIPE_EMAIL_MODO'] = 'duble';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_CHAVES_SEGREDO'] ??= `teste:${Buffer.alloc(32, 9).toString('base64')}`;
process.env['PIPE_CHAVE_SEGREDO_ATUAL'] ??= 'teste';
process.env['PIPE_URL_APP'] = 'http://telas.teste';

const { RemetenteDuble, RemetenteHttp, definirRemetente, enviarEmailSemDerrubar, remetente } =
  await import('../src/domain/email.js');
const { createInvitation, resendInvitation } = await import('../src/domain/convites.js');
const { applyEventsOfTemplate } = await import('../src/domain/whatsapp/events-of-template.js');
const { forgetChannel, fecharBancos, resolveChannel } = await import('../src/database.js');
const { montarCenario } = await import('./ajuda.js');
import type { Email, RemetenteDeEmail } from '../src/domain/email.js';

type Cenario = Awaited<ReturnType<typeof montarCenario>>;

/**
 * Email: the double records it, the invite fires with the link, recategorization fires for the channel's list (and doesn't fire when disabled), and a provider failure does NOT bring down either operation.
 *
 * No HTTP server: `criarConvite` and `aplicarEventosDeModelo` are called directly, as `convites.test.ts` and `canais.test.ts` already do. The real sender is exercised with a fake `fetch`, to prove the POST's contract without a network.
 */

let cenario: Cenario;

/** Um remetente que sempre falha — o provedor fora do ar. */
class RemetenteQueFalha implements RemetenteDeEmail {
  readonly nome = 'real' as const;
  enviar(): Promise<void> {
    return Promise.reject(new Error('provedor fora do ar'));
  }
}

async function seedRoleOfAccount(nome: string): Promise<void> {
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

/** A person on the tenant with the given permission — who the alert finds when the list is empty. */
async function pessoaCom(permission: string, email: string): Promise<string> {
  const marca = randomUUID().slice(0, 8);
  const { rows: users } = await cenario.dono.execute<{ id: string }>(sql`
    insert into usuario (tenant_id, nome, email)
    values (${cenario.tenantId}, ${`Pessoa ${marca}`}, ${email})
    returning id
  `);
  await cenario.dono.execute(sql`
    insert into permissao (codigo, descricao, grupo)
    values (${permission}, ${permission}, 'teste') on conflict (codigo) do nothing
  `);
  const { rows: papeis } = await cenario.dono.execute<{ id: string }>(sql`
    insert into papel (tenant_id, nome, escopo)
    values (${cenario.tenantId}, ${`papel ${marca}`}, 'atendimento') returning id
  `);
  await cenario.dono.execute(sql`
    insert into papel_permissao (tenant_id, papel_id, permissao_codigo)
    values (${cenario.tenantId}, ${papeis[0]!.id}, ${permission})
  `);
  await cenario.dono.execute(sql`
    insert into usuario_papel (tenant_id, usuario_id, papel_id)
    values (${cenario.tenantId}, ${users[0]!.id}, ${papeis[0]!.id})
  `);
  return users[0]!.id;
}

/** Writes the alert preference on the scenario's channel and clears the channel cache. */
async function configurarAlerta(ativo: boolean, emails: string[]): Promise<void> {
  const preferences = JSON.stringify({ alertaRecategorizacao: { ativo, emails } });
  await cenario.dono.execute(sql`
    update canal set config = config || jsonb_build_object('preferencias', ${preferences}::jsonb)
     where id = ${cenario.channelId}::uuid
  `);
  forgetChannel(cenario.channelId);
}

/** The recategorization event as Meta sends it, for the scenario's template. */
function recategorization(nome: string, de: string, para: string): unknown {
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

async function createTemplate(nome: string, categoria: string): Promise<string> {
  const { rows } = await cenario.dono.execute<{ id: string }>(sql`
    insert into template_mensagem (tenant_id, canal_id, nome, idioma, categoria, status_meta, corpo)
    values (${cenario.tenantId}, ${cenario.channelId}::uuid, ${nome}, 'pt_BR', ${categoria}, 'aprovado', 'Oi')
    returning id
  `);
  return rows[0]!.id;
}

async function categoryOfTemplate(id: string): Promise<string> {
  const { rows } = await cenario.dono.execute<{ category: string }>(
    sql`select categoria from template_mensagem where id = ${id}::uuid`,
  );
  return rows[0]!.category;
}

beforeAll(async () => {
  cenario = await montarCenario(`email-${randomUUID().slice(0, 8)}`);
  await seedRoleOfAccount('guest');
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

    // // Nobody to notify isn't an error, and nothing gets recorded.
    expect(await enviarEmailSemDerrubar({ ...email, para: [] }, 'teste')).toBe(false);
    expect(RemetenteDuble.enviados).toHaveLength(1);
  });

  it('POST provider-formatted emails with an authorization token and reject missing credentials', async () => {
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

      // // A provider refusal becomes an error with the status — and the token doesn't leak into the message.
      const recusa = (() =>
        Promise.resolve(new Response('token-de-teste-bem-comprido invalido', { status: 401 }))) as unknown as typeof fetch;
      await expect(
        new RemetenteHttp(recusa).enviar({ para: ['x@y.z'], assunto: 'a', texto: 'b' }),
      ).rejects.toMatchObject({ codigo: 'email_recusado', detalhe: { http: 401 } });
      await new RemetenteHttp(recusa)
        .enviar({ para: ['x@y.z'], assunto: 'a', texto: 'b' })
        .catch((error: Error) => expect(error.message).not.toContain('token-de-teste-bem-comprido'));
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

describe('Create and email invitations', () => {
  it('Email the invitation link while also returning it in the response', async () => {
    const email = `ana.${randomUUID().slice(0, 6)}@cliente.teste`;
    const invitation = await createInvitation(cenario.tenantId, { email, role: 'guest' });
    expect(invitation.url).toContain('http://telas.teste/convite/');

    expect(RemetenteDuble.enviados).toHaveLength(1);
    const enviado = RemetenteDuble.enviados[0]!;
    expect(enviado.para).toEqual([email]);
    expect(enviado.assunto).toContain('Convite');
    expect(enviado.texto).toContain(invitation.url);
    // // Says where the person is signing in and with what access.
    expect(enviado.texto).toContain(`e2e email-`);
    expect(enviado.texto).toContain('Pode visualizar');
  });

  it('reenviar manda o link NOVO, que é o que passa a valer', async () => {
    const email = `bia.${randomUUID().slice(0, 6)}@cliente.teste`;
    const first = await createInvitation(cenario.tenantId, { email, role: 'guest' });
    RemetenteDuble.reiniciar();

    const segundo = await resendInvitation(cenario.tenantId, first.id);
    expect(segundo.url).not.toBe(first.url);
    expect(RemetenteDuble.enviados).toHaveLength(1);
    expect(RemetenteDuble.enviados[0]!.para).toEqual([email]);
    expect(RemetenteDuble.enviados[0]!.texto).toContain(segundo.url);
    expect(RemetenteDuble.enviados[0]!.texto).not.toContain(first.url);
  });

  it('Preserve an invitation and return its link when the email provider is unavailable', async () => {
    definirRemetente(new RemetenteQueFalha());
    const email = `carla.${randomUUID().slice(0, 6)}@cliente.teste`;
    const convite = await createInvitation(cenario.tenantId, { email, role: 'guest' });
    expect(convite.url).toContain('/convite/');

    const { rows } = await cenario.dono.execute<{ n: string }>(
      sql`select count(*)::text as n from convite where email = ${email} and aceito_em is null`,
    );
    expect(rows[0]?.n).toBe('1');
  });
});

describe('Send template recategorization alerts', () => {
  it('Send one alert per recategorized template to channel-configured emails', async () => {
    const templateId = await createTemplate(`lembrete_${randomUUID().slice(0, 6)}`, 'utilidade');
    const { rows } = await cenario.dono.execute<{ name: string }>(
      sql`select nome from template_mensagem where id = ${templateId}::uuid`,
    );
    const nome = rows[0]!.name;
    await configurarAlerta(true, ['ana@pipe.app', 'bia@pipe.app']);
    const channel = (await resolveChannel(cenario.channelId))!;

    expect(await applyEventsOfTemplate(channel, recategorization(nome, 'UTILITY', 'MARKETING'))).toBe(1);
    expect(await categoryOfTemplate(templateId)).toBe('marketing');

    expect(RemetenteDuble.enviados).toHaveLength(1);
    const enviado = RemetenteDuble.enviados[0]!;
    expect(enviado.para).toEqual(['ana@pipe.app', 'bia@pipe.app']);
    expect(enviado.assunto).toContain(nome);
    expect(enviado.assunto).toContain('Utilidade → Marketing');
    expect(enviado.texto).toContain('WhatsApp de teste');

    // // A template Pipe doesn't know doesn't fire anything.
    expect(await applyEventsOfTemplate(channel, recategorization('nao_existe', 'UTILITY', 'MARKETING'))).toBe(0);
    expect(RemetenteDuble.enviados).toHaveLength(1);
  });

  it('Skip email alerts when disabled while still updating the template category', async () => {
    const modeloId = await createTemplate(`aviso_${randomUUID().slice(0, 6)}`, 'utilidade');
    const { rows } = await cenario.dono.execute<{ name: string }>(
      sql`select nome from template_mensagem where id = ${modeloId}::uuid`,
    );
    await configurarAlerta(false, ['ana@pipe.app']);
    const canal = (await resolveChannel(cenario.channelId))!;

    expect(await applyEventsOfTemplate(canal, recategorization(rows[0]!.name, 'UTILITY', 'MARKETING'))).toBe(1);
    expect(await categoryOfTemplate(modeloId)).toBe('marketing');
    expect(RemetenteDuble.enviados).toHaveLength(0);
  });

  it('Send alerts to tenant channel managers when the recipient list is empty', async () => {
    const emailDoGestor = `gestor.${randomUUID().slice(0, 6)}@cliente.teste`;
    await pessoaCom('canal.gerenciar', emailDoGestor);
    const modeloId = await createTemplate(`cobranca_${randomUUID().slice(0, 6)}`, 'marketing');
    const { rows } = await cenario.dono.execute<{ name: string }>(
      sql`select nome from template_mensagem where id = ${modeloId}::uuid`,
    );
    await configurarAlerta(true, []);
    const canal = (await resolveChannel(cenario.channelId))!;

    expect(await applyEventsOfTemplate(canal, recategorization(rows[0]!.name, 'MARKETING', 'UTILITY'))).toBe(1);
    expect(RemetenteDuble.enviados).toHaveLength(1);
    expect(RemetenteDuble.enviados[0]!.para).toContain(emailDoGestor);
    // // The scenario's agent doesn't manage the channel: doesn't make the list.
    const { rows: agent } = await cenario.dono.execute<{ email: string }>(
      sql`select email from usuario where id = ${cenario.agentId}::uuid`,
    );
    expect(RemetenteDuble.enviados[0]!.para).not.toContain(agent[0]!.email);
  });

  it('Complete template recategorization even when the email provider is unavailable', async () => {
    definirRemetente(new RemetenteQueFalha());
    const modeloId = await createTemplate(`falha_${randomUUID().slice(0, 6)}`, 'utilidade');
    const { rows } = await cenario.dono.execute<{ name: string }>(
      sql`select nome from template_mensagem where id = ${modeloId}::uuid`,
    );
    await configurarAlerta(true, ['ana@pipe.app']);
    const canal = (await resolveChannel(cenario.channelId))!;

    expect(await applyEventsOfTemplate(canal, recategorization(rows[0]!.name, 'UTILITY', 'MARKETING'))).toBe(1);
    expect(await categoryOfTemplate(modeloId)).toBe('marketing');
  });
});
