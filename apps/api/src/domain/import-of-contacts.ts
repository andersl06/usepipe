import { sql } from 'drizzle-orm';
import { registrarAuditoria } from '@pipe/db';
import { noTenant } from '../database.js';
import { PipeError } from '../errors.js';
import { enqueueImport } from '../queues.js';

/**
 * Ported from chatwoot/chatwoot (MIT): the `import` action in app/controllers/api/v1/accounts/contacts_controller.rb and `DataImport` in app/models/data_import.rb (`set_default_name` and `process_data_import`). As in the original, the API rejects an empty file, writes the import and file in the same transaction, then queues the job after commit. The worker reads the CSV (`apps/workers/src/importacao-de-contatos.ts`). Unlike Chatwoot's one-minute delay while storage upload finishes, this file is in `importacao_arquivo` and is available when the job is created.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ImportVisible {
  id: string;
  nome: string | null;
  /** `pronta` (pending), `executando` (processing), `concluida` (completed) ou `falhou` (failed). */
  estado: string;
  total: number;
  aceitos: number;
  rejeitados: number;
  /** Whether a downloadable CSV of rejected rows exists. */
  temFalhas: boolean;
  criadoEm: Date;
  atualizadoEm: Date | null;
}

type LineImport = {
  [column: string]: unknown;
  id: string;
  arquivo: string | null;
  estado: string;
  total: number;
  aceitos: number;
  rejeitados: number;
  tem_falhas: boolean;
  criado_em: string | Date;
  atualizado_em: string | Date | null;
};

function visivel(linha: LineImport): ImportVisible {
  return {
    id: linha.id,
    nome: linha.arquivo,
    estado: linha.estado,
    total: Number(linha.total),
    aceitos: Number(linha.aceitos),
    rejeitados: Number(linha.rejeitados),
    temFalhas: linha.tem_falhas === true,
    criadoEm: new Date(linha.criado_em),
    atualizadoEm: linha.atualizado_em ? new Date(linha.atualizado_em) : null,
  };
}

export async function createImport(
  tenantId: string,
  userId: string,
  conteudo: string | undefined,
  nome?: string | undefined,
): Promise<ImportVisible> {
  // `errors.contacts.import.failed`, no pt_BR do Chatwoot.
  if (!conteudo || !conteudo.trim()) throw new PipeError(422, 'file_empty', 'Arquivo vazio');

  // `set_default_name`: "Contacts - 2026-09-11".
  const nomeFinal = nome?.trim() || `Contatos - ${new Date().toISOString().slice(0, 10)}`;
  // Postgres cannot store a NUL byte in `text`; spreadsheet exports sometimes contain one.
  const limpo = conteudo.split('\u0000').join('');

  const id = await noTenant(tenantId, async (tx) => {
    const { rows } = await tx.execute<{ id: string }>(sql`
      insert into importacao (tenant_id, origem, arquivo, estado)
      values (${tenantId}::uuid, 'csv', ${nomeFinal}, 'pronta')
      returning id
    `);
    const novo = rows[0]!.id;
    await tx.execute(sql`
      insert into importacao_arquivo (importacao_id, tenant_id, conteudo)
      values (${novo}::uuid, ${tenantId}::uuid, ${limpo})
    `);
    await registrarAuditoria(tx, tenantId, {
      ator: { type: 'usuario', id: userId },
      acao: 'criou',
      objetoTipo: 'importacao',
      objetoId: novo,
      depois: { id: novo, origem: 'csv', arquivo: nomeFinal },
    });
    return novo;
  });

  // `after_create_commit :process_data_import` — depois do commit, nunca dentro:
  // The worker must see the row just written, so enqueue only after commit.
  await enqueueImport({ tenantId, importId: id });
  return readImport(tenantId, id);
}

const COLUNAS = sql`
  i.id, i.arquivo, i.estado, i.total, i.aceitos, i.rejeitados, i.criado_em, i.atualizado_em,
  (a.falhas_csv is not null) as tem_falhas
`;

export async function readImport(tenantId: string, id: string): Promise<ImportVisible> {
  if (!UUID.test(id)) throw PipeError.naoEncontrado('Importação');
  const linha = await noTenant(tenantId, async (tx) => {
    const { rows } = await tx.execute<LineImport>(sql`
      select ${COLUNAS}
        from importacao i
        left join importacao_arquivo a on a.importacao_id = i.id
       where i.id = ${id}::uuid and i.origem = 'csv'
       limit 1
    `);
    return rows[0] ?? null;
  });
  if (!linha) throw PipeError.naoEncontrado('Importação');
  return visivel(linha);
}

export async function listImports(tenantId: string, limite = 5): Promise<ImportVisible[]> {
  return noTenant(tenantId, async (tx) => {
    const { rows } = await tx.execute<LineImport>(sql`
      select ${COLUNAS}
        from importacao i
        left join importacao_arquivo a on a.importacao_id = i.id
       where i.origem = 'csv'
       order by i.criado_em desc
       limit ${limite}
    `);
    return rows.map(visivel);
  });
}

/** CSV of rejected rows (`failed_records`); return 404 when none were rejected. */
export async function lerFalhas(tenantId: string, id: string): Promise<string> {
  if (!UUID.test(id)) throw PipeError.naoEncontrado('Relatório');
  const falhas = await noTenant(tenantId, async (tx) => {
    const { rows } = await tx.execute<{ falhas_csv: string | null }>(sql`
      select falhas_csv from importacao_arquivo where importacao_id = ${id}::uuid limit 1
    `);
    return rows[0]?.falhas_csv ?? null;
  });
  if (!falhas) throw PipeError.naoEncontrado('Relatório');
  return falhas;
}
