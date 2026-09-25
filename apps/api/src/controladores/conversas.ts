import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { CloseConversationInput } from '@pipe/contracts';
import { noTenant } from '../banco.js';
import { KeyOrSession, Scopes, atorDe, contextOf } from '../autenticacao.js';
import type { RequestAuthenticated } from '../autenticacao.js';
import type { RequestWithSession } from '../sessao.js';
import { alternarEspera, closeConversation, transferConversation } from '../dominio/conversa.js';
import { sendAttachments, sendMessage, resendMessage } from '../dominio/envio.js';
import type { TipoEnvio } from '../dominio/envio.js';
import { PipeError } from '../erros.js';
import {
  conditionOfCursor,
  lerCursor,
  lerLimite,
  readSorting,
  assemblePage,
  orderSql,
} from '../paginacao.js';
import type { Page } from '../paginacao.js';

/**
 * `/v1/conversas` — o recurso central da API.
 *
 * Padrão de `apis.md` §5: recurso plural, filtro na query string, ordenação
 * declarada e paginação por cursor. Nenhuma consulta filtra `tenant_id` na mão: a
 * RLS já filtra, e filtrar de novo esconderia um bug de isolamento em vez de expô-lo.
 */

const ESTADOS = ['na_fila', 'atribuida', 'em_atendimento', 'em_espera', 'encerrada'];

type LineConversation = {
  id: string;
  state: string;
  priority: string;
  criada_em: Date | string;
  atribuida_em: Date | string | null;
  firstResponseAt: Date | string | null;
  encerrada_em: Date | string | null;
  lastMessageAt: Date | string | null;
  lastMessageOf: string | null;
  windowExpiresAt: Date | string | null;
  queueId: string | null;
  queueName: string | null;
  atendente_id: string | null;
  agentName: string | null;
  contactId: string;
  contactName: string | null;
  contactPhone: string | null;
  channelType: string;
};

type LineMessage = {
  id: string;
  criada_em: Date | string;
  direction: string;
  autor_tipo: string;
  authorId: string | null;
  type: string;
  content: string | null;
  stateDelivery: string | null;
  errorCode: string | null;
  errorText: string | null;
  idProvider: string | null;
  entregueAt: Date | string | null;
  lidaAt: Date | string | null;
  insideOfWindow: boolean | null;
  categoryCobranca: string | null;
};

interface CorpoDeEnvio {
  texto?: string;
  type?: TipoEnvio;
  template_id?: string;
  parametros?: string[];
  attachmentId?: string;
  mediaUrl?: string;
  atendente_id?: string;
  resposta_pronta_id?: string;
}

@Controller('v1/conversations')
export class ConversationsController {
  @Get()
  @Scopes('conversas:ler')
  async listar(
    @Req() requisicao: RequestAuthenticated,
    @Query() consulta: Record<string, string | undefined>,
  ): Promise<Page<Record<string, unknown>>> {
    const { tenantId } = contextOf(requisicao);
    const limite = lerLimite(consulta['limit']);
    const cursor = lerCursor(consulta['cursor']);
    const ordem = readSorting(consulta['order_by'], ['criada_em', 'ultima_mensagem_em'], {
      campo: 'criada_em',
      direction: 'desc',
    });
    // `ultima_mensagem_em` é nulo em conversa sem mensagem; sem o `coalesce` a linha
    // sumiria da paginação por cursor em vez de aparecer no fim.
    const expressao =
      ordem.campo === 'ultima_mensagem_em'
        ? 'coalesce(c.ultima_mensagem_em, c.criada_em)'
        : 'c.criada_em';

    const filters: SQL[] = [];
    if (consulta['estado']) filters.push(igualEmLista('c.estado', consulta['estado'], ESTADOS));
    if (consulta['fila_id']) filters.push(sql`c.fila_id = ${consulta['fila_id']}::uuid`);
    if (consulta['atendente_id']) {
      filters.push(sql`c.atendente_id = ${consulta['atendente_id']}::uuid`);
    }
    if (consulta['contato_id']) filters.push(sql`c.contato_id = ${consulta['contato_id']}::uuid`);

    const linhas = await noTenant(tenantId, async (tx) => {
      const { rows } = await tx.execute<LineConversation & { key: Date | string }>(sql`
        select ${sql.raw(expressao)} as chave, ${sql.raw(COLUMNS_CONVERSATION)}
          from conversa c
          join contato ct on ct.id = c.contato_id
          join inbox ib on ib.id = c.inbox_id
          join canal ca on ca.id = ib.canal_id
          left join fila f on f.id = c.fila_id
          left join usuario u on u.id = c.atendente_id
         where ${juntar(filters)}
           and ${conditionOfCursor(expressao, 'timestamptz', ordem.direction, cursor, 'c.id')}
         order by ${orderSql(expressao, ordem.direction, 'c.id')}
         limit ${limite + 1}
      `);
      return rows;
    });

    // O cursor sai da linha crua, antes da serialização: a chave de ordenação é
    // detalhe de paginação e não precisa aparecer no corpo da resposta.
    const page = assemblePage(linhas, limite, (linha) => ({
      value: iso(linha.key) ?? '',
      id: linha.id,
    }));
    return { data: page.data.map(asConversation), page_info: page.page_info };
  }

