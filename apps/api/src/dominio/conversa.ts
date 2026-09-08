import { sql } from 'drizzle-orm';
import { TransicaoInvalidaError, transitar } from '@pipe/core';
import type { EstadoConversa } from '@pipe/core';
import { noTenant } from '../banco.js';
import { ErroPipe } from '../erros.js';
import { registrarEvento } from './eventos.js';
import { exigirPermissao } from '../sessao.js';
import { drenarEmSegundoPlano, emitir } from '../webhooks-saida.js';

/**
 * Encerrar e pausar conversa.
 *
 * Existem aqui, e não na tela, porque **o evento não pode depender de a tela lembrar**.
 * O Desk encerrava e pausava escrevendo direto na tabela e não gravava
 * `evento_atendimento` nenhum — o resultado era TMR, SLA e esforço cegos para tudo o
 * que o atendente fazia, com a Gestão mostrando número errado com cara de certo.
 *
 * `evento_atendimento` é a fonte de toda métrica e é imutável (modelo de dados §4).
 * Estado da conversa é cache do que os eventos já dizem; se os dois divergirem, quem
 * está certo é o evento.
 */

type LinhaConversa = {
  id: string;
  estado: string;
  fila_id: string | null;
  atendente_id: string | null;
  em_espera_desde: Date | string | null;
};

/** Quem está pedindo. `atendenteId` nulo é integração — não é dono de conversa. */
export interface AtorDaConversa {
  tenantId: string;
  atendenteId: string | null;
  /** Exige que a conversa esteja atribuída ao `atendenteId`. Ver `envio.ts`. */
  exigirAtribuicao: boolean;
}

async function carregar(
  tx: Parameters<Parameters<typeof noTenant>[1]>[0],
  conversaId: string,
  ator: AtorDaConversa,
): Promise<LinhaConversa> {
  const { rows } = await tx.execute<LinhaConversa>(sql`
    select id, estado, fila_id, atendente_id, em_espera_desde
      from conversa where id = ${conversaId}::uuid limit 1
  `);
  const conversa = rows[0];
  if (!conversa) throw ErroPipe.naoEncontrado('Conversa');
  if (ator.exigirAtribuicao && conversa.atendente_id !== ator.atendenteId) {
    throw new ErroPipe(
      403,
      'conversa_de_outro_atendente',
      conversa.atendente_id
        ? 'Esta conversa está com outro atendente.'
        : 'Esta conversa não está atribuída a você.',
    );
  }
  return conversa;
}

/** Traduz a recusa da máquina de estados em 409, sem vazar `never` para o controlador. */
function exigirTransicao(de: string, para: EstadoConversa): void {
  try {
    transitar(de as EstadoConversa, para);
  } catch (erro) {
    if (erro instanceof TransicaoInvalidaError) {
      throw ErroPipe.conflito('transicao_invalida', erro.message);
    }
    throw erro;
  }
}

export interface PedidoDeEncerramento {
  conversaId: string;
  /**
   * Etiqueta de encerramento. **Obrigatória**: conversa fechada sem motivo é relatório
   * que não explica nada depois — a regra já valia no Desk e sobe junto com ela.
   */
  etiquetaId: string;
}

