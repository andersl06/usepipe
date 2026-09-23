import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { EncerrarConversaInput } from '@pipe/contracts';
import { noTenant } from '../banco.js';
import { ChaveOuSessao, Escopos, atorDe, contextoDe } from '../autenticacao.js';
import type { RequisicaoAutenticada } from '../autenticacao.js';
import type { RequisicaoComSessao } from '../sessao.js';
import { alternarEspera, encerrarConversa, transferirConversa } from '../dominio/conversa.js';
import { enviarAnexos, enviarMensagem, reenviarMensagem } from '../dominio/envio.js';
import type { TipoEnvio } from '../dominio/envio.js';
import { ErroPipe } from '../erros.js';
import {
  condicaoDeCursor,
  lerCursor,
  lerLimite,
  lerOrdenacao,
  montarPagina,
  ordemSql,
} from '../paginacao.js';
import type { Pagina } from '../paginacao.js';

/**
 * `/v1/conversas` — o recurso central da API.
 *
 * Padrão de `apis.md` §5: recurso plural, filtro na query string, ordenação
 * declarada e paginação por cursor. Nenhuma consulta filtra `tenant_id` na mão: a
 * RLS já filtra, e filtrar de novo esconderia um bug de isolamento em vez de expô-lo.
 */

const ESTADOS = ['na_fila', 'atribuida', 'em_atendimento', 'em_espera', 'encerrada'];

type LinhaConversa = {
  id: string;
  estado: string;
  prioridade: string;
  criada_em: Date | string;
  atribuida_em: Date | string | null;
  primeira_resposta_em: Date | string | null;
  encerrada_em: Date | string | null;
  ultima_mensagem_em: Date | string | null;
  ultima_mensagem_de: string | null;
  janela_expira_em: Date | string | null;
  fila_id: string | null;
  fila_nome: string | null;
  atendente_id: string | null;
  atendente_nome: string | null;
  contato_id: string;
  contato_nome: string | null;
  contato_telefone: string | null;
  canal_tipo: string;
};

type LinhaMensagem = {
  id: string;
  criada_em: Date | string;
  direcao: string;
  autor_tipo: string;
  autor_id: string | null;
  tipo: string;
  conteudo: string | null;
  estado_entrega: string | null;
  erro_codigo: string | null;
  erro_texto: string | null;
  id_provedor: string | null;
  entregue_em: Date | string | null;
  lida_em: Date | string | null;
  dentro_da_janela: boolean | null;
  categoria_cobranca: string | null;
};

interface CorpoDeEnvio {
  texto?: string;
  tipo?: TipoEnvio;
  template_id?: string;
  parametros?: string[];
  anexo_id?: string;
  midia_url?: string;
  atendente_id?: string;
  resposta_pronta_id?: string;
}

@Controller('v1/conversas')
export class ControladorConversas {
  @Get()
  @Escopos('conversas:ler')
  async listar(
    @Req() requisicao: RequisicaoAutenticada,
    @Query() consulta: Record<string, string | undefined>,
  ): Promise<Pagina<Record<string, unknown>>> {
    const { tenantId } = contextoDe(requisicao);
    const limite = lerLimite(consulta['limit']);
    const cursor = lerCursor(consulta['cursor']);
    const ordem = lerOrdenacao(consulta['order_by'], ['criada_em', 'ultima_mensagem_em'], {
      campo: 'criada_em',
      direcao: 'desc',
    });
    // `ultima_mensagem_em` é nulo em conversa sem mensagem; sem o `coalesce` a linha
    // sumiria da paginação por cursor em vez de aparecer no fim.
    const expressao =
      ordem.campo === 'ultima_mensagem_em'
        ? 'coalesce(c.ultima_mensagem_em, c.criada_em)'
        : 'c.criada_em';

    const filtros: SQL[] = [];
    if (consulta['estado']) filtros.push(igualEmLista('c.estado', consulta['estado'], ESTADOS));
    if (consulta['fila_id']) filtros.push(sql`c.fila_id = ${consulta['fila_id']}::uuid`);
    if (consulta['atendente_id']) {
      filtros.push(sql`c.atendente_id = ${consulta['atendente_id']}::uuid`);
    }
    if (consulta['contato_id']) filtros.push(sql`c.contato_id = ${consulta['contato_id']}::uuid`);

    const linhas = await noTenant(tenantId, async (tx) => {
      const { rows } = await tx.execute<LinhaConversa & { chave: Date | string }>(sql`
        select ${sql.raw(expressao)} as chave, ${sql.raw(COLUNAS_CONVERSA)}
          from conversa c
          join contato ct on ct.id = c.contato_id
          join inbox ib on ib.id = c.inbox_id
          join canal ca on ca.id = ib.canal_id
          left join fila f on f.id = c.fila_id
          left join usuario u on u.id = c.atendente_id
         where ${juntar(filtros)}
           and ${condicaoDeCursor(expressao, 'timestamptz', ordem.direcao, cursor, 'c.id')}
         order by ${ordemSql(expressao, ordem.direcao, 'c.id')}
         limit ${limite + 1}
      `);
      return rows;
    });

    // O cursor sai da linha crua, antes da serialização: a chave de ordenação é
    // detalhe de paginação e não precisa aparecer no corpo da resposta.
    const pagina = montarPagina(linhas, limite, (linha) => ({
      valor: iso(linha.chave) ?? '',
      id: linha.id,
    }));
    return { data: pagina.data.map(comoConversa), page_info: pagina.page_info };
  }

