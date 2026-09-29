import { useState } from 'react';
import { IconePortal } from '@pipe/ui/icones-portal';

/**
 * The Active Messages filter — `St` (analytics-main.js 33556), dictionary `gt`. It's client-side for ONE visible reason: "Aplicar" starts disabled and only lights up when something changes (the `N`/`U()` of `Lx`: chip, date, or template). The rest is a plain GET form — the period, dates, and template go in the URL, and the (server) page reads from there, which is the origin's `K()`. It deliberately does not import `lib/analise.ts`: that file opens the database. Labels and date limits arrive via prop.
 */
export interface ActiveMessagesFilterValues {
  periodo: string;
  de: string;
  ate: string;
  template: string;
}

export function Filter({
  fileiras,
  period,
  de,
  ate,
  template,
  templates,
  hoje,
  limite,
  aoAplicar,
}: {
  /** As duas fileiras de chip: `vT` sem o personalizado, e `kt`. */
  fileiras: { key: string; rotulo: string }[][];
  period: string;
  de: string;
  ate: string;
  template: string;
  /** `/active-messages/template-names`: the autocomplete's options. */
  templates: string[];
  /** `endDateLimit` (hoje) e `startDateLimit` (hoje − 186), em `AAAA-MM-DD`. */
  hoje: string;
  limite: string;
  /**
   * Período em React state (D-30): o envio é interceptado, nunca navega
   * para `?periodo=&de=&ate=`. `template` continua fora do D-30 (NEEDS
   * VALIDATION) — a tela decide se ele volta para a query string.
   */
  aoAplicar?: (filtros: ActiveMessagesFilterValues) => void;
}) {
  const [mudou, setMudou] = useState(false);
  const [escolhido, setEscolhido] = useState(period);
  const [datas, setDatas] = useState({ de, ate });
  const [nome, setNome] = useState(template);
  const personalizado = escolhido === 'custom';

  /* `D()`: finishing the calendar turns it into a custom period and clears the chip. */
  const mudarData = (campo: 'de' | 'ate', value: string) => {
    setDatas((d) => ({ ...d, [campo]: value }));
    setEscolhido('custom');
    setMudou(true);
  };

  return (
    <form
      id="ma-filtro"
      className="ma-filter"
      method="get"
      onSubmit={(e) => {
        if (!aoAplicar) return;
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        aoAplicar({
          periodo: String(data.get('periodo') ?? escolhido),
          de: String(data.get('de') ?? ''),
          ate: String(data.get('ate') ?? ''),
          template: String(data.get('template') ?? ''),
        });
      }}
    >
      <div className="ma-filter-grid">
        {/* `.chips-wrapper` › `bds-grid direction="column" gap="1"` */}
        <div className="ma-chips-caixa">
          <div className="ma-column">
            <div className="ma-rotulo-caixa">
              <p className="ma-t14 ma-negrito">Selecione o período</p>
            </div>
            {fileiras.map((row) => (
              <div key={row[0]?.key} className="ma-linha-chips">
                {row.map(({ key, rotulo }) => (
                  <label key={key} className="ma-chip">
                    <input
                      type="radio"
                      name="periodo"
                      value={key}
                      checked={escolhido === key}
                      onChange={() => {
                        setEscolhido(key);
                        setDatas({ de: '', ate: '' });
                        setMudou(true);
                      }}
                    />
                    <span className="ma-chip-texto">{rotulo}</span>
                  </label>
                ))}
              </div>
            ))}
            {personalizado ? <input type="hidden" name="periodo" value="custom" /> : null}
          </div>
        </div>

        {/*
 * `.datepicker-wrapper`: fs-14 semi-bold label and the `bds-datepicker type-of-date="period"` — two "De"/"Até" `bds-input`s with the `calendar` icon. Their floating calendar becomes the native picker.
 */}
        <div className="ma-column">
          <p className="ma-t14 ma-semi">Filtre por data</p>
          <div className="ma-datas">
            {(
              [
                ['de', 'De'],
                ['ate', 'Até'],
              ] as const
            ).map(([campo, rotulo]) => (
              <label key={campo} className="ma-campo">
                <span className="ma-campo-icone">
                  <IconePortal nome="calendario" tamanho={24} />
                </span>
                <span className="ma-campo-miolo">
                  <span className="ma-campo-rotulo">{rotulo}</span>
                  <input
                    type="date"
                    name={personalizado ? campo : undefined}
                    value={datas[campo]}
                    min={limite}
                    max={hoje}
                    onChange={(e) => mudarData(campo, e.target.value)}
                  />
                </span>
              </label>
            ))}
          </div>
        </div>

        {/*
 * `.autocomplete-wrapper`: the label says "campanha" because the template one is enabled (`y || v`); the Campaign one is hidden by the flag.
 */}
        <div className="ma-column">
          <p className="ma-t14 ma-semi">Filtre por campanha</p>
          <div className="ma-linha-chips ma-filter-template">
            <label className="ma-campo ma-campo-auto">
              <span className="ma-campo-miolo">
                <span className="ma-campo-rotulo">Template</span>
                <input
                  type="text"
                  name="template"
                  list="ma-templates"
                  placeholder="Nome do template"
                  autoComplete="off"
                  value={nome}
                  onChange={(e) => {
                    setNome(e.target.value);
                    setMudou(true);
                  }}
                />
                <datalist id="ma-templates">
                  {templates.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </span>
              {/* `.select__icon`: the solid `error` icon only appears with a value (`icon-hidden`). */}
              <span className="ma-campo-sufixo">
                <IconePortal
                  nome="fechar-chip"
                  tamanho={16}
                  style={{ visibility: nome ? 'visible' : 'hidden', cursor: 'pointer' }}
                  onClick={(e) => {
                    e.preventDefault();
                    setNome('');
                    setMudou(true);
                  }}
                />
                <IconePortal nome="baixo" tamanho={16} />
              </span>
            </label>
            <button type="submit" className="ma-botao ma-botao-primario" disabled={!mudou}>
              Aplicar
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
