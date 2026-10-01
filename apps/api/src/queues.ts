import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import {
  QUEUE_DICTIONARY_CRM,
  QUEUE_INBOUND,
  QUEUE_DELIVERY,
  QUEUE_MIRROR_CRM,
  QUEUE_MEDIA,
  QUEUE_PROCESS_HTTP,
  QUEUE_SLA,
  conexaoRedis,
} from '@pipe/workers';
import type {
  JobDictionaryCrm,
  JobInbound,
  JobDelivery,
  JobMirrorCrm,
  JobMedia,
  JobProcessHttp,
  JobSla,
} from '@pipe/workers';
import { resolveChannel } from './database.js';
import { SEM_CRM, syncDictionary, tenantsOfDictionary } from './domain/dictionary-crm.js';
import { processarPayload } from './domain/inbound.js';
import { executarProcessHttp, recoverStuckProcessHttp } from './domain/flow.js';
import { renovarTokensInstagram } from './domain/instagram/renewal.js';
import { contactsWithoutMirror, syncContact } from './domain/mirror-crm.js';
import { downloadMediaOfAttachment, midiasPendentes } from './domain/media.js';
import { runAutoClose } from './domain/management/auto-close.js';
import { checkSlaOfConversation, conversationsForCheckSla } from './domain/management/sla-motor.js';
import { QUEUE_IMPORT, processImport } from '@pipe/workers';
import type { JobImport } from '@pipe/workers';

/**
 * The API enqueues work and `apps/workers` executes it. With `PIPE_FILAS=memoria`, inbound processing runs inline without Redis for development and end-to-end tests, following the same path minus Redis. Delivery never runs inline, even in memory mode: `outbox_mensagem` is authoritative, and the queue only prompts a worker to look before the next sweep.
 */

export type ModeQueue = 'bullmq' | 'memoria';

export function modo(): ModeQueue {
  return process.env['PIPE_FILAS'] === 'memoria' ? 'memoria' : 'bullmq';
}

let conexao: IORedis | null = null;
let queueInbound: Queue | null = null;
let queueDelivery: Queue<JobDelivery> | null = null;
let queueMirrorCrm: Queue | null = null;
let queueMedia: Queue<JobMedia> | null = null;
let queueSla: Queue<JobSla> | null = null;
let queueProcessHttp: Queue<JobProcessHttp> | null = null;
let consumidorProcessHttp: Worker<JobProcessHttp> | null = null;
let relogioProcessHttp: ReturnType<typeof setInterval> | null = null;
const processHttpEmMemoria: JobProcessHttp[] = [];
const QUEUE_PROCESS_HTTP_SWEEP = 'pipe-process-http-sweep';
let queueProcessHttpSweep: Queue | null = null;
let consumerProcessHttpSweep: Worker | null = null;

function redis(): IORedis {
  conexao ??= new IORedis(conexaoRedis().url, { maxRetriesPerRequest: null });
  return conexao;
}

/**
 * Meta retries events when the response is slow, so acknowledge the webhook with 200 and process from the queue afterward.
 */
export async function enqueueInbound(channelId: string, payload: unknown): Promise<void> {
  if (modo() === 'memoria') {
    const canal = await resolveChannel(channelId);
    if (canal) await processarPayload(canal, payload);
    return;
  }
  queueInbound ??= new Queue(QUEUE_INBOUND, { connection: redis() });
  await queueInbound.add('entrada', { channelId, payload }, { removeOnComplete: 1_000 });
}

export async function enfileirarProcessHttp(job: JobProcessHttp): Promise<void> {
  if (modo() === 'memoria') {
    const continuar = (ids: string[]) => {
      for (const processoId of ids) void enfileirarProcessHttp({ tenantId: job.tenantId, processoId });
    };
    if (process.env['PIPE_PROCESS_HTTP_EM_MEMORIA'] === '1') processHttpEmMemoria.push(job);
    else void executarProcessHttp(job.processoId).then(continuar);
    return;
  }
  queueProcessHttp ??= new Queue(QUEUE_PROCESS_HTTP, { connection: redis() });
  await queueProcessHttp.add('chamar', job, {
    jobId: `process-http-${job.processoId}`,
    removeOnComplete: 1_000,
    attempts: 1,
  });
}

