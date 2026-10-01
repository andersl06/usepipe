import type { Campos, Resultado } from './campos.js';
import type { TransactionPipe, Ator } from '@pipe/db';
import { PipeError } from '../../../errors.js';
import { createQueue, createReasonPause } from '../registrations.js';

/**
 * Agent Server Actions manage queues and pause reasons. Follow `Resultado` from `app/comunicacao/acoes.ts`: an expected form error is returned as a value so `useActionState` can display it without try/catch. These actions wrap `criarFila` and `criarMotivoPausa` in `cadastros.ts`, which the new REST routes (`POST /v1/gestao/atendentes/filas`, `POST /v1/gestao/atendentes/pausas`) also call. Previously each action validated and wrote here without permission checks, creating duplicate implementations. Only at this form boundary convert `ErroPipe` from `exigirPermissao`, `nomeDeFilaConferido`, etc. into `Resultado`; REST retains real status codes.
 */

const OK: Resultado = { ok: true };

function falha(error: string): Resultado {
  return { ok: false, error };
}

/** `ErroPipe` de validação/permissão/conflito vira a frase da tela; qualquer outro erro sobe. */
async function comoResultado(fn: () => Promise<unknown>): Promise<Resultado> {
  try {
    await fn();
    return OK;
  } catch (erro) {
    if (erro instanceof PipeError) return falha(erro.message);
    throw erro;
  }
}

// -------------------------------------------------------------------- filas

export async function saveQueue(
  tx: TransactionPipe,
  tid: string,
  ator: Ator,
  data: Campos,
): Promise<Resultado> {
  const capacityRaw = data.get('capacidadePadrao');
  const orderRaw = data.get('ordem');
  return comoResultado(() =>
    createQueue(tx, tid, String(data.get('fluxoId') ?? '').trim(), ator.id ?? '', {
      name: String(data.get('nome') ?? '').trim(),
      color: data.get('cor'),
      scheduleId: data.get('horarioId'),
      capacityDefault: Number(capacityRaw ?? Number.NaN),
      order: orderRaw === null ? 0 : Number(orderRaw),
      active: data.get('ativa') !== null,
    }),
  );
}

// ------------------------------------------------------------------- pausas

export async function salvarMotivoPausa(
  tx: TransactionPipe,
  tid: string,
  ator: Ator,
  dados: Campos,
): Promise<Resultado> {
  const durationRaw = dados.get('duracaoSugeridaMin');
  return comoResultado(() =>
    createReasonPause(tx, tid, ator.id ?? '', {
      name: String(dados.get('nome') ?? '').trim(),
      durationSuggestedMin: durationRaw === null || durationRaw === '' ? null : Number(durationRaw),
      countsAsProductive: dados.get('contaComoProdutivo') !== null,
      active: dados.get('ativo') !== null,
    }),
  );
}
