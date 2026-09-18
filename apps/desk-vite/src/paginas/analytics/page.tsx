import { useMemo, useState } from 'react';
import type { RespostaDasMetricas } from '@pipe/contracts';
import { useLeitura } from '../../lib/consulta';
import { useEu } from '../../contexto/sessao';
import { atualizarLeituras } from '../../lib/acoes';
import { IconeDesk } from '../../componentes/icones-desk';
import { Avatar } from '../../componentes/avatar';
import {
  ATALHOS,
  dataCurta,
  diaCurto,
  intervaloDoAtalho,
  intervaloPersonalizado,
  tempoMedio,
  type Atalho,
} from '../../lib/periodo';

/**
 * "Minhas métricas: {nome}" — `/analytics`. A estrutura é a da tela do clone
 * (`~/desk-clone/clone/index.html`, seção `metrics`, foto
 * `desk2/blip-clone-metrics.png`): cabeçalho com seta, avatar extra-large,
 * título 19/700 + subtítulo 12, "Atualizar" e a barra de períodos; o corpo
 * com "Visão Geral de Tickets" (rosca + seis cartões), "Total de tickets de
 * atendimento" (série diária com a ficha "Desde dd/mm/aaaa") e "Médias de
 * métricas de atendimento" (três tempos).
 *
 * A coluna "blip copilot" da referência é marketing do produto deles e fica
 * de fora — nenhuma menção visível a eles.
 *
 * Os dados vêm de `GET /v1/desk/metricas?inicio=&fim=`, sempre do próprio
 * atendente. "Transferidos" e "Perdidos" chegam `null` (o domínio ainda não
 * guarda) e aparecem como traço, não como zero.
 */
export function PaginaMetricas() {
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

  const leitura = useLeitura<RespostaDasMetricas>(
    intervalo
      ? `/v1/desk/metricas?inicio=${encodeURIComponent(intervalo.inicio.toISOString())}&fim=${encodeURIComponent(intervalo.fim.toISOString())}`
      : null,
  );
  const m = leitura.data?.metricas ?? null;
  const serie = m?.serie ?? [];
  const maximo = Math.max(1, ...serie.map((d) => Math.max(d.abertos, d.fechados)));

  const cartoes: { rotulo: string; valor: number | null; cor: string }[] = [
    { rotulo: 'Abertos', valor: m?.situacoes.abertos ?? null, cor: 'var(--p-grafico-1)' },
    { rotulo: 'Transferidos', valor: m?.situacoes.transferidos ?? null, cor: 'var(--p-grafico-5)' },
    { rotulo: 'Fechados', valor: m?.situacoes.fechados ?? null, cor: 'var(--p-grafico-2)' },
    { rotulo: 'Abandonados', valor: m?.situacoes.abandonados ?? null, cor: 'var(--p-grafico-3)' },
    { rotulo: 'Finalizados', valor: m?.situacoes.finalizados ?? null, cor: 'var(--p-grafico-4)' },
    { rotulo: 'Perdidos', valor: m?.situacoes.perdidos ?? null, cor: 'var(--p-erro-conteudo)' },
  ];
  const total = cartoes.reduce((s, c) => s + (c.valor ?? 0), 0);

  return (
    <div className="dk-metricas">
      <div className="dk-metricas-topo">
        <IconeDesk nome="seta-esquerda" />
        <Avatar nome={eu.usuario.nome} tamanho={56} />
        <div>
          <div className="dk-metricas-titulo">Minhas métricas: {eu.usuario.nome}</div>
          <div className="dk-metricas-sub">
            Confira todas as suas métricas de atendimento nesse painel
          </div>
        </div>
        <div className="dk-metricas-espaco" />
        <button type="button" className="dk-metricas-atualizar" onClick={() => atualizarLeituras()}>
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
        <div className="dk-metricas-datas">
          <label>
            De <input type="date" value={de} onChange={(e) => setDe(e.target.value)} />
          </label>
          <label>
            Até <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
          </label>
          <span>O intervalo é limitado a 90 dias.</span>
        </div>
      ) : null}

      <div className="dk-metricas-corpo">
        <div className="dk-metricas-principal">
          <h3>Visão Geral de Tickets</h3>
          <div className="dk-kpis">
            <Rosca cartoes={cartoes} total={total} />
            <div className="dk-kpi-grade">
              {cartoes.map((c) => (
                <div key={c.rotulo} className="dk-kpi">
                  <b>{c.valor === null ? '-' : c.valor}</b>
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
              <b>{tempoMedio(m?.tempos.primeiraRespostaSeg ?? null)}</b>
            </div>
            <div>
              <span>Espera na fila</span>
              <b>{tempoMedio(m?.tempos.esperaNaFilaSeg ?? null)}</b>
            </div>
            <div>
              <span>Espera total</span>
              <b>{tempoMedio(m?.tempos.esperaTotalSeg ?? null)}</b>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** A rosca de seis fatias da referência: 118px, traço 5.5 numa caixa de 42. */
function Rosca({
  cartoes,
  total,
}: {
  cartoes: { valor: number | null; cor: string }[];
  total: number;
}) {
  let deslocamento = 0;
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
        {cartoes.map((c) => {
          const fatia =
            total > 0 ? ((c.valor ?? 0) / total) * circunferencia : circunferencia / cartoes.length;
          const el = (
            <circle
              key={c.cor + deslocamento}
              cx="21"
              cy="21"
              r={raio}
              stroke={c.cor}
              strokeDasharray={`${Math.max(0, fatia - 1)} ${circunferencia}`}
              strokeDashoffset={-deslocamento}
              transform="rotate(-90 21 21)"
            />
          );
          deslocamento += fatia;
          return el;
        })}
      </g>
    </svg>
  );
}
