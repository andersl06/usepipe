import { sql } from 'drizzle-orm';
import { registrarAuditoria } from '@pipe/db';
import type { TransactionPipe } from '@pipe/db';
import { PipeError } from '../../errors.js';
import { requirePermission } from '../../session.js';
import { RESPONSE_READY_MANAGE } from './communication.js';
import { uuidOuNada } from './format.js';

/** Bloco do Builder oferecido no seletor "Fluxo de retorno": só o que a tela precisa. */
export type BlocoDeRetorno = { id: string; code: string; label: string; type: string };

export type EstadoDoRetorno = 'nenhum' | 'ok' | 'removido';

/** Situação do vínculo de um modelo com o Builder, já resolvida contra o fluxo atual do canal. */
export interface FluxoDeRetorno {
  state: EstadoDoRetorno;
  blockId: string | null;
  code: string | null;
  label: string | null;
}

export const SEM_RETORNO: FluxoDeRetorno = { state: 'nenhum', blockId: null, code: null, label: null };

/**
 * Fluxo que atende o canal: o publicado; sem ele, o mais recentemente alterado que não esteja arquivado.
 * Roteador não tem Builder.
 */
async function fluxoDoCanal(tx: TransactionPipe, tid: string, canalId: string): Promise<string | null> {
  const { rows } = await tx.execute<{ id: string }>(sql`
    select id from fluxo
     where tenant_id = ${tid}::uuid and canal_id = ${canalId}::uuid and tipo = 'fluxo' and estado <> 'arquivado'
     order by (estado = 'publicado') desc, atualizado_em desc
     limit 1
  `);
  return rows[0]?.id ?? null;
}

/** Blocos da versão publicada do fluxo; sem publicada, os do rascunho. */
async function blocosDoFluxo(tx: TransactionPipe, tid: string, fluxoId: string): Promise<BlocoDeRetorno[]> {
  const { rows } = await tx.execute<BlocoDeRetorno>(sql`
    select b.id, b.codigo as code, b.nome as label, b.tipo as type
      from bloco b
     where b.tenant_id = ${tid}::uuid
       and b.versao_id = (
         select v.id from fluxo_versao v
          where v.tenant_id = ${tid}::uuid and v.fluxo_id = ${fluxoId}::uuid and v.estado in ('publicada', 'rascunho')
          order by (v.estado = 'publicada') desc, v.versao desc
          limit 1)
     order by b.codigo
  `);
  return rows;
}

/** Blocos efetivos do fluxo do canal, com cache por canal para as listas. */
function carregadorDeBlocos(tx: TransactionPipe, tid: string) {
  const cache = new Map<string, Promise<BlocoDeRetorno[]>>();
  return (canalId: string): Promise<BlocoDeRetorno[]> => {
    let atual = cache.get(canalId);
    if (!atual) {
      atual = fluxoDoCanal(tx, tid, canalId).then((f) => (f ? blocosDoFluxo(tx, tid, f) : []));
      cache.set(canalId, atual);
    }
    return atual;
  };
}

export interface LinhaDeRetorno {
  canalId: string;
  /** Código do bloco ao qual o vínculo gravado aponta (nulo = sem vínculo). */
  codigoGravado: string | null;
}

/**
 * Resolve o vínculo gravado contra o fluxo atual do canal, pelo código do bloco (o id muda a cada
 * versão). Vínculo cujo código não existe mais no fluxo vira "removido".
 */
export async function resolverRetornos(
  tx: TransactionPipe,
  tid: string,
  linhas: readonly LinhaDeRetorno[],
): Promise<FluxoDeRetorno[]> {
  const blocosDe = carregadorDeBlocos(tx, tid);
  const saida: FluxoDeRetorno[] = [];
  for (const l of linhas) {
    if (!l.codigoGravado) {
      saida.push(SEM_RETORNO);
      continue;
    }
    const bloco = (await blocosDe(l.canalId)).find((b) => b.code === l.codigoGravado);
    saida.push(
      bloco
        ? { state: 'ok', blockId: bloco.id, code: bloco.code, label: bloco.label }
        : { state: 'removido', blockId: null, code: l.codigoGravado, label: null },
    );
  }
  return saida;
}

