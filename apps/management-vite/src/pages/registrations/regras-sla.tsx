import { useState } from 'react';
import { Botao, BotaoDeIcone } from '@pipe/ui';
import { useRead } from '../../lib/query';
import { ROTULO_ALVO, type QueueConfigured, type RegraSlaConfigurada } from '../../lib/settings';
import { editarRegraSla, excluirRegraSla } from '../../lib/settings-gravar';
import { duration } from '../../lib/format';
import { ListaRegras, type RulesSection } from '../../components/lista-regras';
import { Modal, ConfirmModal } from '@pipe/ui/modal';
import { FormularioRegraSla } from './regras-sla-formulario';

/**
 * The acronym their "Metas" column uses for each target (`dom/sla-policy.html`: "TME, TMR1, TMA" — average wait time, average first-response time, average handling time; `FICHA-sla-policy.md` §8). Our target is a single one per rule, so the column shows one acronym; the deadline and the alert go in the cell's `title`, which is where they fit without opening a column their screen doesn't have.
 */
const SIGLA_DO_ALVO: Record<string, string> = {
  espera_fila: 'TME',
  primeira_resposta: 'TMR1',
  resposta: 'TMR',
  resolucao: 'TMA',
};

/**
 * Regras ├ SLA — the source's `attendance/desk/sla-policy`, measured in `referencias-blip/fichas/FICHA-sla-policy.md` and checked against the `fotos/original-sla-policy.png` screenshot. Same skeleton as theirs (§2): header, search alone below ("Buscar regras de SLA", §3), card list, and the pagination footer (§5). The card has FOUR columns — "Regras de SLA", "Metas", "Filas atribuídas" and the unlabeled "Padrão" badge (§4) — and nothing else on the row besides the actions. DATA divergences, not layout ones: - **One target per rule.** There, one policy combines several targets ("TME, TMR1"); here `regra_sla.alvo` is a single value. The column shows the target's acronym, and the deadline/alert go in the `title`. - **"Padrão" comes from scope.** What the source calls the default policy is, here, the `tenant`-scope rule — the one `escolherRegra` uses as fallback. The badge is that rule, not a new flag. - **"Filas atribuídas"** is at most one queue (or the whole operation): `scopeType`/`scopeId` tie the rule to a single scope. `TODO(escrita)` removed: real `PATCH`/`POST`/`DELETE` on `/v1/gestao/configuracoes/regras` (item 2 of the Attendance registration task) — "Criar regra" and the card's "Editar"/"Excluir" icons (§5) are wired up the same way as `regras-atendimento.tsx`: toggle + `ConfirmModal` for delete, never `window.confirm`.
 */

/** Switch + edit/delete — the row-card's `acao` slot. */
function RuleSlaActions({
  regra,
  onEditar,
  onExcluir,
}: {
  regra: RegraSlaConfigurada;
  onEditar: () => void;
  onExcluir: () => void;
}) {
  const alternar = async () => {
    await editarRegraSla(regra.id, { active: !regra.ativa });
  };
  return (
    <>
      <button
        type="button"
        className="interruptor"
        role="switch"
        aria-checked={regra.ativa}
        aria-label={regra.ativa ? `Desativar a regra ${regra.name}` : `Ativar a regra ${regra.name}`}
        title={regra.ativa ? 'Desativar esta regra' : 'Ativar esta regra'}
        onClick={() => void alternar()}
      >
        <span className="interruptor-bolinha" />
      </button>
      <BotaoDeIcone nome="lapis" rotulo={`Editar a regra ${regra.name}`} onClick={onEditar} />
      <BotaoDeIcone nome="x" rotulo={`Excluir a regra ${regra.name}`} onClick={onExcluir} />
    </>
  );
}

export function SlaPageRules() {
  const [modalAberto, setModalAberto] = useState(false);
  const [ruleInEdit, setRuleInEdit] = useState<RegraSlaConfigurada | null>(null);
  const [regraParaExcluir, setRegraParaExcluir] = useState<RegraSlaConfigurada | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [errorDeletion, setErrorDeletion] = useState<string | null>(null);
  const read = useRead<{ queues: QueueConfigured[]; regras: RegraSlaConfigurada[] }>(
    '/v1/management/settings/rules',
  );
  if (!read.data) return null;
  const { queues, regras } = read.data;

  async function excluir() {
    if (!regraParaExcluir) return;
    setExcluindo(true);
    setErrorDeletion(null);
    const resultado = await excluirRegraSla(regraParaExcluir.id);
    setExcluindo(false);
    if (resultado.ok) setRegraParaExcluir(null);
    else setErrorDeletion(resultado.error);
  }

  const sections: RulesSection[] = [
    {
      titulo: 'Regras de SLA',
      empty: 'Nenhuma regra de SLA cadastrada',
      emptyDescription: 'Toda conversa aparece como “Sem regra” no Monitoramento.',
      cards: regras.map((r) => {
        const queueAssigned = r.scopeType === 'tenant' ? '' : (r.scopeName ?? 'fila removida');
        const meta = SIGLA_DO_ALVO[r.target] ?? r.target;
        const prazo = `${ROTULO_ALVO[r.target] ?? r.target}: prazo ${duration(r.deadlineSeg)}${
          r.alertSeg === null ? '' : `, alerta ${duration(r.alertSeg)}`
        }`;
        return {
          id: r.id,
          campos: [
            { rotulo: 'Regras de SLA', value: r.name },
            { rotulo: 'Metas', value: meta, titulo: prazo },
            { rotulo: 'Filas atribuídas', value: queueAssigned },
          ],
          selo: r.scopeType === 'tenant' ? 'Padrão' : undefined,
          situation: r.ativa ? 'Ativa' : 'Desativada',
          active: r.ativa,
          acao: (
            <RuleSlaActions
              regra={r}
              onEditar={() => setRuleInEdit(r)}
              onExcluir={() => setRegraParaExcluir(r)}
            />
          ),
          procura: `${r.name} ${meta} ${ROTULO_ALVO[r.target] ?? r.target} ${queueAssigned}`.toLowerCase(),
        };
      }),
    },
  ];

  return (
    <>
      <div className="board-head">
        <h2>Regras de SLA</h2>
        <Botao
          variante="primario"
          icone="mais"
          className="board-acao"
          onClick={() => setModalAberto(true)}
        >
          Nova regra
        </Botao>
      </div>

      <ListaRegras
        sections={sections}
        placeholder="Buscar regras de SLA"
        sectionHideHeader
        paginar
        pageInitialSize={5}
      />

      <Modal aberto={modalAberto} titulo="Nova regra de SLA" onFechar={() => setModalAberto(false)}>
        <FormularioRegraSla queues={queues} aoSalvar={() => setModalAberto(false)} />
      </Modal>

      <Modal
        aberto={ruleInEdit !== null}
        titulo="Editar regra de SLA"
        onFechar={() => setRuleInEdit(null)}
      >
        {ruleInEdit ? (
          <FormularioRegraSla
            queues={queues}
            regraExistente={ruleInEdit}
            aoSalvar={() => setRuleInEdit(null)}
          />
        ) : null}
      </Modal>

      <ConfirmModal
        aberto={regraParaExcluir !== null}
        titulo="Excluir regra de SLA"
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
