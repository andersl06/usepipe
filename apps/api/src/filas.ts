import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import {
  FILA_DICIONARIO_CRM,
  FILA_ENTRADA,
  FILA_ENTREGA,
  FILA_ESPELHO_CRM,
  FILA_MIDIA,
  conexaoRedis,
} from '@pipe/workers';
import type { JobDicionarioCrm, JobEntrada, JobEntrega, JobEspelhoCrm, JobMidia } from '@pipe/workers';
import { resolverCanal } from './banco.js';
import { SEM_CRM, sincronizarDicionario, tenantsDoDicionario } from './dominio/dicionario-crm.js';
import { processarPayload } from './dominio/entrada.js';
import { renovarTokensInstagram } from './dominio/instagram/renovacao.js';
import { contatosSemEspelho, sincronizarContato } from './dominio/espelho-crm.js';
import { baixarMidiaDoAnexo, midiasPendentes } from './dominio/midia.js';
import { FILA_IMPORTACAO, processarImportacao } from '@pipe/workers';
import type { JobImportacao } from '@pipe/workers';

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
let filaMidia: Queue<JobMidia> | null = null;

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
      //
      // Hífen, NUNCA `:`. O BullMQ 5 recusa id customizado com `:` (só aceita o formato
      // de três partes dos jobs repetidos antigos) — e como o `catch` abaixo engole o
      // erro, `espelho:<uuid>` fazia TODO enfileiramento falhar em silêncio.
      jobId: `espelho-${job.contatoId}`,
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
export async function enfileirarDownloadMidia(job: JobMidia): Promise<void> {
  if (modo() === 'memoria') return;
  try {
    filaMidia ??= new Queue(FILA_MIDIA, { connection: redis() });
    await filaMidia.add('baixar', job, {
      removeOnComplete: 1_000,
      // Um por anexo: o empurrão de agora e o da varredura, se se cruzarem, viram UM
      // job — `baixarMidiaDoAnexo` também é idempotente por conta própria (`bytes = 0`
      // na condição do `select`), então isto é só para não gastar chamada à toa.
      jobId: `midia-${job.anexoId}`,
      attempts: 1,
    });
  } catch (erro) {
    console.error(`[midia] não enfileirou ${job.anexoId}: ${(erro as Error).message}`);
  }
}

let consumidorMidia: Worker | null = null;
let relogioMidia: ReturnType<typeof setInterval> | null = null;

/**
 * Consome o download de mídia — na `api`, como o espelho e o dicionário: quem já
 * decifra o token do canal (`chaveiro`, `dominio/banco.ts`) é a `api`.
 *
 * `baixar` baixa UM anexo; `varredura` reenfileira quem ficou para trás — o reagendar
 * por backoff mora dentro de `baixarMidiaDoAnexo`, não aqui, por isso `attempts: 1`
 * acima: o BullMQ nunca precisa tentar de novo por conta própria.
 */
