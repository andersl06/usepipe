import type { ReactNode } from 'react';
import { IconePortal, type NomeDeIconePortal } from '../../../../components/icones-portal';
import {
  diaCurto,
  diasDoIntervalo,
  escalaDoEixo as escala,
  type ActiveMessagesData,
  type Intervalo,
} from '@pipe/core/analytics';

/**
 * The Active Messages body — the column of cards and charts from `Lx` (analytics-main.js 56300). Receives the data ready via prop: that's what lets the same markup render both the empty and the filled states. The origin draws the charts with chart.js + chartjs-plugin-datalabels. No library is used here: it's CSS and a line SVG, with the chart.js defaults that show on screen (12px ticks, 3px line, 10% grid).
 */
export function ActiveMessagesMiolo({
  data,
  intervalo,
}: {
  data: ActiveMessagesData;
  intervalo: Intervalo;
}) {
  /*
   * `ne()`: the sum of the `/active-messages/status` rows (`read` is `consumed`, `replied` is `response`).
   */
  const t = data.status.reduce(
    (s, d) => ({
      enviadas: s.enviadas + d.enviadas,
      recebidas: s.recebidas + d.recebidas,
      lidas: s.lidas + d.lidas,
      respondidas: s.respondidas + d.respondidas,
      falhas: s.falhas + d.falhas,
    }),
    { enviadas: 0, recebidas: 0, lidas: 0, respondidas: 0, falhas: 0 },
  );

  return (
    <div className="ma-miolo">
      <div className="ma-papel">
        <div className="ma-fileira">
          <Numeros t={t} />
          <Funil t={t} />
        </div>
      </div>
      <div className="ma-fileira">
        <Conversions data={data} intervalo={intervalo} />
        <Taxas t={t} />
      </div>
      <div className="ma-fileira ma-fileira-ultima">
        <div className="ma-papel ma-flex1">
          <Picos horas={data.respostasByHora} />
        </div>
        <Falhas falhas={data.falhas} />
      </div>
    </div>
  );
}

type Totals = {
  enviadas: number;
  recebidas: number;
  lidas: number;
  respondidas: number;
  falhas: number;
};

/** `bds-tooltip position="top-right"` com o `info` outline `x-small` dentro. */
function Dica({ texto }: { texto: string }) {
  return (
    <span className="ma-dica">
      <IconePortal nome="informacao" tamanho={16} />
      <span className="ma-dica-texto" role="tooltip">
        {texto}
      </span>
    </span>
  );
}

/* ------------------------------------------------------------- `Mt` e `Ft` */

/** `Ct`: label and tooltip for each count. */
const CONTAGENS = {
  enviadas: ['Enviadas', 'Todas as mensagens enviadas à audiência'],
  recebidas: ['Recebidas', 'Todas as mensagens entregues com sucesso'],
  lidas: ['Lidas', 'Todas as mensagens visualizadas pelos contatos'],
  respondidas: ['Respondidas', 'Todas as mensagens respondidas pelos contatos'],
  falhas: ['Falharam', 'Todas as mensagens que falharam no envio e não chegaram aos contatos'],
} as const;

