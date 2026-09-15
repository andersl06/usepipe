import type { ReactNode } from 'react';
import { IconePortal, type NomeDeIconePortal } from '../../../../../componentes/icones-portal';
import {
  diaCurto,
  diasDoIntervalo,
  escalaDoEixo as escala,
  type DadosDeMensagensAtivas,
  type Intervalo,
} from '../../../../../lib/analise';

/**
 * O miolo de Mensagens ativas — a coluna de cartões e gráficos do `Lx`
 * (analytics-main.js 56300). Recebe o dado pronto por prop: é o que deixa a
 * mesma marcação desenhar o vazio e o preenchido.
 *
 * A origem desenha os gráficos com chart.js + chartjs-plugin-datalabels. Aqui
 * não entra biblioteca: é CSS e um SVG de linha, com os padrões do chart.js que
 * aparecem na tela (tique 12px, linha de 3px, grade a 10%).
 */
export function MioloDeMensagensAtivas({
  dados,
  intervalo,
}: {
  dados: DadosDeMensagensAtivas;
  intervalo: Intervalo;
}) {
  /* `ne()`: a soma das linhas de `/active-messages/status` (`read` é
     `consumed`, `replied` é `response`). */
  const t = dados.status.reduce(
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
        <Conversoes dados={dados} intervalo={intervalo} />
        <Taxas t={t} />
      </div>
      <div className="ma-fileira ma-fileira-ultima">
        <div className="ma-papel ma-flex1">
          <Picos horas={dados.respostasPorHora} />
        </div>
        <Falhas falhas={dados.falhas} />
      </div>
    </div>
  );
}

