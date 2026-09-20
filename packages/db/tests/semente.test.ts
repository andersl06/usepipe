import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarBanco, fecharBanco } from '../src/cliente.js';
import type { BancoPipe } from '../src/cliente.js';
import { migrar } from '../src/migrar.js';
import { garantirPapelDeConta, semear } from '../src/semente.js';
import { URL_DONO } from './ajuda.js';

/**
 * `semear` e `garantirPapelDeConta`: todo usuário semeado recebe papel de CONTA
 * (a regra "exatamente um" da migração 0021), e rodar duas vezes não duplica
 * nem troca o que alguém deu à mão. Era o buraco que deixava a tela de Membros
 * do contrato vazia no tenant de demonstração.
 */

let dono: BancoPipe;
let slug: string;
let tenantId: string;

beforeAll(async () => {
  await migrar(URL_DONO);
  dono = criarBanco({ url: URL_DONO, maxConexoes: 2 });
  slug = `semente-${randomUUID().slice(0, 8)}`;
  tenantId = (await semear(dono, { nome: `Semente ${slug}`, slug })).tenantId;
}, 120_000);

afterAll(async () => {
  await dono.execute(sql`delete from tenant where id = ${tenantId}::uuid`);
  await fecharBanco(dono);
});

async function papeisDeConta(usuarioId: string): Promise<string[]> {
  const { rows } = await dono.execute<{ nome: string }>(sql`
    select p.nome from usuario_papel up
      join papel p on p.id = up.papel_id
     where up.usuario_id = ${usuarioId}::uuid and up.escopo = 'conta'
     order by p.nome
  `);
  return rows.map((r) => r.nome);
}

async function criarUsuario(papelDeAtendimento: string | null): Promise<string> {
  const { rows } = await dono.execute<{ id: string }>(sql`
    insert into usuario (tenant_id, nome, email)
    values (${tenantId}, 'Pessoa', ${`pessoa-${randomUUID().slice(0, 8)}@semente.pipe.app`})
    returning id
  `);
  const usuarioId = rows[0]!.id;
  if (papelDeAtendimento) {
    await dono.execute(sql`
      insert into usuario_papel (tenant_id, usuario_id, papel_id, escopo)
      select ${tenantId}, ${usuarioId}::uuid, id, 'atendimento'
        from papel where tenant_id = ${tenantId}::uuid and nome = ${papelDeAtendimento}
    `);
  }
  return usuarioId;
}

describe('papel de conta para todo usuário semeado', () => {
  it('quem nasceu sem papel de conta ganha um, pela mesma régua da migração 0021', async () => {
    const atendente = await criarUsuario('atendente');
    const gestor = await criarUsuario('gestor');
    const administrador = await criarUsuario('administrador');
    const semNada = await criarUsuario(null);

    const dados = await garantirPapelDeConta(dono, tenantId);
    expect(dados).toBe(4);

    expect(await papeisDeConta(atendente)).toEqual(['guest']);
    // O gestor edita fluxo (`automacao.fluxo.editar`) → `member`.
    expect(await papeisDeConta(gestor)).toEqual(['member']);
    expect(await papeisDeConta(administrador)).toEqual(['admin']);
    expect(await papeisDeConta(semNada)).toEqual(['guest']);
  });

  it('é idempotente: a segunda rodada não dá nada a quem já tem, e não troca papel dado à mão', async () => {
    const pessoa = await criarUsuario('atendente');
    await dono.execute(sql`
      insert into usuario_papel (tenant_id, usuario_id, papel_id, escopo)
      select ${tenantId}, ${pessoa}::uuid, id, 'conta'
        from papel where tenant_id = ${tenantId}::uuid and nome = 'admin' and escopo = 'conta'
    `);

    expect(await garantirPapelDeConta(dono, tenantId)).toBe(0);
    expect(await papeisDeConta(pessoa)).toEqual(['admin']);

    // `semear` de novo, no mesmo tenant: nada duplica.
    const segunda = await semear(dono, { nome: `Semente ${slug}`, slug });
    expect(segunda.tenantId).toBe(tenantId);
    expect(segunda.papeisDeContaDados).toBe(0);
    const { rows } = await dono.execute<{ n: string }>(sql`
      select count(*)::text as n from usuario_papel up
        join usuario u on u.id = up.usuario_id
       where u.tenant_id = ${tenantId}::uuid and up.escopo = 'conta'
       group by up.usuario_id having count(*) > 1
    `);
    expect(rows).toHaveLength(0);
  });
});
