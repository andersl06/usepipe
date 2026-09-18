import type { ReactNode } from 'react';
import { IconePortal } from '../../../componentes/icones-portal';

/**
 * As peças que mais de uma aba da Análise usa. Sem estado e sem dado: recebem
 * tudo por prop, para o print preenchido sair do mesmo componente.
 */

/**
 * `<page-header>` — a diretiva `blipComponents.pageHeader`:
 *
 *   div.container > div.full-initial-section >
 *     div.row.flex.page-header-content.items-center.mb0 >
 *       div.flex.items-center.w-100 > (custom-title | h1.mv0.mr2.lh-solid)
 *       div.custom-header-content.flex.items-center.justify-end.ml5.tr.w-100
 *
 * O ícone de ajuda e o `<page-help>` só existem com `helperTitle`,
 * `helperBody` E `helperConfirm`; nenhuma das três abas passa o terceiro, então
 * nenhum dos dois aparece.
 */
export function CabecalhoDaPagina({
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
      <div className="fx-coluna">
        <div className="an-cabecalho-secao">
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
 * O mês abreviado do `_setDateOnInput()`. Na origem sai do `DateHelper.months`
 * em inglês, porque o template não passa `months`; aqui, por decisão do dono
 * do produto, sai em português e minúsculo. O formato é o deles.
 */
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** `_setDateOnInput()`: `dd mmm, aaaa` (`06 set, 2026`). Recebe `AAAA-MM-DD`. */
export function dataDoSeletor(iso: string): string {
  const [ano, mes, dia] = iso.split('-');
  return `${dia} ${MESES[Number(mes) - 1]}, ${ano}`;
}

/**
 * `<blip-daterange-picker>`: a caixa com o ícone de calendário e as duas datas
 * separadas por "~"; ao abrir, o `bp-daterange-dropdown` com os calendários e
 * os botões Cancelar e Aplicar.
 *
 * Os dois calendários de mês da origem viraram dois `<input type="date">`
 * dentro da mesma moldura: o que muda é só o miolo do painel, e o formulário
 * manda `de` e `ate` pela URL. "Cancelar" recarrega a tela como estava.
 */
export function SeletorDePeriodo({
  de,
  ate,
  min,
  max,
}: {
  de: string;
  ate: string;
  min?: string;
  max?: string;
}) {
  return (
    <details className="an-periodo">
      <summary className="an-periodo-campos">
        <span className="an-periodo-icone">
          <IconePortal nome="calendario" tamanho={21} />
        </span>
        <span className="an-periodo-data">{dataDoSeletor(de)}</span>
        <span>~</span>
        <span className="an-periodo-data">{dataDoSeletor(ate)}</span>
      </summary>
      <form className="an-periodo-painel" method="get">
        <div className="an-periodo-calendarios">
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
        <div className="an-periodo-botoes">
          <a className="an-periodo-cancelar" href="">
            Cancelar
          </a>
          <button type="submit" className="an-periodo-aplicar">
            Aplicar
          </button>
        </div>
      </form>
    </details>
  );
}

/**
 * `<card>` — `blipComponents.card`: sem `item-title`, só o `div.card-content`;
 * com título, o `div.card-header` antes (o `p.card-title` e o `i.icon-info`
 * que só aparece com o cursor sobre o cartão).
 */
export function Cartao({
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

/* ---------------------------------------------------------- o período na URL */

const DIA = /^\d{4}-\d{2}-\d{2}$/;

/** O dia de hoje (`AAAA-MM-DD`) no fuso da conta. */
export function hojeNoFuso(fuso: string, agora = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: fuso }).format(agora);
}

/** `moment().add(n, 'days')` sobre uma data sem hora. */
export function somarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * `de` e `ate` vêm da URL, que é texto de fora: só passam no formato de dia e
 * em ordem; senão, vale o período padrão da tela.
 */
export function periodoDaUrl(
  busca: Record<string, string | string[] | undefined>,
  padraoDe: string,
  padraoAte: string,
): { de: string; ate: string } {
  const de = busca.de;
  const ate = busca.ate;
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