export async function encerrarConversa(
  ator: AtorDaConversa,
  pedido: PedidoDeEncerramento,
): Promise<{ estado: 'encerrada'; motivo: string }> {
  const agora = new Date();

  const resultado = await noTenant(ator.tenantId, async (tx) => {
    const conversa = await carregar(tx, pedido.conversaId, ator);
    exigirTransicao(conversa.estado, 'encerrada');

    const { rows: etiquetas } = await tx.execute<{ nome: string }>(
      sql`select nome from etiqueta where id = ${pedido.etiquetaId}::uuid limit 1`,
    );
    const etiqueta = etiquetas[0];
    if (!etiqueta) throw ErroPipe.naoEncontrado('Etiqueta');

    await tx.execute(sql`
      insert into conversa_etiqueta (tenant_id, conversa_id, etiqueta_id, por_usuario_id)
      values (${ator.tenantId}, ${conversa.id}, ${pedido.etiquetaId}, ${ator.atendenteId})
      on conflict do nothing
    `);

    // Uma conversa encerrada em espera tem de fechar a espera antes, senão o intervalo
    // pausado fica aberto para sempre e some do relatório de esforço.
    const pausaEmAberto = conversa.estado === 'em_espera' && conversa.em_espera_desde !== null;
    const pausadoSeg = pausaEmAberto
      ? Math.round((agora.getTime() - comoData(conversa.em_espera_desde)!.getTime()) / 1000)
      : 0;

    await tx.execute(sql`
      update conversa
         set estado = 'encerrada', encerrada_em = ${agora}, encerrada_por = ${ator.atendenteId},
             motivo_encerramento = ${etiqueta.nome}, em_espera_desde = null,
             pausado_seg = pausado_seg + ${pausadoSeg}, atualizado_em = ${agora}
       where id = ${conversa.id}
    `);

    if (pausaEmAberto) {
      await registrarEvento(tx, {
        tenantId: ator.tenantId,
        conversaId: conversa.id,
        tipo: 'espera_encerrada',
        em: agora,
        usuarioId: ator.atendenteId,
        filaId: conversa.fila_id,
        dados: { motivo: 'encerramento', pausado_seg: pausadoSeg },
      });
    }

    await registrarEvento(tx, {
      tenantId: ator.tenantId,
      conversaId: conversa.id,
      tipo: 'encerrada',
      em: agora,
      usuarioId: ator.atendenteId,
      filaId: conversa.fila_id,
      // `encerradaPor` do `@pipe/core` é QUEM tirou da tela, não o id de quem clicou.
      dados: {
        encerrada_por: ator.atendenteId ? 'atendente' : 'transferencia',
        etiqueta: etiqueta.nome,
      },
    });

    await emitir(tx, ator.tenantId, 'conversa.encerrada', {
      conversa_id: conversa.id,
      motivo: etiqueta.nome,
      encerrada_por: ator.atendenteId,
    });

    return { motivo: etiqueta.nome };
  });

  drenarEmSegundoPlano(ator.tenantId);
  return { estado: 'encerrada', motivo: resultado.motivo };
}

export interface EsperaAlternada {
  estado: 'em_espera' | 'em_atendimento';
  /** Segundos somados ao acumulado nesta virada. Zero ao entrar em espera. */
  pausadoSeg: number;
}

/**
 * Modo de espera: pausa a conversa sem que a inatividade do cliente conte.
 *
 * O intervalo em espera vira coluna própria no relatório — some do SLA, não do número.
 */
export async function alternarEspera(
  ator: AtorDaConversa,
  conversaId: string,
): Promise<EsperaAlternada> {
  const agora = new Date();

  return noTenant(ator.tenantId, async (tx) => {
    const conversa = await carregar(tx, conversaId, ator);
    const destino: EstadoConversa = conversa.estado === 'em_espera' ? 'em_atendimento' : 'em_espera';
    exigirTransicao(conversa.estado, destino);

    if (destino === 'em_espera') {
      await tx.execute(sql`
        update conversa set estado = 'em_espera', em_espera_desde = ${agora},
                            atualizado_em = ${agora}
         where id = ${conversa.id}
      `);
      await registrarEvento(tx, {
        tenantId: ator.tenantId,
        conversaId: conversa.id,
        tipo: 'espera_iniciada',
        em: agora,
        usuarioId: ator.atendenteId,
        filaId: conversa.fila_id,
      });
      await emitir(tx, ator.tenantId, 'conversa.estado_alterado', {
        conversa_id: conversa.id,
        estado: 'em_espera',
      });
      return { estado: destino, pausadoSeg: 0 };
    }

    const inicio = comoData(conversa.em_espera_desde);
    const pausadoSeg = inicio ? Math.round((agora.getTime() - inicio.getTime()) / 1000) : 0;
    await tx.execute(sql`
      update conversa set estado = 'em_atendimento', em_espera_desde = null,
                          pausado_seg = pausado_seg + ${pausadoSeg}, atualizado_em = ${agora}
       where id = ${conversa.id}
    `);
    await registrarEvento(tx, {
      tenantId: ator.tenantId,
      conversaId: conversa.id,
      tipo: 'espera_encerrada',
      em: agora,
      usuarioId: ator.atendenteId,
      filaId: conversa.fila_id,
      dados: { pausado_seg: pausadoSeg },
    });
    await emitir(tx, ator.tenantId, 'conversa.estado_alterado', {
      conversa_id: conversa.id,
      estado: 'em_atendimento',
    });
    return { estado: destino, pausadoSeg };
  });
}

export interface PedidoDeTransferencia {
  conversaId: string;
  /** Exatamente UM dos dois. Fila devolve para a fila; atendente entrega direto. */
  paraFilaId?: string | null;
  paraAtendenteId?: string | null;
  motivo?: string | null;
}

export interface Transferida {
  /** A conversa que foi ENCERRADA. */
  deConversaId: string;
  /** A conversa NOVA, no destino. */
  paraConversaId: string;
  estado: 'na_fila' | 'atribuida';
}

