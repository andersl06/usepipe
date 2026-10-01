import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Botao, BotaoDeIcone, Etiqueta } from '@pipe/ui';
import { useRead } from '../../lib/query';
import { withFlow } from '../../lib/flow-scope';
import type { QueueRegistered } from '../../lib/registrations';
import { toggleQueue, deleteQueue, falhaAoSalvar } from '../../lib/registrations-gravar';
import { numero } from '../../lib/format';
import { ListaRegras, type RulesSection } from '../../components/lista-regras';
import { useContact } from '../flow/contact';
import { attendanceBase } from '../operation/shell';
import { QueueForm } from './agents-queues-formulario';
import { Modal, ConfirmModal } from '@pipe/ui/modal';

/**
 * Queues — the list.
 *
 * Skeleton and copy measured in `referencias-blip/portal/dom/FICHA-atendentes-filas-pausas.md` §b.1: header "Filas de atendimento" with "Nova fila" on the right and no subtitle, search "Buscar fila" alone on the line below, an 86px row card with TWO columns — "Fila de atendimento" and "Atendentes atribuídos" — and, on the right, toggle + "Editar" + "Excluir". Footer "Resultados por página" with the source's options.
 *
 * **What left the card, and why.** It used to carry a footer with color, default capacity, order, schedule, simultaneous cap, and the list of enabled attendants — six lines of information the source doesn't put here (ficha §d.1: "Card footer: doesn't exist"). All of that moved to the queue's edit page, which is also where the source puts configuration. The card went back to being just a card.
 *
 * **"Editar" opens a PAGE, not a modal.** That's what the owner asked for, and what the source's router says: `attendance.desk.queueManagement.edit` has `url:"/edit/:id"` (ficha §a.1). Here: `atendentes/filas/:id/editar`.
 *
 * Toggle and deletion stay on the card (`PATCH`/`DELETE` on `/v1/gestao/atendentes/filas/:id`), confirmed via `ConfirmModal` — never `window.confirm`/`window.alert`. A toggle rejection becomes an `Etiqueta` above the list, since there's no open modal for it to live in.
 */

/** The row card's toggle + edit/delete — the `acao` slot of `lista-regras.tsx`. */
function QueueActions({
  queue,
  onErrorToggle,
  onEditar,
  onExcluir,
}: {
  queue: QueueRegistered;
  onErrorToggle: (error: string) => void;
  onEditar: () => void;
  onExcluir: () => void;
}) {
  const { contact } = useContact();
  const alternar = async () => {
    const r = await toggleQueue(contact.id, queue.id, queue.ativa);
    if (!r.ok) onErrorToggle(falhaAoSalvar(r.error));
  };
  return (
    <>
      <BotaoDeIcone nome="lapis" rotulo="Editar" onClick={onEditar} />
      <BotaoDeIcone nome="x" rotulo="Excluir" onClick={onExcluir} />
      <button
        type="button"
        className="interruptor"
        role="switch"
        aria-checked={queue.ativa}
        aria-label={queue.ativa ? `Desativar a fila ${queue.name}` : `Ativar a fila ${queue.name}`}
        title={queue.ativa ? 'Desativar esta fila' : 'Ativar esta fila'}
        onClick={() => void alternar()}
      >
        <span className="interruptor-bolinha" />
      </button>
    </>
  );
}

export function PageQueues() {
  const navegar = useNavigate();
  const { contact } = useContact();
  const base = attendanceBase(contact);
  const [modalAberto, setModalAberto] = useState(false);
  const [queueForDelete, setQueueForDelete] = useState<QueueRegistered | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [errorDeletion, setErrorDeletion] = useState<string | null>(null);
  const [errorToggle, setErrorToggle] = useState<string | null>(null);
  const read = useRead<{ queues: QueueRegistered[] }>(withFlow('/v1/management/agents/queues', contact.id));
  if (!read.data) return null;
  const { queues } = read.data;

  async function excluir() {
    if (!queueForDelete) return;
    setExcluindo(true);
    setErrorDeletion(null);
    const resultado = await deleteQueue(contact.id, queueForDelete.id);
    setExcluindo(false);
    if (resultado.ok) setQueueForDelete(null);
    else setErrorDeletion(falhaAoSalvar(resultado.error));
  }

  const sections: RulesSection[] = [
    {
      titulo: 'Filas de atendimento',
      empty: 'Nenhuma fila cadastrada',
      emptyDescription: 'Crie a primeira fila para distribuir os atendimentos.',
      cards: queues.map((f) => ({
        id: f.id,
        campos: [
          { rotulo: 'Fila de atendimento', value: f.name },
          { rotulo: 'Atendentes atribuídos', value: numero(f.agents.length), classe: 'num' },
        ],
        situation: f.ativa ? 'Ativa' : 'Desativada',
        active: f.ativa,
        acao: (
          <QueueActions
            queue={f}
            onErrorToggle={setErrorToggle}
            onEditar={() => navegar(`${base}/queue-management/${f.id}/edit`)}
            onExcluir={() => setQueueForDelete(f)}
          />
        ),
        procura: f.name.toLowerCase(),
      })),
    },
  ];

  return (
    <>
      <div className="board-head">
        <h2>Filas de atendimento</h2>
        <Botao
          variante="primario"
          icone="mais"
          className="board-acao"
          onClick={() => setModalAberto(true)}
        >
          Nova fila
        </Botao>
      </div>

      {errorToggle ? <Etiqueta tom="erro">{errorToggle}</Etiqueta> : null}

      <ListaRegras
        sections={sections}
        placeholder="Buscar fila"
        sectionHideHeader
        paginar
        pageInitialSize={5}
      />

      <Modal aberto={modalAberto} titulo="Criar nova fila" onFechar={() => setModalAberto(false)}>
        <QueueForm aoSalvar={() => setModalAberto(false)} />
      </Modal>

      <ConfirmModal
        aberto={queueForDelete !== null}
        titulo="Excluir fila"
        message="Excluir fila: os atendentes da fila ficam sem esta fila e tickets novos não serão direcionados a ela. Esta ação não pode ser desfeita."
        rotuloConfirmar="Excluir fila"
        error={errorDeletion}
        confirmando={excluindo}
        onConfirmar={() => void excluir()}
        onCancelar={() => {
          setQueueForDelete(null);
          setErrorDeletion(null);
        }}
      />
    </>
  );
}
