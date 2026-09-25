import { useState } from 'react';
import type { KeyboardEvent as KeyboardEventDeReact } from 'react';
import type { ConditionBlip } from '@pipe/core';
import { ehUnaria } from '@pipe/core';
import { Campo, Etiqueta } from '@pipe/ui';
import { IconeManagement } from '../../components/icones-management';
import { Selection } from '../../components/selection';
import {
  COMPARISONS_OF_TELA,
  FONTES_DA_TELA,
  OPERADORES_DA_TELA,
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
  removerValue,
} from './conditions';

/**
 * A lista de condições de uma saída (ou de uma ação): o `condition-wrapper`
 * do editor — "Se" [fonte] [nome da variável] [comparação] [valores], uma
 * linha por condição, todas precisam casar (o motor avalia em sequência e
 * para na primeira falsa). Os valores são as "tags" do editor: Enter ou
 * vírgula acrescenta um; entre eles vale o operador OU/E.
 */

export function ConditionsEditor({
  conditions,
  onMudar,
  rotuloAdicionar,
}: {
  conditions: ConditionBlip[];
  onMudar: (conditions: ConditionBlip[]) => void;
  rotuloAdicionar: string;
}) {
  const switch = (indice: number, c: ConditionBlip): void =>
    onMudar(conditions.map((x, i) => (i === indice ? c : x)));
  const remover = (indice: number): void => onMudar(conditions.filter((_, i) => i !== indice));
  return (
    <div className="bl-condicoes">
      {conditions.map((c, i) => (
        <ConditionLinha
          key={i}
          condition={c}
          first={i === 0}
          onMudar={(nova) => switch(i, nova)}
          onRemover={() => remover(i)}
        />
      ))}
      <button
        type="button"
        className="bl-adicionar-condicao"
        aria-label={rotuloAdicionar}
        title={rotuloAdicionar}
        onClick={() => onMudar([...conditions, newCondition()])}
      >
        +
      </button>
    </div>
  );
}

function ConditionLinha({
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
      onMudar(removerValue(condition, values.length - 1));
    }
  }

  return (
    <div className={`bl-condicao${error ? ' bl-condicao--erro' : ''}`}>
      <div className="bl-condicao-linha bl-condicao-campos">
        <span className="bl-condicao-se">{first ? ROTULOS_DAS_SAIDAS.se : 'e'}</span>
        {semSuporte ? (
          <Etiqueta tom="alert" titulo="O Pipe não tem provedor de IA: esta condição nunca casa.">
            {ROTULO_DA_FONTE[fonte] ?? fonte}
          </Etiqueta>
        ) : (
          <Selection
            aria-label="Fonte"
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
        {fonte === 'context' ? (
          <Campo
            aria-label={ROTULOS_DAS_SAIDAS.nomeDaVariavel}
            placeholder={ROTULOS_DAS_SAIDAS.nomeDaVariavel}
            value={condition.variable ?? ''}
            onChange={(e) => onMudar({ ...condition, variable: e.target.value })}
          />
        ) : null}
        <Selection
          aria-label="Comparação"
          value={comparison}
          onChange={(e) => onMudar(withComparison(condition, e.target.value as typeof comparison))}
        >
          {COMPARISONS_OF_TELA.map((c) => (
            <option key={c.valor} value={c.valor}>
              {c.rotulo}
            </option>
          ))}
        </Selection>
        <button type="button" className="iconbtn bl-remover" title="Excluir condição" aria-label="Excluir condição" onClick={onRemover}>
          <IconeManagement nome="lixeira" tamanho={18} />
        </button>
      </div>
      {!unaria ? (
        <div className="bl-condicao-valores">
          {values.length > 1 ? (
            <Selection
              aria-label="Operador"
              className="bl-condicao-operador"
              value={(condition.operator ?? 'or').toLowerCase()}
              onChange={(e) => onMudar({ ...condition, operator: e.target.value })}
            >
              {OPERADORES_DA_TELA.map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.rotulo}
                </option>
              ))}
            </Selection>
          ) : null}
          <div className="bl-valores" onClick={(e) => (e.currentTarget.querySelector('input') as HTMLInputElement | null)?.focus()}>
            {values.map((v, i) => (
              <span key={`${v}-${i}`} className="bl-valor">
                {v}
                <button type="button" aria-label={`Remover ${v}`} onClick={() => onMudar(removerValue(condition, i))}>
                  ×
                </button>
              </span>
            ))}
            <input
              className="bl-valores-campo"
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
      {error ? <p className="bl-erro-do-campo">{error}</p> : null}
    </div>
  );
}