export function consumirProcessHttp(): void {
  if (modo() === 'memoria' || consumidorProcessHttp) return;
  consumidorProcessHttp = new Worker<JobProcessHttp>(
    QUEUE_PROCESS_HTTP,
    async (job) => {
      for (const processoId of await executarProcessHttp(job.data.processoId)) {
        await enfileirarProcessHttp({ tenantId: job.data.tenantId, processoId });
      }
    },
    { connection: redis(), concurrency: Number(process.env['PIPE_PROCESS_HTTP_CONCORRENCIA'] ?? 4) },
  );
}

/**
 * Memory-mode branch keeps its own in-process timer (development/tests, no Redis). The BullMQ
 * branch adds a dedicated queue and scheduler so production recovers a `process_http_execucao`
 * a failure left stuck in `chamando` (D-26); `consumeSweepProcessHttp` runs the recovery.
 */
export async function scheduleSweepProcessHttp(): Promise<void> {
  if (modo() === 'memoria') {
    if (process.env['PIPE_PROCESS_HTTP_EM_MEMORIA'] !== '1' || relogioProcessHttp) return;
    let rodando = false;
    relogioProcessHttp = setInterval(() => {
      if (rodando) return;
      rodando = true;
      void (async () => {
        try {
          while (processHttpEmMemoria.length > 0) {
            const job = processHttpEmMemoria.shift()!;
            await executarProcessHttp(job.processoId);
          }
        } finally {
          rodando = false;
        }
      })();
    }, Number(process.env['PIPE_PROCESS_HTTP_VARREDURA_MS'] ?? 15_000));
    relogioProcessHttp.unref();
    return;
  }
  queueProcessHttpSweep ??= new Queue(QUEUE_PROCESS_HTTP_SWEEP, { connection: redis() });
  await queueProcessHttpSweep.upsertJobScheduler(
    'process-http-sweep',
    { every: Number(process.env['PIPE_PROCESS_HTTP_VARREDURA_MS'] ?? 60_000) },
    { name: 'varredura', data: {} },
  );
}

/** Consume the ProcessHttp recovery sweep; concurrency 1, since `recoverStuckProcessHttp` already claims rows `for update skip locked`. */
export function consumeSweepProcessHttp(): void {
  if (modo() === 'memoria' || consumerProcessHttpSweep) return;
  consumerProcessHttpSweep = new Worker(
    QUEUE_PROCESS_HTTP_SWEEP,
    async (job) => {
      if (job.name !== 'varredura') return 0;
      const limiteMs = Number(process.env['PIPE_PROCESS_HTTP_TIMEOUT_MS'] ?? 120_000);
      const novos = await recoverStuckProcessHttp(limiteMs);
      for (const { tenantId, processoId } of novos) await enfileirarProcessHttp({ tenantId, processoId });
      return novos.length;
    },
    { connection: redis(), concurrency: 1 },
  );
}

export async function enqueueDelivery(job: JobDelivery): Promise<void> {
  if (modo() === 'memoria') return;
  queueDelivery ??= new Queue(QUEUE_DELIVERY, { connection: redis() });
  await queueDelivery.add('entrega', job, { removeOnComplete: 1_000 });
}

/**
 * Enqueue contact mirroring to CRM. Failure must not interrupt attendance: the received message matters more than its CRM mirror, and the sweep recovers missed jobs. Log and swallow enqueue errors. Memory mode skips mirroring because it runs without external services.
 */
export async function enqueueMirrorCrm(job: JobMirrorCrm): Promise<void> {
  if (modo() === 'memoria') return;
  try {
    queueMirrorCrm ??= new Queue(QUEUE_MIRROR_CRM, { connection: redis() });
    await queueMirrorCrm.add('espelhar', job, {
      removeOnComplete: 1_000,
      // Use one job ID per contact: three rapid changes to a conversation's contact should coalesce into one mirror job, not concurrent races.
      // escrevendo no mesmo registro do CRM.
      //
      // Use a hyphen, never `:`, in custom job IDs. BullMQ 5 rejects colons except in legacy three-part repeat IDs; because the catch below swallows errors, `espelho:<uuid>` made every enqueue fail silently.
      jobId: `espelho-${job.contactId}`,
      attempts: 5,
      backoff: { type: 'exponential', delay: 5_000 },
    });
  } catch (error) {
    console.error(`[espelho-crm] não enfileirou ${job.contactId}: ${(error as Error).message}`);
  }
}

