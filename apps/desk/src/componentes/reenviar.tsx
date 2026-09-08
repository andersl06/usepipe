'use client';

import { useActionState } from 'react';
import { reenviarMensagem } from '../app/acoes';

/**
 * Falha de mídia aparece com motivo e botão de reenviar. No Blip o atendente ouve o
 * próprio áudio e o cliente nunca recebe, sem aviso nenhum — é a decisão nº 1 da tela.
 *
 * O reenvio vai para a `api`, que reenfileira a mensagem: ela volta em
 * `pendente` e o tique só aparece quando a Meta confirmar. A conversa vai
 * junto porque a rota é filha dela — mensagem sem conversa não é endereço.
 */
export function BotaoReenviar({
  conversaId,
  mensagemId,
}: {
  conversaId: string;
  mensagemId: string;
}) {
  const [resultado, enviar, enviando] = useActionState(reenviarMensagem, { ok: true });

  return (
    <form action={enviar}>
      <input type="hidden" name="conversaId" value={conversaId} />
      <input type="hidden" name="mensagemId" value={mensagemId} />
      <button className="btn" type="submit" disabled={enviando}>
        {enviando ? 'Reenviando…' : 'Reenviar'}
      </button>
      {resultado.erro ? <span className="erro">{resultado.erro}</span> : null}
    </form>
  );
}
