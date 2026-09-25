import { sql } from 'drizzle-orm';
import { MAX_FILES_BY_MESSAGE, maxBytesDoMime, mimeAceito, tipoDoMime } from '@pipe/storage';
import { avaliarEnvio, classificarCusto } from '@pipe/core';
import type { CategoriaTemplate, TipoChannel } from '@pipe/core';
import { positionOfVariable } from '@pipe/workers/whatsapp';
import type { CabecalhoTemplate } from '@pipe/workers/whatsapp';
import { noTenant } from '../banco.js';
import { PipeError } from '../erros.js';
import { registrarEvento } from './eventos.js';
import { exigirSemPalavrasProibidas } from './gestao/palavras-proibidas.js';
import { drenarEmSegundoPlano, emitir } from '../webhooks-saida.js';
import { evento, publicar } from '../tempo-real.js';
import { enqueueDelivery } from '../filas.js';

/**
 * Envio de mensagem pela API.
 *
 * O que muda em relação ao que o Desk fazia: a mensagem **não** nasce `enviada`.
 * Ela nasce `pendente` e ganha uma linha em `outbox_mensagem`; quem entrega é o
 * worker, e o estado só avança quando a Meta confirma. Era exatamente o ponto de
 * extensão marcado em `apps/desk/src/app/acoes.ts`.
 *
 * A regra da janela de 24h vem de `@pipe/core` e é avaliada **antes** de gravar:
 * fora da janela, texto livre é recusado com o motivo escrito, nunca com um erro
 * da Meta depois do envio.
 */

export type TipoEnvio = 'texto' | 'imagem' | 'audio' | 'video' | 'documento' | 'template';

export interface PedidoDeEnvio {
  tenantId: string;
  conversationId: string;
  /** Atendente que assina a mensagem. Ausente = integração, e a mensagem é do sistema. */
  agentId?: string | null;
  type?: TipoEnvio;
  texto?: string | null;
  templateId?: string | null;
  /** Valores das variáveis do corpo, na ordem de `{{1}}`, `{{2}}`, … */
  parametros?: string[];
  /** Mídia já subida para o storage. */
  attachmentId?: string | null;
  /** URL pública da mídia do cabeçalho do template. É ela que ocupa a posição 1. */
  mediaUrl?: string | null;
  /**
   * Resposta pronta usada para escrever a mensagem. Só alimenta o relatório de esforço
   * — mas vem no MESMO insert de propósito: a tela carimbava numa segunda ida ao banco
   * depois do envio, e toda vez que aquela segunda escrita falhava a marca sumia sem
   * ninguém notar.
   */
  responseReadyId?: string | null;
  /**
   * Exige que a conversa esteja atribuída a `atendenteId`.
   *
   * Ligado quando quem pede é uma PESSOA num navegador: atendente responde no que é
   * dele. Desligado para integração, que não tem dono e fala pelo sistema.
   *
   * A regra mora aqui, e não no controlador, de propósito: qualquer caminho que
   * chegue a `enviarMensagem` obedece. Confiar na tela lembrar é como o Desk chegou
   * a gravar mensagem sem outbox.
   */
  exigirAtribuicao?: boolean;
}

export interface MessageQueued {
  id: string;
  estadoEntrega: 'pendente';
  insideOfWindow: boolean;
  categoriaCobranca: string | null;
  content: string | null;
}

/**
 * `@pipe/core` só conhece canal com janela e canal sem janela. Instagram, e-mail e
 * widget caem no segundo grupo — a mesma tradução que o Desk faz.
 */
// Decisão Pipe: o Instagram cai aqui como canal SEM janela, igual ao widget. O Direct
// tem janela de 24h para resposta padrão (7 dias com a tag HUMAN_AGENT); fora dela a
// Meta recusa o envio e o worker grava a falha na mensagem. Regra de janela própria do
// Instagram no `@pipe/core` é decisão de produto ainda por tomar.
function channelOfCore(tipo: string): TipoChannel {
  return tipo === 'whatsapp_cloud' ? 'whatsapp_cloud' : 'widget';
}

type LineConversation = {
  id: string;
  state: string;
  queueId: string | null;
  agentId: string | null;
  windowExpiresAt: Date | string | null;
  firstResponseAt: Date | string | null;
  lastMessageAt: Date | string | null;
  channelId: string;
  channelType: string;
};