function Numeros({ t }: { t: Totals }) {
  /* `Ft`: icon, background, raw number (the origin doesn't format here), and label. */
  const card = (
    key: 'recebidas' | 'lidas' | 'respondidas' | 'falhas',
    icone: NomeDeIconePortal,
    fundo: string,
  ) => (
    <div className="ma-cartao">
      <span className={`ma-cartao-icone ${fundo}`}>
        <IconePortal nome={icone} tamanho={32} />
      </span>
      <div className="ma-cartao-textos">
        <div className="ma-par">
          <b className="ma-cartao-numero">{t[key]}</b>
          <Dica texto={CONTAGENS[key][1]} />
        </div>
        <span className="ma-cartao-titulo">{CONTAGENS[key][0]}</span>
      </div>
    </div>
  );

  return (
    <div className="ma-numeros">
      <div className="ma-numeros-caixa">
        <div className="ma-enviadas">
          <span className="ma-enviadas-icone">
            <IconePortal nome="aviao" tamanho={40} />
          </span>
          <div className="ma-enviadas-textos">
            <div className="ma-par">
              <b className="ma-enviadas-numero">{t.enviadas}</b>
              <Dica texto={CONTAGENS.enviadas[1]} />
            </div>
            <b className="ma-enviadas-titulo">{CONTAGENS.enviadas[0]}</b>
          </div>
        </div>
        <div className="ma-cartoes">
          <div className="ma-cartoes-linha">
            {card('recebidas', 'cheque', 'ma-fundo-recebidas')}
            {card('lidas', 'duplo-cheque', 'ma-fundo-lidas')}
          </div>
          <div className="ma-cartoes-linha">
            {card('respondidas', 'responder', 'ma-fundo-respondidas')}
            {card('falhas', 'erro-contorno', 'ma-fundo-falharam')}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ `fc` */

function Funil({ t }: { t: Totals }) {
  /* `D()`: everything as a percentage of sent; with no sends, everything is zero. */
  const pct = (v: number) => (t.enviadas === 0 ? 0 : Math.round((v / t.enviadas) * 100));
  const barras = [
    ['Enviadas', t.enviadas === 0 ? 0 : 100, 'ma-fundo-enviadas'],
    ['Recebidas', pct(t.recebidas), 'ma-fundo-recebidas'],
    ['Lidas', pct(t.lidas), 'ma-fundo-lidas'],
    ['Respondidas', pct(t.respondidas), 'ma-fundo-respondidas'],
    ['Falharam', pct(t.falhas), 'ma-fundo-falharam'],
  ] as const;
  const { topo } = escala(Math.max(...barras.map((b) => b[1])));

  return (
    <div className="ma-funil">
      <div className="ma-funil-caixa">
        <div className="ma-cabeca-grafico">
          <b className="ma-titulo-grafico">Funil de Conversão</b>
          <span className="ma-descricao-grafico">
            Avalie a eficácia no envio de mensagens e interações geradas pela audiência
          </span>
        </div>
        <div className="ma-funil-grafico">
          {barras.map(([rotulo, value, fundo]) => (
            <FunilLinha key={rotulo} rotulo={rotulo} largura={(value / topo) * 100} fundo={fundo}>
              {value}%
            </FunilLinha>
          ))}
        </div>
      </div>
    </div>
  );
}

function FunilLinha({
  rotulo,
  largura,
  fundo,
  children,
}: {
  rotulo: string;
  largura: number;
  fundo: string;
  children: ReactNode;
}) {
  return (
    <>
      <span className="ma-funil-rotulo">{rotulo}</span>
      <span className="ma-funil-trilho">
        <span className={`ma-funil-barra ${fundo}`} style={{ width: `${largura}%` }} />
        <span className="ma-funil-valor" style={{ left: `${largura}%` }}>
          {children}
        </span>
      </span>
    </>
  );
}

/* ------------------------------------------------------------------ `Dl` */

const SERIES = [
  ['enviadas', 'Enviadas', 'ma-serie-enviadas'],
  ['respondidas', 'Respondidas', 'ma-serie-respondidas'],
  ['falhas', 'Falharam', 'ma-serie-falharam'],
] as const;

function Conversions({ data, intervalo }: { data: ActiveMessagesData; intervalo: Intervalo }) {
  /* `b()`: one point per day in the period, zero where nothing was sent. */
  const byDia = new Map(data.status.map((s) => [s.dia, s]));
  const dias = diasDoIntervalo(intervalo).map((d) => ({
    dia: d,
    enviadas: byDia.get(d)?.enviadas ?? 0,
    respondidas: byDia.get(d)?.respondidas ?? 0,
    falhas: byDia.get(d)?.falhas ?? 0,
  }));

  /*
   * `bds-paper style={{ flex: 1 }}` › `bds-paper` › `bds-grid gap="2" padding="2"`: the paper-inside-paper is theirs, and the shadow doubles up. The title and description ask for `lineHeight="none"`, which doesn't take (see `.ma-taxa-titulo`).
   */
  return (
    <div className="ma-papel ma-flex1">
      <div className="ma-papel ma-conversoes">
        <div className="ma-cabeca-grafico">
          <b className="ma-t20 ma-negrito">Conversões</b>
          <span className="ma-t14">
            Todas as mensagens enviadas e respondidas pelos contatos ou que tiveram falhas no envio
          </span>
        </div>
        <div className="ma-conversoes-grafico">
          {intervalo.inicio === intervalo.fim ? (
            <BarrasDoDia dia={dias[0]} />
          ) : (
            <Linhas dias={dias} />
          )}
          <div className="ma-legenda">
            {SERIES.map(([, rotulo, serie]) => (
              <span key={rotulo}>
                <i className={serie} />
                {rotulo}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** `f()` + the single-day `options`: three bars, no axis or grid. */
function BarrasDoDia({ dia }: { dia?: { enviadas: number; respondidas: number; falhas: number } }) {
  const values = SERIES.map(([key]) => dia?.[key] ?? 0);
  const { topo } = escala(Math.max(...values));
  return (
    <div className="ma-area">
      <span />
      <div className="ma-barras">
        {SERIES.map(([key, rotulo, serie], i) => (
          <span
            key={key}
            className={serie}
            title={rotulo}
            style={{ height: `${((values[i] ?? 0) / topo) * 100}%` }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * `m()` + the period `options`: three lines, each on its OWN scale (`y`, `y1`, `y2`, the last two hidden), and only the "sent" line has an axis.
 */
function Linhas({
  dias,
}: {
  dias: { dia: string; enviadas: number; respondidas: number; falhas: number }[];
}) {
  const { topo, tiques } = escala(Math.max(...dias.map((d) => d.enviadas)));
  const x = (i: number) => (dias.length > 1 ? (i / (dias.length - 1)) * 100 : 50);
  /* chart.js skips labels that don't fit (`autoSkip`); here, one every N. */
  const pulo = Math.ceil(dias.length / 12);

  return (
    <div className="ma-area">
      <div className="ma-eixo-y">
        {tiques.map((v) => (
          <span key={v} style={{ top: `${100 - (v / topo) * 100}%` }}>
            {v.toLocaleString('pt-BR')}
          </span>
        ))}
      </div>
      <div className="ma-plotagem">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {tiques.map((v) => (
            <line
              key={`h${v}`}
              className="ma-grade"
              x1="0"
              x2="100"
              y1={100 - (v / topo) * 100}
              y2={100 - (v / topo) * 100}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {dias.map((d, i) => (
            <line
              key={`v${d.dia}`}
              className="ma-grade"
              x1={x(i)}
              x2={x(i)}
              y1="0"
              y2="100"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {SERIES.map(([key, , serie]) => {
            const alto = escala(Math.max(...dias.map((d) => d[key]))).topo;
            return (
              <polyline
                key={key}
                className={`ma-linha ${serie}`}
                vectorEffect="non-scaling-stroke"
                points={dias.map((d, i) => `${x(i)},${100 - (d[key] / alto) * 100}`).join(' ')}
              />
            );
          })}
        </svg>
      </div>
      <span />
      <div className="ma-eixo-x">
        {dias.map((d, i) =>
          i % pulo === 0 ? (
            <span key={d.dia} style={{ left: `${x(i)}%` }}>
              {diaCurto(d.dia)}
            </span>
          ) : null,
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ `Wl` */

function Taxas({ t }: { t: Totals }) {
  /* `(l / c * 100).toFixed(2).replace(".", ",")`, e o "0%" inicial sem envio. */
  const taxa = (v: number) =>
    t.enviadas ? `${((v / t.enviadas) * 100).toFixed(2).replace('.', ',')}%` : '0%';
  const card = (icone: NomeDeIconePortal, titulo: string, description: string, value: string) => (
    <div className="ma-taxa">
      <IconePortal nome={icone} tamanho={48} />
      <div className="ma-taxa-miolo">
        <div>
          <p className="ma-taxa-titulo">{titulo}</p>
          <p className="ma-taxa-descricao">{description}</p>
        </div>
        <b className="ma-t24">{value}</b>
      </div>
    </div>
  );

  return (
    <div className="ma-flex1 ma-taxas-fora">
      <div className="ma-papel ma-taxas">
        <div className="ma-taxas-caixa">
          {card(
            'mensagem-lida',
            'Taxa de Conversão',
            'Total de respostas dos contatos em relação às mensagens enviadas',
            taxa(t.respondidas),
          )}
          {card(
            'mensagem-erro',
            'Taxa de Falha',
            'Total de mensagens que falharam em relação às mensagens enviadas',
            taxa(t.falhas),
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ `_c` */

function Picos({ horas }: { horas: number[] }) {
  /* Zero is drawn as 0.5 (the minimum bar) and the axis goes to at least 50. */
  const values = Array.from({ length: 24 }, (_, h) => horas[h] || 0.5);
  const { topo } = escala(Math.max(50, ...values));

  return (
    <div className="ma-picos">
      <div className="ma-picos-cabeca">
        <b className="ma-titulo-grafico">Picos de resposta</b>
        <span className="ma-descricao-grafico">
          Horários em que seus contatos mais respondem às mensagens
        </span>
      </div>
      <div className="ma-picos-grafico">
        <div className="ma-picos-area">
          {values.map((v, h) => (
            <span key={h} className="ma-picos-coluna" title={`Respostas: ${v === 0.5 ? 0 : v}`}>
              <span style={{ height: `${(v / topo) * 100}%` }} />
            </span>
          ))}
        </div>
        <div className="ma-picos-eixo">
          {values.map((_, h) => (
            <span key={h}>{h % 2 === 0 ? `${h}h` : ''}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ `bc` */

function Falhas({ falhas }: { falhas: ActiveMessagesData['falhas'] }) {
  return (
    <div className="ma-papel ma-falhas">
      <div className="ma-falhas-caixa">
        <p className="ma-falhas-titulo">
          Falhas no envio
          <br />
          <span className="ma-falhas-descricao">
            Erros que impediram a entrega de mensagens aos contatos.{' '}
            <a
              href="https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes/?translation"
              target="_blank"
              rel="noreferrer"
            >
              Confira erros e soluções.
            </a>
          </span>
        </p>
        <div className="ma-falhas-rolagem">
          <table className="ma-tabela">
            <thead>
              <tr>
                <th>Código</th>
                <th>Descrição do erro</th>
                <th>Ocorrências</th>
              </tr>
            </thead>
            <tbody>
              {falhas.map((f, i) => (
                <tr key={`${f.codigo}-${i}`}>
                  <td>{f.codigo ?? 'N/A'}</td>
                  <td>{f.description}</td>
                  <td>{f.ocorrencias}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
