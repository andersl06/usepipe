import type { NextFunction, Request, Response } from 'express';
import { stateOfQueues } from './queues.js';
import { migrationsPendentes } from './saude.js';

/**
 * Métricas em formato Prometheus, escritas à mão.
 *
 * Sem `prom-client` de propósito: o que os alertas de `infra/observability/alertas.yml`
 * pedem são dois contadores, um histograma e três medidores. O formato de exposição é
 * texto de uma linha por série — cabe no arquivo, e uma dependência a menos é uma
 * dependência a menos para atualizar, auditar e carregar na imagem.
 *
 * O que sai daqui, e por que cada um existe:
 *
 * - `http_request_duration_seconds` (histograma) — o nome é o padrão porque o alerta
 *   `LatenciaDaApiAlta` usa exatamente `http_request_duration_seconds_bucket`.
 * - `pipe_http_requests_total{rota,metodo,status}` — volume e taxa de erro por rota.
 * - `pipe_message_delivery_total{canal,resultado}` — o alerta `EntregaFalhando`.
 * - `pipe_queue_depth{fila}` e `pipe_queue_oldest_item_age_seconds{fila}` —
 *   o alerta `FilaParada` olha a idade, não a profundidade: fila grande escoando é
 *   hora cheia; item velho parado é fila travada.
 * - `pipe_migration_pending` — o alerta `MigrationPendente`.
 *
 * Cardinalidade: o rótulo `rota` é o PADRÃO da rota (`/v1/conversas/:id/mensagens`),
 * nunca o caminho com o uuid dentro. Caminho cru vira uma série por conversa e mata
 * o Prometheus em uma tarde.
 */

type Rotulos = Record<string, string>;

/** Baldes em segundos. O alerta corta em p95 > 1,5s, então o 1 e o 2,5 cercam o corte. */
export const BALDES_SEGUNDOS = [0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10] as const;

interface Contador {
  name: string;
  rotulos: Rotulos;
  value: number;
}

interface Histograma {
  name: string;
  rotulos: Rotulos;
  /** Contagem por balde, já acumulada — é o que o formato `le` exige. */
  baldes: number[];
  soma: number;
  count: number;
}

const AJUDA: Record<string, string> = {
  http_request_duration_seconds: 'Duração da requisição HTTP, em segundos',
  pipe_http_requests_total: 'Requisições HTTP concluídas, por rota, método e status',
  pipe_message_delivery_total: 'Desfechos de entrega recebidos do provedor, por canal',
  pipe_queue_depth: 'Jobs esperando ou adiados na fila',
  pipe_queue_oldest_item_age_seconds: 'Idade do job mais antigo ainda esperando',
  pipe_migration_pending: 'Migrations no repositório que ainda não foram aplicadas',
};

const contadores = new Map<string, Contador>();
const histogramas = new Map<string, Histograma>();

function key(nome: string, rotulos: Rotulos): string {
  const partes = Object.keys(rotulos)
    .sort()
    .map((k) => `${k}=${rotulos[k] ?? ''}`);
  return `${nome}|${partes.join(',')}`;
}

export function contar(nome: string, rotulos: Rotulos = {}, delta = 1): void {
  const k = key(nome, rotulos);
  const atual = contadores.get(k);
  if (atual) atual.value += delta;
  else contadores.set(k, { name: nome, rotulos, value: delta });
}

export function watch(nome: string, rotulos: Rotulos, valor: number): void {
  const k = key(nome, rotulos);
  let histograma = histogramas.get(k);
  if (!histograma) {
    histograma = { nome, rotulos, baldes: BALDES_SEGUNDOS.map(() => 0), soma: 0, count: 0 };
    histogramas.set(k, histograma);
  }
  histograma.soma += valor;
  histograma.count += 1;
  // Somar em TODO balde cujo teto alcança o valor é o que deixa a contagem
  // acumulada, que é como o Prometheus lê `le`.
  BALDES_SEGUNDOS.forEach((teto, i) => {
    if (valor <= teto) histograma.baldes[i] = (histograma.baldes[i] ?? 0) + 1;
  });
}

