'use client';

import { useState } from 'react';

/**
 * O "De / Até" do filtro do Dashboard — o `aT` da origem (`analytics-main.js`
 * ~58160). É a ÚNICA parte cliente da aba, porque a regra dele é de campo:
 *
 * - escolher o "De" apaga o "Até" (`f(e, wc)` zera o fim);
 * - o "Até" não aceita data antes do "De" (`min` do segundo campo);
 * - nada antes de 90 dias atrás nem depois de hoje (`st(90)` e `rT`);
 * - o teclado não digita (`onKeyDown: preventDefault`), só o calendário;
 * - "Aplicar" fica travado até os dois estarem preenchidos (`g()`).
 *
 * Aplicar é um GET com `periodo=custom`: a página relê o período da URL.
 */
export function PeriodoPersonalizado({ hoje, de, ate }: { hoje: string; de: string; ate: string }) {
  const [inicio, setInicio] = useState(de);
  const [fim, setFim] = useState(ate);
  const minimo = new Date(Date.parse(`${hoje}T00:00:00Z`) - 90 * 86_400_000)
    .toISOString()
    .slice(0, 10);

  return (
    <form method="get" className="da-datas">
      <input type="hidden" name="periodo" value="custom" />
      {/* `tT.date-info`: a caixa de 32px com borda surface-2 e as duas `oT`. */}
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
