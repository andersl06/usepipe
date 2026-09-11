import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// No modo memória a API processa a importação em linha — o mesmo código do worker.
process.env['PIPE_FILAS'] = 'memoria';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_CHAVES_SEGREDO'] ??= `teste:${Buffer.alloc(32, 7).toString('base64')}`;
process.env['PIPE_CHAVE_SEGREDO_ATUAL'] ??= 'teste';

const { criarBanco, fecharBanco, migrar, semear } = await import('@pipe/db');
const { fecharBancos } = await import('../src/banco.js');
const workers = await import('@pipe/workers');
const { criarImportacao, lerFalhas, lerImportacao } = await import(
  '../src/dominio/importacao-de-contatos.js'
);
const { ControladorImportacoesDeContatos } = await import('../src/controladores/importacoes.js');
import type { RequisicaoComSessao } from '../src/sessao.js';

/**
 * A importação de contatos por CSV, com banco de verdade: o porte do
 * `DataImportJob` do Chatwoot mais o que o Pipe pede — telefone em E.164 com o
 * nono dígito, deduplicação por telefone dentro do tenant, relatório das linhas
 * rejeitadas e isolamento entre clientes.
 */

const URL_DONO = process.env['DATABASE_URL']!;
const S = randomUUID().slice(0, 8);

type Dono = ReturnType<typeof criarBanco>;
let dono: Dono;
let A: { tenantId: string; adminId: string };
let B: { tenantId: string; adminId: string };

async function tenantComAdmin(nome: string): Promise<{ tenantId: string; adminId: string }> {
  const { tenantId } = await semear(dono, { nome: `importa ${nome}`, slug: `importa-${nome}` });
  const adminId = await usuarioCom(tenantId, `admin-${nome}`, 'administrador');
  return { tenantId, adminId };
}

async function usuarioCom(tenantId: string, nome: string, papel: string): Promise<string> {
  const { rows } = await dono.execute<{ id: string }>(sql`
    insert into usuario (tenant_id, nome, email)
    values (${tenantId}::uuid, ${nome}, ${`${nome}@importa.pipe.app`})
    returning id
  `);
  await dono.execute(sql`
    insert into usuario_papel (tenant_id, usuario_id, papel_id)
    select ${tenantId}::uuid, ${rows[0]!.id}::uuid, id from papel
     where tenant_id = ${tenantId}::uuid and nome = ${papel}
  `);
  return rows[0]!.id;
}

type Contato = {
  [c: string]: unknown;
  id: string;
  nome: string | null;
  email: string | null;
  telefone_e164: string | null;
  atributos: Record<string, unknown>;
};

async function contatosCom(tenantId: string, telefones: string[]): Promise<Contato[]> {
  const { rows } = await dono.execute<Contato>(sql`
    select id, nome, email, telefone_e164, atributos from contato
     where tenant_id = ${tenantId}::uuid
       and telefone_e164 in (${sql.join(telefones.map((t) => sql`${t}`), sql`, `)})
     order by telefone_e164
  `);
  return rows;
}

function importar(quem: { tenantId: string; adminId: string }, csv: string) {
  return criarImportacao(quem.tenantId, quem.adminId, csv, `teste-${S}.csv`);
}

beforeAll(async () => {
  await migrar(URL_DONO);
  dono = criarBanco({ url: URL_DONO, maxConexoes: 2 });
  A = await tenantComAdmin(`a-${S}`);
  B = await tenantComAdmin(`b-${S}`);
}, 180_000);

afterAll(async () => {
  await dono.execute(sql`delete from tenant where id in (${A.tenantId}::uuid, ${B.tenantId}::uuid)`);
  await fecharBanco(dono);
  await fecharBancos();
  await workers.fecharBancos();
});

