import type { ReactNode } from 'react';
import { IconePortal } from '../../../components/icones-portal';

/**
 * The pieces shared by more than one Analytics tab. No state and no data of their own: everything arrives via prop, so the filled-in render comes from the same component.
 */

/**
 * `<page-header>` — the `blipComponents.pageHeader` directive: div.container > div.full-initial-section > div.row.flex.page-header-content.items-center.mb0 > div.flex.items-center.w-100 > (custom-title | h1.mv0.mr2.lh-solid) div.custom-header-content.flex.items-center.justify-end.ml5.tr.w-100 The help icon and the `<page-help>` only exist with `helperTitle`, `helperBody`, AND `helperConfirm`; none of the three tabs pass the third one, so neither shows up.
 */
export function PageHeader({
  id,
  titulo,
  tituloProprio,
  extra,
}: {
  id?: string;
  /** `page-title`: vira o `h1`. */
  titulo?: string;
  /** `<custom-title>`: toma o lugar do `h1`. */
  tituloProprio?: ReactNode;
  /** `<custom-content>`. */
  extra?: ReactNode;
}) {
  return (
    <div id={id} className="an-cabecalho">
      <div className="fx-column">
        <div className="an-header-section">
          <div className="an-cabecalho-linha">
            <div className="an-cabecalho-titulo">
              {tituloProprio ?? <h1 className="an-h1">{titulo}</h1>}
            </div>
            <div className="an-cabecalho-extra">{extra}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The abbreviated month from `_setDateOnInput()`. In the origin it comes from `DateHelper.months` in English, because the template doesn't pass `months`; here, by the product owner's decision, it comes out in Portuguese and lowercase. The format is theirs.
 */
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** `_setDateOnInput()`: `dd mmm, aaaa` (`06 set, 2026`). Recebe `AAAA-MM-DD`. */
export function dataDoSeletor(iso: string): string {
  const [ano, mes, dia] = iso.split('-');
  return `${dia} ${MESES[Number(mes) - 1]}, ${ano}`;
}

/**
 * `<blip-daterange-picker>`: the box with the calendar icon and the two dates separated by "~"; on open, the `bp-daterange-dropdown` with the calendars and the Cancelar/Aplicar buttons. The origin's two month calendars became two `<input type="date">` inside the same frame: only the panel's inner content changes, and the form sends `de` and `ate` via the URL. "Cancelar" reloads the screen as it was.
 */
export function PeriodSeletor({
  de,
  ate,
  min,
  max,
  aoAplicar,
}: {
  de: string;
  ate: string;
  min?: string;
  max?: string;
  /**
   * De/Até em React state (D-30, `std/nav-contract.md` §Gestão): o envio é
   * interceptado — nunca navega para `?de=&ate=`, só chama esta função com
   * os dois valores lidos do formulário.
   */
  aoAplicar?: (de: string, ate: string) => void;
}) {
  return (
    <details className="an-period">
      <summary className="an-period-fields">
        <span className="an-period-icon">
          <IconePortal nome="calendario" tamanho={21} />
        </span>
        <span className="an-period-data">{dataDoSeletor(de)}</span>
        <span>~</span>
        <span className="an-period-data">{dataDoSeletor(ate)}</span>
      </summary>
      <form
        className="an-period-panel"
        method="get"
        onSubmit={(e) => {
          if (!aoAplicar) return;
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          aoAplicar(String(data.get('de') ?? ''), String(data.get('ate') ?? ''));
        }}
      >
        <div className="an-period-calendars">
          <input
            type="date"
            name="de"
            defaultValue={de}
            min={min}
            max={max}
            aria-label="Data inicial"
          />
          <input
            type="date"
            name="ate"
            defaultValue={ate}
            min={min}
            max={max}
            aria-label="Data final"
          />
        </div>
        <div className="an-period-buttons">
          <a className="an-period-cancel" href="">
            Cancelar
          </a>
          <button type="submit" className="an-period-apply">
            Aplicar
          </button>
        </div>
      </form>
    </details>
  );
}

/**
 * `<card>` — `blipComponents.card`: without `item-title`, just the `div.card-content`; with a title, the `div.card-header` comes first (the `p.card-title` and the `i.icon-info` that only shows up on hover over the card).
 */
export function Card({
  id,
  className,
  titulo,
  dica,
  children,
}: {
  id?: string;
  className?: string;
  titulo?: string;
  dica?: string;
  children: ReactNode;
}) {
  return (
    <div id={id} className={className ? `an-card ${className}` : 'an-card'}>
      {titulo ? (
        <div className="an-card-cabeca">
          <p className="an-card-titulo">
            {titulo}
            {dica ? (
              <span className="an-card-dica" title={dica}>
                <IconePortal nome="informacao" tamanho={24} />
              </span>
            ) : null}
          </p>
        </div>
      ) : null}
      <div className="an-card-conteudo">{children}</div>
    </div>
  );
}

/* ---------------------------------------------------------- the period in the URL */

const DIA = /^\d{4}-\d{2}-\d{2}$/;

/** O dia de hoje (`AAAA-MM-DD`) no fuso da conta. */
export function hojeNoFuso(fuso: string, agora = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: fuso }).format(agora);
}

/** `moment().add(n, 'days')` over a date without time. */
export function somarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * `de` and `ate` come from the URL, which is untrusted external text: they only pass through in day format and in order; otherwise, the screen's default period applies.
 */
export function urlPeriod(
  search: Record<string, string | string[] | undefined>,
  padraoDe: string,
  padraoAte: string,
): { de: string; ate: string } {
  const de = search.de;
  const ate = search.ate;
  if (
    typeof de === 'string' &&
    typeof ate === 'string' &&
    DIA.test(de) &&
    DIA.test(ate) &&
    de <= ate
  ) {
    return { de, ate };
  }
  return { de: padraoDe, ate: padraoAte };
}
