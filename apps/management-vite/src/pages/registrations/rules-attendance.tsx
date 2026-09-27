import { useState } from 'react';
import { Botao, BotaoDeIcone, Etiqueta } from '@pipe/ui';
import { useRead } from '../../lib/query';
import type { QueueForChoose, QueueRegisteredRule } from '../../lib/registrations';
import { descreverRegra, regrasInalcancaveis, rotuloDoCampo } from '../../lib/rule-queue';
import { ListaRegras, type RulesSection } from '../../components/lista-regras';
import { toggleRuleQueue } from '../../lib/actions';
import { editRuleQueue, deleteRuleQueue } from '../../lib/registrations-gravar';
import { Modal, ModalConfirmation } from './_modal';
import { RuleQueueForm } from './rules-attendance-formulario';

interface QueueRules {
  regras: QueueRegisteredRule[];
  queues: QueueForChoose[];
  defaults: { inbox: string; queue: string | null }[];
}

/**
 * Regras ├ Atendimento — the entry rule. Skeleton measured in `FICHA-rules.md` §2: header with "Criar nova regra" on the right (no subtitle), search alone below, row-card with only "Nome da Regra"/"Fila" as columns (§4), and the pagination footer (§2.5). The row-card itself — label 12/400 over value 16/700, a toggle that enables/disables the record right in the list — is the same one as always. The combinator, the evaluation order, and the unreachable-rule warning aren't columns in the ficha (it only documents "Nome da Regra" and "Fila"), but they remain decisive for predicting what the rule does — so they live in the card's footer (`descreverRegra`/warnings), which is a per-row annotation, not a new column or a new block on the page. "Criar nova regra" opens a modal — Blip doesn't show the form on the page, it lives inside the closed modal the material captured for the sibling screens (`FICHA-queue-management.md` §2.6). Edit/delete (item 1, second part) were added: the "Editar" icon reopens the same modal with `FormularioRegraFila` in edit mode; the "Excluir" icon asks for confirmation via `ModalConfirmation` — never `window.confirm`, which is the provisional pattern `atendentes-filas.tsx` still uses (the comment there says so itself). REORDER is the two footer arrows: each click swaps the rule's position with its neighbor and sends one `PATCH` per rule whose `order` changed — no dedicated endpoint (decision logged in `cadastros.ts`).
 */

/** The card's toggle. A one-button form: there's nothing typed to preserve. */
function Interruptor({ id, active, nome }: { id: string; active: boolean; nome: string }) {
  return (
    <form action={(data: FormData) => void toggleRuleQueue({ ok: true }, data)}>
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="interruptor"
        role="switch"
        aria-checked={active}
        aria-label={active ? `Desativar a regra ${nome}` : `Ativar a regra ${nome}`}
        title={active ? 'Desativar esta regra' : 'Ativar esta regra'}
      >
        <span className="interruptor-bolinha" />
      </button>
    </form>
  );
}

/** Switch + reorder arrows + edit/delete — the row-card's `acao` slot. */
function RuleActions({
  regra,
  first,
  ultima,
  onMover,
  onEditar,
  onExcluir,
}: {
  regra: QueueRegisteredRule;
  first: boolean;
  ultima: boolean;
  onMover: (direction: -1 | 1) => void;
  onEditar: () => void;
  onExcluir: () => void;
}) {
  return (
    <>
      <Interruptor id={regra.id} active={regra.active} nome={regra.name} />
      <BotaoDeIcone
        nome="cima"
        rotulo={`Mover "${regra.name}" para cima — avalia antes`}
        onClick={() => onMover(-1)}
        disabled={first}
      />
      <BotaoDeIcone
        nome="baixo"
        rotulo={`Mover "${regra.name}" para baixo — avalia depois`}
        onClick={() => onMover(1)}
        disabled={ultima}
      />
      <BotaoDeIcone nome="lapis" rotulo={`Editar a regra ${regra.name}`} onClick={onEditar} />
      <BotaoDeIcone nome="x" rotulo={`Excluir a regra ${regra.name}`} onClick={onExcluir} />
    </>
  );
}

