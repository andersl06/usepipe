import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// No modo memória a API processa a importação em linha — o mesmo código do worker.
process.env['PIPE_FILAS'] = 'memoria';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_CHAVES_SEGREDO'] ??= `teste:${Buffer.alloc(32, 7).toString('base64')}`;
process.env['PIPE_CHAVE_SEGREDO_ATUAL'] ??= 'teste';

const { createDatabasecriarBancocreateDatabase, closeDatabasefecharBancocloseDatabase, migratemigrarmigrate, seedsemearseed } = await import('@pipe/db');
const { fecharBancos } = await import('../src/database.js');
const workers = await import('@pipe/workers');
const { createImport, lerFalhas, readImport } = await import(
  '../src/domain/import-of-contacts.js'
);
const { ContactImportsController } = await import('../src/controllers/imports.js');
import type { RequestWithSession } from '../src/session.js';

/**
 * A importação de contatos por CSV, com banco de verdade: o porte do
 * `DataImportJob` do Chatwoot mais o que o Pipe pede — telefone em E.164 com o
 * nono dígito, deduplicação por telefone dentro do tenant, relatório das linhas
 * rejeitadas e isolamento entre clientes.
 */

const URL_DONO = process.env['DATABASE_URL']!;
const S = randomUUID().slice(0, 8);

type Dono = ReturnType<typeof createDatabasecriarBancocreateDatabase>;
let dono: Dono;
let A: { tenantId: string; adminId: string };
let B: { tenantId: string; adminId: string };

async function tenantComAdmin(nome: string): Promise<{ tenantId: string; adminId: string }> {
  const { tenantId } = await seedsemearseed(dono, { name: `importa ${nome}`, slug: `importa-${nome}` });
  const adminId = await userWith(tenantId, `admin-${nome}`, 'administrador');
  return { tenantId, adminId };
}

async function userWith(tenantId: string, nome: string, role: string): Promise<string> {
  const { rows } = await dono.execute<{ id: string }>(sql`
    insert into usuario (tenant_id, nome, email)
    values (${tenantId}::uuid, ${nome}, ${`${nome}@importa.pipe.app`})
    returning id
  `);
  await dono.execute(sql`
    insert into usuario_papel (tenant_id, usuario_id, papel_id)
    select ${tenantId}::uuid, ${rows[0]!.id}::uuid, id from papel
     where tenant_id = ${tenantId}::uuid and nome = ${role}
  `);
  return rows[0]!.id;
}

type Contact = {
  [c: string]: unknown;
  id: string;
  name: string | null;
  email: string | null;
  phoneE164: string | null;
  atributos: Record<string, unknown>;
};

async function contactsWith(tenantId: string, telefones: string[]): Promise<Contact[]> {
  const { rows } = await dono.execute<Contact>(sql`
    select id, nome, email, telefone_e164, atributos from contato
     where tenant_id = ${tenantId}::uuid
       and telefone_e164 in (${sql.join(telefones.map((t) => sql`${t}`), sql`, `)})
     order by telefone_e164
  `);
  return rows;
}

function runImport(quem: { tenantId: string; adminId: string }, csv: string) {
  return createImport(quem.tenantId, quem.adminId, csv, `teste-${S}.csv`);
}

beforeAll(async () => {
  await migratemigrarmigrate(URL_DONO);
  dono = createDatabasecriarBancocreateDatabase({ url: URL_DONO, maxConexoes: 2 });
  A = await tenantComAdmin(`a-${S}`);
  B = await tenantComAdmin(`b-${S}`);
}, 180_000);

afterAll(async () => {
  await dono.execute(sql`delete from tenant where id in (${A.tenantId}::uuid, ${B.tenantId}::uuid)`);
  await closeDatabasefecharBancocloseDatabase(dono);
  await fecharBancos();
  await workers.fecharBancos();
});

