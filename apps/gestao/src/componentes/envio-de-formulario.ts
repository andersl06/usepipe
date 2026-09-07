'use client';

import { startTransition } from 'react';
import type { FormEvent } from 'react';

/**
 * Enviar o formulário SEM deixar o React apagar o que a pessoa digitou.
 *
 * O React 19 limpa todo formulário não controlado assim que a ação começa:
 * `startHostTransition` chama `requestFormReset` antes de rodar a ação, e faz
 * isso independentemente de a ação dar certo. Com `<form action={…}>`, um erro
 * de validação do servidor — "já existe uma fila com esse nome" — devolvia a
 * mensagem e o formulário em branco, e quem cadastrava tinha de redigitar os
 * cinco campos para corrigir um.
 *
 * A saída é não usar o atributo `action`: o despacho do `useActionState` também
 * pode ser chamado à mão, e aí o reset automático não acontece. O
 * `startTransition` continua sendo obrigatório — é ele que liga o `enviando`,
 * e sem ele o botão nunca mostraria "Salvando…".
 *
 * Limpar depois do sucesso continua sendo trabalho da tela, com o
 * `formulario.reset()` que cada uma já tem no `useEffect`.
 */
export function envioQuePreserva(
  despachar: (dados: FormData) => void,
): (evento: FormEvent<HTMLFormElement>) => void {
  return (evento) => {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);
    startTransition(() => despachar(dados));
  };
}
