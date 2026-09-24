'use client';

import { useEffect, useState } from 'react';

const EVENTO_ENCERRAMENTO = 'pipe:ticket-finalizado';

export function avisarTicketFinalizado(numero: string) {
  window.dispatchEvent(new CustomEvent(EVENTO_ENCERRAMENTO, { detail: { numero } }));
}

export function AvisoEncerramento() {
  const [texto, setTexto] = useState<string | null>(null);

  useEffect(() => {
    let timer: number | undefined;
    const aoFinalizar = (evento: Event) => {
      const numero = (evento as CustomEvent<{ numero: string }>).detail.numero;
      setTexto(`Ticket #${numero.replace(/^#/, '')} finalizado com sucesso!`);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setTexto(null), 5000);
    };
    window.addEventListener(EVENTO_ENCERRAMENTO, aoFinalizar);
    return () => {
      window.removeEventListener(EVENTO_ENCERRAMENTO, aoFinalizar);
      window.clearTimeout(timer);
    };
  }, []);

  return texto ? <div className="pipe-aviso-encerramento" role="status">{texto}</div> : null;
}