describe('telefone em E.164, com o nono dígito do Brasil', () => {
  it('celular antigo ganha o 9, fixo fica como está, e número sem DDI ganha o 55', async () => {
    const importacao = await runImport(
      A,
      [
        'nome;telefone',
        'Ana;(11) 8888-7777',
        'Beto;+55 11 3232-4545',
        'Caio;11 98765-4321',
        'Dani;+55 41 9 8888-1234',
      ].join('\n'),
    );

    expect(importacao).toMatchObject({ estado: 'concluida', total: 4, aceitos: 4, rejeitados: 0 });
    const contacts = await contactsWith(A.tenantId, [
      '+5511988887777',
      '+551132324545',
      '+5511987654321',
      '+5541988881234',
    ]);
    expect(contacts.map((c) => [c.nome, c.telefone_e164])).toEqual([
      ['Beto', '+551132324545'],
      ['Caio', '+5511987654321'],
      ['Ana', '+5511988887777'],
      ['Dani', '+5541988881234'],
    ]);

    // A identidade de WhatsApp nasce junto: a primeira mensagem da Ana cai nesta ficha.
    const { rows } = await dono.execute<{ n: string }>(sql`
      select count(*)::text as n from contato_identidade
       where tenant_id = ${A.tenantId}::uuid and canal_tipo = 'whatsapp_cloud'
         and identificador = '5511988887777'
    `);
    expect(rows[0]!.n).toBe('1');
  });
});

describe('Deduplicate contacts by phone number within a tenant', () => {
  it('Deduplicate repeated CSV rows and existing contacts with legacy phone formatting', async () => {
    const { rows } = await dono.execute<{ id: string }>(sql`
      insert into contato (tenant_id, nome, telefone_e164)
      values (${A.tenantId}::uuid, 'Eva antiga', '+554199990000') returning id
    `);
    const idDaEva = rows[0]!.id;

    const importacao = await runImport(
      A,
      [
        'name,phone_number,email',
        'Eva,41999990000,eva@exemplo.com.br',
        'Eva Souza,+55 (41) 99999-0000,',
        'Fabi,11 97777-6666,',
        'Fabi,(11) 97777-6666,fabi@exemplo.com.br',
      ].join('\n'),
    );
    expect(importacao).toMatchObject({ estado: 'concluida', aceitos: 4, rejeitados: 0 });

    const eva = await contactsWith(A.tenantId, ['+554199990000', '+5541999990000']);
    expect(eva).toHaveLength(1);
    // O contato que já existia é o que fica, mesclado: nome da última linha, e-mail
    // da primeira, telefone agora na forma canônica.
    expect(eva[0]).toMatchObject({
      id: idDaEva,
      nome: 'Eva Souza',
      email: 'eva@exemplo.com.br',
      telefone_e164: '+5541999990000',
    });

    const fabi = await contactsWith(A.tenantId, ['+5511977776666']);
    expect(fabi).toHaveLength(1);
    expect(fabi[0]!.email).toBe('fabi@exemplo.com.br');
  });

  it('Reimport the same CSV without creating duplicate contacts', async () => {
    const csv = 'nome,telefone\nGui,11966665555\n';
    await runImport(A, csv);
    await runImport(A, csv);
    expect(await contactsWith(A.tenantId, ['+5511966665555'])).toHaveLength(1);
  });
});

