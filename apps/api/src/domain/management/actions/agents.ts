import type { Campos, Resultado } from './campos.js';
import type { TransactionPipe, Ator } from '@pipe/db';
import { PipeError } from '../../../errors.js';
import { createQueue, createReasonPause } from '../registrations.js';

/**
 * Server Actions de Atendentes — filas e motivos de pausa.
 *
 * Mesmo formato `Resultado` de `app/comunicacao/acoes.ts`: o erro esperado de
 * formulário volta como valor, não como exceção, para o `useActionState` da
 * tela mostrar a mensagem sem try/catch.
 *
 * As duas ações abaixo são casca fina sobre `criarFila`/`criarMotivoPausa` de
 * `cadastros.ts` — as mesmas que as rotas REST novas (`POST
 * /v1/gestao/atendentes/filas`, `POST /v1/gestao/atendentes/pausas`) chamam.
 * Antes da tarefa de cadastros do Atendimento cada uma validava e gravava
 * aqui, SEM permissão nenhuma — duas implementações do mesmo cadastro
 * discordariam cedo ou tarde. `ErroPipe` (que `exigirPermissao`,
 * `nomeDeFilaConferido` etc. lançam) vira `Resultado` aqui, e só aqui: é a
 * fronteira entre o padrão REST (status de verdade) e o padrão de formulário
 * (`Resultado` em 200) que este arquivo sempre teve.
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
    createQueue(tx, tid, ator.id ?? '', {
      nome: String(data.get('nome') ?? '').trim(),
      cor: data.get('cor'),
      horarioId: data.get('horarioId'),
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
      nome: String(dados.get('nome') ?? '').trim(),
      durationSuggestedMin: durationRaw === null || durationRaw === '' ? null : Number(durationRaw),
      countsAsProductive: dados.get('contaComoProdutivo') !== null,
      ativo: dados.get('ativo') !== null,
    }),
  );
}
