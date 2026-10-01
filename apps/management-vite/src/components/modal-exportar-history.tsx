import { useEffect, useRef, useState } from 'react';
import { Modal } from '@pipe/ui/modal';
import { api } from '@pipe/ui/api';
import { useEu } from '../context/session';

/** Both Blip modals send the file by e-mail; they differ in title, text and format. */
const TEXTOS = {
  csv: {
    titulo: 'Enviar lista de tickets',
    texto: 'Informe o e-mail para receber a planilha (.CSV) com os tickets selecionados:',
  },
  pdf: {
    titulo: 'Enviar histórico de conversas',
    texto: 'Informe o e-mail para receber o arquivo (.PDF) com o histórico completo das conversas selecionadas:',
  },
} as const;

/**
 * "Lista de tickets" (CSV) and "Histórico de conversas (.pdf)" modals of the Histórico: pre-filled e-mail, terms checkbox, Enviar disabled until the terms are accepted. The server validates the recipient; on failure the form stays filled.
 */
export function ModalExportHistory({
  tipo,
  filtros,
  aoFechar,
}: {
  tipo: 'csv' | 'pdf';
  /** Query filters of the page (from/to/queue/agent/etiqueta/ticket/contact); the PDF replaces `ticket` with the selection. */
  filtros: Record<string, string>;
  aoFechar: () => void;
}) {
  const eu = useEu();
  const [email, setEmail] = useState(eu.user.email);
  const [aceito, setAceito] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const campo = useRef<HTMLInputElement>(null);
  const { titulo, texto } = TEXTOS[tipo];

  useEffect(() => {
    campo.current?.focus();
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') aoFechar();
    };
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [aoFechar]);

  async function enviar() {
    setEnviando(true);
    setError(null);
    try {
      await api.post('/v1/management/history/export-email', {
        destinatarios: [email.trim()],
        formato: tipo,
        filtros,
      });
      setEnviado(true);
    } catch (causa) {
      setError(`Não foi possível enviar: ${causa instanceof Error ? causa.message : 'tente novamente.'}`);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal skin={{ fundo: 'mon-modal-fundo', caixa: 'mon-modal', elemento: 'section' }} titulo={titulo} onFechar={aoFechar}>
      <h2>{titulo}</h2>
      {enviado ? (
        <p role="status">O arquivo foi enviado para {email.trim()}.</p>
      ) : (
        <>
          <p>{texto}</p>
          <label className="mon-campo">
            Email
            <input
              ref={campo}
              type="email"
              className="hist-email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-label="Email"
            />
          </label>
          <label className="hist-termo">
            <input type="checkbox" checked={aceito} onChange={(e) => setAceito(e.target.checked)} />
            <span>
              Li e estou ciente do{' '}
              <a href="/termo-de-responsabilidade" target="_blank" rel="noreferrer">
                Termo de responsabilidade
              </a>
              .
            </span>
          </label>
          {error ? <p className="mon-modal-error" role="alert">{error}</p> : null}
        </>
      )}
      <div className="mon-modal-actions">
        <button type="button" className="btn" onClick={aoFechar}>
          {enviado ? 'Fechar' : 'Cancelar'}
        </button>
        {enviado ? null : (
          <button
            type="button"
            className="btn primario"
            disabled={!aceito || !email.trim() || enviando}
            onClick={() => void enviar()}
          >
            Enviar
          </button>
        )}
      </div>
    </Modal>
  );
}
