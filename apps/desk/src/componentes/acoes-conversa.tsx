'use client';

import { useActionState } from 'react';
import { alternarEspera } from '../app/acoes';
import { abrirDialogoEncerrar } from './dialogo-encerrar';

/**
 * Ações do cabeçalho da conversa.
 *
 * O botão "Transferir" saiu. Ele era da spec (§3) mas não desta etapa, e ficava
 * desabilitado com o motivo no `title` — um botão cinza no cabeçalho de toda
 * conversa, que o atendente lê como ferramenta quebrada e não como aviso de
 * roteiro. Volta quando transferir. O mesmo aconteceu com `/transferir`,
 * `/etiquetar` e `/automacao` no paletão do compositor.
 */
export function AcoesDaConversa({
  conversaId,
  emEspera,
}: {
  conversaId: string;
  emEspera: boolean;
}) {
  const [resultado, enviar, enviando] = useActionState(alternarEspera, { ok: true });

  return (
    <div className="acts">
      {resultado.erro ? <span className="erro">{resultado.erro}</span> : null}
      <form action={enviar} id="formulario-espera">
        <input type="hidden" name="conversaId" value={conversaId} />
        <button className="btn" type="submit" disabled={enviando}>
          {emEspera ? 'Retomar' : 'Em espera'}
        </button>
      </form>
      <button className="btn primary" type="button" onClick={abrirDialogoEncerrar}>
        Encerrar
      </button>
    </div>
  );
}
