import { useState } from 'react';

/**
 * The Dashboard filter's "From / To" — the source's `aT`
 * (`analytics-main.js` ~58160). It's the ONLY client-side part of the tab, because
 * its rule is field-level:
 *
 * - picking "From" clears "To" (`f(e, wc)` resets the end);
 * - "To" doesn't accept a date before "From" (the second field's `min`);
 * - nothing before 90 days ago or after today (`st(90)` and `rT`);
 * - the keyboard doesn't type into it (`onKeyDown: preventDefault`), only the
 *   calendar picker does;
 * - "Aplicar" stays locked until both are filled (`g()`).
 *
 * Applying is a GET with `periodo=custom`: the page re-reads the period from the
 * URL.
 */
export function PeriodCustom({
  hoje,
  de,
  ate,
  aoAplicar,
}: {
  hoje: string;
  de: string;
  ate: string;
  /** D-30: período em state, nunca mais `?periodo=custom&de=&ate=`. */
  aoAplicar?: (de: string, ate: string) => void;
}) {
  const [inicio, setInicio] = useState(de);
  const [fim, setFim] = useState(ate);
  const minimo = new Date(Date.parse(`${hoje}T00:00:00Z`) - 90 * 86_400_000)
    .toISOString()
    .slice(0, 10);

  return (
    <form
      method="get"
      className="da-datas"
      onSubmit={(e) => {
        if (!aoAplicar) return;
        e.preventDefault();
        if (inicio && fim) aoAplicar(inicio, fim);
      }}
    >
      <input type="hidden" name="periodo" value="custom" />
      {/* `tT.date-info`: the 32px box with surface-2 border and the two `oT`. */}
      <div className="da-datas-caixa">
        <label className="da-data">
          <span className="da-t16 da-negrito">De</span>
          <input
            type="date"
            name="de"
            value={inicio}
            min={minimo}
            max={hoje}
            onKeyDown={(e) => e.preventDefault()}
            onChange={(e) => {
              setInicio(e.target.value);
              setFim('');
            }}
          />
        </label>
        <label className="da-data">
          <span className="da-t16 da-negrito">Até</span>
          <input
            type="date"
            name="ate"
            value={fim}
            min={inicio || minimo}
            max={hoje}
            onKeyDown={(e) => e.preventDefault()}
            onChange={(e) => setFim(e.target.value)}
          />
        </label>
      </div>
      {/* `Le variant="tertiary"`. */}
      <button type="submit" className="da-botao da-botao--terciario" disabled={!inicio || !fim}>
        Aplicar
      </button>
    </form>
  );
}
