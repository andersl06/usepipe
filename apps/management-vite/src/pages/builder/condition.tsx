import { useContext, useId } from 'react';
import type { ConditionBlip } from '@pipe/core';
import { AiModelContext } from './ai-model-context';
import { aiConditionSuggestions } from '../flow/ai-model-logic';
import { ehUnaria } from '@pipe/core';
import { Campo, Etiqueta, Icone } from '@pipe/ui';
import { ManagementIcon } from '../../components/icones-management';
import { Select } from '@pipe/ui/select';
import { ChipsInput } from '@pipe/ui/chips-input';
import {
  COMPARISONS_OF_SCREEN,
  FONTES_DA_TELA,
  ROTULOS_DAS_SAIDAS,
  ROTULO_DA_FONTE,
  withComparison,
  comFonte,
  comparisonOf,
  conditionError,
  fonteDe,
  fonteSemSuporte,
  newCondition,
} from './conditions';

/**
 * Reference `condition-wrapper` for an exit or action lists If, source, variable, comparison, values in each row. All conditions must match; the engine stops at the first false one. Enter or comma adds a value tag, with OR/AND between values.
 */

export function ConditionsEditor({
  conditions,
  onMudar,
  onRemoverCondicao,
  rotuloAdicionar,
}: {
  conditions: ConditionBlip[];
  onMudar: (conditions: ConditionBlip[]) => void;
  /** When set, removal goes through this callback instead of filtering the array in place — the
   * outputs panel uses it to remove the whole output once its last condition goes (Blip
   * `on-remove-condition`); action conditions have no such concept and fall back to filtering. */
  onRemoverCondicao?: (indice: number) => void;
  rotuloAdicionar: string;
}) {
  const substituir = (indice: number, c: ConditionBlip): void =>
    onMudar(conditions.map((x, i) => (i === indice ? c : x)));
  const remover = (indice: number): void =>
    onRemoverCondicao ? onRemoverCondicao(indice) : onMudar(conditions.filter((_, i) => i !== indice));
  return (
    <div className="bl-conditions">
      {conditions.map((c, i) => (
        <ConditionRow
          key={i}
          condition={c}
          first={i === 0}
          onMudar={(nova) => substituir(i, nova)}
          onRemover={() => remover(i)}
        />
      ))}
      <div className="bl-add-condition-wrapper">
        <div className="bl-add-condition-linha" />
        <button
          type="button"
          className="bl-add-condition"
          aria-label={rotuloAdicionar}
          title={rotuloAdicionar}
          onClick={() => onMudar([...conditions, newCondition()])}
        >
          <Icone nome="mais" tamanho={14} />
        </button>
      </div>
    </div>
  );
}

function ConditionRow({
  condition,
  first,
  onMudar,
  onRemover,
}: {
  condition: ConditionBlip;
  first: boolean;
  onMudar: (c: ConditionBlip) => void;
  onRemover: () => void;
}) {
  const fonte = fonteDe(condition);
  const comparison = comparisonOf(condition);
  const unaria = ehUnaria(comparison);
  const values = condition.values ?? [];
  const error = conditionError(condition);
  const semSuporte = fonteSemSuporte(condition);
  const { model } = useContext(AiModelContext);
  const entityList = useId();
  const suggestions = aiConditionSuggestions(model, condition);

  return (
    <div className={`bl-condition${error ? ' bl-condition--error' : ''}`} title={error ?? undefined}>
      {!first ? <b className="bl-condition-and">E</b> : null}
      <div className="bl-condition-line bl-condition-fields">
        {semSuporte ? (
          <Etiqueta tom="alerta" titulo="Esta fonte de condição não é suportada pelo Pipe.">
            {ROTULO_DA_FONTE[fonte] ?? fonte}
          </Etiqueta>
        ) : (
          <Select
            aria-label="Fonte"
            rotulo="Se"
            value={fonte}
            onChange={(e) => onMudar(comFonte(condition, e.target.value))}
          >
            {FONTES_DA_TELA.map((f) => (
              <option key={f.valor} value={f.valor}>
                {f.rotulo}
              </option>
            ))}
          </Select>
        )}
        <Select
          aria-label="Comparação"
          rotulo="Condição"
          value={comparison}
          onChange={(e) => onMudar(withComparison(condition, e.target.value as typeof comparison))}
        >
          {COMPARISONS_OF_SCREEN.map((c) => (
            <option key={c.value} value={c.value}>
              {c.rotulo}
            </option>
          ))}
        </Select>
        <button type="button" className="iconbtn bl-remover" title="Excluir condição" aria-label="Excluir condição" onClick={onRemover}>
          <ManagementIcon nome="lixeira" tamanho={18} />
        </button>
        {fonte === 'context' ? (
          <Campo
            className={!condition.variable?.trim() && error ? 'bl-campo--danger' : undefined}
            title={!condition.variable?.trim() && error ? error : undefined}
            aria-label={ROTULOS_DAS_SAIDAS.nomeDaVariavel}
            placeholder={ROTULOS_DAS_SAIDAS.nomeDaVariavel}
            value={condition.variable ?? ''}
            onChange={(e) => onMudar({ ...condition, variable: e.target.value })}
          />
        ) : null}
        {fonte === 'entity' ? <>
          <Campo aria-label="Nome da entidade" placeholder="Nome da entidade" list={entityList} value={condition.entity ?? ''} onChange={(e) => onMudar({ ...condition, entity: e.target.value })} />
          <datalist id={entityList}>{model?.entities.map((entity) => <option key={entity.id} value={entity.name} />)}</datalist>
        </> : null}
      </div>
      {!unaria ? (
        <div
          className={`bl-condition-values${error ? ' bl-campo--danger' : ''}`}
          title={error ?? undefined}
        >
          {/*
           * The Blip screen no longer shows an OR/AND select between values (F-1.4 line 4) — only
           * the chips remain — but `condition.operator` is never cleared, so it survives edits and
           * round-trips through import/export untouched.
           */}
          <ChipsInput
            rotulo={ROTULOS_DAS_SAIDAS.valores}
            placeholder={ROTULOS_DAS_SAIDAS.valores}
            values={values}
            onChange={(next) => onMudar({ ...condition, values: next })}
            erro={values.length === 0 && error ? 'Ops! Este campo precisa ser preenchido' : undefined}
          />
          {suggestions.length ? <div className="bl-ai-suggestions" aria-label="Sugestões do modelo de IA">
            <span className="sub">Sugestões:</span>
            {suggestions.filter((value) => !values.includes(value)).map((value) => <button type="button" className="bl-mais" key={value} onClick={() => onMudar({ ...condition, values: [...values, value] })}>{value}</button>)}
          </div> : null}
        </div>
      ) : null}
    </div>
  );
}