type Totais = {
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

/** `Ct`: rótulo e dica de cada contagem. */
const CONTAGENS = {
  enviadas: ['Enviadas', 'Todas as mensagens enviadas à audiência'],
  recebidas: ['Recebidas', 'Todas as mensagens entregues com sucesso'],
  lidas: ['Lidas', 'Todas as mensagens visualizadas pelos contatos'],
  respondidas: ['Respondidas', 'Todas as mensagens respondidas pelos contatos'],
  falhas: ['Falharam', 'Todas as mensagens que falharam no envio e não chegaram aos contatos'],
} as const;

function Numeros({ t }: { t: Totais }) {
  /* `Ft`: ícone, fundo, número cru (a origem não formata aqui) e rótulo. */
  const cartao = (
    chave: 'recebidas' | 'lidas' | 'respondidas' | 'falhas',
    icone: NomeDeIconePortal,
    fundo: string,
  ) => (
    <div className="ma-cartao">
      <span className={`ma-cartao-icone ${fundo}`}>
        <IconePortal nome={icone} tamanho={32} />
      </span>
      <div className="ma-cartao-textos">
        <div className="ma-par">
          <b className="ma-cartao-numero">{t[chave]}</b>
          <Dica texto={CONTAGENS[chave][1]} />
        </div>
        <span className="ma-cartao-titulo">{CONTAGENS[chave][0]}</span>
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
            {cartao('recebidas', 'cheque', 'ma-fundo-recebidas')}
            {cartao('lidas', 'duplo-cheque', 'ma-fundo-lidas')}
          </div>
          <div className="ma-cartoes-linha">
            {cartao('respondidas', 'responder', 'ma-fundo-respondidas')}
            {cartao('falhas', 'erro-contorno', 'ma-fundo-falharam')}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ `fc` */

function Funil({ t }: { t: Totais }) {
  /* `D()`: tudo em porcentagem das enviadas; sem envio, tudo zero. */
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
          {barras.map(([rotulo, valor, fundo]) => (
            <FunilLinha key={rotulo} rotulo={rotulo} largura={(valor / topo) * 100} fundo={fundo}>
              {valor}%
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

function Conversoes({ dados, intervalo }: { dados: DadosDeMensagensAtivas; intervalo: Intervalo }) {
  /* `b()`: um ponto por dia do período, zero onde não houve envio. */
  const porDia = new Map(dados.status.map((s) => [s.dia, s]));
  const dias = diasDoIntervalo(intervalo).map((d) => ({
    dia: d,
    enviadas: porDia.get(d)?.enviadas ?? 0,
    respondidas: porDia.get(d)?.respondidas ?? 0,
    falhas: porDia.get(d)?.falhas ?? 0,
  }));

  /* `bds-paper style={{ flex: 1 }}` › `bds-paper` › `bds-grid gap="2" padding="2"`:
     o papel dentro do papel é deles, e a sombra sai dobrada. O título e a
     descrição pedem `lineHeight="none"`, que não pega (ver `.ma-taxa-titulo`). */
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

/** `f()` + as `options` de um dia só: três barras, sem eixo nem grade. */
function BarrasDoDia({ dia }: { dia?: { enviadas: number; respondidas: number; falhas: number } }) {
  const valores = SERIES.map(([chave]) => dia?.[chave] ?? 0);
  const { topo } = escala(Math.max(...valores));
  return (
    <div className="ma-area">
      <span />
      <div className="ma-barras">
        {SERIES.map(([chave, rotulo, serie], i) => (
          <span
            key={chave}
            className={serie}
            title={rotulo}
            style={{ height: `${((valores[i] ?? 0) / topo) * 100}%` }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * `m()` + as `options` de período: três linhas, cada uma na PRÓPRIA escala
 * (`y`, `y1`, `y2`, as duas últimas escondidas) e só a de enviadas com eixo.
 */
function Linhas({
  dias,
}: {
  dias: { dia: string; enviadas: number; respondidas: number; falhas: number }[];
}) {
  const { topo, tiques } = escala(Math.max(...dias.map((d) => d.enviadas)));
  const x = (i: number) => (dias.length > 1 ? (i / (dias.length - 1)) * 100 : 50);
  /* O chart.js pula rótulo que não cabe (`autoSkip`); aqui, um a cada N. */
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
          {SERIES.map(([chave, , serie]) => {
            const alto = escala(Math.max(...dias.map((d) => d[chave]))).topo;
            return (
              <polyline
                key={chave}
                className={`ma-linha ${serie}`}
                vectorEffect="non-scaling-stroke"
                points={dias.map((d, i) => `${x(i)},${100 - (d[chave] / alto) * 100}`).join(' ')}
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

function Taxas({ t }: { t: Totais }) {
  /* `(l / c * 100).toFixed(2).replace(".", ",")`, e o "0%" inicial sem envio. */
  const taxa = (v: number) =>
    t.enviadas ? `${((v / t.enviadas) * 100).toFixed(2).replace('.', ',')}%` : '0%';
  const cartao = (icone: NomeDeIconePortal, titulo: string, descricao: string, valor: string) => (
    <div className="ma-taxa">
      <IconePortal nome={icone} tamanho={48} />
      <div className="ma-taxa-miolo">
        <div>
          <p className="ma-taxa-titulo">{titulo}</p>
          <p className="ma-taxa-descricao">{descricao}</p>
        </div>
        <b className="ma-t24">{valor}</b>
      </div>
    </div>
  );

  return (
    <div className="ma-flex1 ma-taxas-fora">
      <div className="ma-papel ma-taxas">
        <div className="ma-taxas-caixa">
          {cartao(
            'mensagem-lida',
            'Taxa de Conversão',
            'Total de respostas dos contatos em relação às mensagens enviadas',
            taxa(t.respondidas),
          )}
          {cartao(
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
  /* Zero é desenhado como 0,5 (a barra mínima) e o eixo vai a 50 no mínimo. */
  const valores = Array.from({ length: 24 }, (_, h) => horas[h] || 0.5);
  const { topo } = escala(Math.max(50, ...valores));

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
          {valores.map((v, h) => (
            <span key={h} className="ma-picos-coluna" title={`Respostas: ${v === 0.5 ? 0 : v}`}>
              <span style={{ height: `${(v / topo) * 100}%` }} />
            </span>
          ))}
        </div>
        <div className="ma-picos-eixo">
          {valores.map((_, h) => (
            <span key={h}>{h % 2 === 0 ? `${h}h` : ''}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ `bc` */

function Falhas({ falhas }: { falhas: DadosDeMensagensAtivas['falhas'] }) {
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
                  <td>{f.descricao}</td>
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
