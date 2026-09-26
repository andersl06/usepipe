'use client';

import { useEffect } from 'react';
import { Illustration } from '@pipe/ui';

/**
 * The error screen for the whole CRM. It covers all child routes, which is what Next
 * does with an `error.tsx` at the root of `app/`.
 *
 * Three things, and nothing more:
 *
 * 1. **What happened, in Portuguese.** "Something went wrong" doesn't help anyone;
 *    "the database query didn't respond" tells you who to call.
 * 2. **A retry button.** `reset()` remounts the segment without reloading the whole
 *    page — most errors here are a dropped connection, and retrying fixes it.
 * 3. **The error identifier**, when Next provides one (`digest`). It's what links
 *    the screen to the server log without asking the person to describe what they
 *    saw.
 *
 * The raw error message does NOT show: in production Next already replaces it with a
 * generic text, and in development it goes to the console, which is where you read
 * the stack trace.
 */
export default function CrmError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[crm] erro na tela:', error);
  }, [error]);

  return (
    <div className="tblwrap">
      <div className="empty">
        <Illustration nome="erro" />
        <b>Esta tela não carregou.</b>
        <span>
          O CRM lê tudo do banco a cada visita. Quando a consulta não volta, não há tela — e
          mostrar meia tela com metade dos números seria pior do que não mostrar nenhuma.
        </span>
        <span className="actions-error">
          <button type="button" className="btn primario" onClick={reset}>
            Tentar de novo
          </button>
        </span>
        {error.digest ? <span className="lbl">Identificador do erro: {error.digest}</span> : null}
      </div>
    </div>
  );
}
