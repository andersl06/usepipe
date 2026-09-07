/**
 * Prova de ponta a ponta contra a instância REAL do CRM.
 *
 * NÃO é teste automatizado — é o roteiro de evidência, rodado à mão contra o Twenty
 * que está no ar. Fica versionado porque a próxima pessoa que mexer na integração vai
 * querer repetir exatamente isto para saber se ainda funciona.
 *
 *   PIPE_TWENTY_CHAVE=<chave> pnpm --filter @pipe/api exec tsx tests/prova-e2e-twenty.ts
 *
 * Ele cria um tenant e um contato descartáveis, espelha no CRM de verdade, confere que
 * o id voltou para a nossa coluna, e limpa o que criou do lado do Pipe.
 */
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';

process.env['PIPE_FILAS'] = 'memoria';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_CHAVES_SEGREDO'] ??= `prova:${Buffer.alloc(32, 3).toString('base64')}`;
process.env['PIPE_CHAVE_SEGREDO_ATUAL'] ??= 'prova';

const URL_CRM = process.env['PIPE_TWENTY_URL'] ?? 'http://localhost:3500';
const CHAVE = process.env['PIPE_TWENTY_CHAVE'];
if (!CHAVE) throw new Error('faltou PIPE_TWENTY_CHAVE');

const { criarBanco, migrar, cifrar, chaveiroDoAmbiente } = await import('@pipe/db');
const { sincronizarContato } = await import('../src/dominio/espelho-crm.js');
const { fecharBancos } = await import('../src/banco.js');

await migrar(process.env['DATABASE_URL']);
const dono = criarBanco({ url: process.env['DATABASE_URL'], maxConexoes: 2 });

const marca = randomUUID().slice(0, 8);
const nome = `Cliente Prova ${marca}`;

const { rows: t } = await dono.execute<{ id: string }>(sql`
  insert into tenant (nome, slug, twenty_url, twenty_chave)
  values (${`Prova ${marca}`}, ${`prova-${marca}`}, ${URL_CRM},
          ${cifrar(CHAVE, chaveiroDoAmbiente())})
  returning id
`);
const tenantId = t[0]!.id;

const { rows: c } = await dono.execute<{ id: string }>(sql`
  insert into contato (tenant_id, nome, telefone_e164, email)
  values (${tenantId}, ${nome}, '+5511977776666', ${`prova.${marca}@exemplo.com.br`})
  returning id
`);
const contatoId = c[0]!.id;

console.log(`tenant  ${tenantId}`);
console.log(`contato ${contatoId}  "${nome}"`);

const r = await sincronizarContato(tenantId, contatoId);
console.log('espelho:', JSON.stringify(r));

const { rows: depois } = await dono.execute<{ twenty_pessoa_id: string | null }>(
  sql`select twenty_pessoa_id from contato where id = ${contatoId}`,
);
const pessoaId = depois[0]?.twenty_pessoa_id;
console.log(`coluna twenty_pessoa_id = ${pessoaId ?? 'NULA'}`);

// Confere do lado do CRM, com uma chamada independente: o registro existe mesmo, e
// está marcado com o id do NOSSO contato.
const conferencia = await fetch(`${URL_CRM}/graphql`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${CHAVE}` },
  body: JSON.stringify({
    query: `query($id: UUID!) {
      person(filter: {id: {eq: $id}}) {
        id pipeContatoId name { firstName lastName }
        emails { primaryEmail }
        phones { primaryPhoneNumber primaryPhoneCallingCode primaryPhoneCountryCode }
      }
    }`,
    variables: { id: pessoaId },
  }),
});
const vista = (await conferencia.json()) as { data?: { person?: unknown } };
console.log('no CRM:', JSON.stringify(vista.data?.person));

// Roda de novo: tem de ATUALIZAR o mesmo registro, nunca criar um segundo.
const denovo = await sincronizarContato(tenantId, contatoId);
console.log('segunda passada:', JSON.stringify(denovo), denovo.estado === 'espelhado' &&
  denovo.pessoaId === pessoaId ? '— mesmo id, sem duplicata' : '— DIVERGIU');

await dono.execute(sql`delete from contato where id = ${contatoId}`);
await dono.execute(sql`delete from tenant where id = ${tenantId}`);
await dono.$client.end();
await fecharBancos();
console.log('limpo do lado do Pipe (o registro no CRM fica, de propósito, como evidência)');
