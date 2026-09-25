import { sql } from 'drizzle-orm';
import { transitionDeliveryAllowed } from '@pipe/core';
import { keyringOfAmbiente, decifrarConfig, estaCifrado } from '@pipe/db';
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
import type { PerguntaOfFlow } from './whatsapp/interativo.js';
import { validateMedia } from './whatsapp/media.js';
import type { TypeMedia } from './whatsapp/media.js';
import type { CabecalhoTemplate } from './whatsapp/template.js';

/**
 * Fila de entrega: drena `outbox_mensagem` e entrega de verdade.
 *
 * A chamada à Meta acontece **fora** da transação. Segurar uma conexão do pool
 * durante um HTTP que pode levar segundos é o jeito mais rápido de esgotar o pool
 * num pico. São três passos: reivindica (papel dono), lê e envia, grava.
 */

export const MAX_TENTATIVAS = Number(process.env['PIPE_ENTREGA_MAX_TENTATIVAS'] ?? 5);
export const ESPERA_BASE_MS = Number(process.env['PIPE_ENTREGA_ESPERA_BASE_MS'] ?? 5_000);
export const ESPERA_TETO_MS = Number(process.env['PIPE_ENTREGA_ESPERA_TETO_MS'] ?? 15 * 60_000);

/**
 * Espera crescente com um pouco de sorteio. Sem o sorteio, mil mensagens que
 * falharam juntas voltam juntas e batem na Meta no mesmo segundo de novo.
 */
export function esperaMs(tentativas: number, sortear: () => number = Math.random): number {
  const crescente = Math.min(ESPERA_TETO_MS, ESPERA_BASE_MS * 2 ** Math.max(0, tentativas - 1));
  return Math.round(crescente * (0.8 + sortear() * 0.4));
}

/** `type` e não `interface`: só o alias ganha índice implícito, que `execute<T>` exige. */
type Reivindicada = {
  id: string;
  tenant_id: string;
  messageId: string;
  tentativas: number;
};

