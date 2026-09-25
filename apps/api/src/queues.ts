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
import { executarProcessHttp } from './domain/flow.js';
import { renovarTokensInstagram } from './domain/instagram/renewal.js';
import { contactsWithoutMirror, syncContact } from './domain/mirror-crm.js';
import { baixarMediaOfAttachment, midiasPendentes } from './domain/media.js';
import { checarSlaOfConversation, conversationsForChecarSla } from './domain/management/sla-motor.js';
import { QUEUE_IMPORT, processarImport } from '@pipe/workers';
import type { JobImport } from '@pipe/workers';

/**
 * A API só empurra trabalho para a fila; quem executa é `apps/workers`.
 *
 * `PIPE_FILAS=memoria` roda a entrada **em linha**, sem Redis. Serve ao ambiente de
 * desenvolvimento e ao teste de ponta a ponta, e não é um atalho: o caminho
 * percorrido é o mesmo, só sem o salto pelo Redis.
 *
 * A entrega nunca é executada em linha, nem no modo memória. A verdade da entrega é
 * a linha em `outbox_mensagem`; a fila é só o empurrão para o worker olhar agora em
 * vez de na próxima varredura.
 */

export type ModoQueue = 'bullmq' | 'memoria';

export function modo(): ModoQueue {
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

function redis(): IORedis {
  conexao ??= new IORedis(conexaoRedis().url, { maxRetriesPerRequest: null });
  return conexao;
}

/**
 * A Meta reenvia o evento se a resposta demorar. Por isso o webhook responde 200 e
 * o processamento vai para a fila — nunca o contrário.
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

export async function scheduleSweepProcessHttp(): Promise<void> {
  if (modo() !== 'memoria' || process.env['PIPE_PROCESS_HTTP_EM_MEMORIA'] !== '1' || relogioProcessHttp) return;
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
}

export async function enqueueDelivery(job: JobDelivery): Promise<void> {
  if (modo() === 'memoria') return;
  queueDelivery ??= new Queue(QUEUE_DELIVERY, { connection: redis() });
  await queueDelivery.add('entrega', job, { removeOnComplete: 1_000 });
}

/**
 * Empurra um contato para o espelho no CRM.
 *
 * Falhar aqui **não pode derrubar o atendimento**: uma mensagem que chegou vale mais
 * que o espelho dela no CRM, e a varredura recupera o que não entrou. Por isso o erro
 * é registrado e engolido em vez de propagado.
 *
 * No modo memória não espelha: a integração fala com um serviço externo, e o modo
 * memória existe justamente para rodar sem serviço externo nenhum.
 */
export async function enqueueMirrorCrm(job: JobMirrorCrm): Promise<void> {
  if (modo() === 'memoria') return;
  try {
    queueMirrorCrm ??= new Queue(QUEUE_MIRROR_CRM, { connection: redis() });
    await queueMirrorCrm.add('espelhar', job, {
      removeOnComplete: 1_000,
      // Um contato por vez, e o mesmo id de job: se a conversa mudar o contato três
      // vezes em segundos, isso vira UM espelho, não três corridas concorrentes
      // escrevendo no mesmo registro do CRM.
      //
      // Hífen, NUNCA `:`. O BullMQ 5 recusa id customizado com `:` (só aceita o formato
      // de três partes dos jobs repetidos antigos) — e como o `catch` abaixo engole o
      // erro, `espelho:<uuid>` fazia TODO enfileiramento falhar em silêncio.
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
 * Consome o espelho do CRM — na `api`, e não em `apps/workers`, pelo mesmo motivo da
 * `pipe-entrada`: **quem fala com serviço externo é a `api`**, regra do dono.
 *
 * Dois tipos de job na mesma fila, como na entrega: `espelhar` faz um contato, e
 * `varredura` reenfileira quem ficou para trás. A varredura existe porque a fila pode
 * perder job e o contato não pode ficar sem link para a ficha.
 */
export function consumeMirrorCrm(): void {
  if (modo() === 'memoria' || consumerMirrorCrm) return;
  consumerMirrorCrm = new Worker(
    QUEUE_MIRROR_CRM,
    async (job) => {
      if (job.name === 'varredura') {
        const pendentes = await contactsWithoutMirror();
        // Em série: o objetivo é reenfileirar, não competir com o próprio consumidor.
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

/** A varredura de segurança do espelho. Ver `contatosSemEspelho`. */
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
 * Empurra o download da mídia de um anexo recebido (`dominio/midia.ts`).
 *
 * Mesma regra do espelho no CRM: falhar aqui **não pode derrubar o atendimento** — a
 * mensagem já chegou e está na tela, mesmo sem a mídia baixada ainda. O erro é
 * engolido, e a varredura periódica recupera o que não entrou.
 *
 * No modo memória não baixa: o download fala com a Meta, e o modo memória existe
 * para rodar sem serviço externo nenhum — quem quiser testar o download de verdade
 * chama `baixarMidiaDoAnexo` direto, como faz `tests/midia-recebida.test.ts`.
 */
export async function enqueueDownloadMedia(job: JobMedia): Promise<void> {
  if (modo() === 'memoria') return;
  try {
    queueMedia ??= new Queue(QUEUE_MEDIA, { connection: redis() });
    await queueMedia.add('baixar', job, {
      removeOnComplete: 1_000,
      // Um por anexo: o empurrão de agora e o da varredura, se se cruzarem, viram UM
      // job — `baixarMidiaDoAnexo` também é idempotente por conta própria (`bytes = 0`
      // na condição do `select`), então isto é só para não gastar chamada à toa.
      jobId: `midia-${job.attachmentId}`,
      attempts: 1,
    });
  } catch (erro) {
    console.error(`[midia] não enfileirou ${job.attachmentId}: ${(erro as Error).message}`);
  }
}

let consumerMedia: Worker | null = null;
let relogioMedia: ReturnType<typeof setInterval> | null = null;

/**
 * Consome o download de mídia — na `api`, como o espelho e o dicionário: quem já
 * decifra o token do canal (`chaveiro`, `dominio/banco.ts`) é a `api`.
 *
 * `baixar` baixa UM anexo; `varredura` reenfileira quem ficou para trás — o reagendar
 * por backoff mora dentro de `baixarMidiaDoAnexo`, não aqui, por isso `attempts: 1`
 * acima: o BullMQ nunca precisa tentar de novo por conta própria.
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
      const r = await baixarMediaOfAttachment(dados.tenantId, dados.attachmentId);
      return r.state;
    },
    {
      connection: redis(),
      concurrency: Number(process.env['PIPE_MIDIA_CONCORRENCIA'] ?? 4),
    },
  );
}

/**
 * A varredura de segurança do download de mídia. Ver `midiasPendentes`.
 *
 * ponytail: a fila não entra em `estadoDasFilas` — entra quando o alerta
 * `FilaParada` precisar olhar mídia sem baixar, mesma dívida já anotada para a
 * `pipe-importacao` (mais abaixo neste arquivo).
 */
export async function scheduleSweepDownloadMedia(): Promise<void> {
  if (modo() === 'memoria') {
    // Sem Redis (a demonstração na VPS roda assim), a varredura vira um relógio no
    // próprio processo — só com `PIPE_MIDIA_EM_MEMORIA=1`, para o teste continuar
    // vendo o anexo cru logo depois do webhook. O empurrão por anexo não existe
    // aqui: o intervalo curto faz o papel dele.
    if (process.env['PIPE_MIDIA_EM_MEMORIA'] !== '1' || relogioMedia) return;
    let rodando = false;
    relogioMedia = setInterval(() => {
      if (rodando) return;
      rodando = true;
      void (async () => {
        try {
          for (const p of await midiasPendentes()) await baixarMediaOfAttachment(p.tenantId, p.attachmentId);
        } catch (erro) {
          console.error(`[midia] varredura em memória falhou: ${(erro as Error).message}`);
        } finally {
          rodando = false;
        }
      })();
    }, Number(process.env['PIPE_MIDIA_VARREDURA_MS'] ?? 15_000));
    relogioMedia.unref();
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
 * Empurra a checagem de SLA de uma conversa (`dominio/gestao/sla-motor.ts`).
 *
 * Mesma regra do espelho e da mídia: falhar aqui não pode derrubar quem mandou a
 * mensagem — o erro é engolido, e a varredura periódica pega a conversa nesta
 * mesma passada ou na próxima.
 *
 * No modo memória não empurra: quem quiser o relógio rodando em teste/dev liga
 * `PIPE_SLA_EM_MEMORIA=1` (ver `agendarVarreduraSla`), que varre direto sem fila —
 * mesmo desenho do `PIPE_MIDIA_EM_MEMORIA`.
 */
export async function enqueueCheckSla(job: JobSla): Promise<void> {
  if (modo() === 'memoria') return;
  try {
    queueSla ??= new Queue(QUEUE_SLA, { connection: redis() });
    await queueSla.add('checar', job, {
      removeOnComplete: 1_000,
      // Uma checagem pendente por conversa: um empurrão a mais enquanto a anterior
      // ainda não rodou vira UM job, não dois competindo pela mesma linha.
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
 * Consome a checagem de SLA — na `api`, como a mídia e o espelho: quem já tem a
 * regra de domínio (`sla-motor.ts`) e fala com o webhook de saída é a `api`.
 *
 * `checar` decide alerta/estouro de UMA conversa; `varredura` reenfileira quem
 * ficou para trás — mesmos dois nomes de job da mídia.
 */
export function consumeCheckSla(): void {
  if (modo() === 'memoria' || consumidorSla) return;
  consumidorSla = new Worker(
    QUEUE_SLA,
    async (job) => {
      if (job.name === 'varredura') {
        const pendentes = await conversationsForChecarSla();
        for (const p of pendentes) await enqueueCheckSla(p);
        return pendentes.length;
      }
      const dados = job.data as JobSla;
      await checarSlaOfConversation(dados.tenantId, dados.conversationId);
    },
    {
      connection: redis(),
      concurrency: Number(process.env['PIPE_SLA_CONCORRENCIA'] ?? 4),
    },
  );
}

/**
 * A varredura de segurança do relógio de SLA. Ver `conversasParaChecarSla`.
 *
 * ponytail: a fila não entra em `estadoDasFilas` — mesma dívida já anotada para a
 * `pipe-midia` e a `pipe-importacao` (mais abaixo neste arquivo).
 */
export async function scheduleSweepSla(): Promise<void> {
  if (modo() === 'memoria') {
    // Sem Redis, a varredura vira um relógio no próprio processo — só com
    // `PIPE_SLA_EM_MEMORIA=1`, para o teste de ponta a ponta ver alerta/estouro
    // acontecer sem precisar enfileirar nada. Mesmo desenho do `PIPE_MIDIA_EM_MEMORIA`.
    if (process.env['PIPE_SLA_EM_MEMORIA'] !== '1' || relogioSla) return;
    let rodando = false;
    relogioSla = setInterval(() => {
      if (rodando) return;
      rodando = true;
      void (async () => {
        try {
          for (const p of await conversationsForChecarSla()) {
            await checarSlaOfConversation(p.tenantId, p.conversationId);
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

let queueDictionaryCrm: Queue<JobDictionaryCrm> | null = null;
let consumerDictionaryCrm: Worker | null = null;

/**
 * Pede a sincronização do dicionário de um tenant — a varredura, ou o admin logo depois
 * de criar um campo no CRM.
 *
 * O `jobId` por tenant faz dez pedidos seguidos virarem UMA sincronização. E o job sai
 * da fila ao terminar (`removeOnComplete: true`), senão o id guardado engoliria o
 * próximo pedido. No modo memória não sincroniza, pelo motivo do espelho.
 */
export async function enqueueDictionaryCrm(job: JobDictionaryCrm): Promise<boolean> {
  if (modo() === 'memoria') return false;
  queueDictionaryCrm ??= new Queue(QUEUE_DICTIONARY_CRM, { connection: redis() });
  await queueDictionaryCrm.add('sincronizar', job, {
    // Hífen, não `:` — o BullMQ 5 recusa `:` no id customizado ("Custom Id cannot contain :").
    jobId: `dicionario-${job.tenantId}`,
    removeOnComplete: true,
    removeOnFail: true,
    attempts: 3,
    backoff: { type: 'exponential', delay: 30_000 },
  });
  return true;
}

/** Consome o dicionário — na `api`, como o espelho: quem fala com o CRM é a `api`. */
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

/** A varredura periódica do dicionário: de hora em hora, todo tenant com CRM. */
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
 * A renovação diária do token do Instagram (`dominio/instagram/renovacao.ts`). Na
 * `api`, e não em `apps/workers`, pela regra do espelho: quem fala com a Meta para
 * mexer em credencial é a `api`, e é aqui que mora a regra.
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
 * Quem consome a fila de entrada é a própria `api`, e não `apps/workers`: a regra de
 * domínio mora aqui (§3 da spec, "api … dono das regras de domínio"). A fila serve
 * para desacoplar a **resposta** à Meta do processamento, não para mudar de dono.
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

/** Sonda do `/saude`. Usa a MESMA conexão do resto: sonda em canal próprio mente. */
export async function pingRedis(): Promise<string> {
  return redis().ping();
}

export interface StateOfQueue {
  queue: string;
  /** Esperando mais adiado: o que ainda não rodou, sob qualquer motivo. */
  depth: number;
  /** Idade do item mais antigo ainda esperando. É o número do alerta `FilaParada`. */
  ageSeconds: number;
}

/**
 * O estado das filas no instante da coleta.
 *
 * Profundidade sozinha engana — fila grande escoando é hora cheia normal. O que
 * dói, e o que o alerta olha, é o item mais velho não sair.
 *
 * No modo memória não há fila: devolve vazio, e a métrica some da coleta em vez de
 * virar um zero que parece "tudo escoando".
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
  if (relogioProcessHttp) clearInterval(relogioProcessHttp);
  relogioProcessHttp = null;
  processHttpEmMemoria.length = 0;
  await consumerMirrorCrm?.close();
  await consumerDictionaryCrm?.close();
  await consumerMedia?.close();
  if (relogioMedia) clearInterval(relogioMedia);
  relogioMedia = null;
  await consumidorSla?.close();
  if (relogioSla) clearInterval(relogioSla);
  relogioSla = null;
  await consumidorInstagramToken?.close();
  await queueInstagramToken?.close();
  consumidorInstagramToken = null;
  queueInstagramToken = null;
  await queueInbound?.close();
  await queueProcessHttp?.close();
  await queueDelivery?.close();
  await queueMirrorCrm?.close();
  await queueDictionaryCrm?.close();
  await queueMedia?.close();
  await queueSla?.close();
  await conexao?.quit();
  consumerInbound = null;
  consumidorProcessHttp = null;
  consumerMirrorCrm = null;
  consumerDictionaryCrm = null;
  consumerMedia = null;
  consumidorSla = null;
  queueInbound = null;
  queueProcessHttp = null;
  queueDelivery = null;
  queueMirrorCrm = null;
  queueDictionaryCrm = null;
  queueMedia = null;
  queueSla = null;
  conexao = null;
}

let queueImport: Queue<JobImport> | null = null;

/**
 * Empurra uma importação de contatos para os workers
 * (`apps/workers/src/importacao-de-contatos.ts`).
 *
 * No modo memória roda em linha, como a entrada: o caminho é o mesmo, sem o
 * salto pelo Redis. Fora dele, a verdade é a linha em `importacao`; perder o job
 * deixa a importação em `pronta`, visível na tela, e reenviar o arquivo não
 * duplica contato.
 *
 * ponytail: a fila não entra em `estadoDasFilas` nem em `fecharFilas` (o `quit`
 * da conexão já a encerra). Entra quando o alerta `FilaParada` precisar olhar
 * importação parada.
 */
export async function enqueueImport(job: JobImport): Promise<void> {
  if (modo() === 'memoria') {
    await processarImport(job);
    return;
  }
  queueImport ??= new Queue(QUEUE_IMPORT, { connection: redis() });
  await queueImport.add('importar', job, { removeOnComplete: 1_000, removeOnFail: 1_000 });
}
