import { sql } from 'drizzle-orm';
import { avaliarEnvio, classificarCusto } from '@pipe/core';
import type { CategoriaTemplate, TipoCanal } from '@pipe/core';
import { posicaoDeVariavel } from '@pipe/workers/whatsapp';
import type { CabecalhoTemplate } from '@pipe/workers/whatsapp';
import { noTenant } from '../banco.js';
import { ErroPipe } from '../erros.js';
import { registrarEvento } from './eventos.js';
import { drenarEmSegundoPlano, emitir } from '../webhooks-saida.js';
import { enfileirarEntrega } from '../filas.js';

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
  conversaId: string;
  /** Atendente que assina a mensagem. Ausente = integração, e a mensagem é do sistema. */
  atendenteId?: string | null;
  tipo?: TipoEnvio;
  texto?: string | null;
  templateId?: string | null;
  /** Valores das variáveis do corpo, na ordem de `{{1}}`, `{{2}}`, … */
  parametros?: string[];
  /** Mídia já subida para o storage. */
  anexoId?: string | null;
  /** URL pública da mídia do cabeçalho do template. É ela que ocupa a posição 1. */
  midiaUrl?: string | null;
}

export interface MensagemEnfileirada {
  id: string;
  estadoEntrega: 'pendente';
  dentroDaJanela: boolean;
  categoriaCobranca: string | null;
  conteudo: string | null;
}

/**
 * `@pipe/core` só conhece canal com janela e canal sem janela. Instagram, e-mail e
 * widget caem no segundo grupo — a mesma tradução que o Desk faz.
 */
function canalDoCore(tipo: string): TipoCanal {
  return tipo === 'whatsapp_cloud' ? 'whatsapp_cloud' : 'widget';
}

type LinhaConversa = {
  id: string;
  estado: string;
  fila_id: string | null;
  atendente_id: string | null;
  janela_expira_em: Date | string | null;
  primeira_resposta_em: Date | string | null;
  canal_id: string;
  canal_tipo: string;
};

type LinhaTemplate = {
  id: string;
  nome: string;
  categoria: CategoriaTemplate;
  corpo: string;
  status_meta: string;
  cabecalho_tipo: string;
  variaveis: unknown;
};