let consumerMirrorCrm: Worker | null = null;

/**
 * Consume CRM mirroring in the `api`, not `apps/workers`, as for `pipe-entrada`: the API owns calls to external services. The queue has `espelhar` for one contact and `varredura` to requeue missed work, since lost jobs must not leave contacts without CRM links.
 */
export function consumeMirrorCrm(): void {
  if (modo() === 'memoria' || consumerMirrorCrm) return;
  consumerMirrorCrm = new Worker(
    QUEUE_MIRROR_CRM,
    async (job) => {
      if (job.name === 'varredura') {
        const pendentes = await contactsWithoutMirror();
        // Run serially: requeueing should not compete with its own consumer.
        for (const p of pendentes) await enqueueMirrorCrm(p);
        return pendentes.length;
      }
      const data = job.data as JobMirrorCrm;
      const r = await syncContact(data.tenantId, data.contactId);
      return r.state;
    },
    {
      connection: redis(),
      concurrency: Number(process.env['PIPE_ESPELHO_CRM_CONCORRENCIA'] ?? 2),
    },
  );
}

/** Safety sweep for CRM mirroring; see `contatosSemEspelho`. */
export async function scheduleSweepMirrorCrm(): Promise<void> {
  if (modo() === 'memoria') return;
  queueMirrorCrm ??= new Queue(QUEUE_MIRROR_CRM, { connection: redis() });
  await queueMirrorCrm.upsertJobScheduler(
    'sweep-crm-mirror',
    { every: Number(process.env['PIPE_ESPELHO_CRM_VARREDURA_MS'] ?? 300_000) },
    { name: 'varredura', data: {} },
  );
}

/**
 * Enqueue inbound attachment media download (`dominio/midia.ts`). Failure must not interrupt attendance: the message is already visible, and a periodic sweep recovers missed downloads. Memory mode skips Meta calls; tests can call `baixarMidiaDoAnexo` directly (`tests/midia-recebida.test.ts`).
 */
export async function enqueueDownloadMedia(job: JobMedia): Promise<void> {
  if (modo() === 'memoria') return;
  try {
    queueMedia ??= new Queue(QUEUE_MEDIA, { connection: redis() });
    await queueMedia.add('baixar', job, {
      removeOnComplete: 1_000,
      // Use one job per attachment so immediate enqueue and sweep coalesce. `baixarMidiaDoAnexo` also checks `bytes = 0` for idempotency; this only avoids unnecessary calls.
      jobId: `midia-${job.attachmentId}`,
      attempts: 1,
    });
  } catch (erro) {
    console.error(`[midia] não enfileirou ${job.attachmentId}: ${(erro as Error).message}`);
  }
}

let consumerMedia: Worker | null = null;
let clockMedia: ReturnType<typeof setInterval> | null = null;

/**
 * Consume media downloads in `api`, which already decrypts channel tokens (`chaveiro`, `dominio/banco.ts`). `baixar` handles one attachment and `varredura` requeues missed ones. `baixarMidiaDoAnexo` owns backoff rescheduling, so BullMQ uses `attempts: 1` and never retries independently.
 */
export function consumeDownloadMedia(): void {
  if (modo() === 'memoria' || consumerMedia) return;
  consumerMedia = new Worker(
    QUEUE_MEDIA,
    async (job) => {
      if (job.name === 'varredura') {
        const pendentes = await midiasPendentes();
        for (const p of pendentes) await enqueueDownloadMedia(p);
        return pendentes.length;
      }
      const dados = job.data as JobMedia;
      const r = await downloadMediaOfAttachment(dados.tenantId, dados.attachmentId);
      return r.state;
    },
    {
      connection: redis(),
      concurrency: Number(process.env['PIPE_MIDIA_CONCORRENCIA'] ?? 4),
    },
  );
}

