import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { agregarDiaAnterior } from './agregacao.js';
import { fecharBancos } from './banco.js';
import { processarOutbox } from './entrega.js';
import { FILA_AGREGACAO, FILA_ENTREGA, FILA_IMPORTACAO, conexaoRedis } from './filas.js';
import type { JobEntrega, JobImportacao } from './filas.js';
import { processarImportacao } from './importacao-de-contatos.js';
import { clienteWhatsApp } from './whatsapp/index.js';

/**
 * Processo dos workers.
 *
 * Duas filas: entrega de mensagem e agregação diária. A entrega tem dois gatilhos —
 * o job que a `api` publica ao enfileirar, e uma varredura periódica que existe
 * porque a fila pode perder job e o outbox não pode perder mensagem.
 */

const conexao = new IORedis(conexaoRedis().url, { maxRetriesPerRequest: null });

const filaEntrega = new Queue(FILA_ENTREGA, { connection: conexao });
const filaAgregacao = new Queue(FILA_AGREGACAO, { connection: conexao });

const entrega = new Worker<JobEntrega>(
  FILA_ENTREGA,
  async (job) => {
    const parametros = new Map<string, Record<string, string>>();
    if (job.data.mensagemId && job.data.parametros) {
      parametros.set(job.data.mensagemId, job.data.parametros);
    }
    const resultados = await processarOutbox({ parametros });
    for (const r of resultados) {
      if (r.estado === 'falhou') {
        console.error(`[entrega] ${r.mensagemId} falhou: ${r.erroCodigo} — ${r.erroTexto}`);
      }
    }
    return resultados.length;
  },
  { connection: conexao, concurrency: Number(process.env['PIPE_ENTREGA_CONCORRENCIA'] ?? 4) },
);

const agregacao = new Worker(
  FILA_AGREGACAO,
  async () => {
    const resumos = await agregarDiaAnterior();
    console.log(`[agregacao] ${resumos.length} tenant(s) agregado(s)`);
    return resumos.length;
  },
  { connection: conexao, concurrency: 1 },
);

// Uma importação por vez: é a fila `low` do Chatwoot, e duas planilhas grandes em
// paralelo disputariam o banco com a entrega de mensagem.
const importacao = new Worker<JobImportacao>(
  FILA_IMPORTACAO,
  async (job) => {
    const r = await processarImportacao(job.data);
    console.log(`[importacao] ${job.data.importacaoId}: ${r.estado}, ${r.aceitos} aceitos, ${r.rejeitados} rejeitados`);
    return r;
  },
  { connection: conexao, concurrency: 1 },
);

async function subir(): Promise<void> {
  // Varredura de segurança da entrega: recupera o que a fila deixou cair e o que
  // está esperando a próxima tentativa do backoff.
  await filaEntrega.upsertJobScheduler(
    'varredura-outbox',
    { every: Number(process.env['PIPE_ENTREGA_VARREDURA_MS'] ?? 15_000) },
    { name: 'varredura', data: {} },
  );

  // 03:10 no fuso do processo: depois da virada do dia e antes do expediente.
  await filaAgregacao.upsertJobScheduler(
    'metrica-diaria',
    { pattern: process.env['PIPE_AGREGACAO_CRON'] ?? '10 3 * * *' },
    { name: 'dia-anterior', data: {} },
  );

  console.log(`[workers] no ar. Cliente WhatsApp: ${clienteWhatsApp().nome}.`);
}

async function descer(): Promise<void> {
  await entrega.close();
  await agregacao.close();
  await importacao.close();
  await filaEntrega.close();
  await filaAgregacao.close();
  await conexao.quit();
  await fecharBancos();
}

process.on('SIGINT', () => void descer().then(() => process.exit(0)));
process.on('SIGTERM', () => void descer().then(() => process.exit(0)));

await subir();
