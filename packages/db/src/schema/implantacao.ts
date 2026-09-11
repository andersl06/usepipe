import { pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { momento } from './comum.js';
import { refTenant } from './identidade.js';
import { importacao } from './crm.js';

/**
 * O arquivo da importação de contatos — migration `0016_entrada_do_cliente`.
 *
 * É o `import_file` e o `failed_records` do `DataImport` do Chatwoot. Declarado
 * aqui para o `drizzle-kit` não gerar um `DROP` dela na próxima migration.
 */
export const importacaoArquivo = pgTable('importacao_arquivo', {
  importacaoId: uuid('importacao_id')
    .primaryKey()
    .references(() => importacao.id, { onDelete: 'cascade' }),
  tenantId: refTenant(),
  conteudo: text('conteudo').notNull(),
  /** O CSV das linhas rejeitadas, com a coluna `erros`. Nulo quando nada foi rejeitado. */
  falhasCsv: text('falhas_csv'),
  criadoEm: momento('criado_em').notNull().defaultNow(),
});
