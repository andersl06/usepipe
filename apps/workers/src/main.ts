import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { agregarDiaAnterior } from './aggregation.js';
import { fecharBancos } from './database.js';
import { processarOutbox } from './delivery.js';
import { QUEUE_AGGREGATION, QUEUE_DELIVERY, QUEUE_IMPORT, conexaoRedis } from './queues.js';
import type { JobDelivery, JobImport } from './queues.js';
import { processarImport } from './import-of-contacts.js';
import { clienteWhatsApp } from './whatsapp/index.js';

/**
 * Processo dos workers.
 *
 * Duas filas: entrega de mensagem e agregação diária. A entrega tem dois gatilhos —
 * o job que a `api` publica ao enfileirar, e uma varredura periódica que existe
 * porque a fila pode perder job e o outbox não pode perder mensagem.
 */

const conexao = new IORedis(conexaoRedis().url, { maxRetriesPerRequest: null });

const queueDelivery = new Queue(QUEUE_DELIVERY, { connection: conexao });
const queueAggregation = new Queue(QUEUE_AGGREGATION, { connection: conexao });

const delivery = new Worker<JobDelivery>(
  QUEUE_DELIVERY,
  async (job) => {
    const parametros = new Map<string, Record<string, string>>();
    if (job.data.messageId && job.data.parametros) {
      parametros.set(job.data.messageId, job.data.parametros);
    }
    const resultados = await processarOutbox({ parametros });
    for (const r of resultados) {
      if (r.state === 'falhou') {
        console.error(`[entrega] ${r.messageId} falhou: ${r.errorCode} — ${r.errorText}`);
      }
    }
    return resultados.length;
  },
  { connection: conexao, concurrency: Number(process.env['PIPE_ENTREGA_CONCORRENCIA'] ?? 4) },
);

const aggregation = new Worker(
  QUEUE_AGGREGATION,
  async () => {
    const resumos = await agregarDiaAnterior();
    console.log(`[agregacao] ${resumos.length} tenant(s) agregado(s)`);
    return resumos.length;
  },
  { connection: conexao, concurrency: 1 },
);

// Uma importação por vez: é a fila `low` do Chatwoot, e duas planilhas grandes em
// paralelo disputariam o banco com a entrega de mensagem.
const importJob = new Worker<JobImport>(
  QUEUE_IMPORT,
  async (job) => {
    const r = await processarImport(job.data);
    console.log(`[importacao] ${job.data.importId}: ${r.state}, ${r.aceitos} aceitos, ${r.rejeitados} rejeitados`);
    return r;
  },
  { connection: conexao, concurrency: 1 },
);

async function up(): Promise<void> {
  // Varredura de segurança da entrega: recupera o que a fila deixou cair e o que
  // está esperando a próxima tentativa do backoff.
  await queueDelivery.upsertJobScheduler(
    'sweep-outbox',
    { every: Number(process.env['PIPE_ENTREGA_VARREDURA_MS'] ?? 15_000) },
    { name: 'varredura', data: {} },
  );

  // 03:10 no fuso do processo: depois da virada do dia e antes do expediente.
  await queueAggregation.upsertJobScheduler(
    'daily-metric',
    { pattern: process.env['PIPE_AGREGACAO_CRON'] ?? '10 3 * * *' },
    { name: 'dia-anterior', data: {} },
  );

  console.log(`[workers] no ar. Cliente WhatsApp: ${clienteWhatsApp().nome}.`);
}

async function down(): Promise<void> {
  await delivery.close();
  await aggregation.close();
  await importJob.close();
  await queueDelivery.close();
  await queueAggregation.close();
  await conexao.quit();
  await fecharBancos();
}

process.on('SIGINT', () => void down().then(() => process.exit(0)));
process.on('SIGTERM', () => void down().then(() => process.exit(0)));

await up();
