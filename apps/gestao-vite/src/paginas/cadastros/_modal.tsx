import type { ReactNode } from 'react';
import { BotaoDeIcone } from '@pipe/ui';

/**
 * Modal centralizado, para o botão "Criar X"/"Nova X" do cabeçalho de cada
 * tela de cadastro — o `bds-modal` que a Blip abre ali (`FICHA-queue-
 * management.md` §2.6, `FICHA-personalizedbreaks.md` §2.3, `FICHA-
 * replies.md` §2.3): título, corpo com o formulário, e um "x" para fechar.
 *
 * O conteúdo do formulário em si não está no material (a captura sempre
 * pegou o modal fechado, `open="false"`), então aqui dentro a liberdade é
 * total — só a existência do modal, no lugar do formulário solto na página,
 * é o que os DOMs capturados confirmam.
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
