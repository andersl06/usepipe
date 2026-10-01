import { sql } from 'drizzle-orm';
import { transitionDeliveryAllowed } from '@pipe/core';
import { keyringOfEnvironment, decifrarConfig, estaCifrado } from '@pipe/db';
import type { StateDelivery } from '@pipe/core';
import { databaseOwner, noTenant } from './database.js';
import { clienteInstagram } from './instagram.js';
import type { PedidoInstagram } from './instagram.js';
import { clienteMessenger } from './messenger.js';
import type { PedidoMessenger } from './messenger.js';
import { clienteWhatsApp } from './whatsapp/index.js';
import { WhatsAppError } from './whatsapp/cliente.js';
import type { Conteudo, CredentialsChannel, PedidoEnvio } from './whatsapp/cliente.js';
import { conteudoDaPergunta, preferencesInteractiveOf } from './whatsapp/interativo.js';
import type { QuestionOfFlow } from './whatsapp/interativo.js';
import { validateMedia } from './whatsapp/media.js';
import type { TypeMedia } from './whatsapp/media.js';
import type { CabecalhoTemplate } from './whatsapp/template.js';

/**
 * Delivery queue drains `outbox_mensagem` and sends messages. Call Meta OUTSIDE the transaction: holding a pool connection during an HTTP call that may take seconds could exhaust the pool under load. Steps: claim with the owner role, read and send, then write the result.
 */

export const MAX_TENTATIVAS = Number(process.env['PIPE_ENTREGA_MAX_TENTATIVAS'] ?? 5);
export const ESPERA_BASE_MS = Number(process.env['PIPE_ENTREGA_ESPERA_BASE_MS'] ?? 5_000);
export const ESPERA_TETO_MS = Number(process.env['PIPE_ENTREGA_ESPERA_TETO_MS'] ?? 15 * 60_000);

/**
 * Use increasing backoff with jitter. Without jitter, a thousand messages failing together retry together and hit Meta again in the same second.
 */
export function esperaMs(tentativas: number, sortear: () => number = Math.random): number {
  const crescente = Math.min(ESPERA_TETO_MS, ESPERA_BASE_MS * 2 ** Math.max(0, tentativas - 1));
  return Math.round(crescente * (0.8 + sortear() * 0.4));
}

/** Use `type`, not `interface`: only the alias gets the implicit index signature required by `execute<T>`. */
type Reivindicada = {
  id: string;
  tenant_id: string;
  mensagem_id: string;
  tentativas: number;
};

type LinhaDeEnvio = {
  tipo: string;
  conteudo: string | null;
  dados: Record<string, unknown> | null;
  template_id: string | null;
  telefone_e164: string | null;
  identificador: string | null;
  canal_config: Record<string, unknown> | null;
  canal_tipo: string;
  template_nome: string | null;
  template_idioma: string | null;
  template_cabecalho: string | null;
  template_variaveis: unknown;
  template_status: string | null;
  anexo_mime: string | null;
  anexo_bytes: number | null;
  anexo_chave: string | null;
  anexo_nome: string | null;
};

export interface ResultDelivery {
  messageId: string;
  state: StateDelivery;
  errorCode?: string;
  errorText?: string;
}

export interface OptionsDelivery {
  /** Quantas linhas reivindicar por rodada. */
  lote?: number;
  /**
   * Positional template values, keyed by message ID, come from the queue job. The database has no column for them yet; see `parametros_perdidos`.
   */
  parametros?: Map<string, Record<string, string>>;
}

const TYPES_OF_MEDIA: Readonly<Record<string, TypeMedia>> = {
  imagem: 'imagem',
  audio: 'audio',
  video: 'video',
  documento: 'documento',
};

/**
 * Process one delivery queue sweep and return each message result for end-to-end tests and production logs.
 */
export async function processarOutbox(options: OptionsDelivery = {}): Promise<ResultDelivery[]> {
  const lote = options.lote ?? 20;

  // Atomic claim: `skip locked` lets two workers split the queue without
  // so two workers cannot claim the same row. Use the owner role to scan all tenants.
  const { rows: reivindicadas } = await databaseOwner().execute<Reivindicada>(sql`
    update outbox_mensagem
       set estado = 'enviando', atualizado_em = now()
     where id in (
       select id from outbox_mensagem
        where estado = 'pendente'
          and (proxima_tentativa_em is null or proxima_tentativa_em <= now())
        order by criado_em
        limit ${lote}
        for update skip locked
     )
    returning id, tenant_id, mensagem_id, tentativas
  `);

  const resultados: ResultDelivery[] = [];
  // Intentionally serial: each item opens its own transaction with a fixed tenant.
  for (const linha of reivindicadas) {
    resultados.push(await entregarUma(linha, options.parametros?.get(linha.mensagem_id)));
  }
  return resultados;
}