/**
 * Mede toda requisição, inclusive as que não casam com rota nenhuma.
 *
 * Fica em middleware, e não em interceptor do Nest, justamente por isso: o 404 e o
 * corpo grande demais nunca chegam a um controlador, e são exatamente os dois
 * sintomas que a gente quer ver no gráfico.
 */
export function medirRequest(
  requisicao: Request,
  resposta: Response,
  seguir: NextFunction,
): void {
  const inicio = process.hrtime.bigint();
  resposta.on('finish', () => {
    const segundos = Number(process.hrtime.bigint() - inicio) / 1e9;
    const rota = rotaDe(requisicao);
    contar('pipe_http_requests_total', {
      rota,
      metodo: requisicao.method,
      status: String(resposta.statusCode),
    });
    watch('http_request_duration_seconds', { rota, metodo: requisicao.method }, segundos);
  });
  seguir();
}

function rotaDe(request: Request): string {
  const caminho = (request as Request & { route?: { path?: string } }).route?.path;
  // `desconhecida` em vez do caminho cru: sem rota casada, o caminho é entrada do
  // cliente, e entrada do cliente como rótulo é cardinalidade sem teto.
  return caminho ?? 'desconhecida';
}

function escapar(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

function serie(nome: string, rotulos: Rotulos, valor: number): string {
  const pares = Object.entries(rotulos).map(([k, v]) => `${k}="${escapar(v)}"`);
  return `${nome}${pares.length ? `{${pares.join(',')}}` : ''} ${valor}\n`;
}

function cabecalho(nome: string, tipo: string): string {
  const ajuda = AJUDA[nome];
  return `${ajuda ? `# HELP ${nome} ${ajuda}\n` : ''}# TYPE ${nome} ${tipo}\n`;
}

/** Medidores: valem só no instante da coleta, então são lidos aqui e não guardados. */
async function medidores(): Promise<string> {
  let texto = '';

  const queues = await stateOfQueues();
  if (queues.length > 0) {
    texto += cabecalho('pipe_queue_depth', 'gauge');
    for (const f of queues) texto += serie('pipe_queue_depth', { fila: f.queue }, f.depth);
    texto += cabecalho('pipe_queue_oldest_item_age_seconds', 'gauge');
    for (const f of queues) {
      texto += serie('pipe_queue_oldest_item_age_seconds', { fila: f.queue }, f.ageSeconds);
    }
  }

  const pendentes = await migrationsPendentes();
  if (pendentes !== null) {
    texto += cabecalho('pipe_migration_pending', 'gauge');
    texto += serie('pipe_migration_pending', {}, pendentes);
  }

  return texto;
}

export async function renderizar(): Promise<string> {
  let texto = '';

  for (const nome of [...new Set([...contadores.values()].map((c) => c.name))].sort()) {
    texto += cabecalho(nome, 'counter');
    for (const c of contadores.values()) {
      if (c.name === nome) texto += serie(nome, c.rotulos, c.value);
    }
  }

  for (const nome of [...new Set([...histogramas.values()].map((h) => h.name))].sort()) {
    texto += cabecalho(nome, 'histogram');
    for (const h of histogramas.values()) {
      if (h.name !== nome) continue;
      BALDES_SEGUNDOS.forEach((teto, i) => {
        texto += serie(`${nome}_bucket`, { ...h.rotulos, le: String(teto) }, h.baldes[i] ?? 0);
      });
      texto += serie(`${nome}_bucket`, { ...h.rotulos, le: '+Inf' }, h.count);
      texto += serie(`${nome}_sum`, h.rotulos, h.soma);
      texto += serie(`${nome}_count`, h.rotulos, h.count);
    }
  }

  return texto + (await medidores());
}