/**
 * Safety sweep for media downloads; see `midiasPendentes`. ponytail: this queue is absent from `estadoDasFilas` until `FilaParada` needs stalled-media monitoring, as already noted for `pipe-importacao` below.
 */
export async function scheduleSweepDownloadMedia(): Promise<void> {
  if (modo() === 'memoria') {
    // Without Redis, run the sweep on an in-process timer only when `PIPE_MIDIA_EM_MEMORIA=1`, so tests still see the raw attachment immediately after the webhook; there is no per-attachment enqueue in this mode.
    // aqui: o intervalo curto faz o papel dele.
    if (process.env['PIPE_MIDIA_EM_MEMORIA'] !== '1' || clockMedia) return;
    let rodando = false;
    clockMedia = setInterval(() => {
      if (rodando) return;
      rodando = true;
      void (async () => {
        try {
          for (const p of await midiasPendentes()) await downloadMediaOfAttachment(p.tenantId, p.attachmentId);
        } catch (erro) {
          console.error(`[midia] varredura em memória falhou: ${(erro as Error).message}`);
        } finally {
          rodando = false;
        }
      })();
    }, Number(process.env['PIPE_MIDIA_VARREDURA_MS'] ?? 15_000));
    clockMedia.unref();
    return;
  }
  queueMedia ??= new Queue(QUEUE_MEDIA, { connection: redis() });
  await queueMedia.upsertJobScheduler(
    'sweep-media',
    { every: Number(process.env['PIPE_MIDIA_VARREDURA_MS'] ?? 300_000) },
    { name: 'varredura', data: {} as JobMedia },
  );
}

/**
 * Enqueue one conversation SLA check (`dominio/gestao/sla-motor.ts`). As with CRM and media, enqueue failure cannot interrupt the sender; swallow it and let the periodic sweep find the conversation now or next time. Memory mode skips enqueueing; `PIPE_SLA_EM_MEMORIA=1` enables direct sweeping without a queue, like `PIPE_MIDIA_EM_MEMORIA`. `agendarVarreduraSla` supplies the memory-mode sweep.
 */
export async function enqueueCheckSla(job: JobSla): Promise<void> {
  if (modo() === 'memoria') return;
  try {
    queueSla ??= new Queue(QUEUE_SLA, { connection: redis() });
    await queueSla.add('checar', job, {
      removeOnComplete: 1_000,
      // One pending check per conversation: an extra push before processing coalesces instead of racing on the same row.
      jobId: `sla-${job.conversationId}`,
      attempts: 1,
    });
  } catch (erro) {
    console.error(`[sla] não enfileirou ${job.conversationId}: ${(erro as Error).message}`);
  }
}

let consumidorSla: Worker | null = null;
let relogioSla: ReturnType<typeof setInterval> | null = null;

/**
 * Consume SLA checks in `api`, which owns `sla-motor.ts` domain rules and outbound webhooks. `checar` decides alert or breach for one conversation; `varredura` requeues missed work, as with media.
 */
export function consumeCheckSla(): void {
  if (modo() === 'memoria' || consumidorSla) return;
  consumidorSla = new Worker(
    QUEUE_SLA,
    async (job) => {
      if (job.name === 'varredura') {
        const pendentes = await conversationsForCheckSla();
        for (const p of pendentes) await enqueueCheckSla(p);
        return pendentes.length;
      }
      const dados = job.data as JobSla;
      await checkSlaOfConversation(dados.tenantId, dados.conversationId);
    },
    {
      connection: redis(),
      concurrency: Number(process.env['PIPE_SLA_CONCORRENCIA'] ?? 4),
    },
  );
}

/**
 * Safety sweep for SLA; see `conversasParaChecarSla`. ponytail: omit this queue from `estadoDasFilas` until stalled-SLA monitoring is needed, like `pipe-midia` and `pipe-importacao`.
 */