type LinhaDeEnvio = {
  type: string;
  content: string | null;
  data: Record<string, unknown> | null;
  template_id: string | null;
  phoneE164: string | null;
  identificador: string | null;
  channelConfig: Record<string, unknown> | null;
  channelType: string;
  templateName: string | null;
  template_idioma: string | null;
  template_cabecalho: string | null;
  templateVariables: unknown;
  template_status: string | null;
  attachmentMime: string | null;
  attachmentBytes: number | null;
  attachmentKey: string | null;
  attachmentName: string | null;
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
   * Valores posicionais de template, por id de mensagem, vindos do job da fila.
   * O banco ainda não tem coluna para guardá-los — ver `parametros_perdidos`.
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
 * Uma rodada da fila de entrega. Devolve o que aconteceu com cada mensagem — é o que
 * o teste de ponta a ponta inspeciona e o que o log de produção registra.
 */
export async function processarOutbox(options: OptionsDelivery = {}): Promise<ResultDelivery[]> {
  const lote = options.lote ?? 20;

  // Reivindicação atômica: `skip locked` deixa dois workers dividirem a fila sem que
  // os dois peguem a mesma linha. Roda com o papel dono porque varre todos os tenants.
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
  // Em série de propósito: cada item abre a própria transação com tenant fixado.
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
        join conversa c on c.id = m.conversa_id
        join contato ct on ct.id = c.contato_id
        join inbox ib on ib.id = c.inbox_id
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

  const preparado = data.channelType === 'instagram' ? prepararEnvioInstagram(data) : data.channelType === 'messenger' ? prepararEnvioMessenger(data) : prepararEnvio(data, parametros);
  if ('erro' in preparado) {
    return gravarFalha(linha, preparado.error.code, preparado.error.texto);
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

type Preparado = { pedido: PedidoEnvio } | { error: { code: string; texto: string } };

/**
 * O Instagram manda para o IGSID (`contato_identidade`), nunca para telefone, e só
 * texto e mídia por URL — template é coisa do WhatsApp.
 *
 * Decisão Pipe: a janela de 24h do Direct (7 dias com a tag HUMAN_AGENT) NÃO é
 * conferida aqui nem no `@pipe/core` — o core trata canal que não é WhatsApp como sem
 * janela (`canalDoCore` em `apps/api/src/dominio/envio.ts`). Fora da janela, a Meta
 * recusa com 4xx e a mensagem fica `falhou` com o motivo dela.
 */
function prepararEnvioInstagram(
  linha: LinhaDeEnvio,
): { instagram: PedidoInstagram } | { error: { code: string; texto: string } } {
  if (!linha.identificador) {
    return { erro: { codigo: 'sem_destinatario', texto: 'O contato não tem conta do Instagram neste canal.' } };
  }
  // O canal do Instagram SEMPRE grava o token cifrado (`dominio/instagram/canal.ts`).
  // ponytail: chaveiro relido a cada envio; guardar em memória se aparecer no perfil.
  let config: Record<string, unknown>;
  try {
    config = decifrarConfig(linha.channelConfig ?? {}, keyringOfAmbiente());
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
      conteudo: c.tipo === 'texto' ? c : { tipo: c.tipo, link: c.link, legenda: c.legenda },
      credentials,
    },
  };
}

function prepararEnvioMessenger(linha: LinhaDeEnvio): { messenger: PedidoMessenger } | { error: { code: string; texto: string } } {
  if (!linha.identificador) return { erro: { codigo: 'sem_destinatario', texto: 'O contato não tem PSID neste canal.' } };
  let config: Record<string, unknown>; try { config = decifrarConfig(linha.channelConfig ?? {}, keyringOfAmbiente()); } catch { return { erro: { codigo: 'canal_sem_credencial', texto: 'O token do canal não decifrou.' } }; }
  if (typeof config['tokenAcesso'] !== 'string' || !config['tokenAcesso']) return { erro: { codigo: 'canal_sem_credencial', texto: 'O canal não tem token de acesso.' } };
  const conteudo = montarConteudo(linha, undefined); if ('erro' in conteudo) return conteudo; const c = conteudo.conteudo;
  if (c.tipo === 'template' || c.tipo === 'interativo') return { erro: { codigo: 'tipo_nao_suportado', texto: 'O Messenger não envia template.' } };
  return { messenger: { para: linha.identificador, conteudo: c.tipo === 'texto' ? c : { tipo: c.tipo, link: c.link, legenda: c.legenda }, credentials: { tokenAccess: config['tokenAcesso'], apiVersao: typeof config['apiVersao'] === 'string' ? config['apiVersao'] : undefined } } };
}

/**
 * Monta o pedido e recusa antes de gastar chamada.
 *
 * Formato e tamanho de mídia (`regras-blip.md` §1.6) e deslocamento de parâmetro de
 * template (§1.4) são verificados aqui: mídia em formato recusado **nunca** chega a
 * chamar a Meta, e o atendente lê o motivo em vez de um código da Meta.
 */
function prepararEnvio(
  linha: LinhaDeEnvio,
  parametros: Record<string, string> | undefined,
): Preparado {
  const para = destinatario(linha);
  if (!para) {
    return { error: { codigo: 'sem_destinatario', texto: 'O contato não tem telefone no canal.' } };
  }

  const credenciais = credentialsOf(linha.channelConfig);
  if (!credenciais) {
    return {
      error: {
        codigo: 'canal_sem_credencial',
        texto: 'O canal não tem phoneNumberId e tokenAcesso em canal.config.',
      },
    };
  }

  const conteudo = montarConteudo(linha, parametros);
  if ('erro' in conteudo) return conteudo;
  return { pedido: { para, conteudo: conteudo.conteudo, credentials } };
}

function montarConteudo(
  linha: LinhaDeEnvio,
  parametros: Record<string, string> | undefined,
): { content: Conteudo } | { error: { code: string; texto: string } } {
  if (linha.tipo === 'texto') {
    const texto = linha.conteudo?.trim();
    if (!texto) {
      return { erro: { codigo: 'texto_vazio', texto: 'Mensagem de texto sem conteúdo.' } };
    }
    // Pergunta do fluxo: botões ou lista quando o canal permite; senão o texto numerado.
    const pergunta = linha.data?.['pergunta'] as PerguntaOfFlow | undefined;
    // Só no WhatsApp: o Instagram tem quick reply próprio, ainda não ligado — sai texto.
    const interativo = pergunta && linha.channelType === 'whatsapp_cloud'
      ? conteudoDaPergunta(pergunta, preferencesInteractiveOf(linha.channelConfig))
      : null;
    return { conteudo: interativo ?? { tipo: 'texto', texto } };
  }

  const typeMedia = TYPES_OF_MEDIA[linha.tipo];
  if (typeMedia) {
    if (!linha.attachmentMime || linha.attachmentBytes === null || !linha.attachmentKey) {
      return { erro: { codigo: 'anexo_ausente', texto: `Mensagem de ${linha.tipo} sem anexo.` } };
    }
    const falha = validateMedia({
      tipo: typeMedia,
      mime: linha.attachmentMime,
      bytes: linha.attachmentBytes,
    });
    if (falha) return { erro: { codigo: falha.codigo, texto: falha.texto } };
    return {
      conteudo: {
        tipo: typeMedia,
        link: urlOfMedia(linha.attachmentKey),
        legenda: linha.conteudo ?? undefined,
        nameFile: linha.attachmentName ?? undefined,
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
    const variables = readVariables(linha.templateVariables);
    const values = parametros ?? {};
    const cabecalho = (linha.template_cabecalho ?? 'nenhum') as CabecalhoTemplate;
    // Sem coluna jsonb em `mensagem`, os valores só existem no job da fila. Se o job
    // se perdeu, falha alto em vez de mandar o template com o parâmetro trocado.
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

/** A identidade do canal manda; telefone é o fallback de quem nunca escreveu. */
function destinatario(linha: LinhaDeEnvio): string | null {
  const bruto = linha.identificador ?? linha.telefone_e164;
  if (!bruto) return null;
  return bruto.replace(/^\+/, '');
}

export function credentialsOf(cru: Record<string, unknown> | null): CredentialsChannel | null {
  // O `config` vem do banco com o token CIFRADO (`cifrarConfig` na criação do canal).
  // Sem decifrar, o `Bearer` sairia com o `pipev1…` e a Meta recusaria todo envio —
  // o dublê não percebe. O chaveiro só é exigido quando há o que decifrar.
  const config =
    cru && Object.values(cru).some((v) => typeof v === 'string' && estaCifrado(v))
      ? decifrarConfig(cru, keyringOfAmbiente())
      : cru;
  const phoneNumberId =
    (config?.['phoneNumberId'] as string | undefined) ?? process.env['WHATSAPP_PHONE_NUMBER_ID'];
  const tokenAcesso =
    (config?.['tokenAcesso'] as string | undefined) ?? process.env['WHATSAPP_TOKEN_ACESSO'];
  if (!phoneNumberId || !tokenAcesso) return null;
  return {
    phoneNumberId,
    tokenAccess,
    apiVersao: (config?.['apiVersao'] as string | undefined) ?? process.env['WHATSAPP_API_VERSAO'],
  };
}

/** `anexo.chave_storage` é chave no storage de objetos; a base pública é configuração. */
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
    // A mensagem volta a `pendente`: para o atendente ela ainda está a caminho.
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
  return { messageId: linha.mensagem_id, state: 'pending', errorCode: falha.codigo };
}

/** Guarda contra status fora de ordem vindo de webhook. */
export function podeAvancar(de: StateDelivery | null, para: StateDelivery): boolean {
  if (de === null) return true;
  if (de === para) return false;
  return transitionDeliveryAllowed(de, para);
}