async function entregarUma(
  linha: Reivindicada,
  parametros: Record<string, string> | undefined,
): Promise<ResultDelivery> {
  const data = await noTenant(linha.tenant_id, async (tx) => {
    await tx.execute(sql`
      update mensagem set estado_entrega = 'enviando'
       where id = ${linha.mensagem_id} and estado_entrega in ('pendente', 'enviando')
    `);
    const { rows } = await tx.execute<LinhaDeEnvio>(sql`
      select m.tipo, m.conteudo, m.dados, m.template_id,
             ct.telefone_e164, ci.identificador,
             ca.config as canal_config, ca.tipo as canal_tipo,
             t.nome as template_nome, t.idioma as template_idioma,
             t.cabecalho_tipo as template_cabecalho, t.variaveis as template_variaveis,
             t.status_meta as template_status,
             a.mime as anexo_mime, a.bytes as anexo_bytes,
             a.chave_storage as anexo_chave, a.nome_original as anexo_nome
        from mensagem m
        left join conversa c on c.id = m.conversa_id
        left join execucao_fluxo ex on ex.id = m.execucao_id
        join contato ct on ct.id = coalesce(c.contato_id, ex.contato_id)
        join inbox ib on ib.id = coalesce(c.inbox_id, ex.inbox_id)
        join canal ca on ca.id = ib.canal_id
        left join contato_identidade ci
               on ci.contato_id = ct.id and ci.canal_tipo = ca.tipo
        left join template_mensagem t on t.id = m.template_id
        left join anexo a on a.id = m.anexo_id
       where m.id = ${linha.mensagem_id}
       limit 1
    `);
    return rows[0] ?? null;
  });

  if (!data) {
    return gravarFalha(linha, 'mensagem_sumiu', 'A mensagem não existe mais no banco.');
  }

  const preparado = data.canal_tipo === 'instagram' ? prepararEnvioInstagram(data) : data.canal_tipo === 'messenger' ? prepararEnvioMessenger(data) : prepararEnvio(data, parametros);
  if ('erro' in preparado) {
    return gravarFalha(linha, preparado.erro.codigo, preparado.erro.texto);
  }

  try {
    const resposta =
      'instagram' in preparado
        ? await clienteInstagram().enviar(preparado.instagram)
        : 'messenger' in preparado ? await clienteMessenger().enviar(preparado.messenger)
        : await clienteWhatsApp().enviar(preparado.pedido);
    await noTenant(linha.tenant_id, async (tx) => {
      await tx.execute(sql`
        update mensagem
           set estado_entrega = 'enviada', id_provedor = ${resposta.idProvedor},
               erro_codigo = null, erro_texto = null
         where id = ${linha.mensagem_id}
      `);
      await tx.execute(sql`
        update outbox_mensagem
           set estado = 'enviada', tentativas = ${linha.tentativas + 1},
               ultimo_erro = null, proxima_tentativa_em = null, atualizado_em = now()
         where id = ${linha.id}
      `);
    });
    return { messageId: linha.mensagem_id, state: 'enviada' };
  } catch (error) {
    const falha =
      error instanceof WhatsAppError
        ? error
        : new WhatsAppError('desconhecido', (error as Error).message, false);
    const tentativas = linha.tentativas + 1;
    if (falha.permanente || tentativas >= MAX_TENTATIVAS) {
      const texto = falha.permanente
        ? falha.message
        : `${falha.message} (desistiu depois de ${tentativas} tentativas)`;
      return gravarFalha(linha, falha.codigo, texto, tentativas);
    }
    return reagendar(linha, tentativas, falha);
  }
}

type Preparado = { pedido: PedidoEnvio } | { erro: { codigo: string; texto: string } };

/**
 * Instagram sends to the IGSID (`contato_identidade`), never a phone number, and supports text and URL media, not WhatsApp templates. Pipe intentionally does not enforce Direct's 24-hour window (or 7 days with HUMAN_AGENT) here or in `@pipe/core`: `canalDoCore` in `apps/api/src/dominio/envio.ts` treats non-WhatsApp channels as without a window. Outside the window Meta returns 4xx and the message becomes `falhou` with Meta's reason.
 */