export function consumirDownloadMidia(): void {
  if (modo() === 'memoria' || consumidorMidia) return;
  consumidorMidia = new Worker(
    FILA_MIDIA,
    async (job) => {
      if (job.name === 'varredura') {
        const pendentes = await midiasPendentes();
        for (const p of pendentes) await enfileirarDownloadMidia(p);
        return pendentes.length;
      }
      const dados = job.data as JobMidia;
      const r = await baixarMidiaDoAnexo(dados.tenantId, dados.anexoId);
      return r.estado;
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
export async function agendarVarreduraDownloadMidia(): Promise<void> {
  if (modo() === 'memoria') {
    // Sem Redis (a demonstração na VPS roda assim), a varredura vira um relógio no
    // próprio processo — só com `PIPE_MIDIA_EM_MEMORIA=1`, para o teste continuar
    // vendo o anexo cru logo depois do webhook. O empurrão por anexo não existe
    // aqui: o intervalo curto faz o papel dele.
    if (process.env['PIPE_MIDIA_EM_MEMORIA'] !== '1' || relogioMidia) return;
    let rodando = false;
    relogioMidia = setInterval(() => {
      if (rodando) return;
      rodando = true;
      void (async () => {
        try {
          for (const p of await midiasPendentes()) await baixarMidiaDoAnexo(p.tenantId, p.anexoId);
        } catch (erro) {
          console.error(`[midia] varredura em memória falhou: ${(erro as Error).message}`);
        } finally {
          rodando = false;
        }
      })();
    }, Number(process.env['PIPE_MIDIA_VARREDURA_MS'] ?? 15_000));
    relogioMidia.unref();
    return;
  }
  filaMidia ??= new Queue(FILA_MIDIA, { connection: redis() });
  await filaMidia.upsertJobScheduler(
    'varredura-midia',
    { every: Number(process.env['PIPE_MIDIA_VARREDURA_MS'] ?? 300_000) },
    { name: 'varredura', data: {} as JobMidia },
  );
}

let filaDicionarioCrm: Queue<JobDicionarioCrm> | null = null;
let consumidorDicionarioCrm: Worker | null = null;

/**
 * Pede a sincronização do dicionário de um tenant — a varredura, ou o admin logo depois
 * de criar um campo no CRM.
 *
 * O `jobId` por tenant faz dez pedidos seguidos virarem UMA sincronização. E o job sai
 * da fila ao terminar (`removeOnComplete: true`), senão o id guardado engoliria o
 * próximo pedido. No modo memória não sincroniza, pelo motivo do espelho.
 */
export async function enfileirarDicionarioCrm(job: JobDicionarioCrm): Promise<boolean> {
  if (modo() === 'memoria') return false;
  filaDicionarioCrm ??= new Queue(FILA_DICIONARIO_CRM, { connection: redis() });
  await filaDicionarioCrm.add('sincronizar', job, {
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
export function consumirDicionarioCrm(): void {
  if (modo() === 'memoria' || consumidorDicionarioCrm) return;
  consumidorDicionarioCrm = new Worker(
    FILA_DICIONARIO_CRM,
    async (job) => {
      if (job.name === 'varredura') {
        const { comCrm, semCrm } = await tenantsDoDicionario();
        if (semCrm > 0) console.log(`[dicionario-crm] ${semCrm} tenant(s) sem CRM: pulado(s)`);
        for (const tenantId of comCrm) await enfileirarDicionarioCrm({ tenantId });
        return comCrm.length;
      }
      const { tenantId } = job.data as JobDicionarioCrm;
      const r = await sincronizarDicionario(tenantId);
      if (r.estado === SEM_CRM) console.log(`[dicionario-crm] tenant ${tenantId} sem CRM: pulado`);
      return r;
    },
    {
      connection: redis(),
      concurrency: Number(process.env['PIPE_DICIONARIO_CRM_CONCORRENCIA'] ?? 1),
    },
  );
  consumidorDicionarioCrm.on('failed', (job, erro) => {
    console.error(`[dicionario-crm] ${job?.id ?? '?'} falhou: ${erro.message}`);
  });
}

/** A varredura periódica do dicionário: de hora em hora, todo tenant com CRM. */
export async function agendarVarreduraDicionarioCrm(): Promise<void> {
  if (modo() === 'memoria') return;
  filaDicionarioCrm ??= new Queue(FILA_DICIONARIO_CRM, { connection: redis() });
  await filaDicionarioCrm.upsertJobScheduler(
    'varredura-dicionario-crm',
    { every: Number(process.env['PIPE_DICIONARIO_CRM_VARREDURA_MS'] ?? 3_600_000) },
    { name: 'varredura', data: {} as JobDicionarioCrm },
  );
}

/**
 * A renovação diária do token do Instagram (`dominio/instagram/renovacao.ts`). Na
 * `api`, e não em `apps/workers`, pela regra do espelho: quem fala com a Meta para
 * mexer em credencial é a `api`, e é aqui que mora a regra.
 */
const FILA_INSTAGRAM_TOKEN = 'pipe-instagram-token';
let filaInstagramToken: Queue | null = null;
let consumidorInstagramToken: Worker | null = null;

export function consumirRenovacaoInstagram(): void {
  if (modo() === 'memoria' || consumidorInstagramToken) return;
  consumidorInstagramToken = new Worker(FILA_INSTAGRAM_TOKEN, () => renovarTokensInstagram(), {
    connection: redis(),
    concurrency: 1,
  });
}

export async function agendarRenovacaoInstagram(): Promise<void> {
  if (modo() === 'memoria') return;
  filaInstagramToken ??= new Queue(FILA_INSTAGRAM_TOKEN, { connection: redis() });
  await filaInstagramToken.upsertJobScheduler(
    'renovacao-token-instagram',
    { every: Number(process.env['PIPE_INSTAGRAM_RENOVACAO_MS'] ?? 86_400_000) },
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
    [
      FILA_DICIONARIO_CRM,
      (filaDicionarioCrm ??= new Queue(FILA_DICIONARIO_CRM, { connection: redis() })),
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
  await consumidorDicionarioCrm?.close();
  await consumidorMidia?.close();
  if (relogioMidia) clearInterval(relogioMidia);
  relogioMidia = null;
  await consumidorInstagramToken?.close();
  await filaInstagramToken?.close();
  consumidorInstagramToken = null;
  filaInstagramToken = null;
  await filaEntrada?.close();
  await filaEntrega?.close();
  await filaEspelhoCrm?.close();
  await filaDicionarioCrm?.close();
  await filaMidia?.close();
  await conexao?.quit();
  consumidorEntrada = null;
  consumidorEspelhoCrm = null;
  consumidorDicionarioCrm = null;
  consumidorMidia = null;
  filaEntrada = null;
  filaEntrega = null;
  filaEspelhoCrm = null;
  filaDicionarioCrm = null;
  filaMidia = null;
  conexao = null;
}

let filaImportacao: Queue<JobImportacao> | null = null;

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
export async function enfileirarImportacao(job: JobImportacao): Promise<void> {
  if (modo() === 'memoria') {
    await processarImportacao(job);
    return;
  }
  filaImportacao ??= new Queue(FILA_IMPORTACAO, { connection: redis() });
  await filaImportacao.add('importar', job, { removeOnComplete: 1_000, removeOnFail: 1_000 });
}