type LinhaTemplate = {
  id: string;
  name: string;
  category: CategoriaTemplate;
  body: string;
  status_meta: string;
  cabecalho_tipo: string;
  variables: unknown;
};

export async function sendMessage(pedido: PedidoDeEnvio): Promise<MessageQueued> {
  const agora = new Date();

  const resultado = await noTenant(pedido.tenantId, async (tx) => {
    const { rows } = await tx.execute<LineConversation>(sql`
      select c.id, c.estado, c.fila_id, c.atendente_id, c.janela_expira_em,
             c.primeira_resposta_em, c.ultima_mensagem_em, ca.id as canal_id, ca.tipo as canal_tipo
        from conversa c
        join inbox ib on ib.id = c.inbox_id
        join canal ca on ca.id = ib.canal_id
       where c.id = ${pedido.conversaId}
       limit 1
    `);
    const conversation = rows[0];
    if (!conversation) throw PipeError.naoEncontrado('Conversa');
    if (conversation.state === 'encerrada') {
      throw PipeError.conflito(
        'conversation_closed',
        'A conversa está encerrada. Reabra antes de responder.',
      );
    }

    // Atendente responde no que é dele. Conversa na fila (sem dono) também é recusada:
    // pegar a conversa é uma ação com evento próprio (`atribuida`), e deixar o envio
    // atribuir por tabela faria o relatório de TMR perder o marco.
    if (pedido.exigirAtribuicao && conversation.atendente_id !== pedido.atendenteId) {
      throw new PipeError(
        403,
        'conversation_of_other_agent',
        // O texto segue o da Blip ("Contato sendo atendido por outra pessoa. Para
        // atender, solicite a transferência a…"): diz o que houve e o que fazer.
        conversation.atendente_id
          ? 'Contato sendo atendido por outra pessoa. Para atender, solicite a transferência.'
          : 'Esta conversa não está atribuída a você. Assuma a conversa antes de responder.',
      );
    }

    let template: LinhaTemplate | null = null;
    if (pedido.templateId) {
      const { rows: linhas } = await tx.execute<LinhaTemplate>(sql`
        select id, nome, categoria, corpo, status_meta, cabecalho_tipo, variaveis
          from template_mensagem
         where id = ${pedido.templateId} and canal_id = ${conversation.channelId}
         limit 1
      `);
      template = linhas[0] ?? null;
      if (!template) throw PipeError.naoEncontrado('Template');
      if (template.status_meta !== 'aprovado') {
        throw PipeError.conflito(
          'template_nao_aprovado',
          `O template "${template.nome}" está como "${template.status_meta}" na Meta.`,
        );
      }
    }

    const tipo = pedido.tipo ?? (template ? 'template' : 'texto');
    const evaluation = avaliarEnvio({
      channel: channelOfCore(conversation.channelType),
      expiraEm: comoData(conversation.windowExpiresAt),
      agora,
      conteudo: template ? 'template' : 'texto_livre',
      categoriaTemplate: template?.categoria ?? null,
    });

    if (!evaluation.permitido) {
      // Mensagem em português e acionável: é ela que o atendente lê na tela.
      const message =
        evaluation.motivo === 'janela_fechada'
          ? 'A janela de 24 horas fechou: fora dela só sai template aprovado pela Meta. ' +
            'Escolha um template para reabrir a conversa.'
          : 'O template não tem categoria de cobrança definida.';
      throw new PipeError(409, evaluation.motivo ?? 'envio_bloqueado', message, {
        modo: evaluation.modo,
        restante_seg: Math.round(evaluation.restanteSeg),
      });
    }

    const conteudo = template
      ? renderizar(template.corpo, pedido.parametros ?? [])
      : (pedido.texto?.trim() ?? null);
    if (!conteudo && !pedido.attachmentId) {
      throw PipeError.request('content_empty', 'Escreva algo ou anexe um arquivo.');
    }

    // Palavras proibidas — ANTES de gravar, como o `sendTextMessage` do Desk da
    // origem (`blip-desk-regras-tecnicas.md` §3.4): achou, não envia. Vale para o
    // texto livre assinado por atendente (inclusive a legenda de anexo); template
    // e mensagem do sistema/bot não passam pelo filtro, como lá.
    if (pedido.atendenteId && !template && conteudo) {
      await exigirSemPalavrasProibidas(tx, pedido.tenantId, conteudo);
    }

    const { rows: criada } = await tx.execute<{ id: string }>(sql`
      insert into mensagem (
        tenant_id, conversa_id, direcao, autor_tipo, autor_id, tipo, conteudo,
        anexo_id, template_id, resposta_pronta_id, estado_entrega, criada_em,
        dentro_da_janela, categoria_cobranca
      ) values (
        ${pedido.tenantId}, ${conversation.id}, 'saida',
        ${pedido.atendenteId ? 'atendente' : 'sistema'}, ${pedido.atendenteId ?? null},
        ${tipo}, ${conteudo}, ${pedido.attachmentId ?? null}, ${template?.id ?? null},
        ${pedido.respostaProntaId ?? null},
        'pendente', ${agora}, ${evaluation.windowDentro},
        ${classificarCusto({
          conteudo: template ? 'template' : 'texto_livre',
          windowDentro: evaluation.windowDentro,
          categoriaTemplate: template?.categoria ?? null,
        })}
      )
      returning id
    `);
    const messageId = criada[0]?.id;
    if (!messageId) throw new Error('não gravou a mensagem');

    await tx.execute(sql`
      insert into outbox_mensagem (tenant_id, mensagem_id, estado)
      values (${pedido.tenantId}, ${messageId}, 'pendente')
    `);

    // Responder tira a conversa de `atribuida` e de `em_espera` — as duas transições
    // que a máquina de estados permite para `em_atendimento`.
    const stateNew =
      conversation.state === 'atribuida' || conversation.state === 'em_espera'
        ? 'em_atendimento'
        : conversation.state;
    // **Resposta pressupõe pergunta.** Só conta como `primeira_resposta` se o cliente
    // já tiver falado nesta conversa (`ultima_mensagem_em` preenchido). Numa conversa
    // aberta por mensagem ativa quem começou fomos nós, e contar o disparo como
    // primeira resposta cravaria um TMR de zero segundo — enfeitando justamente a
    // métrica que a spec de métricas proíbe enfeitar.
    const clienteJaFalou = comoData(conversation.lastMessageAt) !== null;
    const firstResponse =
      comoData(conversation.firstResponseAt) === null && !!pedido.atendenteId && clienteJaFalou;

    await tx.execute(sql`
      update conversa
         set estado = ${stateNew}, em_espera_desde = null,
             ultima_mensagem_em = ${agora}, ultima_mensagem_de = 'atendente',
             primeira_resposta_em = coalesce(primeira_resposta_em, ${
               firstResponse ? agora : null
             }),
             atualizado_em = now()
       where id = ${conversation.id}
    `);

    await registrarEvento(tx, {
      tenantId: pedido.tenantId,
      conversationId: conversation.id,
      tipo: 'mensagem_saida',
      em: agora,
      userId: pedido.atendenteId ?? null,
      queueId: conversation.queueId,
    });
    if (firstResponse) {
      await registrarEvento(tx, {
        tenantId: pedido.tenantId,
        conversationId: conversation.id,
        tipo: 'primeira_resposta',
        em: agora,
        userId: pedido.atendenteId ?? null,
        queueId: conversation.queueId,
      });
    }

    await emitir(tx, pedido.tenantId, 'mensagem.criada', {
      mensagem_id: messageId,
      conversa_id: conversation.id,
      direcao: 'saida',
      tipo,
      conteudo,
    });

    return {
      messageId,
      dentroDaJanela: evaluation.windowDentro,
      categoriaCobranca: evaluation.categoriaCobranca,
      conteudo,
      valores: template
        ? posicionar(template, pedido.parametros ?? [], pedido.mediaUrl ?? null)
        : null,
    };
  });

  // Fora da transação: enfileirar e drenar webhook não podem prender o commit.
  await enqueueDelivery({
    messageId: resultado.mensagemId,
    ...(resultado.valores ? { parametros: resultado.valores } : {}),
  });
  drenarEmSegundoPlano(pedido.tenantId);
  // Depois do commit, sempre. Ver `tempo-real.ts`.
  await publicar(pedido.tenantId, evento('conversation', pedido.conversaId));

  return {
    id: resultado.mensagemId,
    estadoEntrega: 'pending',
    insideOfWindow: resultado.dentroDaJanela,
    categoriaCobranca: resultado.categoriaCobranca,
    conteudo: resultado.conteudo,
  };
}