function prepararEnvioInstagram(
  linha: LinhaDeEnvio,
): { instagram: PedidoInstagram } | { erro: { codigo: string; texto: string } } {
  if (!linha.identificador) {
    return { erro: { codigo: 'sem_destinatario', texto: 'O contato não tem conta do Instagram neste canal.' } };
  }
  // O canal do Instagram SEMPRE grava o token cifrado (`dominio/instagram/canal.ts`).
  // The keyring is reread on every send; cache it if profiling shows this matters.
  let config: Record<string, unknown>;
  try {
    config = decifrarConfig(linha.canal_config ?? {}, keyringOfEnvironment());
  } catch (erro) {
    return { erro: { codigo: 'canal_sem_credencial', texto: `O token do canal não decifrou: ${(erro as Error).message}` } };
  }
  const igUserId = config['igUserId'];
  const tokenAccess = config['tokenAcesso'];
  if (typeof igUserId !== 'string' || typeof tokenAccess !== 'string' || !igUserId || !tokenAccess) {
    return {
      erro: { codigo: 'canal_sem_credencial', texto: 'O canal não tem igUserId e tokenAcesso em canal.config.' },
    };
  }
  const credentials = {
    igUserId,
    tokenAccess,
    apiVersao: typeof config['apiVersao'] === 'string' ? config['apiVersao'] : undefined,
  };

  const conteudo = montarConteudo(linha, undefined);
  if ('erro' in conteudo) return conteudo;
  const c = conteudo.conteudo;
  if (c.tipo === 'template' || c.tipo === 'interativo') {
    return { erro: { codigo: 'tipo_nao_suportado', texto: 'O Instagram não envia template.' } };
  }
  return {
    instagram: {
      para: linha.identificador,
      conteudo:
        c.tipo === 'localizacao'
          ? { tipo: 'texto', texto: `${c.latitude}, ${c.longitude}` }
          : c.tipo === 'texto'
            ? c
            : { tipo: c.tipo, link: c.link, legenda: c.legenda },
      credentials,
    },
  };
}

function prepararEnvioMessenger(linha: LinhaDeEnvio): { messenger: PedidoMessenger } | { erro: { codigo: string; texto: string } } {
  if (!linha.identificador) return { erro: { codigo: 'sem_destinatario', texto: 'O contato não tem PSID neste canal.' } };
  let config: Record<string, unknown>; try { config = decifrarConfig(linha.canal_config ?? {}, keyringOfEnvironment()); } catch { return { erro: { codigo: 'canal_sem_credencial', texto: 'O token do canal não decifrou.' } }; }
  if (typeof config['tokenAcesso'] !== 'string' || !config['tokenAcesso']) return { erro: { codigo: 'canal_sem_credencial', texto: 'O canal não tem token de acesso.' } };
  const conteudo = montarConteudo(linha, undefined); if ('erro' in conteudo) return conteudo; const c = conteudo.conteudo;
  if (c.tipo === 'template' || c.tipo === 'interativo') return { erro: { codigo: 'tipo_nao_suportado', texto: 'O Messenger não envia template.' } };
  return { messenger: { para: linha.identificador, conteudo: c.tipo === 'localizacao' ? { tipo: 'texto', texto: `${c.latitude}, ${c.longitude}` } : c.tipo === 'texto' ? c : { tipo: c.tipo, link: c.link, legenda: c.legenda }, credentials: { tokenAccess: config['tokenAcesso'], apiVersao: typeof config['apiVersao'] === 'string' ? config['apiVersao'] : undefined } } };
}

/**
 * Build the request and reject invalid media before a network call. Check media format and size (`regras-blip.md` §1.6) and template parameter offset (§1.4) here. Unsupported media must never reach Meta; the agent sees a reason instead of a Meta code.
 */
function prepararEnvio(
  linha: LinhaDeEnvio,
  parametros: Record<string, string> | undefined,
): Preparado {
  const para = destinatario(linha);
  if (!para) {
    return { erro: { codigo: 'sem_destinatario', texto: 'O contato não tem telefone no canal.' } };
  }

  const credenciais = credentialsOf(linha.canal_config);
  if (!credenciais) {
    return {
      erro: {
        codigo: 'canal_sem_credencial',
        texto: 'O canal não tem phoneNumberId e tokenAcesso em canal.config.',
      },
    };
  }

  const conteudo = montarConteudo(linha, parametros);
  if ('erro' in conteudo) return conteudo;
  return { pedido: { para, conteudo: conteudo.conteudo, credentials: credenciais } };
}