export async function scheduleSweepSla(): Promise<void> {
  if (modo() === 'memoria') {
    // Without Redis, run the SLA sweep on an in-process timer only with `PIPE_SLA_EM_MEMORIA=1` so end-to-end tests can observe alerts and breaches.
    // acontecer sem precisar enfileirar nada. Mesmo desenho do `PIPE_MIDIA_EM_MEMORIA`.
    if (process.env['PIPE_SLA_EM_MEMORIA'] !== '1' || relogioSla) return;
    let rodando = false;
    relogioSla = setInterval(() => {
      if (rodando) return;
      rodando = true;
      void (async () => {
        try {
          for (const p of await conversationsForCheckSla()) {
            await checkSlaOfConversation(p.tenantId, p.conversationId);
          }
        } catch (erro) {
          console.error(`[sla] varredura em memória falhou: ${(erro as Error).message}`);
        } finally {
          rodando = false;
        }
      })();
    }, Number(process.env['PIPE_SLA_VARREDURA_MS'] ?? 15_000));
    relogioSla.unref();
    return;
  }
  queueSla ??= new Queue(QUEUE_SLA, { connection: redis() });
  await queueSla.upsertJobScheduler(
    'sweep-sla',
    { every: Number(process.env['PIPE_SLA_VARREDURA_MS'] ?? 60_000) },
    { name: 'varredura', data: {} as JobSla },
  );
}

const QUEUE_AUTO_CLOSE = 'pipe-encerramento-automatico';
let queueAutoClose: Queue | null = null;
let consumerAutoClose: Worker | null = null;
let relogioAutoClose: ReturnType<typeof setInterval> | null = null;

/** Interruptor geral do encerramento automático: desligado a menos que `PIPE_ENCERRAMENTO_AUTOMATICO=1`. */
export function autoCloseEnabled(): boolean {
  return process.env['PIPE_ENCERRAMENTO_AUTOMATICO'] === '1';
}

const autoCloseIntervalMs = (): number => Number(process.env['PIPE_ENCERRAMENTO_AUTOMATICO_MS'] ?? 60_000);

/** Consome o tick de encerramento por inatividade (`domain/management/auto-close.ts`); só com o interruptor geral ligado. */
export function consumeAutoClose(): void {
  if (!autoCloseEnabled() || modo() === 'memoria' || consumerAutoClose) return;
  consumerAutoClose = new Worker(QUEUE_AUTO_CLOSE, async () => (await runAutoClose()).closed, {
    connection: redis(),
    // Um tick por vez: o lote já é limitado e a trava por conversa impede encerrar duas vezes.
    concurrency: 1,
  });
}

/** Agenda o tick (BullMQ, ou temporizador em processo no modo memória). Sem o interruptor geral, não agenda nada. */
export async function scheduleAutoClose(): Promise<void> {
  if (!autoCloseEnabled()) return;
  if (modo() === 'memoria') {
    if (relogioAutoClose) return;
    let rodando = false;
    relogioAutoClose = setInterval(() => {
      if (rodando) return;
      rodando = true;
      void runAutoClose()
        .catch((erro: unknown) => console.error(`[encerramento-automatico] tick falhou: ${(erro as Error).message}`))
        .finally(() => {
          rodando = false;
        });
    }, autoCloseIntervalMs());
    relogioAutoClose.unref();
    return;
  }
  queueAutoClose ??= new Queue(QUEUE_AUTO_CLOSE, { connection: redis() });
  await queueAutoClose.upsertJobScheduler(
    'sweep-encerramento-automatico',
    { every: autoCloseIntervalMs() },
    { name: 'varredura', data: {} },
  );
}

let queueDictionaryCrm: Queue<JobDictionaryCrm> | null = null;
let consumerDictionaryCrm: Worker | null = null;

/**
 * Queue one tenant's dictionary sync after a sweep or admin CRM-field creation. A tenant-specific `jobId` coalesces repeated requests; `removeOnComplete: true` clears the ID so future syncs are not swallowed. Memory mode skips sync because CRM is external.
 */
export async function enqueueDictionaryCrm(job: JobDictionaryCrm): Promise<boolean> {
  if (modo() === 'memoria') return false;
  queueDictionaryCrm ??= new Queue(QUEUE_DICTIONARY_CRM, { connection: redis() });
  await queueDictionaryCrm.add('sincronizar', job, {
    // Use hyphen rather than `:`; BullMQ 5 rejects `:` in custom IDs ("Custom Id cannot contain :").
    jobId: `dicionario-${job.tenantId}`,
    removeOnComplete: true,
    removeOnFail: true,
    attempts: 3,
    backoff: { type: 'exponential', delay: 30_000 },
  });
  return true;
}

