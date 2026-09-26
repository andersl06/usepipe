import { sql } from 'drizzle-orm';
import { noTenant } from './database.js';
import { CsvMalformado, escreverCsv, lerCsv } from './csv.js';
import type { JobImport } from './queues.js';
import { assembleContact, saveContact } from './manager-of-contacts.js';
import type { ParametersOfContact } from './manager-of-contacts.js';

/**
 * Ported from chatwoot/chatwoot (MIT), `app/jobs/data_import_job.rb`. API stores the file and enqueues the job; workers read CSV, deduplicate, and write contacts so large files do not hold an HTTP request. Follow the source steps: set `executando` (`status: :processing`); read headed CSV, marking `falhou` and stopping on malformed quotes; validate and write good rows while appending invalid ones and reasons in `erros`; set `concluida` with totals; save rejected rows as `failed_records` for download. Process batches of 1,000 (`Contact.import`'s `batch_size: 1000`), each in its own transaction. Progress is visible while running; a database error loses only the current batch, and rerun deduplicates accepted rows. The job carries only `tenantId` and `importacaoId`; all reads occur in that tenant's `comTenant`, so another tenant's import ID is invisible. Known differences: source `labels` become an attribute because Pipe has no contact tag, and no admin email is sent because there is no transactional email (`o-que-falta.md` item 7); the screen shows status.
 */

export const TAMANHO_DO_LOTE = 1_000;

/**
 * Recognize the source column names and Pipe's Portuguese aliases; users do not export spreadsheets headed `phone_number`.
 */
const APELIDOS: Readonly<Record<string, string>> = {
  phone_number: 'phone_number',
  phone: 'phone_number',
  telefone: 'phone_number',
  celular: 'phone_number',
  whatsapp: 'phone_number',
  fone: 'phone_number',
  name: 'name',
  nome: 'name',
  email: 'email',
  'e-mail': 'email',
  company_name: 'company_name',
  empresa: 'company_name',
  city: 'city',
  cidade: 'city',
  identifier: 'identifier',
  identificador: 'identifier',
};

export function keyOfColumn(cabecalho: string): string {
  const limpo = cabecalho
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  return APELIDOS[limpo] ?? cabecalho.trim();
}

function paraParametros(chaves: readonly string[], linha: readonly string[]): ParametersOfContact {
  const params: ParametersOfContact = {};
  chaves.forEach((key, i) => {
    const value = (linha[i] ?? '').trim();
    if (key && value) params[key] = value;
  });
  return params;
}

export interface ResultOfImport {
  state: 'concluida' | 'falhou' | 'ausente';
  aceitos: number;
  rejeitados: number;
}

async function marcar(job: JobImport, state: 'executando' | 'falhou'): Promise<void> {
  await noTenant(job.tenantId, (tx) =>
    tx.execute(sql`
      update importacao set estado = ${state}, atualizado_em = now()
       where id = ${job.importId}::uuid
    `),
  );
}

export async function processImport(job: JobImport): Promise<ResultOfImport> {
  const carregado = await noTenant(job.tenantId, async (tx) => {
    const { rows } = await tx.execute<{ conteudo: string }>(sql`
      select a.conteudo
        from importacao i
        join importacao_arquivo a on a.importacao_id = i.id
       where i.id = ${job.importId}::uuid
       limit 1
    `);
    return rows[0] ?? null;
  });
  if (!carregado) return { state: 'ausente', aceitos: 0, rejeitados: 0 };

  await marcar(job, 'executando');

  let tabela;
  try {
    tabela = lerCsv(carregado.conteudo);
  } catch (error) {
    if (!(error instanceof CsvMalformado)) throw error;
    // `handle_csv_error`
    console.error(`[importacao] ${job.importId}: ${error.message}`);
    await marcar(job, 'falhou');
    return { state: 'falhou', aceitos: 0, rejeitados: 0 };
  }

  const chaves = tabela.cabecalhos.map(keyOfColumn);
  const rejeitadas: string[][] = [];
  let aceitos = 0;

  try {
    for (let inicio = 0; inicio < tabela.linhas.length; inicio += TAMANHO_DO_LOTE) {
      const lote = tabela.linhas.slice(inicio, inicio + TAMANHO_DO_LOTE);
      await noTenant(job.tenantId, async (tx) => {
        // Run rows serially so the next row sees a contact created by the previous one,
        // preventing duplicate contacts for repeated phone numbers.
        for (const linha of lote) {
          const contact = await assembleContact(tx, paraParametros(chaves, linha));
          if (contact.errors.length === 0) {
            await saveContact(tx, job.tenantId, contact);
            aceitos += 1;
          } else {
            rejeitadas.push([...linha, contact.errors.join(', ')]);
          }
        }
        await tx.execute(sql`
          update importacao
             set total = ${aceitos + rejeitadas.length}, aceitos = ${aceitos},
                 rejeitados = ${rejeitadas.length}, atualizado_em = now()
           where id = ${job.importId}::uuid
        `);
      });
    }
  } catch (erro) {
    await marcar(job, 'falhou');
    throw erro;
  }

  // `update_data_import_status` e `save_failed_records_csv`.
  const falhas =
    rejeitadas.length > 0 ? escreverCsv([[...tabela.cabecalhos, 'erros'], ...rejeitadas]) : null;
  await noTenant(job.tenantId, async (tx) => {
    await tx.execute(sql`
      update importacao
         set estado = 'concluida', total = ${aceitos + rejeitadas.length},
             aceitos = ${aceitos}, rejeitados = ${rejeitadas.length}, atualizado_em = now()
       where id = ${job.importId}::uuid
    `);
    await tx.execute(sql`
      update importacao_arquivo set falhas_csv = ${falhas}
       where importacao_id = ${job.importId}::uuid
    `);
  });

  return { state: 'concluida', aceitos, rejeitados: rejeitadas.length };
}
