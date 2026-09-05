import { createHmac, randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { TransacaoPipe } from '@pipe/db';
import { noTenant } from './banco.js';

/**
 * Webhooks de saída — `apis.md` §5.5.
 *
 * Assinatura `X-Pipe-Signature: sha256=HMAC-SHA256(segredo, "<timestamp>.<corpo>")`,
 * com `X-Pipe-Timestamp` e `X-Pipe-Delivery` ao lado. O timestamp entra **dentro**
 * do que é assinado: assinar só o corpo deixa o replay de graça, que é uma das duas
 * lacunas encontradas no Chatwoot. A outra — segredo opcional — o schema já fecha:
 * `webhook_saida.segredo` é `not null`.
 *
 * `entrega_webhook` guarda tentativa e erro. Webhook que falha em silêncio é a mesma
 * doença do envio que falha em silêncio.
 */

export const EVENTOS = [
  'conversa.criada',
  'conversa.estado_alterado',
  'conversa.atribuida',
  'conversa.encerrada',
  'mensagem.criada',
  'mensagem.estado_entrega_alterado',
  'contato.criado',
] as const;

export type EventoWebhook = (typeof EVENTOS)[number];

export const MAX_TENTATIVAS_WEBHOOK = Number(process.env['PIPE_WEBHOOK_MAX_TENTATIVAS'] ?? 5);
const TEMPO_LIMITE_MS = Number(process.env['PIPE_WEBHOOK_TIMEOUT_MS'] ?? 5_000);
/** Tolerância recomendada ao consumidor, publicada junto do payload. */
export const TOLERANCIA_REPLAY_SEG = 300;

export function assinar(segredo: string, timestamp: string, corpo: string): string {
  return `sha256=${createHmac('sha256', segredo).update(`${timestamp}.${corpo}`).digest('hex')}`;
}

/**
 * Enfileira o evento para todos os webhooks ativos que o assinam.
 *
 * Roda **dentro** da transação do fato que a originou: ou o fato e o evento entram
 * juntos, ou nenhum dos dois entra. Entregar é outro passo, fora da transação.
 */
export async function emitir(
  tx: TransacaoPipe,
  tenantId: string,
  evento: EventoWebhook,
  dados: Record<string, unknown>,
): Promise<number> {
  const { rows: assinantes } = await tx.execute<{ id: string }>(sql`
    select id from webhook_saida
     where ativo and ${evento} = any(eventos)
  `);
  if (assinantes.length === 0) return 0;

  const payload = {
    event: evento,
    delivery_id: randomUUID(),
    tenant_id: tenantId,
    occurred_at: new Date().toISOString(),
    data: dados,
  };

  // Em série: `Promise.all` dentro da transação derruba o tenant da sessão.
  for (const assinante of assinantes) {
    await tx.execute(sql`
      insert into entrega_webhook (tenant_id, webhook_id, evento, payload, estado)
      values (${tenantId}, ${assinante.id}, ${evento}, ${JSON.stringify(payload)}::jsonb, 'pendente')
    `);
  }
  return assinantes.length;
}

export interface ResultadoEntregaWebhook {
  id: string;
  estado: 'entregue' | 'pendente' | 'descartada';
  erro?: string;
}

type LinhaEntrega = {
  id: string;
  url: string;
  segredo: string;
  payload: unknown;
  tentativas: number;
};

/**
 * Drena as entregas pendentes de um tenant. Chamada depois do commit da operação e
 * também por varredura periódica — a entrega precisa acontecer mesmo que o processo
 * que a originou tenha morrido entre o commit e o POST.
 */
export async function entregarPendentes(
  tenantId: string,
  lote = 20,
): Promise<ResultadoEntregaWebhook[]> {
  const pendentes = await noTenant(tenantId, async (tx) => {
    const { rows } = await tx.execute<LinhaEntrega>(sql`
      with alvo as (
        select id from entrega_webhook
         where estado = 'pendente'
           and (proxima_tentativa_em is null or proxima_tentativa_em <= now())
         order by criado_em
         limit ${lote}
         for update skip locked
      )
      select e.id, w.url, w.segredo, e.payload, e.tentativas
        from entrega_webhook e
        join webhook_saida w on w.id = e.webhook_id
       where e.id in (select id from alvo)
    `);
    return rows;
  });

  const resultados: ResultadoEntregaWebhook[] = [];
  // Em série: cada entrega abre a própria transação para gravar o resultado.
  for (const linha of pendentes) {
    resultados.push(await entregarUma(tenantId, linha));
  }
  return resultados;
}

async function entregarUma(
  tenantId: string,
  linha: LinhaEntrega,
): Promise<ResultadoEntregaWebhook> {
  const corpo = JSON.stringify(linha.payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const entregaId = randomUUID();
  const tentativas = linha.tentativas + 1;

  let erro: string | null = null;
  try {
    const resposta = await fetch(linha.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-pipe-signature': assinar(linha.segredo, timestamp, corpo),
        'x-pipe-timestamp': timestamp,
        'x-pipe-delivery': entregaId,
      },
      body: corpo,
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
    });
    if (!resposta.ok) erro = `HTTP ${resposta.status}`;
  } catch (falha) {
    erro = (falha as Error).message;
  }

  if (!erro) {
    await noTenant(tenantId, async (tx) => {
      await tx.execute(sql`
        update entrega_webhook
           set estado = 'entregue', tentativas = ${tentativas}, ultimo_erro = null,
               proxima_tentativa_em = null
         where id = ${linha.id}
      `);
    });
    return { id: linha.id, estado: 'entregue' };
  }

  // `descartada` e não `falhou`: o catálogo de estados de `entrega_webhook` separa
  // "ainda vai tentar" de "desistimos", e a tela precisa distinguir os dois.
  const desistiu = tentativas >= MAX_TENTATIVAS_WEBHOOK;
  const esperaSeg = Math.min(3600, 10 * 2 ** (tentativas - 1));
  await noTenant(tenantId, async (tx) => {
    await tx.execute(sql`
      update entrega_webhook
         set estado = ${desistiu ? 'descartada' : 'pendente'},
             tentativas = ${tentativas},
             ultimo_erro = ${erro},
             proxima_tentativa_em = ${
               desistiu ? null : sql`now() + ${`${esperaSeg} seconds`}::interval`
             }
       where id = ${linha.id}
    `);
  });
  return { id: linha.id, estado: desistiu ? 'descartada' : 'pendente', erro };
}

/**
 * Dispara a drenagem sem prender a resposta HTTP. Falha aqui não pode virar erro
 * para quem mandou a mensagem — a linha em `entrega_webhook` continua pendente e a
 * varredura pega depois.
 */
export function drenarEmSegundoPlano(tenantId: string): void {
  void entregarPendentes(tenantId).catch((erro: unknown) => {
    console.error('[webhook-saida] falhou ao drenar', erro);
  });
}