export function AttendancePageRules() {
  const [modalAberto, setModalAberto] = useState(false);
  const [ruleInEdit, setRuleInEdit] = useState<QueueRegisteredRule | null>(null);
  const [regraParaExcluir, setRegraParaExcluir] = useState<QueueRegisteredRule | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [errorDeletion, setErrorDeletion] = useState<string | null>(null);
  const [errorReorder, setErrorReorder] = useState<string | null>(null);
  const read = useRead<QueueRules>('/v1/management/rules/attendance');
  if (!read.data) return null;
  const { regras, queues, defaults } = read.data;
  const mortas = new Set(regrasInalcancaveis(regras));

  // `regras` already comes sorted by `ordem`/id (the same order that `ordenarRegras`
  // applies to the engine) — moving position in the list means moving position of
  // evaluation. Renumbers sequentially instead of just swapping `ordem` between the
  // two: if both tie (every new rule's default is `ordem: 0`),
  // swapping equal values moves nothing.
  async function mover(id: string, direction: -1 | 1) {
    const i = regras.findIndex((r) => r.id === id);
    const j = i + direction;
    if (i < 0 || j < 0 || j >= regras.length) return;
    setErrorReorder(null);
    const nova = [...regras];
    const tmp = nova[i]!;
    nova[i] = nova[j]!;
    nova[j] = tmp;
    for (const [indice, r] of nova.entries()) {
      if (r.order === indice) continue;
      const resultado = await editRuleQueue(r.id, { order: indice });
      if (!resultado.ok) {
        setErrorReorder(resultado.error);
        return;
      }
    }
  }

  async function excluir() {
    if (!regraParaExcluir) return;
    setExcluindo(true);
    setErrorDeletion(null);
    const resultado = await deleteRuleQueue(regraParaExcluir.id);
    setExcluindo(false);
    if (resultado.ok) setRegraParaExcluir(null);
    else setErrorDeletion(resultado.error);
  }

  const sections: RulesSection[] = [
    {
      titulo: 'Regras de atendimento',
      empty:
        'Nenhuma regra de entrada. Toda conversa cai na fila padrão da caixa de entrada por onde ela chegou.',
      cards: regras.map((r, indice) => ({
        id: r.id,
        campos: [
          { rotulo: 'Nome da Regra', value: r.name },
          { rotulo: 'Fila', value: r.queueDestinationName },
        ],
        situation: r.active ? 'Ativa' : 'Desativada',
        active: r.active,
        acao: (
          <RuleActions
            regra={r}
            first={indice === 0}
            ultima={indice === regras.length - 1}
            onMover={(direction) => void mover(r.id, direction)}
            onEditar={() => setRuleInEdit(r)}
            onExcluir={() => setRegraParaExcluir(r)}
          />
        ),
        rodape: [
          descreverRegra(r),
          ...(mortas.has(r.id) ? ['Inalcançável — uma regra acima já casa o mesmo caso'] : []),
          ...(r.active && !r.queueDestinationActive
            ? [`Fila “${r.queueDestinationName}” está desativada — a conversa cai nela e para`]
            : []),
        ],
        procura: `${r.name} ${r.queueDestinationName} ${r.conditions
          .map((c) => `${rotuloDoCampo(c.field)} ${c.value}`)
          .join(' ')}`.toLowerCase(),
      })),
    },
  ];

  return (
    <>
      <div className="board-head">
        <h2>Regras de atendimento</h2>
        <Botao
          variante="primario"
          icone="mais"
          className="board-acao"
          onClick={() => setModalAberto(true)}
        >
          Criar nova regra
        </Botao>
      </div>

      {errorReorder ? <Etiqueta tom="erro">{errorReorder}</Etiqueta> : null}

      {/*
 * "Resultados por página" starts at 5, like the `bds-select value="5"` in their footer (`dom/rules.html`).
 */}
      <ListaRegras
        sections={sections}
        placeholder="Buscar regras de atendimento"
        sectionHideHeader
        paginar
        pageInitialSize={5}
      />

      <Modal aberto={modalAberto} titulo="Nova regra" onFechar={() => setModalAberto(false)}>
        <p className="sub">
          As regras são avaliadas <b>de cima para baixo</b>, na ordem da lista, e a{' '}
          <b>primeira que casa vence</b> — as de baixo nem chegam a ser testadas. Dentro de cada
          regra, as condições se combinam com <b>E</b> (todas precisam casar) ou com <b>OU</b>
          (basta uma). Não casou nenhuma? A conversa segue para a fila padrão da caixa de entrada
          por onde ela chegou —{' '}
          {defaults.length === 0
            ? 'e não há caixa de entrada cadastrada.'
            : defaults.map((p) => `${p.inbox}: ${p.queue ?? 'sem fila padrão'}`).join(' · ')}
          .
        </p>
        <RuleQueueForm queues={queues} aoSalvar={() => setModalAberto(false)} />
      </Modal>

      <Modal
        aberto={ruleInEdit !== null}
        titulo="Editar regra"
        onFechar={() => setRuleInEdit(null)}
      >
        {ruleInEdit ? (
          <RuleQueueForm
            queues={queues}
            regraExistente={ruleInEdit}
            aoSalvar={() => setRuleInEdit(null)}
          />
        ) : null}
      </Modal>

      <ModalConfirmation
        aberto={regraParaExcluir !== null}
        titulo="Excluir regra"
        message={
          <>
            Excluir a regra “{regraParaExcluir?.name}”? Esta ação não pode ser desfeita.
          </>
        }
        error={errorDeletion}
        confirmando={excluindo}
        onConfirmar={() => void excluir()}
        onCancelar={() => {
          setRegraParaExcluir(null);
          setErrorDeletion(null);
        }}
      />
    </>
  );
}
