import type { ReactNode } from 'react';
import { Botao, BotaoDeIcone, Etiqueta } from '@pipe/ui';

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

/**
 * Confirmação de gesto destrutivo, dentro do `Modal` acima — no lugar do
 * `window.confirm`/`window.alert` que `atendentes-filas.tsx` usa hoje
 * (comentário lá: "provisório"). Tarefa de cadastros do Atendimento, itens
 * 1 e 2: toda exclusão nova (regra de atendimento, regra de SLA) passa por
 * aqui, não pelo diálogo nativo do navegador.
 */
export function ModalConfirmacao({
  aberto,
  titulo,
  mensagem,
  erro,
  confirmando,
  rotuloConfirmar = 'Excluir',
  onConfirmar,
  onCancelar,
}: {
  aberto: boolean;
  titulo: string;
  mensagem: ReactNode;
  /** Motivo da recusa, se a última tentativa falhou — a mesma mensagem que iria para `window.alert`. */
  erro?: string | null;
  confirmando?: boolean;
  rotuloConfirmar?: string;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  return (
    <Modal aberto={aberto} titulo={titulo} onFechar={onCancelar}>
      <p className="sub">{mensagem}</p>
      {erro ? <Etiqueta tom="erro">{erro}</Etiqueta> : null}
      <div className="cl-acoes">
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
