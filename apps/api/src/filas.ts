import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { FILA_ENTRADA, FILA_ENTREGA, FILA_ESPELHO_CRM, conexaoRedis } from '@pipe/workers';
import type { JobEntrada, JobEntrega, JobEspelhoCrm } from '@pipe/workers';
import { resolverCanal } from './banco.js';
import { processarPayload } from './dominio/entrada.js';
import { contatosSemEspelho, sincronizarContato } from './dominio/espelho-crm.js';

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

export type ModoFila = 'bullmq' | 'memoria';

export function modo(): ModoFila {
  return process.env['PIPE_FILAS'] === 'memoria' ? 'memoria' : 'bullmq';
}

let conexao: IORedis | null = null;
let filaEntrada: Queue | null = null;
let filaEntrega: Queue<JobEntrega> | null = null;
let filaEspelhoCrm: Queue | null = null;

function redis(): IORedis {
  conexao ??= new IORedis(conexaoRedis().url, { maxRetriesPerRequest: null });
  return conexao;
}

/**
 * A Meta reenvia o evento se a resposta demorar. Por isso o webhook responde 200 e
 * o processamento vai para a fila — nunca o contrário.
 */
export async function enfileirarEntrada(canalId: string, payload: unknown): Promise<void> {
  if (modo() === 'memoria') {
    const canal = await resolverCanal(canalId);
    if (canal) await processarPayload(canal, payload);
    return;
  }
  filaEntrada ??= new Queue(FILA_ENTRADA, { connection: redis() });
  await filaEntrada.add('entrada', { canalId, payload }, { removeOnComplete: 1_000 });
}

export async function enfileirarEntrega(job: JobEntrega): Promise<void> {
  if (modo() === 'memoria') return;
  filaEntrega ??= new Queue(FILA_ENTREGA, { connection: redis() });
  await filaEntrega.add('entrega', job, { removeOnComplete: 1_000 });
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
export async function enfileirarEspelhoCrm(job: JobEspelhoCrm): Promise<void> {
  if (modo() === 'memoria') return;
  try {
    filaEspelhoCrm ??= new Queue(FILA_ESPELHO_CRM, { connection: redis() });
    await filaEspelhoCrm.add('espelhar', job, {
      removeOnComplete: 1_000,
      // Um contato por vez, e o mesmo id de job: se a conversa mudar o contato três
      // vezes em segundos, isso vira UM espelho, não três corridas concorrentes
      // escrevendo no mesmo registro do CRM.
      jobId: `espelho:${job.contatoId}`,
      attempts: 5,
      backoff: { type: 'exponential', delay: 5_000 },
    });
  } catch (erro) {
    console.error(`[espelho-crm] não enfileirou ${job.contatoId}: ${(erro as Error).message}`);
  }
}

let consumidorEspelhoCrm: Worker | null = null;

/**
 * Consome o espelho do CRM — na `api`, e não em `apps/workers`, pelo mesmo motivo da
 * `pipe-entrada`: **quem fala com serviço externo é a `api`**, regra do dono.
 *
 * Dois tipos de job na mesma fila, como na entrega: `espelhar` faz um contato, e
 * `varredura` reenfileira quem ficou para trás. A varredura existe porque a fila pode
 * perder job e o contato não pode ficar sem link para a ficha.
 */
export function consumirEspelhoCrm(): void {
  if (modo() === 'memoria' || consumidorEspelhoCrm) return;
  consumidorEspelhoCrm = new Worker(
    FILA_ESPELHO_CRM,
    async (job) => {
      if (job.name === 'varredura') {
        const pendentes = await contatosSemEspelho();
        // Em série: o objetivo é reenfileirar, não competir com o próprio consumidor.
        for (const p of pendentes) await enfileirarEspelhoCrm(p);
        return pendentes.length;
      }
      const dados = job.data as JobEspelhoCrm;
      const r = await sincronizarContato(dados.tenantId, dados.contatoId);
      return r.estado;
    },
    {
      connection: redis(),
      concurrency: Number(process.env['PIPE_ESPELHO_CRM_CONCORRENCIA'] ?? 2),
    },
  );
}

/** A varredura de segurança do espelho. Ver `contatosSemEspelho`. */
export async function agendarVarreduraEspelhoCrm(): Promise<void> {
  if (modo() === 'memoria') return;
  filaEspelhoCrm ??= new Queue(FILA_ESPELHO_CRM, { connection: redis() });
  await filaEspelhoCrm.upsertJobScheduler(
    'varredura-espelho-crm',
    { every: Number(process.env['PIPE_ESPELHO_CRM_VARREDURA_MS'] ?? 300_000) },
    { name: 'varredura', data: {} },
  );
}

let consumidorEntrada: Worker<JobEntrada> | null = null;

/**
 * Quem consome a fila de entrada é a própria `api`, e não `apps/workers`: a regra de
 * domínio mora aqui (§3 da spec, "api … dono das regras de domínio"). A fila serve
 * para desacoplar a **resposta** à Meta do processamento, não para mudar de dono.
 */
export function consumirEntrada(): void {
  if (modo() === 'memoria' || consumidorEntrada) return;
  consumidorEntrada = new Worker<JobEntrada>(
    FILA_ENTRADA,
    async (job) => {
      const canal = await resolverCanal(job.data.canalId);
      if (!canal) throw new Error(`canal ${job.data.canalId} sumiu entre o webhook e a fila`);
      return processarPayload(canal, job.data.payload);
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

export interface EstadoDaFila {
  fila: string;
  /** Esperando mais adiado: o que ainda não rodou, sob qualquer motivo. */
  profundidade: number;
  /** Idade do item mais antigo ainda esperando. É o número do alerta `FilaParada`. */
  idadeSegundos: number;
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
export async function estadoDasFilas(): Promise<EstadoDaFila[]> {
  if (modo() === 'memoria') return [];

  const agora = Date.now();
  const alvos: [string, Queue][] = [
    [FILA_ENTRADA, (filaEntrada ??= new Queue(FILA_ENTRADA, { connection: redis() }))],
    [FILA_ENTREGA, (filaEntrega ??= new Queue(FILA_ENTREGA, { connection: redis() }))],
    [
      FILA_ESPELHO_CRM,
      (filaEspelhoCrm ??= new Queue(FILA_ESPELHO_CRM, { connection: redis() })),
    ],
  ];

  return Promise.all(
    alvos.map(async ([nome, fila]) => {
      const [esperando, adiados, maisVelho] = await Promise.all([
        fila.getWaitingCount(),
        fila.getDelayedCount(),
        fila.getWaiting(0, 0),
      ]);
      const carimbo = maisVelho[0]?.timestamp;
      return {
        fila: nome,
        profundidade: esperando + adiados,
        idadeSegundos: carimbo ? Math.max(0, (agora - carimbo) / 1000) : 0,
      };
    }),
  );
}

export async function fecharFilas(): Promise<void> {
  await consumidorEntrada?.close();
  await consumidorEspelhoCrm?.close();
  await filaEntrada?.close();
  await filaEntrega?.close();
  await filaEspelhoCrm?.close();
  await conexao?.quit();
  consumidorEntrada = null;
  consumidorEspelhoCrm = null;
  filaEntrada = null;
  filaEntrega = null;
  filaEspelhoCrm = null;
  conexao = null;
}