  @Get(':id')
  @Escopos('conversas:ler')
  async obter(
    @Req() requisicao: RequisicaoAutenticada,
    @Param('id') id: string,
  ): Promise<Record<string, unknown>> {
    const { tenantId } = contextoDe(requisicao);
    const linha = await noTenant(tenantId, async (tx) => {
      const { rows } = await tx.execute<LinhaConversa & { chave: Date | string }>(sql`
        select c.criada_em as chave, ${sql.raw(COLUNAS_CONVERSA)}
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
    if (!linha) throw ErroPipe.naoEncontrado('Conversa');
    return comoConversa(linha);
  }

  @Get(':id/mensagens')
  @Escopos('mensagens:ler')
  async mensagens(
    @Req() requisicao: RequisicaoAutenticada,
    @Param('id') id: string,
    @Query() consulta: Record<string, string | undefined>,
  ): Promise<Pagina<Record<string, unknown>>> {
    const { tenantId } = contextoDe(requisicao);
    const limite = lerLimite(consulta['limit']);
    const cursor = lerCursor(consulta['cursor']);
    const ordem = lerOrdenacao(consulta['order_by'], ['criada_em'], {
      campo: 'criada_em',
      direcao: 'asc',
    });

    const filtros: SQL[] = [sql`conversa_id = ${id}::uuid`];
    if (consulta['direcao']) {
      filtros.push(igualEmLista('direcao', consulta['direcao'], ['entrada', 'saida', 'interna']));
    }
    if (consulta['estado_entrega']) {
      filtros.push(
        igualEmLista('estado_entrega', consulta['estado_entrega'], [
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
      const { rows } = await tx.execute<LinhaMensagem>(sql`
        select id, criada_em, direcao, autor_tipo, autor_id, tipo, conteudo, estado_entrega,
               erro_codigo, erro_texto, id_provedor, entregue_em, lida_em, dentro_da_janela,
               categoria_cobranca
          from mensagem
         where ${juntar(filtros)}
           and ${condicaoDeCursor('criada_em', 'timestamptz', ordem.direcao, cursor)}
         order by ${ordemSql('criada_em', ordem.direcao)}
         limit ${limite + 1}
      `);
      return rows;
    });

    const pagina = montarPagina(linhas, limite, (linha) => ({
      valor: iso(linha.criada_em) ?? '',
      id: linha.id,
    }));
    return { data: pagina.data.map(comoMensagem), page_info: pagina.page_info };
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
  @ChaveOuSessao('mensagens:escrever')
  async enviar(
    @Req() requisicao: RequisicaoAutenticada & RequisicaoComSessao,
    @Param('id') id: string,
    @Body() corpo: CorpoDeEnvio,
  ): Promise<Record<string, unknown>> {
    const ator = atorDe(requisicao);
    const enfileirada = await enviarMensagem({
      tenantId: ator.tenantId,
      conversaId: id,
      atendenteId: ator.viaSessao ? ator.usuarioId : (corpo.atendente_id ?? null),
      exigirAtribuicao: ator.viaSessao,
      ...(corpo.tipo ? { tipo: corpo.tipo } : {}),
      texto: corpo.texto ?? null,
      templateId: corpo.template_id ?? null,
      ...(corpo.parametros ? { parametros: corpo.parametros } : {}),
      anexoId: corpo.anexo_id ?? null,
      midiaUrl: corpo.midia_url ?? null,
      respostaProntaId: corpo.resposta_pronta_id ?? null,
    });
    return {
      id: enfileirada.id,
      estado_entrega: enfileirada.estadoEntrega,
      dentro_da_janela: enfileirada.dentroDaJanela,
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
  @ChaveOuSessao('mensagens:escrever')
  async enviarLoteDeAnexos(
    @Req() requisicao: RequisicaoAutenticada & RequisicaoComSessao,
    @Param('id') id: string,
    @Body() corpo: { anexo_ids?: unknown; texto?: string; atendente_id?: string },
  ): Promise<{ mensagens: Record<string, unknown>[] }> {
    const ator = atorDe(requisicao);
    const ids = Array.isArray(corpo?.anexo_ids)
      ? corpo.anexo_ids.filter((v): v is string => typeof v === 'string')
      : [];
    if (ids.length === 0) {
      throw ErroPipe.requisicao('conteudo_vazio', 'Informe `anexo_ids` com ao menos um anexo.');
    }
    const enviadas = await enviarAnexos({
      tenantId: ator.tenantId,
      conversaId: id,
      atendenteId: ator.viaSessao ? ator.usuarioId : (corpo.atendente_id ?? null),
      exigirAtribuicao: ator.viaSessao,
      anexoIds: ids,
      texto: corpo.texto ?? null,
    });
    return {
      mensagens: enviadas.map((m) => ({
        id: m.id,
        estado_entrega: m.estadoEntrega,
        dentro_da_janela: m.dentroDaJanela,
        categoria_cobranca: m.categoriaCobranca,
        conteudo: m.conteudo,
      })),
    };
  }

  /**
   * Encerrar. A lista replica o `blip-tags` da Blip e respeita tags obrigatórias.
   */
  @Post(':id/encerrar')
  @ChaveOuSessao('conversas:escrever')
  async encerrar(
    @Req() requisicao: RequisicaoAutenticada & RequisicaoComSessao,
    @Param('id') id: string,
    @Body() corpo: EncerrarConversaInput,
  ): Promise<Record<string, unknown>> {
    const ator = atorDe(requisicao);
    const r = await encerrarConversa(
      {
        tenantId: ator.tenantId,
        atendenteId: ator.usuarioId,
        exigirAtribuicao: ator.viaSessao,
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
  @ChaveOuSessao('mensagens:escrever')
  async reenviar(
    @Req() requisicao: RequisicaoAutenticada & RequisicaoComSessao,
    @Param('mensagemId') mensagemId: string,
  ): Promise<Record<string, unknown>> {
    const ator = atorDe(requisicao);
    const r = await reenviarMensagem(ator.tenantId, mensagemId);
    return { id: r.id, estado_entrega: r.estadoEntrega };
  }

  /**
   * Transferir para outra fila ou para outro atendente.
   *
   * **Encerra a conversa atual e abre outra no destino** — não é transição de estado.
   * A regra está em `packages/core/src/conversa/maquina.ts` e é a da Blip. Por isso a
   * resposta traz DOIS ids: o que foi encerrado e o novo.
   */
  @Post(':id/transferir')
  @ChaveOuSessao('conversas:escrever')
  async transferir(
    @Req() requisicao: RequisicaoAutenticada & RequisicaoComSessao,
    @Param('id') id: string,
    @Body() corpo: { para_fila_id?: string; para_atendente_id?: string; motivo?: string },
  ): Promise<Record<string, unknown>> {
    const ator = atorDe(requisicao);
    const r = await transferirConversa(
      {
        tenantId: ator.tenantId,
        atendenteId: ator.usuarioId,
        exigirAtribuicao: ator.viaSessao,
      },
      {
        conversaId: id,
        paraFilaId: corpo.para_fila_id ?? null,
        paraAtendenteId: corpo.para_atendente_id ?? null,
        motivo: corpo.motivo ?? null,
      },
    );
    return {
      de_conversa_id: r.deConversaId,
      para_conversa_id: r.paraConversaId,
      estado: r.estado,
    };
  }

  /** Entra em espera, ou sai dela. A mesma rota nos dois sentidos, como o botão. */
  @Post(':id/espera')
  @ChaveOuSessao('conversas:escrever')
  async espera(
    @Req() requisicao: RequisicaoAutenticada & RequisicaoComSessao,
    @Param('id') id: string,
  ): Promise<Record<string, unknown>> {
    const ator = atorDe(requisicao);
    const r = await alternarEspera(
      {
        tenantId: ator.tenantId,
        atendenteId: ator.usuarioId,
        exigirAtribuicao: ator.viaSessao,
      },
      id,
    );
    return { estado: r.estado, pausado_seg: r.pausadoSeg };
  }
}

const COLUNAS_CONVERSA = `
  c.id, c.estado, c.prioridade, c.criada_em, c.atribuida_em, c.primeira_resposta_em,
  c.encerrada_em, c.ultima_mensagem_em, c.ultima_mensagem_de, c.janela_expira_em,
  c.fila_id, f.nome as fila_nome, c.atendente_id, u.nome as atendente_nome,
  ct.id as contato_id, ct.nome as contato_nome, ct.telefone_e164 as contato_telefone,
  ca.tipo as canal_tipo
`;

/** Filtro `campo=a,b` vira `in (…)`, com os valores conferidos contra a lista. */
export function igualEmLista(coluna: string, bruto: string, permitidos: readonly string[]): SQL {
  const valores = bruto
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  const invalido = valores.find((v) => !permitidos.includes(v));
  if (invalido) {
    throw ErroPipe.requisicao(
      'filtro_invalido',
      `"${invalido}" não é valor de ${coluna}. Aceitos: ${permitidos.join(', ')}.`,
    );
  }
  // Literal de array montado à mão: o template do drizzle achata array em parâmetros
  // soltos, e `= any($1::text[])` com um valor só quebraria com "malformed array".
  // Os valores já passaram pela lista fechada acima, então não há concatenação de
  // entrada do cliente aqui.
  return sql`${sql.raw(coluna)} = any(${`{${valores.join(',')}}`}::text[])`;
}

export function juntar(filtros: readonly SQL[]): SQL {
  if (filtros.length === 0) return sql`true`;
  return filtros.reduce((acumulado, atual) => sql`${acumulado} and ${atual}`);
}

function comoConversa(linha: LinhaConversa): Record<string, unknown> {
  return {
    id: linha.id,
    estado: linha.estado,
    prioridade: linha.prioridade,
    criada_em: iso(linha.criada_em),
    atribuida_em: iso(linha.atribuida_em),
    primeira_resposta_em: iso(linha.primeira_resposta_em),
    encerrada_em: iso(linha.encerrada_em),
    ultima_mensagem_em: iso(linha.ultima_mensagem_em),
    ultima_mensagem_de: linha.ultima_mensagem_de,
    janela_expira_em: iso(linha.janela_expira_em),
    canal_tipo: linha.canal_tipo,
    fila: linha.fila_id ? { id: linha.fila_id, nome: linha.fila_nome } : null,
    atendente: linha.atendente_id ? { id: linha.atendente_id, nome: linha.atendente_nome } : null,
    contato: {
      id: linha.contato_id,
      nome: linha.contato_nome,
      telefone_e164: linha.contato_telefone,
    },
  };
}

function comoMensagem(linha: LinhaMensagem): Record<string, unknown> {
  return {
    id: linha.id,
    criada_em: iso(linha.criada_em),
    direcao: linha.direcao,
    autor_tipo: linha.autor_tipo,
    autor_id: linha.autor_id,
    tipo: linha.tipo,
    conteudo: linha.conteudo,
    estado_entrega: linha.estado_entrega,
    erro_codigo: linha.erro_codigo,
    erro_texto: linha.erro_texto,
    id_provedor: linha.id_provedor,
    entregue_em: iso(linha.entregue_em),
    lida_em: iso(linha.lida_em),
    dentro_da_janela: linha.dentro_da_janela,
    categoria_cobranca: linha.categoria_cobranca,
  };
}

/**
 * `timestamptz` volta como `Date` ou como texto, dependendo de quantas cópias do
 * driver estão carregadas. Normalizar na borda é mais barato do que descobrir isso
 * de novo dentro de um cliente da API.
 */
function iso(valor: Date | string | null | undefined): string | null {
  if (valor === null || valor === undefined) return null;
  return (valor instanceof Date ? valor : new Date(valor)).toISOString();
}