/** Consume dictionary sync in `api`, which owns CRM calls, as with mirroring. */
export function consumeDictionaryCrm(): void {
  if (modo() === 'memoria' || consumerDictionaryCrm) return;
  consumerDictionaryCrm = new Worker(
    QUEUE_DICTIONARY_CRM,
    async (job) => {
      if (job.name === 'varredura') {
        const { comCrm, semCrm } = await tenantsOfDictionary();
        if (semCrm > 0) console.log(`[dicionario-crm] ${semCrm} tenant(s) sem CRM: pulado(s)`);
        for (const tenantId of comCrm) await enqueueDictionaryCrm({ tenantId });
        return comCrm.length;
      }
      const { tenantId } = job.data as JobDictionaryCrm;
      const r = await syncDictionary(tenantId);
      if (r.state === SEM_CRM) console.log(`[dicionario-crm] tenant ${tenantId} sem CRM: pulado`);
      return r;
    },
    {
      connection: redis(),
      concurrency: Number(process.env['PIPE_DICIONARIO_CRM_CONCORRENCIA'] ?? 1),
    },
  );
  consumerDictionaryCrm.on('failed', (job, erro) => {
    console.error(`[dicionario-crm] ${job?.id ?? '?'} falhou: ${erro.message}`);
  });
}

/** Hourly dictionary sweep for every tenant with CRM. */
export async function scheduleSweepDictionaryCrm(): Promise<void> {
  if (modo() === 'memoria') return;
  queueDictionaryCrm ??= new Queue(QUEUE_DICTIONARY_CRM, { connection: redis() });
  await queueDictionaryCrm.upsertJobScheduler(
    'sweep-crm-dictionary',
    { every: Number(process.env['PIPE_DICIONARIO_CRM_VARREDURA_MS'] ?? 3_600_000) },
    { name: 'varredura', data: {} as JobDictionaryCrm },
  );
}

/**
 * Daily Instagram token renewal (`dominio/instagram/renovacao.ts`) belongs in `api`, not `apps/workers`, because the API owns Meta credential calls and their domain rules.
 */
const QUEUE_INSTAGRAM_TOKEN = 'pipe-instagram-token';
let queueInstagramToken: Queue | null = null;
let consumidorInstagramToken: Worker | null = null;

export function consumeRenewalInstagram(): void {
  if (modo() === 'memoria' || consumidorInstagramToken) return;
  consumidorInstagramToken = new Worker(QUEUE_INSTAGRAM_TOKEN, () => renovarTokensInstagram(), {
    connection: redis(),
    concurrency: 1,
  });
}

export async function scheduleRenewalInstagram(): Promise<void> {
  if (modo() === 'memoria') return;
  queueInstagramToken ??= new Queue(QUEUE_INSTAGRAM_TOKEN, { connection: redis() });
  await queueInstagramToken.upsertJobScheduler(
    'instagram-token-renewal',
    { every: Number(process.env['PIPE_INSTAGRAM_RENOVACAO_MS'] ?? 86_400_000) },
    { name: 'varredura', data: {} },
  );
}

let consumerInbound: Worker<JobInbound> | null = null;

/**
 * The `api` consumes inbound jobs rather than `apps/workers` because domain rules live here (spec §3). The queue decouples the response to Meta from processing; it does not transfer ownership.
 */
export function consumeInbound(): void {
  if (modo() === 'memoria' || consumerInbound) return;
  consumerInbound = new Worker<JobInbound>(
    QUEUE_INBOUND,
    async (job) => {
      const channel = await resolveChannel(job.data.channelId);
      if (!channel) throw new Error(`canal ${job.data.channelId} sumiu entre o webhook e a fila`);
      return processarPayload(channel, job.data.payload);
    },
    {
      connection: redis(),
      concurrency: Number(process.env['PIPE_ENTRADA_CONCORRENCIA'] ?? 4),
    },
  );
}

/** `/saude` probe uses the same connection as normal work; a separate connection could report false health. */
export async function pingRedis(): Promise<string> {
  return redis().ping();
}

