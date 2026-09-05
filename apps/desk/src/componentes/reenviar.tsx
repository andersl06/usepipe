'use client';

import { useActionState } from 'react';
import { reenviarMensagem } from '../app/acoes';

/**
 * Falha de mídia aparece com motivo e botão de reenviar. No Blip o atendente ouve o
 * próprio áudio e o cliente nunca recebe, sem aviso nenhum — é a decisão nº 1 da tela.
 *
 * O reenvio aqui é **simulado**: devolve a mensagem para `enviada`. Com o worker no ar
 * ele volta para `pendente` no outbox, que é a transição que o core já prevê.
 */
export function BotaoReenviar({ mensagemId }: { mensagemId: string }) {
  const [resultado, enviar, enviando] = useActionState(reenviarMensagem, { ok: true });

  return (
    <form action={enviar}>
      <input type="hidden" name="mensagemId" value={mensagemId} />
      <button className="btn" type="submit" disabled={enviando}>
        {enviando ? 'Reenviando…' : 'Reenviar'}
      </button>
      {resultado.erro ? <span className="erro">{resultado.erro}</span> : null}
    </form>
  );
}