async function modeloDoTenant(tx: TransactionPipe, tid: string, id: string) {
  const { rows } = await tx.execute<{
    id: string;
    canalId: string;
    nome: string;
    ativo: boolean;
    blocoId: string | null;
  }>(sql`
    select id, canal_id as "canalId", nome, ativo, fluxo_retorno_bloco_id as "blocoId"
      from template_mensagem
     where id = ${id}::uuid and tenant_id = ${tid}::uuid
  `);
  const modelo = rows[0];
  if (!modelo) throw PipeError.naoEncontrado('modelo de mensagem');
  return modelo;
}

/** Blocos do fluxo do canal do modelo, para o seletor. */
export async function listarBlocosDoModelo(
  tx: TransactionPipe,
  tid: string,
  modeloId: string,
): Promise<{ blocks: BlocoDeRetorno[] }> {
  const modelo = await modeloDoTenant(tx, tid, modeloId);
  return { blocks: await carregadorDeBlocos(tx, tid)(modelo.canalId) };
}

export interface PedidoDeModelo {
  fluxoRetornoBlocoId?: string | null;
  ativo?: boolean;
}

const CAMPOS_ACEITOS = new Set(['fluxoRetornoBlocoId', 'ativo']);

/**
 * Grava o bloco de retorno e/ou o interruptor "ativo" de um modelo. O bloco precisa estar no fluxo do
 * canal do modelo (versão publicada, senão rascunho) e no tenant da sessão; qualquer outro é recusado.
 */
export async function editarModelo(
  tx: TransactionPipe,
  tid: string,
  usuarioId: string,
  modeloId: string,
  pedido: PedidoDeModelo,
): Promise<{ id: string; ativo: boolean; fluxoRetorno: FluxoDeRetorno }> {
  await requirePermission(tx, usuarioId, RESPONSE_READY_MANAGE);
  const corpo: Record<string, unknown> =
    pedido && typeof pedido === 'object' && !Array.isArray(pedido) ? { ...pedido } : {};
  const desconhecida = Object.keys(corpo).find((k) => !CAMPOS_ACEITOS.has(k));
  if (desconhecida) {
    throw PipeError.request('field_unknown', `O campo "${desconhecida}" não é aceito.`);
  }
  if (!('fluxoRetornoBlocoId' in corpo) && !('ativo' in corpo)) {
    throw PipeError.request('nothing_to_update', 'Informe o fluxo de retorno ou o interruptor ativo.');
  }
  if ('ativo' in corpo && typeof corpo['ativo'] !== 'boolean') {
    throw PipeError.request('active_invalid', 'ativo deve ser verdadeiro ou falso.');
  }
  const modelo = await modeloDoTenant(tx, tid, modeloId);

  let blocoId = modelo.blocoId;
  if ('fluxoRetornoBlocoId' in corpo) {
    const bruto = corpo['fluxoRetornoBlocoId'];
    if (bruto === null) {
      blocoId = null;
    } else {
      const candidato = typeof bruto === 'string' ? uuidOuNada(bruto) : undefined;
      if (!candidato) {
        throw PipeError.request('block_invalid', 'Escolha um bloco válido do fluxo do canal.');
      }
      const blocos = await carregadorDeBlocos(tx, tid)(modelo.canalId);
      if (!blocos.some((b) => b.id === candidato)) {
        throw PipeError.request(
          'block_outside_flow',
          'O bloco escolhido não pertence ao fluxo do canal deste modelo.',
        );
      }
      blocoId = candidato;
    }
  }
  const ativo = typeof corpo['ativo'] === 'boolean' ? corpo['ativo'] : modelo.ativo;

  await tx.execute(sql`
    update template_mensagem
       set fluxo_retorno_bloco_id = ${blocoId}::uuid, ativo = ${ativo}, atualizado_em = now()
     where id = ${modeloId}::uuid and tenant_id = ${tid}::uuid
  `);
  await registrarAuditoria(tx, tid, {
    ator: { type: 'usuario', id: usuarioId },
    acao: 'alterou',
    objetoTipo: 'template_mensagem',
    objetoId: modeloId,
    antes: { ativo: modelo.ativo, fluxoRetornoBlocoId: modelo.blocoId },
    depois: { ativo, fluxoRetornoBlocoId: blocoId },
  });

  const { rows } = await tx.execute<{ codigo: string | null }>(sql`
    select b.codigo from bloco b where b.id = ${blocoId}::uuid and b.tenant_id = ${tid}::uuid
  `);
  const [fluxoRetorno] = await resolverRetornos(tx, tid, [
    { canalId: modelo.canalId, codigoGravado: rows[0]?.codigo ?? null },
  ]);
  return { id: modeloId, ativo, fluxoRetorno: fluxoRetorno! };
}