/**
 * Transferir conversa, para fila ou para atendente.
 *
 * **Transferência não é transição de estado**: ela ENCERRA a conversa atual com
 * `encerrada_por = transferencia` e ABRE outra no destino. Não é escolha minha — está
 * decidido em `packages/core/src/conversa/maquina.ts`, que por isso não tem aresta de
 * `atribuida` de volta para `na_fila`, e é a regra da Blip ("o ticket atual é
 * encerrado com status Transferido e um novo ticket é aberto",
 * `docs/pesquisa/blip-desk-funcoes.md` §3).
 *
 * O que a conversa nova HERDA, e por quê:
 *
 * - **A janela de 24 horas** (`janela_expira_em` e a mensagem que a abriu). A janela é
 *   do CONTATO, não do ticket: sem herdar, quem recebe a transferência não consegue
 *   mandar texto livre e não entende por quê. É a armadilha mais cara daqui.
 * - **A prioridade** — a Blip herda, e prioridade é do problema, não do atendente.
 * - **A última mensagem** (`ultima_mensagem_em`/`_de`), senão o fechamento automático
 *   por inatividade trataria a conversa nova como recém-nascida.
 *
 * O que NÃO herda: **as etiquetas** (a Blip também não) e **as mensagens** — elas ficam
 * na conversa encerrada, e o histórico do contato é quem costura as duas na tela.
 *
 * O efeito na métrica, escrito porque é a pergunta que sempre volta: a conversa nova
 * começa com `criada_em = agora` e `primeira_resposta_em` nulo, então **o TMR de quem
 * recebe mede quem recebe**, e o tempo de fila da transferência conta de novo. É o
 * preço do modelo da Blip, e o relatório de transferências (`atribuicao`) é o que
 * permite remontar a jornada inteira do cliente.
 */