export interface RequestOfLoteOfAttachments {
  tenantId: string;
  conversationId: string;
  agentId?: string | null;
  /** Os anexos já subidos por `POST /v1/anexos`, na ordem em que devem sair. */
  attachmentIds: string[];
  /** Legenda opcional: vai na PRIMEIRA mensagem do lote, como a origem faz com `text`. */
  texto?: string | null;
  exigirAssignment?: boolean;
}

type LineAttachment = { id: string; mime: string; bytes: string; nome_original: string | null };

/**
 * Vários arquivos num envio só — **uma mensagem por arquivo, em sequência**.
 *
 * É o modelo da origem, e não uma simplificação nossa: no protocolo LIME cada
 * `application/vnd.lime.media-link+json` carrega UM `uri`
 * (`referencias-blip/pesquisa/blip-api-schemas.md`, "media-link"), e o modal de múltiplos
 * arquivos do Desk (`ModalType.SEND_MULT_FILE`) monta uma lista
 * `mediaLinkDocuments` — uma mensagem por arquivo — limitada a
 * `MAX_ATTACHMENT_COUNT = 10` (`blip-desk-regras-tecnicas.md` §3.3). Por isso
 * `mensagem.anexo_id` continua sendo UM, sem tabela nova.
 *
 * O que é do lote, e não de cada mensagem: a validação. O laço da origem aborta
 * inteiro quando um arquivo estoura o limite (§3.3, passo 6), e aqui vale o
 * mesmo — todos os anexos são conferidos (existem no tenant, tipo aceito,
 * tamanho dentro do teto do tipo, no máximo 10) ANTES de a primeira mensagem
 * sair. Uma recusa no meio do lote deixaria o cliente com metade dos arquivos
 * e o atendente sem saber quais.
 *
 * As mensagens saem em série pela mesma `enviarMensagem`: mesma janela de 24 h,
 * mesmo outbox, mesmo evento por mensagem. Se a primeira for recusada (janela
 * fechada, conversa de outro), nenhuma sai.
 */
