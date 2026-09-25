import { sql } from 'drizzle-orm';
import { noTenant } from './banco.js';
import { CsvMalformado, escreverCsv, lerCsv } from './csv.js';
import type { JobImport } from './filas.js';
import { assembleContact, saveContact } from './gerenciador-de-contatos.js';
import type { ParametersOfContact } from './gerenciador-de-contatos.js';

/**
 * Portado de chatwoot/chatwoot (MIT), app/jobs/data_import_job.rb
 *
 * O trabalho pesado da importação de contatos, fora da API: ela só grava o
 * arquivo e enfileira; quem lê o CSV, deduplica e grava é este job, no processo
 * dos workers. Arquivo grande não segura requisição nenhuma.
 *
 * Mesmos passos do original:
 *
 * 1. marca `executando` (`status: :processing`);
 * 2. lê o CSV com cabeçalho — aspas malformadas marcam `falhou` e param tudo;
 * 3. monta cada linha pelo gerenciador de contatos: válida é gravada, inválida
 *    vai para as rejeitadas com o motivo numa coluna `erros` no fim;
 * 4. marca `concluida` com o total, os aceitos e os rejeitados;
 * 5. guarda o CSV das rejeitadas (`failed_records`), que é o relatório que a
 *    tela oferece para baixar.
 *
 * Em lotes de mil linhas (o `batch_size: 1000` do `Contact.import`), cada lote
 * na sua transação: o progresso aparece na tela enquanto roda, e um erro de banco
 * no meio perde só o lote corrente — o que já entrou fica, e reimportar o mesmo
 * arquivo não duplica, porque o gerenciador acha quem já existe.
 *
 * O job carrega só `tenantId` e `importacaoId`, e tudo roda no `comTenant` DAQUELE
 * tenant: um id de importação de outro cliente simplesmente não é encontrado.
 *
 * De fora, e registrado: o original também aplica etiquetas (`labels`) ao
 * contato. O Pipe não tem etiqueta de contato — a coluna, se vier, vira atributo.
 * E o aviso por e-mail ao administrador não existe: não há e-mail transacional
 * (item 7 do `o-que-falta.md`); a tela mostra o estado.
 */

export const TAMANHO_DO_LOTE = 1_000;

/**
 * Os nomes de coluna que o original reconhece, e os apelidos em português que o
 * Pipe acrescenta — ninguém exporta planilha com `phone_number` no cabeçalho.
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

export async function processarImport(job: JobImport): Promise<ResultOfImport> {
  const carregado = await noTenant(job.tenantId, async (tx) => {
    const { rows } = await tx.execute<{ content: string }>(sql`
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
        // Em série: a linha seguinte precisa ver o contato que a anterior criou,
        // senão duas linhas do mesmo telefone viram dois contatos.
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