  @Get(':id')
  @Scopes('conversas:ler')
  async obter(
    @Req() request: RequestAuthenticated,
    @Param('id') id: string,
  ): Promise<Record<string, unknown>> {
    const { tenantId } = contextOf(request);
    const linha = await noTenant(tenantId, async (tx) => {
      const { rows } = await tx.execute<LineConversation & { key: Date | string }>(sql`
        select c.criada_em as chave, ${sql.raw(COLUMNS_CONVERSATION)}
          from conversa c
          join contato ct on ct.id = c.contato_id
          join inbox ib on ib.id = c.inbox_id
          join canal ca on ca.id = ib.canal_id
          left join fila f on f.id = c.fila_id
          left join usuario u on u.id = c.atendente_id
         where c.id = ${id}::uuid
         limit 1
      `);
      return rows[0] ?? null;
    });
    if (!linha) throw PipeError.naoEncontrado('Conversa');
    return asConversation(linha);
  }

  @Get(':id/mensagens')
  @Scopes('mensagens:ler')
  async messages(
    @Req() requisicao: RequestAuthenticated,
    @Param('id') id: string,
    @Query() query: Record<string, string | undefined>,
  ): Promise<Page<Record<string, unknown>>> {
    const { tenantId } = contextOf(requisicao);
    const limite = lerLimite(query['limit']);
    const cursor = lerCursor(query['cursor']);
    const order = readSorting(query['order_by'], ['criada_em'], {
      campo: 'criada_em',
      direction: 'asc',
    });

    const filtros: SQL[] = [sql`conversa_id = ${id}::uuid`];
    if (query['direcao']) {
      filtros.push(igualEmLista('direcao', query['direcao'], ['entrada', 'saida', 'interna']));
    }
    if (query['estado_entrega']) {
      filtros.push(
        igualEmLista('estado_entrega', query['estado_entrega'], [
          'pendente',
          'enviando',
          'enviada',
          'entregue',
          'lida',
          'falhou',
        ]),
      );
    }

    const linhas = await noTenant(tenantId, async (tx) => {
      const { rows } = await tx.execute<LineMessage>(sql`
        select id, criada_em, direcao, autor_tipo, autor_id, tipo, conteudo, estado_entrega,
               erro_codigo, erro_texto, id_provedor, entregue_em, lida_em, dentro_da_janela,
               categoria_cobranca
          from mensagem
         where ${juntar(filtros)}
           and ${conditionOfCursor('criada_em', 'timestamptz', order.direction, cursor)}
         order by ${orderSql('criada_em', order.direction)}
         limit ${limite + 1}
      `);
      return rows;
    });

    const pagina = assemblePage(linhas, limite, (linha) => ({
      value: iso(linha.criada_em) ?? '',
      id: linha.id,
    }));
    return { data: pagina.data.map(asMessage), page_info: pagina.page_info };
  }

  /**
   * A MESMA rota serve à integração e ao Desk — ver `ChaveOuSessao`.
   *
   * A diferença está em quem assina a mensagem, e ela nunca vem do corpo quando é
   * gente: com sessão, o autor é o `usuario_id` do cookie, e um `atendente_id` no
   * corpo é ignorado. Aceitá-lo deixaria qualquer pessoa logada mandar mensagem em
   * nome de outra, com o nome do colega na tela do cliente.
   */
  @Post(':id/mensagens')
  @HttpCode(201)
  @KeyOrSession('mensagens:escrever')
  async enviar(
    @Req() requisicao: RequestAuthenticated & RequestWithSession,
    @Param('id') id: string,
    @Body() corpo: CorpoDeEnvio,
  ): Promise<Record<string, unknown>> {
    const ator = atorDe(requisicao);
    const enfileirada = await sendMessage({
      tenantId: ator.tenantId,
      conversaId: id,
      atendenteId: ator.viaSession ? ator.userId : (corpo.atendente_id ?? null),
      exigirAtribuicao: ator.viaSession,
      ...(corpo.tipo ? { tipo: corpo.tipo } : {}),
      texto: corpo.texto ?? null,
      templateId: corpo.template_id ?? null,
      ...(corpo.parametros ? { parametros: corpo.parametros } : {}),
      attachmentId: corpo.attachmentId ?? null,
      mediaUrl: corpo.mediaUrl ?? null,
      respostaProntaId: corpo.resposta_pronta_id ?? null,
    });
    return {
      id: enfileirada.id,
      estado_entrega: enfileirada.estadoEntrega,
      dentro_da_janela: enfileirada.insideOfWindow,
      categoria_cobranca: enfileirada.categoriaCobranca,
      conteudo: enfileirada.conteudo,
    };
  }