describe('telefone em E.164, com o nono dígito do Brasil', () => {
  it('celular antigo ganha o 9, fixo fica como está, e número sem DDI ganha o 55', async () => {
    const importacao = await importar(
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
    const contatos = await contatosCom(A.tenantId, [
      '+5511988887777',
      '+551132324545',
      '+5511987654321',
      '+5541988881234',
    ]);
    expect(contatos.map((c) => [c.nome, c.telefone_e164])).toEqual([
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

describe('deduplicação por telefone dentro do tenant', () => {
  it('a mesma pessoa duas vezes no arquivo, e já cadastrada na forma antiga, vira um contato só', async () => {
    const { rows } = await dono.execute<{ id: string }>(sql`
      insert into contato (tenant_id, nome, telefone_e164)
      values (${A.tenantId}::uuid, 'Eva antiga', '+554199990000') returning id
    `);
    const idDaEva = rows[0]!.id;

    const importacao = await importar(
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

    const eva = await contatosCom(A.tenantId, ['+554199990000', '+5541999990000']);
    expect(eva).toHaveLength(1);
    // O contato que já existia é o que fica, mesclado: nome da última linha, e-mail
    // da primeira, telefone agora na forma canônica.
    expect(eva[0]).toMatchObject({
      id: idDaEva,
      nome: 'Eva Souza',
      email: 'eva@exemplo.com.br',
      telefone_e164: '+5541999990000',
    });

    const fabi = await contatosCom(A.tenantId, ['+5511977776666']);
    expect(fabi).toHaveLength(1);
    expect(fabi[0]!.email).toBe('fabi@exemplo.com.br');
  });

  it('reimportar o mesmo arquivo não cria ninguém de novo', async () => {
    const csv = 'nome,telefone\nGui,11966665555\n';
    await importar(A, csv);
    await importar(A, csv);
    expect(await contatosCom(A.tenantId, ['+5511966665555'])).toHaveLength(1);
  });
});

describe('linhas inválidas', () => {
  it('são recusadas com o motivo, num CSV que a tela oferece para baixar', async () => {
    const importacao = await importar(
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

    const [aceito] = await contatosCom(A.tenantId, ['+5511988881111']);
    expect(aceito?.nome).toBe('Aspas, e vírgula');
  });

  it('CSV malformado falha inteiro, e nada dele entra (data_import_job_spec)', async () => {
    const importacao = await importar(
      A,
      'id,name,email,phone_number,company_name\n' +
        '1,"Clarice Uzzell,"missing_quote,918080808080,Acmecorp\n' +
        '2,Marieann Creegan,,+918080808081,Acmecorp',
    );
    expect(importacao.estado).toBe('falhou');
    expect(await contatosCom(A.tenantId, ['+918080808081'])).toHaveLength(0);
  });

  it('tira o BOM, e coluna desconhecida vira atributo do contato', async () => {
    await importar(A, '﻿nome,telefone,empresa,plano\nHeitor,11955554444,Acme,ouro\n');
    const [heitor] = await contatosCom(A.tenantId, ['+5511955554444']);
    expect(heitor?.nome).toBe('Heitor');
    expect(heitor?.atributos).toMatchObject({ company_name: 'Acme', plano: 'ouro' });
  });

  it('arquivo vazio é recusado antes de gravar qualquer coisa', async () => {
    await expect(importar(A, '   \n')).rejects.toMatchObject({ codigo: 'arquivo_vazio', status: 422 });
  });
});

describe('isolamento entre tenants', () => {
  it('o mesmo telefone em outro cliente é outro contato, e o do primeiro não muda', async () => {
    await importar(A, 'nome,telefone\nIsa de A,11944443333\n');
    await importar(B, 'nome,telefone\nIsa de B,11944443333\n');

    const deA = await contatosCom(A.tenantId, ['+5511944443333']);
    const deB = await contatosCom(B.tenantId, ['+5511944443333']);
    expect(deA).toHaveLength(1);
    expect(deB).toHaveLength(1);
    expect(deA[0]!.nome).toBe('Isa de A');
    expect(deB[0]!.nome).toBe('Isa de B');
    expect(deA[0]!.id).not.toBe(deB[0]!.id);
  });

  it('um job com o tenant de B e a importação de A não acha nada para processar', async () => {
    const deA = await importar(A, 'nome,telefone\nJoão,11933332222\n');
    const resultado = await workers.processarImportacao({
      tenantId: B.tenantId,
      importacaoId: deA.id,
    });
    expect(resultado.estado).toBe('ausente');
  });

  it('a importação e o relatório de A são 404 para B', async () => {
    const deA = await importar(A, 'nome,telefone\nSem Telefone,\n');
    await expect(lerImportacao(B.tenantId, deA.id)).rejects.toMatchObject({ status: 404 });
    await expect(lerFalhas(B.tenantId, deA.id)).rejects.toMatchObject({ status: 404 });
  });
});

describe('a rota, com a permissão conferida no banco', () => {
  const controlador = new ControladorImportacoesDeContatos();
  const requisicao = (tenantId: string, usuarioId: string) =>
    ({ sessao: { tenantId, usuarioId, origem: 'google' } }) as unknown as RequisicaoComSessao;

  it('atendente não importa: 403 sem_permissao', async () => {
    const atendente = await usuarioCom(A.tenantId, `atendente-${S}`, 'atendente');
    await expect(
      controlador.importar(requisicao(A.tenantId, atendente), 'nome,telefone\nX,11911112222\n', undefined),
    ).rejects.toMatchObject({ codigo: 'sem_permissao', status: 403 });
  });

  it('administrador importa, e o corpo cru é o CSV', async () => {
    const feita = await controlador.importar(
      requisicao(A.tenantId, A.adminId),
      'nome,telefone\nKarla,11922221111\n',
      'planilha.csv',
    );
    expect(feita).toMatchObject({ nome: 'planilha.csv', estado: 'concluida', aceitos: 1 });
  });
});
