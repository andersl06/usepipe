import { pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { moment } from './comum.js';
import { refTenant } from './identity.js';
import { contactImport } from './crm.js';

/**
 * Contact-import file from migration `0016_entrada_do_cliente`. It corresponds to Chatwoot `DataImport` fields `import_file` and `failed_records`. Declared here so `drizzle-kit` does not generate a `DROP` for it in the next migration.
 */
export const importFile = pgTable('importacao_arquivo', {
  importId: uuid('importacao_id')
    .primaryKey()
    .references(() => contactImport.id, { onDelete: 'cascade' }),
  tenantId: refTenant(),
  conteudo: text('conteudo').notNull(),
  /** CSV of rejected rows with an `erros` column; null when no rows were rejected. */
  falhasCsv: text('falhas_csv'),
  criadoEm: moment('criado_em').notNull().defaultNow(),
});
