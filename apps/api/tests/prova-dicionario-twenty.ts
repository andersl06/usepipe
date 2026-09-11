/**
 * Prova do dicionário contra a instância REAL do CRM.
 *
 * NÃO é teste automatizado — é o roteiro de evidência, como `prova-e2e-twenty.ts`. Só
 * LÊ o CRM: a sincronização não escreve nada lá.
 *
 *   PIPE_TWENTY_CHAVE=<chave> pnpm --filter @pipe/api exec tsx tests/prova-dicionario-twenty.ts
 *
 * Usa um tenant fixo (`prova-dicionario`), criado na primeira execução e reaproveitado
 * nas seguintes: rodar, criar um campo no CRM e rodar de novo mostra o campo chegando.
 */
import { sql } from 'drizzle-orm';

process.env['PIPE_FILAS'] = 'memoria';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_CHAVES_SEGREDO'] ??= `prova:${Buffer.alloc(32, 3).toString('base64')}`;
process.env['PIPE_CHAVE_SEGREDO_ATUAL'] ??= 'prova';
process.env['PIPE_TWENTY_TIMEOUT_MS'] ??= '60000';

const URL_CRM = process.env['PIPE_TWENTY_URL'] ?? 'http://localhost:3500';
const CHAVE = process.env['PIPE_TWENTY_CHAVE'];
if (!CHAVE) throw new Error('faltou PIPE_TWENTY_CHAVE');

const { criarBanco, migrar, cifrar, chaveiroDoAmbiente } = await import('@pipe/db');
const { lerDicionario, sincronizarDicionario } = await import('../src/dominio/dicionario-crm.js');
const { fecharBancos, noTenant } = await import('../src/banco.js');

await migrar(process.env['DATABASE_URL']);
const dono = criarBanco({ url: process.env['DATABASE_URL'], maxConexoes: 2 });

const { rows } = await dono.execute<{ id: string }>(sql`
  insert into tenant (nome, slug, twenty_url, twenty_chave)
  values ('Prova do dicionário', 'prova-dicionario', ${URL_CRM},
          ${cifrar(CHAVE, chaveiroDoAmbiente())})
  on conflict (slug) do update
     set twenty_url = excluded.twenty_url, twenty_chave = excluded.twenty_chave
  returning id
`);
const tenantId = rows[0]!.id;
console.log(`tenant ${tenantId}  CRM ${URL_CRM}`);

const inicio = Date.now();
const r = await sincronizarDicionario(tenantId);
console.log(`sincronização (${Date.now() - inicio} ms):`, JSON.stringify(r));

const dicionario = await noTenant(tenantId, lerDicionario);
const ativos = dicionario.filter((o) => !o.excluidoEm);
console.log(
  `objetos: ${ativos.length} (${ativos.filter((o) => o.isSystem).length} de sistema, ` +
    `${ativos.filter((o) => o.isCustom).length} do cliente)`,
);
console.log(
  `campos: ${ativos.reduce((s, o) => s + o.campos.length, 0)} ` +
    `(${ativos.reduce((s, o) => s + o.campos.filter((c) => c.agregavel).length, 0)} agregáveis)`,
);
console.log('do cliente:');
for (const o of dicionario) {
  for (const c of o.campos.filter((x) => x.isCustom)) {
    const marca = c.excluidoEm ? '  [REMOVIDO do CRM]' : '';
    console.log(`  ${o.codigo}.${c.codigo}  ${c.tipo}  "${c.rotulo}"  agregavel=${c.agregavel}${marca}`);
  }
}

await dono.$client.end();
await fecharBancos();
