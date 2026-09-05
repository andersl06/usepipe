'use client';

import { useActionState } from 'react';
import { alternarEspera } from '../app/acoes';
import { abrirDialogoEncerrar } from './dialogo-encerrar';

/**
 * Ações do cabeçalho da conversa.
 *
 * Transferência é da spec (§3) mas não desta etapa: fica desabilitada com o motivo no
 * `title`, em vez de virar um botão que não faz nada.
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
      <button className="btn" type="button" disabled title="Transferência entra na próxima etapa">
        Transferir
      </button>
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
