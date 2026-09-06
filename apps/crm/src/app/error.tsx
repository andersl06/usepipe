'use client';

import { useEffect } from 'react';
import { Ilustracao } from '@pipe/ui';

/**
 * A tela de erro do CRM inteiro. Cobre todas as rotas filhas, que é o que o
 * Next faz com um `error.tsx` na raiz do `app/`.
 *
 * Três coisas, e nenhuma a mais:
 *
 * 1. **O que aconteceu, em português.** "Algo deu errado" não ajuda ninguém;
 *    "a consulta ao banco não respondeu" diz para quem chamar.
 * 2. **Um botão que tenta de novo.** `reset()` remonta o segmento sem recarregar
 *    a página inteira — a maior parte dos erros aqui é conexão que caiu, e
 *    tentar de novo resolve.
 * 3. **O identificador do erro**, quando o Next dá um (`digest`). É o que liga a
 *    tela ao registro do servidor sem pedir para a pessoa descrever o que viu.
 *
 * A mensagem crua do erro NÃO aparece: em produção o Next já a substitui por um
 * texto genérico, e em desenvolvimento ela vai para o console, que é onde se
 * lê rastro de pilha.
 */
export default function ErroDoCrm({
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
      <div className="vazio">
        <Ilustracao nome="erro" />
        <b>Esta tela não carregou.</b>
        <span>
          O CRM lê tudo do banco a cada visita. Quando a consulta não volta, não há tela — e
          mostrar meia tela com metade dos números seria pior do que não mostrar nenhuma.
        </span>
        <span className="acoes-erro">
          <button type="button" className="btn primario" onClick={reset}>
            Tentar de novo
          </button>
        </span>
        {error.digest ? <span className="lbl">Identificador do erro: {error.digest}</span> : null}
      </div>
    </div>
  );
}
