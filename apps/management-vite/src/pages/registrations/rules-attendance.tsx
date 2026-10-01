import { useState } from 'react';
import { Botao, BotaoDeIcone, Carregando, Etiqueta } from '@pipe/ui';
import { useRead } from '../../lib/query';
import { useContact } from '../flow/contact';
import { withFlow } from '../../lib/flow-scope';
import type { QueueForChoose, QueueRegisteredRule } from '../../lib/registrations';
import { descreverRegra, regrasInalcancaveis, rotuloDoCampo } from '../../lib/rule-queue';
import { ListaRegras, type RulesSection } from '../../components/lista-regras';
import { toggleRuleQueue } from '../../lib/actions';
import { editRuleQueue, deleteRuleQueue } from '../../lib/registrations-gravar';
import { ConfirmModal } from '@pipe/ui/modal';
import { RuleQueueForm } from './rules-attendance-formulario';

interface QueueRules {
  regras: QueueRegisteredRule[];
  queues: QueueForChoose[];
  defaults: { inbox: string; queue: string | null }[];
}

/**
 * Regras > Atendimento. Lista de cartões ("Nome da Regra", "Fila", editar, excluir, interruptor) e, no lugar dela e na mesma URL, o formulário de criar/editar regra. As regras são avaliadas de cima para baixo e a primeira que casa vence; por isso, além do que a Blip mostra, o cartão tem as setas de ordem e o rodapé que descreve a regra (`descreverRegra`) e avisa de regra inalcançável. Reordenar manda um `PATCH` por regra cuja posição mudou.
 */

/** The card's toggle. A one-button form: there's nothing typed to preserve. */
function Interruptor({ id, active, nome }: { id: string; active: boolean; nome: string }) {
  const { contact } = useContact();
  return (
    <form action={(data: FormData) => void toggleRuleQueue({ ok: true }, data)}>
      <input type="hidden" name="fluxoId" value={contact.id} />
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
      <BotaoDeIcone nome="lixeira" rotulo={`Excluir a regra ${regra.name}`} onClick={onExcluir} />
    </>
  );
}

export function AttendancePageRules() {
  const { contact } = useContact();
  // `null` = lista; `{}` = formulário de nova regra; `{ regra }` = edição.
  const [formulario, setFormulario] = useState<{ regra?: QueueRegisteredRule } | null>(null);
  const [regraParaExcluir, setRegraParaExcluir] = useState<QueueRegisteredRule | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [errorDeletion, setErrorDeletion] = useState<string | null>(null);
  const [errorReorder, setErrorReorder] = useState<string | null>(null);
  const read = useRead<QueueRules>(withFlow('/v1/management/rules/attendance', contact.id));
  if (read.isError) return <Etiqueta tom="erro">Não foi possível carregar as regras de atendimento.</Etiqueta>;
  if (!read.data) return <Carregando />;
  const { regras, queues } = read.data;
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
      const resultado = await editRuleQueue(contact.id, r.id, { order: indice });
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
    const resultado = await deleteRuleQueue(contact.id, regraParaExcluir.id);
    setExcluindo(false);
    if (resultado.ok) setRegraParaExcluir(null);
    else setErrorDeletion(resultado.error);
  }

  const sections: RulesSection[] = [
    {
      titulo: 'Regras de atendimento',
      empty:
        'Crie uma regra para definir como seu chatbot deve direcionar os atendimentos entre os atendentes cadastrados.',
      emptyDescription:
        'Sem regra, toda conversa cai na fila padrão da caixa de entrada por onde ela chegou.',
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
            onEditar={() => setFormulario({ regra: r })}
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

  if (formulario) {
    return (
      <RuleQueueForm
        queues={queues}
        regra={formulario.regra}
        todasAsRegras={regras}
        onFechar={() => setFormulario(null)}
      />
    );
  }

  return (
    <>
      <div className="board-head">
        <h2>Regras de atendimento</h2>
        <Botao
          variante="primario"
          icone="mais"
          className="board-acao"
          onClick={() => setFormulario({})}
        >
          Criar nova regra
        </Botao>
      </div>

      {errorReorder ? <Etiqueta tom="erro">{errorReorder}</Etiqueta> : null}

      {/* "Resultados por página" começa em 5, como o seletor da Blip. */}
      <ListaRegras
        sections={sections}
        placeholder="Buscar regras de atendimento"
        sectionHideHeader
        paginar
        pageInitialSize={5}
      />

      <ConfirmModal
        aberto={regraParaExcluir !== null}
        titulo="Excluir regra"
        message={
          <>
            Ao excluir essa regra, você removerá permanentemente o direcionamento dos tickets
            condicionados para a fila de atendimento {regraParaExcluir?.queueDestinationName}.
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