export async function enviarMensagem(pedido: PedidoDeEnvio): Promise<MensagemEnfileirada> {
  const agora = new Date();

  const resultado = await noTenant(pedido.tenantId, async (tx) => {
    const { rows } = await tx.execute<LinhaConversa>(sql`
      select c.id, c.estado, c.fila_id, c.atendente_id, c.janela_expira_em,
             c.primeira_resposta_em, ca.id as canal_id, ca.tipo as canal_tipo
        from conversa c
        join inbox ib on ib.id = c.inbox_id
        join canal ca on ca.id = ib.canal_id
       where c.id = ${pedido.conversaId}
       limit 1
    `);
    const conversa = rows[0];
    if (!conversa) throw ErroPipe.naoEncontrado('Conversa');
    if (conversa.estado === 'encerrada') {
      throw ErroPipe.conflito(
        'conversa_encerrada',
        'A conversa está encerrada. Reabra antes de responder.',
      );
    }

    let template: LinhaTemplate | null = null;
    if (pedido.templateId) {
      const { rows: linhas } = await tx.execute<LinhaTemplate>(sql`
        select id, nome, categoria, corpo, status_meta, cabecalho_tipo, variaveis
          from template_mensagem
         where id = ${pedido.templateId} and canal_id = ${conversa.canal_id}
         limit 1
      `);
      template = linhas[0] ?? null;
      if (!template) throw ErroPipe.naoEncontrado('Template');
      if (template.status_meta !== 'aprovado') {
        throw ErroPipe.conflito(
          'template_nao_aprovado',
          `O template "${template.nome}" está como "${template.status_meta}" na Meta.`,
        );
      }
    }

    const tipo = pedido.tipo ?? (template ? 'template' : 'texto');
    const avaliacao = avaliarEnvio({
      canal: canalDoCore(conversa.canal_tipo),
      expiraEm: comoData(conversa.janela_expira_em),
      agora,
      conteudo: template ? 'template' : 'texto_livre',
      categoriaTemplate: template?.categoria ?? null,
    });

    if (!avaliacao.permitido) {
      // Mensagem em português e acionável: é ela que o atendente lê na tela.
      const mensagem =
        avaliacao.motivo === 'janela_fechada'
          ? 'A janela de 24 horas fechou: fora dela só sai template aprovado pela Meta. ' +
            'Escolha um template para reabrir a conversa.'
          : 'O template não tem categoria de cobrança definida.';
      throw new ErroPipe(409, avaliacao.motivo ?? 'envio_bloqueado', mensagem, {
        modo: avaliacao.modo,
        restante_seg: Math.round(avaliacao.restanteSeg),
      });
    }

    const conteudo = template
      ? renderizar(template.corpo, pedido.parametros ?? [])
      : (pedido.texto?.trim() ?? null);
    if (!conteudo && !pedido.anexoId) {
      throw ErroPipe.requisicao('conteudo_vazio', 'Escreva algo ou anexe um arquivo.');
    }

    const { rows: criada } = await tx.execute<{ id: string }>(sql`
      insert into mensagem (
        tenant_id, conversa_id, direcao, autor_tipo, autor_id, tipo, conteudo,
        anexo_id, template_id, estado_entrega, criada_em, dentro_da_janela, categoria_cobranca
      ) values (
        ${pedido.tenantId}, ${conversa.id}, 'saida',
        ${pedido.atendenteId ? 'atendente' : 'sistema'}, ${pedido.atendenteId ?? null},
        ${tipo}, ${conteudo}, ${pedido.anexoId ?? null}, ${template?.id ?? null},
        'pendente', ${agora}, ${avaliacao.dentroDaJanela},
        ${classificarCusto({
          conteudo: template ? 'template' : 'texto_livre',
          dentroDaJanela: avaliacao.dentroDaJanela,
          categoriaTemplate: template?.categoria ?? null,
        })}
      )
      returning id
    `);
    const mensagemId = criada[0]?.id;
    if (!mensagemId) throw new Error('não gravou a mensagem');

    await tx.execute(sql`
      insert into outbox_mensagem (tenant_id, mensagem_id, estado)
      values (${pedido.tenantId}, ${mensagemId}, 'pendente')
    `);

    // Responder tira a conversa de `atribuida` e de `em_espera` — as duas transições
    // que a máquina de estados permite para `em_atendimento`.
    const estadoNovo =
      conversa.estado === 'atribuida' || conversa.estado === 'em_espera'
        ? 'em_atendimento'
        : conversa.estado;
    const primeiraResposta = comoData(conversa.primeira_resposta_em) === null && !!pedido.atendenteId;

    await tx.execute(sql`
      update conversa
         set estado = ${estadoNovo}, em_espera_desde = null,
             ultima_mensagem_em = ${agora}, ultima_mensagem_de = 'atendente',
             primeira_resposta_em = coalesce(primeira_resposta_em, ${
               primeiraResposta ? agora : null
             }),
             atualizado_em = now()
       where id = ${conversa.id}
    `);

    await registrarEvento(tx, {
      tenantId: pedido.tenantId,
      conversaId: conversa.id,
      tipo: 'mensagem_saida',
      em: agora,
      usuarioId: pedido.atendenteId ?? null,
      filaId: conversa.fila_id,
    });
    if (primeiraResposta) {
      await registrarEvento(tx, {
        tenantId: pedido.tenantId,
        conversaId: conversa.id,
        tipo: 'primeira_resposta',
        em: agora,
        usuarioId: pedido.atendenteId ?? null,
        filaId: conversa.fila_id,
      });
    }

    await emitir(tx, pedido.tenantId, 'mensagem.criada', {
      mensagem_id: mensagemId,
      conversa_id: conversa.id,
      direcao: 'saida',
      tipo,
      conteudo,
    });

    return {
      mensagemId,
      dentroDaJanela: avaliacao.dentroDaJanela,
      categoriaCobranca: avaliacao.categoriaCobranca,
      conteudo,
      valores: template
        ? posicionar(template, pedido.parametros ?? [], pedido.midiaUrl ?? null)
        : null,
    };
  });

  // Fora da transação: enfileirar e drenar webhook não podem prender o commit.
  await enfileirarEntrega({
    mensagemId: resultado.mensagemId,
    ...(resultado.valores ? { parametros: resultado.valores } : {}),
  });
  drenarEmSegundoPlano(pedido.tenantId);

  return {
    id: resultado.mensagemId,
    estadoEntrega: 'pendente',
    dentroDaJanela: resultado.dentroDaJanela,
    categoriaCobranca: resultado.categoriaCobranca,
    conteudo: resultado.conteudo,
  };
}

/** `{{1}}`, `{{2}}`, … no corpo do template. A numeração aqui é a do **corpo**. */
function renderizar(corpo: string, parametros: readonly string[]): string {
  return corpo.replace(/\{\{(\d+)\}\}/g, (_todo, numero: string) => {
    const valor = parametros[Number(numero) - 1];
    return valor ?? `{{${numero}}}`;
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
  linkDaMidia: string | null,
): Record<string, string> {
  const cabecalho = (template.cabecalho_tipo ?? 'nenhum') as CabecalhoTemplate;
  const valores: Record<string, string> = {};
  if (linkDaMidia) valores['1'] = linkDaMidia;
  parametros.forEach((valor, indice) => {
    valores[String(posicaoDeVariavel(indice + 1, cabecalho))] = valor;
  });
  return valores;
}

function comoData(valor: Date | string | null): Date | null {
  if (valor === null) return null;
  return valor instanceof Date ? valor : new Date(valor);
}
