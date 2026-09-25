'use client';

import { useEffect, useState } from 'react';

const EVENT_CLOSURE = 'pipe:ticket-finalizado';

export function avisarTicketFinalizado(numero: string) {
  window.dispatchEvent(new CustomEvent(EVENT_CLOSURE, { detail: { numero } }));
}

export function ClosureNotice() {
  const [texto, setTexto] = useState<string | null>(null);

  useEffect(() => {
    let timer: number | undefined;
    const aoFinalizar = (evento: Event) => {
      const numero = (evento as CustomEvent<{ numero: string }>).detail.numero;
      setTexto(`Ticket #${numero.replace(/^#/, '')} finalizado com sucesso!`);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setTexto(null), 5000);
    };
    window.addEventListener(EVENT_CLOSURE, aoFinalizar);
    return () => {
      window.removeEventListener(EVENT_CLOSURE, aoFinalizar);
      window.clearTimeout(timer);
    };
  }, []);

  return texto ? <div className="pipe-aviso-encerramento" role="status">{texto}</div> : null;
}
