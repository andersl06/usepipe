import type { ReactNode } from 'react';
import { Botao, BotaoDeIcone, Etiqueta } from './primitivos';

/**
 * The product's one modal: a backdrop and a centered dialog box.
 *
 * Without `skin` it draws the registrations `bds-modal` (`FICHA-queue-management.md` §2.6, `FICHA-personalizedbreaks.md` §2.3, `FICHA-replies.md` §2.3): title, "x" to close and a body. With `skin` it only provides the shell — backdrop, dialog semantics and closing — under the classes a screen already measured (Desk `dk-veu`/`dk-modal`, Monitoring `mon-modal`, Settings `cf-modal`, Growth `gr-modal`), and the children draw their own header, so adopting it never restyles a screen. The CSS stays next to each screen's stylesheet.
 *
 * Closing on the backdrop reacts to a `mousedown` that starts on the backdrop itself, so a text selection dragged from inside the box to outside never closes it. Leave `onFechar` out when the backdrop must not close the dialog (e.g. a key shown only once).
 */
export function Modal({
  aberto = true,
  titulo,
  rotuloId,
  onFechar,
  skin,
  children,
}: {
  aberto?: boolean;
  /** The heading of the default skin; with `skin`, the accessible name unless `rotuloId` is given. */
  titulo?: string;
  /** Id of the heading the children draw (`aria-labelledby`). */
  rotuloId?: string;
  onFechar?: () => void;
  skin?: { fundo: string; caixa: string; elemento?: 'div' | 'section' };
  children: ReactNode;
}) {
  if (!aberto) return null;
  const Caixa = skin?.elemento ?? 'div';
  return (
    <div
      className={skin?.fundo ?? 'modal-fundo'}
      role="presentation"
      onMouseDown={onFechar ? (evento) => evento.target === evento.currentTarget && onFechar() : undefined}
    >
      <Caixa
        className={skin?.caixa ?? 'modal-caixa'}
        role="dialog"
        aria-modal="true"
        aria-label={rotuloId ? undefined : titulo}
        aria-labelledby={rotuloId}
        // Clicks inside stay inside: a modal rendered within a clickable card must not trigger it.
        onClick={(evento) => evento.stopPropagation()}
      >
        {skin ? (
          children
        ) : (
          <>
            <div className="modal-cabecalho">
              <h3>{titulo}</h3>
              {onFechar ? <BotaoDeIcone nome="x" rotulo="Fechar" onClick={onFechar} /> : null}
            </div>
            <div className="modal-corpo">{children}</div>
          </>
        )}
      </Caixa>
    </div>
  );
}

/**
 * Destructive-action confirmation inside the default `Modal`, replacing `window.confirm`/`window.alert` everywhere (Atendimento cadastros task, items 1 and 2; the Builder forbids native dialogs).
 */
export function ConfirmModal({
  aberto,
  titulo,
  message,
  error,
  confirmando,
  rotuloConfirmar = 'Excluir',
  rotuloCancelar = 'Cancelar',
  onConfirmar,
  onCancelar,
}: {
  aberto: boolean;
  titulo: string;
  message: ReactNode;
  /** The rejection reason, if the last attempt failed — the same message that would have gone to `window.alert`. */
  error?: string | null;
  confirmando?: boolean;
  rotuloConfirmar?: string;
  /** Blip's "Carregar fluxo" confirmation uses "Sim"/"Não" instead of "Cancelar" (F-2.1). */
  rotuloCancelar?: string;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  return (
    <Modal aberto={aberto} titulo={titulo} onFechar={onCancelar}>
      <p className="sub">{message}</p>
      {error ? <Etiqueta tom="erro">{error}</Etiqueta> : null}
      <div className="cl-actions">
        <Botao type="button" onClick={onCancelar} disabled={confirmando}>
          {rotuloCancelar}
        </Botao>
        <Botao type="button" variante="perigo" onClick={onConfirmar} disabled={confirmando}>
          {confirmando ? 'Excluindo…' : rotuloConfirmar}
        </Botao>
      </div>
    </Modal>
  );
}