function montarConteudo(
  linha: LinhaDeEnvio,
  parametros: Record<string, string> | undefined,
): { conteudo: Conteudo } | { erro: { codigo: string; texto: string } } {
  if (linha.tipo === 'texto') {
    const texto = linha.conteudo?.trim();
    if (!texto) {
      return { erro: { codigo: 'texto_vazio', texto: 'Mensagem de texto sem conteúdo.' } };
    }
    // For a flow question, use buttons or a list if the channel allows it; otherwise numbered text.
    const pergunta = linha.dados?.['pergunta'] as QuestionOfFlow | undefined;
    // Only on WhatsApp: Instagram has its own quick reply, not connected yet, so send text.
    const interativo = pergunta && linha.canal_tipo === 'whatsapp_cloud'
      ? conteudoDaPergunta(pergunta, preferencesInteractiveOf(linha.canal_config))
      : null;
    return { conteudo: interativo ?? { tipo: 'texto', texto } };
  }

  if (linha.tipo === 'localizacao') {
    const localizacao = linha.dados?.['localizacao'] as
      | { latitude?: unknown; longitude?: unknown }
      | undefined;
    if (typeof localizacao?.latitude !== 'number' || typeof localizacao.longitude !== 'number') {
      return {
        erro: {
          codigo: 'localizacao_invalida',
          texto: 'Mensagem de localização sem latitude e longitude.',
        },
      };
    }
    return {
      conteudo: { tipo: 'localizacao', latitude: localizacao.latitude, longitude: localizacao.longitude },
    };
  }

  const typeMedia = TYPES_OF_MEDIA[linha.tipo];
  if (typeMedia) {
    // Bot-authored media (`gravarRespostaDoBot` in `apps/api/src/domain/flow.ts`) points at an
    // external URL declared in the flow, already SSRF-checked when the message was recorded —
    // never a Pipe-uploaded `anexo`. Every channel here accepts media by link (§ `cliente.ts`,
    // `instagram.ts`, `messenger.ts`), so no download/upload step is needed for either source.
    const midia = linha.dados?.['midia'] as
      | { url?: unknown; mime?: unknown; titulo?: unknown; nomeArquivo?: unknown }
      | undefined;
    if (midia && typeof midia.url === 'string' && midia.url) {
      return {
        conteudo: {
          tipo: typeMedia,
          link: midia.url,
          legenda: typeof midia.titulo === 'string' ? midia.titulo : (linha.conteudo ?? undefined),
          nameFile: typeof midia.nomeArquivo === 'string' ? midia.nomeArquivo : undefined,
        },
      };
    }
    if (!linha.anexo_mime || linha.anexo_bytes === null || !linha.anexo_chave) {
      return { erro: { codigo: 'anexo_ausente', texto: `Mensagem de ${linha.tipo} sem anexo.` } };
    }
    const falha = validateMedia({
      tipo: typeMedia,
      mime: linha.anexo_mime,
      bytes: linha.anexo_bytes,
    });
    if (falha) return { erro: { codigo: falha.codigo, texto: falha.texto } };
    return {
      conteudo: {
        tipo: typeMedia,
        link: urlOfMedia(linha.anexo_chave),
        legenda: linha.conteudo ?? undefined,
        nameFile: linha.anexo_nome ?? undefined,
      },
    };
  }

  if (linha.tipo === 'template') {
    if (!linha.template_nome || !linha.template_idioma) {
      return {
        erro: {
          codigo: 'template_ausente',
          texto: 'A mensagem aponta para um template que não existe.',
        },
      };
    }
    if (linha.template_status !== 'aprovado') {
      return {
        erro: {
          codigo: 'template_nao_aprovado',
          texto: `O template "${linha.template_nome}" está como "${linha.template_status}" na Meta.`,
        },
      };
    }
    const variables = readVariables(linha.template_variaveis);
    const values = parametros ?? {};
    const cabecalho = (linha.template_cabecalho ?? 'nenhum') as CabecalhoTemplate;
    // There is no JSONB column on `mensagem`; template values exist only in the queue job. If that job
    // is lost, fail loudly instead of sending a template with misplaced parameters.
    if (variables.length > 0 && Object.keys(values).length === 0) {
      return {
        erro: {
          codigo: 'parametros_perdidos',
          texto:
            `O template "${linha.template_nome}" tem ${variables.length} variável(is) e os ` +
            'valores não sobreviveram à fila. Reenvie a partir da conversa.',
        },
      };
    }
    return {
      conteudo: {
        tipo: 'template',
        template: {
          nome: linha.template_nome,
          idioma: linha.template_idioma,
          cabecalhoTipo: cabecalho,
          variables,
        },
        values,
      },
    };
  }

  return {
    erro: {
      codigo: 'tipo_nao_suportado',
      texto: `O canal WhatsApp ainda não envia mensagem do tipo "${linha.tipo}".`,
    },
  };
}