export interface StateOfQueue {
  queue: string;
  /** Waiting plus delayed jobs: all work not yet run, for any reason. */
  depth: number;
  /** Age of the oldest waiting job, used by `FilaParada`. */
  ageSeconds: number;
}

/**
 * Queue state at collection time. Depth alone is misleading: a large draining queue is normal at peak, while an old unmoving item indicates a stall. In memory mode return no queue metric rather than zero, which would falsely imply healthy drainage.
 */
export async function stateOfQueues(): Promise<StateOfQueue[]> {
  if (modo() === 'memoria') return [];

  const agora = Date.now();
  const alvos: [string, Queue][] = [
    [QUEUE_INBOUND, (queueInbound ??= new Queue(QUEUE_INBOUND, { connection: redis() }))],
    [QUEUE_DELIVERY, (queueDelivery ??= new Queue(QUEUE_DELIVERY, { connection: redis() }))],
    [
      QUEUE_MIRROR_CRM,
      (queueMirrorCrm ??= new Queue(QUEUE_MIRROR_CRM, { connection: redis() })),
    ],
    [
      QUEUE_DICTIONARY_CRM,
      (queueDictionaryCrm ??= new Queue(QUEUE_DICTIONARY_CRM, { connection: redis() })),
    ],
  ];

  return Promise.all(
    alvos.map(async ([nome, queue]) => {
      const [esperando, adiados, maisVelho] = await Promise.all([
        queue.getWaitingCount(),
        queue.getDelayedCount(),
        queue.getWaiting(0, 0),
      ]);
      const carimbo = maisVelho[0]?.timestamp;
      return {
        queue: nome,
        depth: esperando + adiados,
        ageSeconds: carimbo ? Math.max(0, (agora - carimbo) / 1000) : 0,
      };
    }),
  );
}

export async function closeQueues(): Promise<void> {
  await consumerInbound?.close();
  await consumidorProcessHttp?.close();
  await consumerProcessHttpSweep?.close();
  if (relogioProcessHttp) clearInterval(relogioProcessHttp);
  relogioProcessHttp = null;
  processHttpEmMemoria.length = 0;
  await consumerMirrorCrm?.close();
  await consumerDictionaryCrm?.close();
  await consumerMedia?.close();
  if (clockMedia) clearInterval(clockMedia);
  clockMedia = null;
  await consumidorSla?.close();
  if (relogioSla) clearInterval(relogioSla);
  relogioSla = null;
  await consumidorInstagramToken?.close();
  await queueInstagramToken?.close();
  consumidorInstagramToken = null;
  queueInstagramToken = null;
  await queueInbound?.close();
  await queueProcessHttp?.close();
  await queueProcessHttpSweep?.close();
  await queueDelivery?.close();
  await queueMirrorCrm?.close();
  await queueDictionaryCrm?.close();
  await queueMedia?.close();
  await queueSla?.close();
  await conexao?.quit();
  consumerInbound = null;
  consumidorProcessHttp = null;
  consumerProcessHttpSweep = null;
  consumerMirrorCrm = null;
  consumerDictionaryCrm = null;
  consumerMedia = null;
  consumidorSla = null;
  queueInbound = null;
  queueProcessHttp = null;
  queueProcessHttpSweep = null;
  queueDelivery = null;
  queueMirrorCrm = null;
  queueDictionaryCrm = null;
  queueMedia = null;
  queueSla = null;
  conexao = null;
}

let queueImport: Queue<JobImport> | null = null;

/**
 * Enqueue contact import for workers (`apps/workers/src/importacao-de-contatos.ts`). Memory mode runs inline through the same path without Redis. Otherwise the `importacao` row is authoritative: a lost job leaves a visible `pronta` import, and resubmitting does not duplicate contacts. ponytail: omit this queue from `estadoDasFilas` and `fecharFilas` (connection `quit` closes it) until `FilaParada` needs stalled-import monitoring.
 */
export async function enqueueImport(job: JobImport): Promise<void> {
  if (modo() === 'memoria') {
    await processImport(job);
    return;
  }
  queueImport ??= new Queue(QUEUE_IMPORT, { connection: redis() });
  await queueImport.add('importar', job, { removeOnComplete: 1_000, removeOnFail: 1_000 });
}
