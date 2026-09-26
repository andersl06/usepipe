import type { ReactNode } from 'react';
import { Botao, BotaoDeIcone, Etiqueta } from '@pipe/ui';

/**
 * Centered modal, for the "Criar X"/"Nova X" button in each registration screen's header — the `bds-modal` Blip opens there (`FICHA-queue-management.md` §2.6, `FICHA-personalizedbreaks.md` §2.3, `FICHA-replies.md` §2.3): title, body with the form, and an "x" to close.
 *
 * The form's actual content isn't in the material (the capture always caught the modal closed, `open="false"`), so inside here we have full freedom — only the modal's existence, in place of a standalone form on the page, is what the captured DOMs confirm.
 */
export function Modal({
  aberto,
  titulo,
  onFechar,
  children,
}: {
  aberto: boolean;
  titulo: string;
  onFechar: () => void;
  children: ReactNode;
}) {
  if (!aberto) return null;
  return (
    <div className="modal-fundo" onClick={onFechar}>
      <div
        className="modal-caixa"
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-cabecalho">
          <h3>{titulo}</h3>
          <BotaoDeIcone nome="x" rotulo="Fechar" onClick={onFechar} />
        </div>
        <div className="modal-corpo">{children}</div>
      </div>
    </div>
  );
}

/**
 * Destructive-action confirmation, inside the `Modal` above — replacing `window.confirm`/`window.alert`, which is what this component was built to remove from cadastros screens (Atendimento cadastros task, items 1 and 2). Every new deletion (attendance rule, SLA rule) goes through here instead of the browser's native dialog — and `atendentes-filas.tsx` has since migrated to it too; no screen in this module still calls `window.confirm`/`window.alert`.
 */
export function ModalConfirmation({
  aberto,
  titulo,
  message,
  error,
  confirmando,
  rotuloConfirmar = 'Excluir',
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
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  return (
    <Modal aberto={aberto} titulo={titulo} onFechar={onCancelar}>
      <p className="sub">{message}</p>
      {error ? <Etiqueta tom="erro">{error}</Etiqueta> : null}
      <div className="cl-actions">
        <Botao type="button" onClick={onCancelar} disabled={confirmando}>
          Cancelar
        </Botao>
        <Botao type="button" variante="perigo" onClick={onConfirmar} disabled={confirmando}>
          {confirmando ? 'Excluindo…' : rotuloConfirmar}
        </Botao>
      </div>
    </Modal>
  );
}
