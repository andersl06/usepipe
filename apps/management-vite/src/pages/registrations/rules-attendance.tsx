import { useState } from 'react';
import { Botao, BotaoDeIcone, Etiqueta } from '@pipe/ui';
import { useRead } from '../../lib/query';
import type { QueueForEscolher, QueueRegisteredRule } from '../../lib/registrations';
import { descreverRegra, regrasInalcancaveis, rotuloDoCampo } from '../../lib/rule-queue';
import { ListaRegras, type RulesSection } from '../../components/lista-regras';
import { alternarRuleQueue } from '../../lib/actions';
import { editRuleQueue, excluirRuleQueue } from '../../lib/registrations-gravar';
import { Modal, ModalConfirmation } from './_modal';
import { FormularioRuleQueue } from './rules-attendance-formulario';

interface QueueRules {
  regras: QueueRegisteredRule[];
  queues: QueueForEscolher[];
  defaults: { inbox: string; queue: string | null }[];
}

/**
 * Regras ├ Atendimento — a regra de entrada.
 *
 * Esqueleto medido em `FICHA-rules.md` §2: cabeçalho com "Criar nova regra"
 * à direita (sem subtítulo), busca sozinha embaixo, cartão-linha com só
 * "Nome da Regra"/"Fila" como coluna (§4) e o rodapé de paginação (§2.5). O
 * cartão-linha em si — rótulo 12/400 sobre valor 16/700, interruptor que liga
 * e desliga o registro na própria lista — é o mesmo de sempre.
 *
 * O combinador, a ordem de avaliação e o aviso de regra inalcançável não são
 * coluna na ficha (ela só documenta "Nome da Regra" e "Fila"), mas continuam
 * decisivos para prever o que a regra faz — por isso ficam no rodapé do
 * cartão (`descreverRegra`/avisos), que é anotação por linha, não uma coluna
 * nova nem um bloco novo na página. "Criar nova regra" abre modal — a Blip
 * não mostra o formulário na página, ele mora dentro do modal fechado que o
 * material capturou para as telas irmãs (`FICHA-queue-management.md` §2.6).
 *
 * Editar/excluir (item 1, segunda parte) entraram: o ícone "Editar" reabre o
 * mesmo modal, com `FormularioRegraFila` em modo edição; o ícone "Excluir"
 * pede confirmação em `ModalConfirmacao` — nunca `window.confirm`, que é o
 * padrão provisório que `atendentes-filas.tsx` ainda usa (comentário lá
 * mesmo diz isso). REORDENAR é as duas setas do rodapé: cada clique troca a
 * regra de posição com a vizinha e manda um `PATCH` por regra cuja `ordem`
 * mudou — sem endpoint próprio (decisão registrada em `cadastros.ts`).
 */

/** O interruptor do cartão. Formulário de um botão: não há nada digitado a preservar. */
function Interruptor({ id, active, nome }: { id: string; active: boolean; nome: string }) {
  return (
    <form action={(data: FormData) => void alternarRuleQueue({ ok: true }, data)}>
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

/** Switch + setas de reordenar + editar/excluir — o slot `acao` do cartão-linha. */
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
      <Interruptor id={regra.id} active={regra.active} nome={regra.nome} />
      <BotaoDeIcone
        nome="cima"
        rotulo={`Mover "${regra.nome}" para cima — avalia antes`}
        onClick={() => onMover(-1)}
        disabled={first}
      />
      <BotaoDeIcone
        nome="baixo"
        rotulo={`Mover "${regra.nome}" para baixo — avalia depois`}
        onClick={() => onMover(1)}
        disabled={ultima}
      />
      <BotaoDeIcone nome="lapis" rotulo={`Editar a regra ${regra.nome}`} onClick={onEditar} />
      <BotaoDeIcone nome="x" rotulo={`Excluir a regra ${regra.nome}`} onClick={onExcluir} />
    </>
  );
}

export function AttendancePageRules() {
  const [modalAberto, setModalAberto] = useState(false);
  const [ruleInEdit, setRuleInEdit] = useState<QueueRegisteredRule | null>(null);
  const [regraParaExcluir, setRegraParaExcluir] = useState<QueueRegisteredRule | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [errorExclusao, setErrorExclusao] = useState<string | null>(null);
  const [errorReordenar, setErrorReordenar] = useState<string | null>(null);
  const read = useRead<QueueRules>('/v1/management/rules/attendance');
  if (!read.data) return null;
  const { regras, queues, defaults } = read.data;
  const mortas = new Set(regrasInalcancaveis(regras));

  // `regras` já vem ordenada por `ordem`/id (mesma ordem que `ordenarRegras`
  // aplica no motor) — trocar de posição na lista é trocar de posição de
  // avaliação. Renumera sequencialmente em vez de só trocar `ordem` entre as
  // duas: se as duas empatarem (o padrão de toda regra nova é `ordem: 0`),
  // trocar valores iguais não move nada.
  async function mover(id: string, direction: -1 | 1) {
    const i = regras.findIndex((r) => r.id === id);
    const j = i + direction;
    if (i < 0 || j < 0 || j >= regras.length) return;
    setErrorReordenar(null);
    const nova = [...regras];
    const tmp = nova[i]!;
    nova[i] = nova[j]!;
    nova[j] = tmp;
    for (const [indice, r] of nova.entries()) {
      if (r.order === indice) continue;
      const resultado = await editRuleQueue(r.id, { order: indice });
      if (!resultado.ok) {
        setErrorReordenar(resultado.error);
        return;
      }
    }
  }

  async function excluir() {
    if (!regraParaExcluir) return;
    setExcluindo(true);
    setErrorExclusao(null);
    const resultado = await excluirRuleQueue(regraParaExcluir.id);
    setExcluindo(false);
    if (resultado.ok) setRegraParaExcluir(null);
    else setErrorExclusao(resultado.error);
  }

  const sections: RulesSection[] = [
    {
      titulo: 'Regras de atendimento',
      empty:
        'Nenhuma regra de entrada. Toda conversa cai na fila padrão da caixa de entrada por onde ela chegou.',
      cards: regras.map((r, indice) => ({
        id: r.id,
        campos: [
          { rotulo: 'Nome da Regra', valor: r.nome },
          { rotulo: 'Fila', valor: r.queueDestinationName },
        ],
        situacao: r.active ? 'Ativa' : 'Desativada',
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
        procura: `${r.nome} ${r.queueDestinationName} ${r.conditions
          .map((c) => `${rotuloDoCampo(c.campo)} ${c.value}`)
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

      {errorReordenar ? <Etiqueta tom="erro">{errorReordenar}</Etiqueta> : null}

      {/* "Resultados por página" nasce em 5, como o `bds-select value="5"` do
          rodapé deles (`dom/rules.html`). */}
      <ListaRegras
        sections={sections}
        placeholder="Buscar regras de atendimento"
        sectionOcultarHeader
        paginar
        pageInitialTamanho={5}
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
        <FormularioRuleQueue queues={queues} aoSalvar={() => setModalAberto(false)} />
      </Modal>

      <Modal
        aberto={ruleInEdit !== null}
        titulo="Editar regra"
        onFechar={() => setRuleInEdit(null)}
      >
        {ruleInEdit ? (
          <FormularioRuleQueue
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
            Excluir a regra “{regraParaExcluir?.nome}”? Esta ação não pode ser desfeita.
          </>
        }
        error={errorExclusao}
        confirmando={excluindo}
        onConfirmar={() => void excluir()}
        onCancelar={() => {
          setRegraParaExcluir(null);
          setErrorExclusao(null);
        }}
      />
    </>
  );
}