export async function transferirConversa(
  ator: AtorDaConversa,
  pedido: PedidoDeTransferencia,
): Promise<Transferida> {
  const paraFila = pedido.paraFilaId ?? null;
  const paraAtendente = pedido.paraAtendenteId ?? null;
  if ((paraFila && paraAtendente) || (!paraFila && !paraAtendente)) {
    throw ErroPipe.requisicao(
      'destino_invalido',
      'Informe `para_fila_id` OU `para_atendente_id`, um só.',
    );
  }

  const agora = new Date();

  const resultado = await noTenant(ator.tenantId, async (tx) => {
    const { rows } = await tx.execute<
      LinhaConversa & {
        inbox_id: string;
        contato_id: string;
        prioridade: string;
        janela_expira_em: Date | string | null;
        janela_aberta_por_mensagem_id: string | null;
        ultima_mensagem_em: Date | string | null;
        ultima_mensagem_de: string | null;
      }
    >(sql`
      select id, estado, fila_id, atendente_id, em_espera_desde, inbox_id, contato_id,
             prioridade, janela_expira_em, janela_aberta_por_mensagem_id,
             ultima_mensagem_em, ultima_mensagem_de
        from conversa where id = ${pedido.conversaId}::uuid limit 1
    `);
    const conversa = rows[0];
    if (!conversa) throw ErroPipe.naoEncontrado('Conversa');
    if (conversa.estado === 'encerrada') {
      throw ErroPipe.conflito('conversa_encerrada', 'A conversa já está encerrada.');
    }

    // Transferir a conversa de OUTRO é ação de supervisão, e é para isso que a
    // permissão `conversa.transferir` existe (modelo de dados §64). Quem transfere a
    // própria não precisa dela — como no Desk da Blip, onde o ícone fica no cabeçalho
    // do ticket do próprio atendente.
    const ehDono = conversa.atendente_id === ator.atendenteId && ator.atendenteId !== null;
    if (ator.exigirAtribuicao && !ehDono) {
      if (!ator.atendenteId) throw ErroPipe.naoAutorizado();
      await exigirPermissao(tx, ator.atendenteId, 'conversa.transferir');
    }

    if (paraFila) {
      const { rows: f } = await tx.execute<{ id: string }>(
        sql`select id from fila where id = ${paraFila}::uuid and ativa limit 1`,
      );
      if (!f[0]) throw ErroPipe.naoEncontrado('Fila');
      if (paraFila === conversa.fila_id && !conversa.atendente_id) {
        throw ErroPipe.conflito('mesmo_destino', 'A conversa já está nesta fila.');
      }
    } else {
      const { rows: u } = await tx.execute<{ id: string }>(
        sql`select id from usuario where id = ${paraAtendente}::uuid and ativo limit 1`,
      );
      if (!u[0]) throw ErroPipe.naoEncontrado('Atendente');
      if (paraAtendente === conversa.atendente_id) {
        throw ErroPipe.conflito('mesmo_destino', 'A conversa já está com este atendente.');
      }
    }

    // Espera em aberto fecha ANTES do encerramento, senão o intervalo pausado fica
    // aberto para sempre e some do relatório de esforço.
    const pausaEmAberto = conversa.estado === 'em_espera' && conversa.em_espera_desde !== null;
    const pausadoSeg = pausaEmAberto
      ? Math.round((agora.getTime() - comoData(conversa.em_espera_desde)!.getTime()) / 1000)
      : 0;
    if (pausaEmAberto) {
      await registrarEvento(tx, {
        tenantId: ator.tenantId,
        conversaId: conversa.id,
        tipo: 'espera_encerrada',
        em: agora,
        usuarioId: ator.atendenteId,
        filaId: conversa.fila_id,
        dados: { motivo: 'transferencia', pausado_seg: pausadoSeg },
      });
    }

    await tx.execute(sql`
      update conversa
         set estado = 'encerrada', encerrada_em = ${agora}, encerrada_por = ${ator.atendenteId},
             motivo_encerramento = 'Transferida', em_espera_desde = null,
             pausado_seg = pausado_seg + ${pausadoSeg}, atualizado_em = ${agora}
       where id = ${conversa.id}
    `);
    await registrarEvento(tx, {
      tenantId: ator.tenantId,
      conversaId: conversa.id,
      tipo: 'encerrada',
      em: agora,
      usuarioId: ator.atendenteId,
      filaId: conversa.fila_id,
      // `encerrada_por = transferencia` é o que separa, no relatório, a conversa que
      // acabou da que só mudou de mãos.
      dados: { encerrada_por: 'transferencia', motivo: pedido.motivo ?? null },
    });

    const filaDestino = paraFila ?? conversa.fila_id;
    const estadoNovo: 'na_fila' | 'atribuida' = paraAtendente ? 'atribuida' : 'na_fila';

    const { rows: nova } = await tx.execute<{ id: string }>(sql`
      insert into conversa (
        tenant_id, inbox_id, contato_id, fila_id, atendente_id, estado, prioridade,
        criada_em, atribuida_em, janela_expira_em, janela_aberta_por_mensagem_id,
        ultima_mensagem_em, ultima_mensagem_de
      ) values (
        ${ator.tenantId}, ${conversa.inbox_id}, ${conversa.contato_id}, ${filaDestino},
        ${paraAtendente}, ${estadoNovo}, ${conversa.prioridade},
        ${agora}, ${paraAtendente ? agora : null},
        ${conversa.janela_expira_em}, ${conversa.janela_aberta_por_mensagem_id},
        ${conversa.ultima_mensagem_em}, ${conversa.ultima_mensagem_de}
      )
      returning id
    `);
    const novaId = nova[0]?.id;
    if (!novaId) throw new Error('não criou a conversa de destino');

    await registrarEvento(tx, {
      tenantId: ator.tenantId,
      conversaId: novaId,
      tipo: 'criada',
      em: agora,
      usuarioId: ator.atendenteId,
      filaId: filaDestino,
    });
    await registrarEvento(tx, {
      tenantId: ator.tenantId,
      conversaId: novaId,
      // Para fila é `transferida_fila`; para pessoa a conversa nasce já atribuída.
      tipo: paraAtendente ? 'atribuida' : 'transferida_fila',
      em: agora,
      usuarioId: paraAtendente ?? ator.atendenteId,
      filaId: filaDestino,
      dados: { de_conversa_id: conversa.id },
    });

    // `atribuicao` é o que costura as duas conversas: é por ela que o painel de
    // transferências remonta a jornada do cliente depois do encerramento.
    await tx.execute(sql`
      insert into atribuicao (
        tenant_id, conversa_id, de_usuario_id, para_usuario_id,
        de_fila_id, para_fila_id, motivo, por_usuario_id, em
      ) values (
        ${ator.tenantId}, ${conversa.id}, ${conversa.atendente_id}, ${paraAtendente},
        ${conversa.fila_id}, ${paraFila}, ${pedido.motivo ?? null}, ${ator.atendenteId}, ${agora}
      )
    `);

    await emitir(tx, ator.tenantId, 'conversa.encerrada', {
      conversa_id: conversa.id,
      motivo: 'Transferida',
      encerrada_por: ator.atendenteId,
    });
    await emitir(tx, ator.tenantId, 'conversa.criada', {
      conversa_id: novaId,
      contato_id: conversa.contato_id,
      fila_id: filaDestino,
      de_conversa_id: conversa.id,
    });

    return { deConversaId: conversa.id, paraConversaId: novaId, estado: estadoNovo };
  });

  drenarEmSegundoPlano(ator.tenantId);
  return resultado;
}

function comoData(valor: Date | string | null): Date | null {
  if (valor === null) return null;
  return valor instanceof Date ? valor : new Date(valor);
}