  /**
   * Vários arquivos de uma vez — uma mensagem por arquivo, em sequência, como a
   * origem (`enviarAnexos`). O lote é validado INTEIRO antes de a primeira sair:
   * mais de 10, anexo inexistente ou fora do limite do tipo recusam tudo, e a
   * resposta diz qual arquivo. As mensagens voltam na ordem em que saíram.
   */
  @Post(':id/mensagens/anexos')
  @HttpCode(201)
  @KeyOrSession('mensagens:escrever')
  async sendLoteOfAttachments(
    @Req() requisicao: RequestAuthenticated & RequestWithSession,
    @Param('id') id: string,
    @Body() corpo: { attachmentIds?: unknown; texto?: string; agentId?: string },
  ): Promise<{ messages: Record<string, unknown>[] }> {
    const ator = atorDe(requisicao);
    const ids = Array.isArray(corpo?.attachmentIds)
      ? corpo.attachmentIds.filter((v): v is string => typeof v === 'string')
      : [];
    if (ids.length === 0) {
      throw PipeError.request('content_empty', 'Informe `anexo_ids` com ao menos um anexo.');
    }
    const enviadas = await sendAttachments({
      tenantId: ator.tenantId,
      conversationId: id,
      agentId: ator.viaSession ? ator.userId : (corpo.agentId ?? null),
      exigirAssignment: ator.viaSession,
      attachmentIds: ids,
      texto: corpo.texto ?? null,
    });
    return {
      messages: enviadas.map((m) => ({
        id: m.id,
        estado_entrega: m.estadoEntrega,
        dentro_da_janela: m.insideOfWindow,
        categoria_cobranca: m.categoriaCobranca,
        conteudo: m.conteudo,
      })),
    };
  }

  /**
   * Encerrar. A lista replica o `blip-tags` da Blip e respeita tags obrigatórias.
   */
  @Post(':id/encerrar')
  @KeyOrSession('conversas:escrever')
  async encerrar(
    @Req() requisicao: RequestAuthenticated & RequestWithSession,
    @Param('id') id: string,
    @Body() corpo: CloseConversationInput,
  ): Promise<Record<string, unknown>> {
    const ator = atorDe(requisicao);
    const r = await closeConversation(
      {
        tenantId: ator.tenantId,
        agentId: ator.userId,
        exigirAssignment: ator.viaSession,
      },
      { conversaId: id, etiquetaIds: corpo.etiqueta_ids, etiquetaId: corpo.etiqueta_id },
    );
    return { estado: r.estado, motivo_encerramento: r.motivo };
  }

  /**
   * Reenviar uma mensagem que falhou.
   *
   * A tela fazia isto direto no banco e **não funcionava**: devolvia `mensagem` para
   * `pendente` sem tocar em `outbox_mensagem`, e o worker reivindica pelo estado do
   * outbox. Ver `reenviarMensagem`.
   */
  @Post(':id/mensagens/:mensagemId/reenviar')
  @KeyOrSession('mensagens:escrever')
  async reenviar(
    @Req() requisicao: RequestAuthenticated & RequestWithSession,
    @Param('mensagemId') messageId: string,
  ): Promise<Record<string, unknown>> {
    const ator = atorDe(requisicao);
    const r = await resendMessage(ator.tenantId, messageId);
    return { id: r.id, estado_entrega: r.stateDelivery };
  }

  /**
   * Transferir para outra fila ou para outro atendente.
   *
   * **Encerra a conversa atual e abre outra no destino** — não é transição de estado.
   * A regra está em `packages/core/src/conversa/maquina.ts` e é a da Blip. Por isso a
   * resposta traz DOIS ids: o que foi encerrado e o novo.
   */
  @Post(':id/transferir')
  @KeyOrSession('conversas:escrever')
  async transferir(
    @Req() requisicao: RequestAuthenticated & RequestWithSession,
    @Param('id') id: string,
    @Body() corpo: { forQueueId?: string; forAgentId?: string; reason?: string },
  ): Promise<Record<string, unknown>> {
    const ator = atorDe(requisicao);
    const r = await transferConversation(
      {
        tenantId: ator.tenantId,
        agentId: ator.userId,
        exigirAssignment: ator.viaSession,
      },
      {
        conversationId: id,
        forQueueId: corpo.forQueueId ?? null,
        forAgentId: corpo.forAgentId ?? null,
        motivo: corpo.motivo ?? null,
      },
    );
    return {
      de_conversa_id: r.ofConversationId,
      para_conversa_id: r.forConversationId,
      estado: r.estado,
    };
  }

