import { createHmac, randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { decifrar, estaCifrado } from '@pipe/db';
import type { TransacaoPipe } from '@pipe/db';
import type { TIPOS_AUTENTICACAO_WEBHOOK } from '@pipe/db/schema';
import { chaveiro, noTenant } from './banco.js';
import { chamarComMtls } from './dominio/mtls.js';

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
 *
 * O POST em si sai por `chamarComMtls` (`dominio/mtls.ts`): se o host do
 * webhook tem certificado cadastrado em `/contrato/certificados`, a Pipe o
 * apresenta (mTLS); se não tem, é o `fetch` de sempre.
 */

export const EVENTOS = [
  'conversa.criada',
  'conversa.estado_alterado',
  'conversa.atribuida',
  'conversa.encerrada',
  'mensagem.criada',
  'mensagem.estado_entrega_alterado',
  'contato.criado',
  /** A Meta recategorizou um modelo de mensagem (`dominio/whatsapp/eventos-de-modelo.ts`). */
  'modelo.recategorizado',
  /** O relógio de SLA (`dominio/gestao/sla-motor.ts`) atingiu o limiar de alerta/estouro. */
  'sla.alertou',
  'sla.estourou',
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
 * Autenticação e cabeçalhos customizados — "Configurações de autenticação" e
 * "Cabeçalhos customizados" da origem (migration 0036,
 * `dominio/gestao/integracoes.ts`). Vive aqui porque tanto a entrega de
 * verdade (`entregarUma`) quanto o botão "Testar" (`testarWebhook`, no
 * domínio) montam a MESMA requisição.
 */
export type TipoAutenticacaoWebhook = (typeof TIPOS_AUTENTICACAO_WEBHOOK)[number];

/** Os cabeçalhos reservados: nenhum cabeçalho customizado pode usar um destes nomes. */
export const CABECALHOS_RESERVADOS = [
  'content-type',
  'x-pipe-signature',
  'x-pipe-timestamp',
  'x-pipe-delivery',
  'authorization',
] as const;

export interface CabecalhoCustomizado {
  chave: string;
  valor: string;
}

/** Já decifrada — o que sai do banco, pronto para montar a requisição. */
export interface AutenticacaoDeSaidaDecifrada {
  tipo: TipoAutenticacaoWebhook;
  usuario?: string | null;
  senha?: string | null;
  oauth2UrlAutorizacao?: string | null;
  oauth2ClientId?: string | null;
  oauth2ClientSecret?: string | null;
}

/**
 * `POST` `client_credentials` — sem cache de token (ponytail: um token por
 * entrega; cachear por `(tenantId, webhookId)` até expirar, se o volume de
 * disparos pedir).
 */
async function obterTokenOAuth2(auth: AutenticacaoDeSaidaDecifrada): Promise<string> {
  const corpo = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: auth.oauth2ClientId ?? '',
    client_secret: auth.oauth2ClientSecret ?? '',
  });
  const resposta = await fetch(auth.oauth2UrlAutorizacao ?? '', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: corpo,
    signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
  });
  if (!resposta.ok) throw new Error(`token OAuth2: HTTP ${resposta.status}`);
  const json = (await resposta.json().catch(() => null)) as { access_token?: unknown } | null;
  if (!json || typeof json.access_token !== 'string' || !json.access_token) {
    throw new Error('token OAuth2: resposta sem access_token');
  }
  return json.access_token;
}

/** `null` = sem cabeçalho `Authorization` (autenticação `nenhuma`). */
export async function cabecalhoDeAutorizacao(
  auth: AutenticacaoDeSaidaDecifrada,
): Promise<string | null> {
  if (auth.tipo === 'basica') {
    const par = `${auth.usuario ?? ''}:${auth.senha ?? ''}`;
    return `Basic ${Buffer.from(par, 'utf8').toString('base64')}`;
  }
  if (auth.tipo === 'oauth2_client_credentials') {
    return `Bearer ${await obterTokenOAuth2(auth)}`;
  }
  return null;
}

/**
 * Os cabeçalhos customizados entram primeiro; os reservados são escritos
 * DEPOIS, por cima — assim nenhum cabeçalho do cliente derruba a assinatura
 * (a gravação já recusa nomes reservados, isto aqui é o cinto e a suspensório).
 */
export function cabecalhosDeSaida(params: {
  segredo: string;
  timestamp: string;
  corpo: string;
  deliveryId: string;
  customizados?: readonly CabecalhoCustomizado[] | null;
}): Record<string, string> {
  const cabecalhos: Record<string, string> = {};
  for (const { chave, valor } of params.customizados ?? []) cabecalhos[chave] = valor;
  cabecalhos['content-type'] = 'application/json';
  cabecalhos['x-pipe-signature'] = assinar(params.segredo, params.timestamp, params.corpo);
  cabecalhos['x-pipe-timestamp'] = params.timestamp;
  cabecalhos['x-pipe-delivery'] = params.deliveryId;
  return cabecalhos;
}

/**
 * Decifra um campo de segredo de `webhook_saida`; `null`/vazio passa direto,
 * e texto que não é um envelope nosso também (o mesmo critério tolerante de
 * `dominio/twenty.ts`, para não derrubar dado gravado direto no banco).
 */
export function decifrarSegredoDeWebhook(valor: string | null): string | null {
  if (!valor) return null;
  return estaCifrado(valor) ? decifrar(valor, chaveiro()) : valor;
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
  tipo_autenticacao: TipoAutenticacaoWebhook;
  autenticacao_usuario: string | null;
  autenticacao_senha: string | null;
  oauth2_url_autorizacao: string | null;
  oauth2_client_id: string | null;
  oauth2_client_secret: string | null;
  cabecalhos: CabecalhoCustomizado[] | null;
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
      select e.id, w.url, w.segredo, e.payload, e.tentativas,
             w.tipo_autenticacao, w.autenticacao_usuario, w.autenticacao_senha,
             w.oauth2_url_autorizacao, w.oauth2_client_id, w.oauth2_client_secret,
             w.cabecalhos
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
    const cabecalhos = cabecalhosDeSaida({
      segredo: linha.segredo,
      timestamp,
      corpo,
      deliveryId: entregaId,
      customizados: linha.cabecalhos,
    });
    const autorizacao = await cabecalhoDeAutorizacao({
      tipo: linha.tipo_autenticacao,
      usuario: linha.autenticacao_usuario,
      senha: decifrarSegredoDeWebhook(linha.autenticacao_senha),
      oauth2UrlAutorizacao: linha.oauth2_url_autorizacao,
      oauth2ClientId: linha.oauth2_client_id,
      oauth2ClientSecret: decifrarSegredoDeWebhook(linha.oauth2_client_secret),
    });
    if (autorizacao) cabecalhos['authorization'] = autorizacao;

    const resposta = await chamarComMtls(tenantId, linha.url, {
      metodo: 'POST',
      headers: cabecalhos,
      body: corpo,
      timeoutMs: TEMPO_LIMITE_MS,
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
