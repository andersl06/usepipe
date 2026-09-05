import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { FILA_ENTRADA, FILA_ENTREGA, conexaoRedis } from '@pipe/workers';
import type { JobEntrada, JobEntrega } from '@pipe/workers';
import { resolverCanal } from './banco.js';
import { processarPayload } from './dominio/entrada.js';

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

export async function fecharFilas(): Promise<void> {
  await consumidorEntrada?.close();
  await filaEntrada?.close();
  await filaEntrega?.close();
  await conexao?.quit();
  consumidorEntrada = null;
  filaEntrada = null;
  filaEntrega = null;
  conexao = null;
}