function readVariables(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v));
}

/** Channel identity takes precedence; phone number is the fallback for a contact who has never messaged. */
function destinatario(linha: LinhaDeEnvio): string | null {
  const bruto = linha.identificador ?? linha.telefone_e164;
  if (!bruto) return null;
  return bruto.replace(/^\+/, '');
}

export function credentialsOf(cru: Record<string, unknown> | null): CredentialsChannel | null {
  // Database `config` contains the ENCRYPTED token (`cifrarConfig` when creating the channel).
  // Without decryption, `Bearer` would contain `pipev1…` and Meta would reject every send;
  // the test double would miss this. Require the keyring only when decryption is needed.
  const config =
    cru && Object.values(cru).some((v) => typeof v === 'string' && estaCifrado(v))
      ? decifrarConfig(cru, keyringOfEnvironment())
      : cru;
  const phoneNumberId =
    (config?.['phoneNumberId'] as string | undefined) ?? process.env['WHATSAPP_PHONE_NUMBER_ID'];
  const tokenAcesso =
    (config?.['tokenAcesso'] as string | undefined) ?? process.env['WHATSAPP_TOKEN_ACESSO'];
  if (!phoneNumberId || !tokenAcesso) return null;
  return {
    phoneNumberId,
    tokenAccess: tokenAcesso,
    apiVersao: (config?.['apiVersao'] as string | undefined) ?? process.env['WHATSAPP_API_VERSAO'],
  };
}

/** `anexo.chave_storage` is an object-storage key; the public base URL is configuration. */
function urlOfMedia(key: string): string {
  if (/^https?:\/\//i.test(key)) return key;
  const base = (process.env['PIPE_STORAGE_URL_BASE'] ?? 'http://localhost:9000/pipe').replace(
    /\/$/,
    '',
  );
  return `${base}/${key.replace(/^\//, '')}`;
}

async function gravarFalha(
  linha: Reivindicada,
  codigo: string,
  texto: string,
  tentativas = linha.tentativas + 1,
): Promise<ResultDelivery> {
  await noTenant(linha.tenant_id, async (tx) => {
    await tx.execute(sql`
      update mensagem
         set estado_entrega = 'falhou', erro_codigo = ${codigo}, erro_texto = ${texto}
       where id = ${linha.mensagem_id}
    `);
    await tx.execute(sql`
      update outbox_mensagem
         set estado = 'falhou', tentativas = ${tentativas},
             ultimo_erro = ${`${codigo}: ${texto}`},
             proxima_tentativa_em = null, atualizado_em = now()
       where id = ${linha.id}
    `);
  });
  return { messageId: linha.mensagem_id, state: 'falhou', errorCode: codigo, errorText: texto };
}

async function reagendar(
  linha: Reivindicada,
  tentativas: number,
  falha: WhatsAppError,
): Promise<ResultDelivery> {
  const espera = esperaMs(tentativas);
  await noTenant(linha.tenant_id, async (tx) => {
    // Return the message to `pendente`: to the agent it is still on its way.
    await tx.execute(sql`
      update mensagem set estado_entrega = 'pendente' where id = ${linha.mensagem_id}
    `);
    await tx.execute(sql`
      update outbox_mensagem
         set estado = 'pendente', tentativas = ${tentativas},
             ultimo_erro = ${`${falha.codigo}: ${falha.message}`},
             proxima_tentativa_em = now() + ${`${espera} milliseconds`}::interval,
             atualizado_em = now()
       where id = ${linha.id}
    `);
  });
  return { messageId: linha.mensagem_id, state: 'pendente', errorCode: falha.codigo };
}

/** Guarda contra status fora de ordem vindo de webhook. */
export function podeAvancar(de: StateDelivery | null, para: StateDelivery): boolean {
  if (de === null) return true;
  if (de === para) return false;
  return transitionDeliveryAllowed(de, para);
}