export async function sendAttachments(pedido: RequestOfLoteOfAttachments): Promise<MessageQueued[]> {
  const ids = pedido.attachmentIds.filter((id, i, lista) => lista.indexOf(id) === i);
  if (ids.length === 0) {
    throw PipeError.request('content_empty', 'Anexe ao menos um arquivo.');
  }
  if (ids.length > MAX_FILES_BY_MESSAGE) {
    throw PipeError.request(
      'attachments_excessive',
      `São no máximo ${MAX_FILES_BY_MESSAGE} arquivos por envio; vieram ${ids.length}.`,
      { limite: MAX_FILES_BY_MESSAGE, enviados: ids.length },
    );
  }
  if (ids.some((id) => !UUID.test(id))) throw PipeError.naoEncontrado('Anexo');

  const attachments = await noTenant(pedido.tenantId, async (tx) => {
    const { rows } = await tx.execute<LineAttachment>(sql`
      select id, mime, bytes::text as bytes, nome_original
        from anexo
       where id = any(${`{${ids.join(',')}}`}::uuid[])
    `);
    return rows;
  });

  const byId = new Map(attachments.map((a) => [a.id, a]));
  const ordenados: LineAttachment[] = [];
  for (const id of ids) {
    const attachment = byId.get(id);
    if (!attachment) throw PipeError.naoEncontrado('Anexo');
    // `guardarAnexo` já recusou o que não passa, mas o teto é conferido de novo
    // por arquivo: o lote inteiro cai se um deles não couber, com o nome dele.
    const nome = attachment.nome_original ?? attachment.id;
    if (!mimeAceito(attachment.mime)) {
      throw PipeError.request('type_not_accepted', `O arquivo "${nome}" é de um tipo não aceito.`, {
        anexo_id: attachment.id,
        mime: attachment.mime,
      });
    }
    const teto = maxBytesDoMime(attachment.mime);
    if (Number(attachment.bytes) > teto) {
      throw PipeError.request(
        'file_large_excessive',
        `O arquivo "${nome}" tem ${mb(Number(attachment.bytes))} MB e o limite para este tipo é ${mb(teto)} MB.`,
        { anexo_id: attachment.id, bytes: Number(attachment.bytes), limite: teto },
      );
    }
    ordenados.push(attachment);
  }

  const enviadas: MessageQueued[] = [];
  for (const [i, attachment] of ordenados.entries()) {
    enviadas.push(
      await sendMessage({
        tenantId: pedido.tenantId,
        conversaId: pedido.conversationId,
        atendenteId: pedido.agentId ?? null,
        tipo: tipoDoMime(attachment.mime),
        attachmentId: attachment.id,
        texto: i === 0 ? (pedido.texto ?? null) : null,
        exigirAtribuicao: pedido.exigirAssignment ?? false,
      }),
    );
  }
  return enviadas;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function mb(bytes: number): string {
  return (bytes / 1_048_576).toFixed(0);
}

/**
 * Reenviar uma mensagem que falhou.
 *
 * O que a tela fazia sozinha estava **quebrado**: ela devolvia `mensagem` para
 * `pendente` e não encostava em `outbox_mensagem`. Como o worker reivindica pelo
 * ESTADO DO OUTBOX (`where estado = 'pendente'`), a linha continuava `falhou` e nada
 * era reentregue — o botão dizia que reenviou e o cliente seguia sem receber. É o
 * mesmo defeito do ✓ mentiroso, um andar abaixo.
 *
 * `tentativas` volta a zero: quem clicou está dizendo que a causa da falha foi
 * resolvida, e manter o backoff antigo faria o reenvio esperar 15 minutos por nada.
 *
 * `entregue_em` **não** é carimbado. Ele é a hora em que a Meta confirmou, e
 * preenchê-lo sem confirmação é inventar prova de entrega.
 */
export async function resendMessage(
  tenantId: string,
  messageId: string,
): Promise<{ id: string; stateDelivery: 'pendente' }> {
  await noTenant(tenantId, async (tx) => {
    const { rows } = await tx.execute<{ id: string }>(sql`
      update mensagem
         set estado_entrega = 'pendente', erro_codigo = null, erro_texto = null
       where id = ${messageId}::uuid and estado_entrega = 'falhou'
      returning id
    `);
    if (!rows[0]) {
      // Sem linha afetada, a mensagem não existe ou já não estava falha. Responder
      // 200 calado fazia o botão parecer que resolveu.
      throw PipeError.conflito('message_not_failed', 'Esta mensagem não está mais em falha.');
    }

    const { rows: outbox } = await tx.execute<{ id: string }>(sql`
      update outbox_mensagem
         set estado = 'pendente', tentativas = 0, proxima_tentativa_em = null,
             ultimo_erro = null, atualizado_em = now()
       where mensagem_id = ${messageId}::uuid
      returning id
    `);
    if (!outbox[0]) {
      // Mensagem falha sem linha de outbox é a assinatura do defeito antigo: a tela
      // gravava a mensagem e não enfileirava nada. Recriar a linha é o que faz essas
      // mensagens antigas voltarem a ter conserto pelo botão.
      await tx.execute(sql`
        insert into outbox_mensagem (tenant_id, mensagem_id, estado)
        values (${tenantId}, ${messageId}::uuid, 'pendente')
      `);
    }
  });

  await enqueueDelivery({ messageId });
  return { id: messageId, stateDelivery: 'pending' };
}

/** `{{1}}`, `{{2}}`, … no corpo do template. A numeração aqui é a do **corpo**. */
function renderizar(corpo: string, parametros: readonly string[]): string {
  return corpo.replace(/\{\{(\d+)\}\}/g, (_todo, numero: string) => {
    const value = parametros[Number(numero) - 1];
    return value ?? `{{${numero}}}`;
  });
}

/**
 * Traduz os valores do corpo para as posições de disparo, aplicando o deslocamento
 * de mídia no cabeçalho. A regra do deslocamento tem **uma** implementação, em
 * `@pipe/workers/whatsapp`; aqui só se chama ela.
 */
function posicionar(
  template: LinhaTemplate,
  parametros: readonly string[],
  linkOfMedia: string | null,
): Record<string, string> {
  const cabecalho = (template.cabecalho_tipo ?? 'nenhum') as CabecalhoTemplate;
  const values: Record<string, string> = {};
  if (linkOfMedia) values['1'] = linkOfMedia;
  parametros.forEach((value, indice) => {
    values[String(positionOfVariable(indice + 1, cabecalho))] = value;
  });
  return values;
}

function comoData(valor: Date | string | null): Date | null {
  if (valor === null) return null;
  return valor instanceof Date ? valor : new Date(valor);
}
