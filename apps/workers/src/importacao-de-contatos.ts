import { sql } from 'drizzle-orm';
import { noTenant } from './banco.js';
import { CsvMalformado, escreverCsv, lerCsv } from './csv.js';
import type { JobImportacao } from './filas.js';
import { montarContato, salvarContato } from './gerenciador-de-contatos.js';
import type { ParametrosDoContato } from './gerenciador-de-contatos.js';

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

export function chaveDaColuna(cabecalho: string): string {
  const limpo = cabecalho
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  return APELIDOS[limpo] ?? cabecalho.trim();
}

function paraParametros(chaves: readonly string[], linha: readonly string[]): ParametrosDoContato {
  const params: ParametrosDoContato = {};
  chaves.forEach((chave, i) => {
    const valor = (linha[i] ?? '').trim();
    if (chave && valor) params[chave] = valor;
  });
  return params;
}

export interface ResultadoDaImportacao {
  estado: 'concluida' | 'falhou' | 'ausente';
  aceitos: number;
  rejeitados: number;
}

async function marcar(job: JobImportacao, estado: 'executando' | 'falhou'): Promise<void> {
  await noTenant(job.tenantId, (tx) =>
    tx.execute(sql`
      update importacao set estado = ${estado}, atualizado_em = now()
       where id = ${job.importacaoId}::uuid
    `),
  );
}

export async function processarImportacao(job: JobImportacao): Promise<ResultadoDaImportacao> {
  const carregado = await noTenant(job.tenantId, async (tx) => {
    const { rows } = await tx.execute<{ conteudo: string }>(sql`
      select a.conteudo
        from importacao i
        join importacao_arquivo a on a.importacao_id = i.id
       where i.id = ${job.importacaoId}::uuid
       limit 1
    `);
    return rows[0] ?? null;
  });
  if (!carregado) return { estado: 'ausente', aceitos: 0, rejeitados: 0 };

  await marcar(job, 'executando');

  let tabela;
  try {
    tabela = lerCsv(carregado.conteudo);
  } catch (erro) {
    if (!(erro instanceof CsvMalformado)) throw erro;
    // `handle_csv_error`
    console.error(`[importacao] ${job.importacaoId}: ${erro.message}`);
    await marcar(job, 'falhou');
    return { estado: 'falhou', aceitos: 0, rejeitados: 0 };
  }

  const chaves = tabela.cabecalhos.map(chaveDaColuna);
  const rejeitadas: string[][] = [];
  let aceitos = 0;

  try {
    for (let inicio = 0; inicio < tabela.linhas.length; inicio += TAMANHO_DO_LOTE) {
      const lote = tabela.linhas.slice(inicio, inicio + TAMANHO_DO_LOTE);
      await noTenant(job.tenantId, async (tx) => {
        // Em série: a linha seguinte precisa ver o contato que a anterior criou,
        // senão duas linhas do mesmo telefone viram dois contatos.
        for (const linha of lote) {
          const contato = await montarContato(tx, paraParametros(chaves, linha));
          if (contato.erros.length === 0) {
            await salvarContato(tx, job.tenantId, contato);
            aceitos += 1;
          } else {
            rejeitadas.push([...linha, contato.erros.join(', ')]);
          }
        }
        await tx.execute(sql`
          update importacao
             set total = ${aceitos + rejeitadas.length}, aceitos = ${aceitos},
                 rejeitados = ${rejeitadas.length}, atualizado_em = now()
           where id = ${job.importacaoId}::uuid
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
       where id = ${job.importacaoId}::uuid
    `);
    await tx.execute(sql`
      update importacao_arquivo set falhas_csv = ${falhas}
       where importacao_id = ${job.importacaoId}::uuid
    `);
  });

  return { estado: 'concluida', aceitos, rejeitados: rejeitadas.length };
}
