import { useMemo, useState } from 'react';
import type { ResponseOfMetrics } from '@pipe/contracts';
import { useRead } from '../../lib/query';
import { useEu } from '../../context/session';
import { atualizarLeituras } from '../../lib/actions';
import { IconeDesk } from '../../components/icones-desk';
import { Avatar } from '../../components/avatar';
import {
  ATALHOS,
  dataCurta,
  diaCurto,
  intervaloDoAtalho,
  intervaloPersonalizado,
  timeMedio,
  type Atalho,
} from '../../lib/period';

/**
 * `Minhas métricas: {nome}` at `/analytics` follows the reference metrics screen (`~/desk-clone/clone/index.html`, metrics section; `desk2/blip-clone-metrics.png`): header and period bar, six-card ticket overview with donut, daily ticket series, and three average durations. Omit the reference `blip copilot` marketing column. Data comes from `GET /v1/desk/metricas?inicio=&fim=` for the current agent. `Transferidos` and `Perdidos` arrive as `null` because the domain does not store them yet; show a dash, not zero.
 */
export function PageMetrics() {
  const eu = useEu();
  const [atalho, setAtalho] = useState<Atalho>('hoje');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const agora = useMemo(() => new Date(), []);

  const intervalo = useMemo(() => {
    if (atalho === 'personalizado') {
      if (!de || !ate) return null;
      return intervaloPersonalizado(new Date(de + 'T00:00:00'), new Date(ate + 'T00:00:00'));
    }
    return intervaloDoAtalho(atalho, agora);
  }, [atalho, de, ate, agora]);

  const read = useRead<ResponseOfMetrics>(
    intervalo
      ? `/v1/desk/metrics?inicio=${encodeURIComponent(intervalo.inicio.toISOString())}&fim=${encodeURIComponent(intervalo.fim.toISOString())}`
      : null,
  );
  const m = read.data?.metrics ?? null;
  const serie = m?.serie ?? [];
  const maximo = Math.max(1, ...serie.map((d) => Math.max(d.abertos, d.fechados)));

  const cards: { rotulo: string; value: number | null; cor: string }[] = [
    { rotulo: 'Abertos', value: m?.situations.abertos ?? null, cor: 'var(--p-grafico-1)' },
    { rotulo: 'Transferidos', value: m?.situations.transferidos ?? null, cor: 'var(--p-grafico-5)' },
    { rotulo: 'Fechados', value: m?.situations.fechados ?? null, cor: 'var(--p-grafico-2)' },
    { rotulo: 'Abandonados', value: m?.situations.abandonados ?? null, cor: 'var(--p-grafico-3)' },
    { rotulo: 'Finalizados', value: m?.situations.finalizados ?? null, cor: 'var(--p-grafico-4)' },
    { rotulo: 'Perdidos', value: m?.situations.perdidos ?? null, cor: 'var(--p-error-content)' },
  ];
  const total = cards.reduce((s, c) => s + (c.value ?? 0), 0);

  return (
    <div className="dk-metrics">
      <div className="dk-metrics-top">
        <IconeDesk nome="seta-esquerda" />
        <Avatar nome={eu.user.nome} tamanho={56} />
        <div>
          <div className="dk-metrics-title">Minhas métricas: {eu.user.nome}</div>
          <div className="dk-metrics-sub">
            Confira todas as suas métricas de atendimento nesse painel
          </div>
        </div>
        <div className="dk-metrics-space" />
        <button type="button" className="dk-metrics-refresh" onClick={() => atualizarLeituras()}>
          Atualizar <IconeDesk nome="atualizar" tamanho={20} />
        </button>
        <div className="dk-seg" role="radiogroup" aria-label="Período">
          {ATALHOS.map((a) => (
            <button
              key={a.id}
              type="button"
              role="radio"
              aria-checked={atalho === a.id}
              onClick={() => setAtalho(a.id)}
            >
              {a.id === 'personalizado' ? <IconeDesk nome="relogio" tamanho={16} /> : null}
              {a.rotulo}
            </button>
          ))}
        </div>
      </div>
      {atalho === 'personalizado' ? (
        <div className="dk-metrics-dates">
          <label>
            De <input type="date" value={de} onChange={(e) => setDe(e.target.value)} />
          </label>
          <label>
            Até <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
          </label>
          <span>O intervalo é limitado a 90 dias.</span>
        </div>
      ) : null}

      <div className="dk-metrics-body">
        <div className="dk-metrics-main">
          <h3>Visão Geral de Tickets</h3>
          <div className="dk-kpis">
            <Rosca cards={cards} total={total} />
            <div className="dk-kpi-grade">
              {cards.map((c) => (
                <div key={c.rotulo} className="dk-kpi">
                  <b>{c.value === null ? '-' : c.value}</b>
                  <span>
                    <i className="dk-ponto" style={{ background: c.cor }} />
                    {c.rotulo}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="dk-grafico-cabecalho">
            <h3 style={{ margin: 0 }}>Total de tickets de atendimento</h3>
            <span className="dk-ficha-cinza">
              Desde {intervalo ? dataCurta(intervalo.inicio) : '—'}
            </span>
          </div>
          <div className="dk-grafico-max">{maximo}</div>
          <div className="dk-eixo">
            {serie.map((d) => (
              <div
                key={d.dia}
                className="dk-barra-dia"
                title={`${diaCurto(d.dia)}: ${d.fechados} fechados, ${d.abertos} abertos`}
              >
                <div
                  className="dk-barra dk-barra-fechados"
                  style={{ height: `${(d.fechados / maximo) * 100}%` }}
                />
                <div
                  className="dk-barra dk-barra-abertos"
                  style={{ height: `${(d.abertos / maximo) * 100}%` }}
                />
              </div>
            ))}
          </div>
          <div className="dk-eixo-rotulos">
            <span>0</span>
            {serie.length > 0 ? (
              <span>{diaCurto(serie[Math.floor(serie.length / 2)]?.dia ?? '')}</span>
            ) : null}
            <span />
          </div>

          <h3 style={{ margin: '40px 0 0' }}>Médias de métricas de atendimento</h3>
          <div className="dk-medias">
            <div>
              <span>Primeira Resposta</span>
              <b>{timeMedio(m?.tempos.firstResponseSeg ?? null)}</b>
            </div>
            <div>
              <span>Espera na fila</span>
              <b>{timeMedio(m?.tempos.waitInQueueSeg ?? null)}</b>
            </div>
            <div>
              <span>Espera total</span>
              <b>{timeMedio(m?.tempos.esperaTotalSeg ?? null)}</b>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Reference six-segment donut: 118px, 5.5 stroke, in a 42px box. */
function Rosca({
  cards,
  total,
}: {
  cards: { value: number | null; cor: string }[];
  total: number;
}) {
  let offset = 0;
  const raio = 16;
  const circunferencia = 2 * Math.PI * raio;
  return (
    <svg
      width="118"
      height="118"
      viewBox="0 0 42 42"
      aria-hidden="true"
      style={{ flex: '0 0 118px' }}
    >
      <g fill="none" strokeWidth="5.5" strokeLinecap="round">
        {cards.map((c) => {
          const fatia =
            total > 0 ? ((c.value ?? 0) / total) * circunferencia : circunferencia / cards.length;
          const el = (
            <circle
              key={c.cor + offset}
              cx="21"
              cy="21"
              r={raio}
              stroke={c.cor}
              strokeDasharray={`${Math.max(0, fatia - 1)} ${circunferencia}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 21 21)"
            />
          );
          offset += fatia;
          return el;
        })}
      </g>
    </svg>
  );
}