describe('linhas inválidas', () => {
  it('são recusadas com o motivo, num CSV que a tela oferece para baixar', async () => {
    const importacao = await runImport(
      A,
      [
        'name,phone_number,email',
        'Sem Nada,,',
        'Telefone Ruim,abc,',
        'Email Ruim,11988880000,nao-e-email',
        '"Aspas, e vírgula",11988881111,ok@exemplo.com.br',
      ].join('\n'),
    );
    expect(importacao).toMatchObject({
      estado: 'concluida',
      total: 4,
      aceitos: 1,
      rejeitados: 3,
      temFalhas: true,
    });

    const falhas = await lerFalhas(A.tenantId, importacao.id);
    const linhas = falhas.trim().split('\n');
    expect(linhas[0]).toBe('name,phone_number,email,erros');
    expect(linhas).toHaveLength(4);
    expect(falhas).toContain('Informe telefone ou e-mail');
    expect(falhas).toContain('Telefone deve estar no formato e164');
    expect(falhas).toContain('E-mail inválido');

    const [aceito] = await contactsWith(A.tenantId, ['+5511988881111']);
    expect(aceito?.nome).toBe('Aspas, e vírgula');
  });

  it('Fail a malformed CSV import atomically (`data_import_job_spec`)', async () => {
    const importacao = await runImport(
      A,
      'id,name,email,phone_number,company_name\n' +
        '1,"Clarice Uzzell,"missing_quote,918080808080,Acmecorp\n' +
        '2,Marieann Creegan,,+918080808081,Acmecorp',
    );
    expect(importacao.state).toBe('falhou');
    expect(await contactsWith(A.tenantId, ['+918080808081'])).toHaveLength(0);
  });

  it('Strip the BOM and store unknown CSV columns as contact attributes', async () => {
    await runImport(A, '﻿nome,telefone,empresa,plano\nHeitor,11955554444,Acme,ouro\n');
    const [heitor] = await contactsWith(A.tenantId, ['+5511955554444']);
    expect(heitor?.nome).toBe('Heitor');
    expect(heitor?.atributos).toMatchObject({ company_name: 'Acme', plano: 'ouro' });
  });

  it('Reject an empty import file before saving anything', async () => {
    await expect(runImport(A, '   \n')).rejects.toMatchObject({ codigo: 'arquivo_vazio', status: 422 });
  });
});

describe('Isolate downloaded media by tenant', () => {
  it('Keep the same phone number as separate contacts across tenants', async () => {
    await runImport(A, 'nome,telefone\nIsa de A,11944443333\n');
    await runImport(B, 'nome,telefone\nIsa de B,11944443333\n');

    const deA = await contactsWith(A.tenantId, ['+5511944443333']);
    const deB = await contactsWith(B.tenantId, ['+5511944443333']);
    expect(deA).toHaveLength(1);
    expect(deB).toHaveLength(1);
    expect(deA[0]!.nome).toBe('Isa de A');
    expect(deB[0]!.nome).toBe('Isa de B');
    expect(deA[0]!.id).not.toBe(deB[0]!.id);
  });

  it('Do not process another tenant\'s import job', async () => {
    const deA = await runImport(A, 'nome,telefone\nJoão,11933332222\n');
    const resultado = await workers.processarImport({
      tenantId: B.tenantId,
      importId: deA.id,
    });
    expect(resultado.state).toBe('ausente');
  });

  it('Return 404 for another tenant\'s import and failure report', async () => {
    const deA = await runImport(A, 'nome,telefone\nSem Telefone,\n');
    await expect(readImport(B.tenantId, deA.id)).rejects.toMatchObject({ status: 404 });
    await expect(lerFalhas(B.tenantId, deA.id)).rejects.toMatchObject({ status: 404 });
  });
});

describe('Check import-route permission against the database', () => {
  const controller = new ContactImportsController();
  const request = (tenantId: string, userId: string) =>
    ({ sessao: { tenantId, userId, origem: 'google' } }) as unknown as RequestWithSession;

  it('Return 403 when an agent imports contacts without permission (`sem_permissao`)', async () => {
    const agent = await userWith(A.tenantId, `atendente-${S}`, 'atendente');
    await expect(
      controller.import(request(A.tenantId, agent), 'nome,telefone\nX,11911112222\n', undefined),
    ).rejects.toMatchObject({ codigo: 'sem_permissao', status: 403 });
  });

  it('administrador importa, e o corpo cru é o CSV', async () => {
    const feita = await controller.import(
      request(A.tenantId, A.adminId),
      'nome,telefone\nKarla,11922221111\n',
      'planilha.csv',
    );
    expect(feita).toMatchObject({ nome: 'planilha.csv', estado: 'concluida', aceitos: 1 });
  });
});
