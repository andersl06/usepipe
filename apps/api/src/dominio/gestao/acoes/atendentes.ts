import type { Campos, Resultado } from './campos.js';
import type { TransacaoPipe, Ator } from '@pipe/db';
import { ErroPipe } from '../../../erros.js';
import { criarFila, criarMotivoPausa } from '../cadastros.js';

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

function falha(erro: string): Resultado {
  return { ok: false, erro };
}

/** `ErroPipe` de validação/permissão/conflito vira a frase da tela; qualquer outro erro sobe. */
async function comoResultado(fn: () => Promise<unknown>): Promise<Resultado> {
  try {
    await fn();
    return OK;
  } catch (erro) {
    if (erro instanceof ErroPipe) return falha(erro.message);
    throw erro;
  }
}

// -------------------------------------------------------------------- filas

export async function salvarFila(
  tx: TransacaoPipe,
  tid: string,
  ator: Ator,
  dados: Campos,
): Promise<Resultado> {
  const capacidadeBruta = dados.get('capacidadePadrao');
  const ordemBruta = dados.get('ordem');
  return comoResultado(() =>
    criarFila(tx, tid, ator.id ?? '', {
      nome: String(dados.get('nome') ?? '').trim(),
      cor: dados.get('cor'),
      horarioId: dados.get('horarioId'),
      capacidadePadrao: Number(capacidadeBruta ?? Number.NaN),
      ordem: ordemBruta === null ? 0 : Number(ordemBruta),
      ativa: dados.get('ativa') !== null,
    }),
  );
}

// ------------------------------------------------------------------- pausas

export async function salvarMotivoPausa(
  tx: TransacaoPipe,
  tid: string,
  ator: Ator,
  dados: Campos,
): Promise<Resultado> {
  const duracaoBruta = dados.get('duracaoSugeridaMin');
  return comoResultado(() =>
    criarMotivoPausa(tx, tid, ator.id ?? '', {
      nome: String(dados.get('nome') ?? '').trim(),
      duracaoSugeridaMin: duracaoBruta === null || duracaoBruta === '' ? null : Number(duracaoBruta),
      contaComoProdutivo: dados.get('contaComoProdutivo') !== null,
      ativo: dados.get('ativo') !== null,
    }),
  );
}
