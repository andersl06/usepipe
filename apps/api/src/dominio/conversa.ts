import { sql } from 'drizzle-orm';
import { TransicaoInvalidaError, transitar } from '@pipe/core';
import type { EstadoConversa } from '@pipe/core';
import { noTenant } from '../banco.js';
import { ErroPipe } from '../erros.js';
import { registrarEvento } from './eventos.js';
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

function comoData(valor: Date | string | null): Date | null {
  if (valor === null) return null;
  return valor instanceof Date ? valor : new Date(valor);
}