  /** Entra em espera, ou sai dela. A mesma rota nos dois sentidos, como o botão. */
  @Post(':id/espera')
  @KeyOrSession('conversas:escrever')
  async espera(
    @Req() requisicao: RequestAuthenticated & RequestWithSession,
    @Param('id') id: string,
  ): Promise<Record<string, unknown>> {
    const ator = atorDe(requisicao);
    const r = await alternarEspera(
      {
        tenantId: ator.tenantId,
        agentId: ator.userId,
        exigirAssignment: ator.viaSession,
      },
      id,
    );
    return { estado: r.state, pausado_seg: r.pausadoSeg };
  }
}

const COLUMNS_CONVERSATION = `
  c.id, c.estado, c.prioridade, c.criada_em, c.atribuida_em, c.primeira_resposta_em,
  c.encerrada_em, c.ultima_mensagem_em, c.ultima_mensagem_de, c.janela_expira_em,
  c.fila_id, f.nome as fila_nome, c.atendente_id, u.nome as atendente_nome,
  ct.id as contato_id, ct.nome as contato_nome, ct.telefone_e164 as contato_telefone,
  ca.tipo as canal_tipo
`;

/** Filtro `campo=a,b` vira `in (…)`, com os valores conferidos contra a lista. */
export function igualEmLista(column: string, bruto: string, permitidos: readonly string[]): SQL {
  const values = bruto
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  const invalido = values.find((v) => !permitidos.includes(v));
  if (invalido) {
    throw PipeError.request(
      'filter_invalid',
      `"${invalido}" não é valor de ${column}. Aceitos: ${permitidos.join(', ')}.`,
    );
  }
  // Literal de array montado à mão: o template do drizzle achata array em parâmetros
  // soltos, e `= any($1::text[])` com um valor só quebraria com "malformed array".
  // Os valores já passaram pela lista fechada acima, então não há concatenação de
  // entrada do cliente aqui.
  return sql`${sql.raw(column)} = any(${`{${values.join(',')}}`}::text[])`;
}

export function juntar(filters: readonly SQL[]): SQL {
  if (filters.length === 0) return sql`true`;
  return filters.reduce((acumulado, atual) => sql`${acumulado} and ${atual}`);
}

function asConversation(linha: LineConversation): Record<string, unknown> {
  return {
    id: linha.id,
    estado: linha.state,
    prioridade: linha.priority,
    criada_em: iso(linha.criada_em),
    atribuida_em: iso(linha.atribuida_em),
    primeira_resposta_em: iso(linha.firstResponseAt),
    encerrada_em: iso(linha.encerrada_em),
    ultima_mensagem_em: iso(linha.lastMessageAt),
    ultima_mensagem_de: linha.lastMessageOf,
    janela_expira_em: iso(linha.windowExpiresAt),
    canal_tipo: linha.channelType,
    fila: linha.queueId ? { id: linha.queueId, name: linha.queueName } : null,
    atendente: linha.atendente_id ? { id: linha.atendente_id, name: linha.agentName } : null,
    contato: {
      id: linha.contactId,
      name: linha.contactName,
      phoneE164: linha.contactPhone,
    },
  };
}

function asMessage(linha: LineMessage): Record<string, unknown> {
  return {
    id: linha.id,
    criada_em: iso(linha.criada_em),
    direcao: linha.direction,
    autor_tipo: linha.autor_tipo,
    autor_id: linha.autor_id,
    tipo: linha.tipo,
    conteudo: linha.conteudo,
    estado_entrega: linha.stateDelivery,
    erro_codigo: linha.errorCode,
    erro_texto: linha.errorText,
    id_provedor: linha.id_provedor,
    entregue_em: iso(linha.entregue_em),
    lida_em: iso(linha.lida_em),
    dentro_da_janela: linha.insideOfWindow,
    categoria_cobranca: linha.categoria_cobranca,
  };
}

/**
 * `timestamptz` volta como `Date` ou como texto, dependendo de quantas cópias do
 * driver estão carregadas. Normalizar na borda é mais barato do que descobrir isso
 * de novo dentro de um cliente da API.
 */
function iso(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return (value instanceof Date ? value : new Date(value)).toISOString();
}
