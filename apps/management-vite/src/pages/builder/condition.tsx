import { useState } from 'react';
import type { KeyboardEvent as KeyboardEventDeReact } from 'react';
import type { ConditionBlip } from '@pipe/core';
import { ehUnaria } from '@pipe/core';
import { Campo, Etiqueta, Icone } from '@pipe/ui';
import { ManagementIcon } from '../../components/icones-management';
import { Selection } from '../../components/selection';
import {
  COMPARISONS_OF_SCREEN,
  FONTES_DA_TELA,
  ROTULOS_DAS_SAIDAS,
  ROTULO_DA_FONTE,
  addValue,
  withComparison,
  comFonte,
  comparisonOf,
  conditionError,
  fonteDe,
  fonteSemSuporte,
  newCondition,
  removeValue,
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
  const [digitando, setDigitando] = useState('');
  const fonte = fonteDe(condition);
  const comparison = comparisonOf(condition);
  const unaria = ehUnaria(comparison);
  const values = condition.values ?? [];
  const error = conditionError(condition);
  const semSuporte = fonteSemSuporte(condition);

  function confirmValue(): void {
    if (!digitando.trim()) return;
    onMudar(addValue(condition, digitando));
    setDigitando('');
  }

  function aoTeclar(e: KeyboardEventDeReact<HTMLInputElement>): void {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      confirmValue();
    } else if (e.key === 'Backspace' && !digitando && values.length > 0) {
      onMudar(removeValue(condition, values.length - 1));
    }
  }

  return (
    <div className={`bl-condition${error ? ' bl-condition--error' : ''}`}>
      {!first ? <b className="bl-condition-and">E</b> : null}
      <div className="bl-condition-line bl-condition-fields">
        {semSuporte ? (
          <Etiqueta tom="alerta" titulo="O Pipe não tem provedor de IA: esta condição nunca casa.">
            {ROTULO_DA_FONTE[fonte] ?? fonte}
          </Etiqueta>
        ) : (
          <Selection
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
          </Selection>
        )}
        <Selection
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
        </Selection>
        <button type="button" className="iconbtn bl-remover" title="Excluir condição" aria-label="Excluir condição" onClick={onRemover}>
          <ManagementIcon nome="lixeira" tamanho={18} />
        </button>
        {fonte === 'context' ? (
          <Campo
            aria-label={ROTULOS_DAS_SAIDAS.nomeDaVariavel}
            placeholder={ROTULOS_DAS_SAIDAS.nomeDaVariavel}
            value={condition.variable ?? ''}
            onChange={(e) => onMudar({ ...condition, variable: e.target.value })}
          />
        ) : null}
      </div>
      {!unaria ? (
        <div className="bl-condition-values">
          {/*
           * The Blip screen no longer shows an OR/AND select between values (F-1.4 line 4) — only
           * the chips remain — but `condition.operator` is never cleared, so it survives edits and
           * round-trips through import/export untouched.
           */}
          <div className="bl-values" onClick={(e) => (e.currentTarget.querySelector('input') as HTMLInputElement | null)?.focus()}>
            {values.map((v, i) => (
              <span key={`${v}-${i}`} className="bl-value">
                {v}
                <button type="button" aria-label={`Remover ${v}`} onClick={() => onMudar(removeValue(condition, i))}>
                  ×
                </button>
              </span>
            ))}
            <input
              className="bl-values-field"
              aria-label={ROTULOS_DAS_SAIDAS.valores}
              placeholder={values.length === 0 ? ROTULOS_DAS_SAIDAS.valores : ''}
              value={digitando}
              onChange={(e) => setDigitando(e.target.value)}
              onKeyDown={aoTeclar}
              onBlur={confirmValue}
            />
          </div>
        </div>
      ) : null}
      {error ? <p className="bl-field-error">{error}</p> : null}
    </div>
  );
}
