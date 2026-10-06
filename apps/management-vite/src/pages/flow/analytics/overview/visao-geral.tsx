import { IconePortal } from '@pipe/ui/icones-portal';
import type { DiaDaVisaoGeral, VisaoGeral as DadosDaVisaoGeral } from '@pipe/core/analytics';
import { PageHeader, Card, PeriodSelector } from '../pecas';
import { PERIOD_LIMIT_NOTICE, minStartOfPeriod } from './limite';

/**
 * Overview — the `generalDashboard` component from the `analyticsComponents` module (template 7780, controller `ri`), with the `counterChildCard` (14085) and the `analyticsChart` (1920). The context flags that affect this page, all enabled: `analytics-messages- general-info` (the title's help icon), `active-messages-per-domain-table` (the "Mensagens ativas por canal" block), and `analytics-general-dashboard-requests-for-user-quantity-enabled` (the user counters). `general-dashboard-initial-period-one-day` is disabled: the period opens at seven days.
 */
export function VisaoGeral({
  data,
  de,
  ate,
  aoAplicarPeriodo,
}: {
  data: DadosDaVisaoGeral;
  de: string;
  ate: string;
  /** D-30: de/ate em state, nunca mais em `?de=&ate=`. */
  aoAplicarPeriodo?: (de: string, ate: string) => void;
}) {
  const c = data.contagens;

  return (
    <>
      <PageHeader
        tituloProprio={
          <div className="vg-titulo">
            <p className="an-t32 vg-titulo-texto">Visão geral</p>
            &nbsp;
            {/* `showOverviewModal()`. */}
            <a
              className="an-t32 vg-titulo-ajuda"
              href="#ajuda-visao-geral"
              aria-label="O que é a Visão Geral?"
            >
              <IconePortal nome="informacao-cheia" tamanho={24} />
            </a>
          </div>
        }
        extra={
          /* `ng-if="$ctrl.usersPerDay && $ctrl.usersPerDay.length > 0"`. */
          data.byDay.length > 0 ? (
            <>
              <a className="an-bds-btn an-bds-btn--secundario vg-botao" href="">
                <IconePortal nome="atualizar" tamanho={24} />
                Atualizar
              </a>
              <span className="vg-exportar">
                <button type="button" className="an-bds-btn vg-botao" disabled>
                  <IconePortal nome="baixar" tamanho={24} />
                  Exportar
                </button>
                <span className="pt-obra-selo">em breve</span>
              </span>
            </>
          ) : null
        }
      />

      <div className="fx-column vg-panel" id="general-dashboard">
        <div className="vg-filters">
          <div className="vg-filter-period">
            <PeriodSelector de={de} ate={ate} min={minStartOfPeriod(ate)} aoAplicar={aoAplicarPeriodo} />
            <p className="an-t12" style={{ color: 'var(--ink-2)' }}>{PERIOD_LIMIT_NOTICE}</p>
          </div>
        </div>

        <div className="vg-cards">
          <div className="vg-card vg-card--users">
            <div className="vg-card-header">
              <p className="an-t24 vg-card-title">Usuários</p>
              <p className="an-t16 vg-card-description">
                Todo usuário único que recebeu ou enviou mensagem para o chatbot.
              </p>
            </div>
            <div className="vg-contadores">
              <Contador
                nome="Ativos"
                value={c.ativos}
                dica="Contatos que enviaram ou receberam pelo menos uma mensagem do chatbot no período selecionado."
              />
              <Contador
                nome="Engajados"
                value={c.engajados}
                dica="Contatos que enviaram pelo menos uma mensagem para o chatbot no período selecionado."
              />
            </div>
          </div>

          <div className="vg-card vg-card--messages">
            <div className="vg-card-header">
              <p className="an-t24 vg-card-title">Mensagens</p>
              <p className="an-t16 vg-card-description">
                São contabilizadas quando o chatbot envia ou recebe mensagens dos contatos.
              </p>
            </div>
            <div className="vg-contadores">
              <Contador
                nome="Total"
                value={c.total}
                dica="Quantidade total de mensagens enviadas e recebidas pelo chatbot no período selecionado."
              />
              <Contador
                nome="Recebidas"
                value={c.recebidas}
                dica="Mensagens recebidas pelo chatbot no período selecionado."
              />
              <Contador
                nome="Enviadas"
                value={c.enviadas}
                dica="Mensagens enviadas pelo chatbot no período selecionado."
              />
              <Contador
                nome="Ativas"
                value={c.ativas}
                dica="Mensagens enviadas pelo chatbot após 24 horas do recebimento da última mensagem do contato. Estão sujeitas a políticas de utilização e tarifação, específicas de cada canal."
              />
            </div>
          </div>
        </div>
      </div>

      <div className="fx-column">
        <div className="vg-margem">
          {data.activeByChannel.length === 0 ? (
            <Card>
              <p className="an-t24 vg-card-title">Mensagens ativas por canal</p>
              <p className="an-t20 vg-sem-conteudo">
                Não há mensagens ativas no período selecionado
              </p>
            </Card>
          ) : (
            <div className="vg-linha vg-grafico">
              <Card className="vg-chart-card" titulo="Mensagens ativas por canal">
                <div className="vg-grafico-area">
                  <table className="vg-lista">
                    <thead>
                      <tr>
                        <th>Canal</th>
                        <th>Total de mensagens ativas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.activeByChannel.map((l) => (
                        <tr key={l.channel}>
                          <td>{l.channel}</td>
                          <td>{numero(l.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}
        </div>

        <div className="vg-linha vg-grafico vg-grafico--24">
          <Card
            className="vg-chart-card"
            titulo="Usuários por dia (DAUs e DEUs)"
            dica="Total diário de usuários do bot"
          >
            <GraficoDeLinha
              dias={data.byDay}
              series={[
                { nome: 'Ativos', key: 'ativos' },
                { nome: 'Engajados', key: 'engajados' },
              ]}
            />
          </Card>
        </div>

        <div className="vg-linha vg-grafico vg-grafico--24">
          <Card
            className="vg-chart-card"
            titulo="Mensagens por dia"
            dica="Mensagens que o bot recebeu dos usuários (ativos)"
          >
            <GraficoDeLinha
              dias={data.byDay}
              series={[
                { nome: 'Recebidas', key: 'recebidas' },
                { nome: 'Enviadas', key: 'enviadas' },
              ]}
            />
          </Card>
        </div>
      </div>

      <ModalDaVisaoGeral />
    </>
  );
}

/** `formatNumbers()`: `toLocaleString()` with the comma swapped for a period. */
function numero(n: number): string {
  return n.toLocaleString('en-US').replaceAll(',', '.');
}

/** `<counter-child-card>`: bold name with the tooltip, and the value at fs-20. */
function Contador({ nome, value, dica }: { nome: string; value: number; dica: string }) {
  return (
    <div className="vg-contador">
      <div className="vg-contador-nome">
        <p className="an-t16">{nome}</p>
        <span className="vg-contador-dica" title={dica}>
          <IconePortal nome="informacao-cheia" tamanho={16} />
        </span>
      </div>
      <p className="an-t20 vg-counter-value">{numero(value)}</p>
    </div>
  );
}

type SeriesKey = 'ativos' | 'engajados' | 'recebidas' | 'enviadas';

/**
 * The `chart type="line"` from `analyticsChart`, which in the origin is the `LineChart` from Google Charts. No library: axis, grid, two lines, and the legend on the right, which is its default. With no day of data, the `noEnoughData` message.
 */
function GraficoDeLinha({
  dias,
  series,
}: {
  dias: DiaDaVisaoGeral[];
  series: { nome: string; key: SeriesKey }[];
}) {
  const L = 1000;
  const A = 290;
  const esq = 50;
  const dir = 160;
  const topo = 20;
  const base = 40;

  if (dias.length === 0) {
    return (
      <div className="vg-grafico-area vg-chart-empty">
        Não há dados suficientes para exibir este gráfico
      </div>
    );
  }

  const maior = Math.max(1, ...dias.flatMap((d) => series.map((s) => d[s.key])));
  const teto = Math.ceil(maior / 4) * 4;
  const x = (i: number) =>
    esq + (dias.length === 1 ? 0 : (i * (L - esq - dir)) / (dias.length - 1));
  const y = (v: number) => topo + (A - topo - base) * (1 - v / teto);

  return (
    <div className="vg-grafico-area">
      <svg className="vg-linhas" viewBox={`0 0 ${L} ${A}`} role="img">
        {[0, 1, 2, 3, 4].map((g) => (
          <g key={g}>
            <line
              className="vg-grade"
              x1={esq}
              x2={L - dir}
              y1={y((teto * g) / 4)}
              y2={y((teto * g) / 4)}
            />
            <text className="vg-eixo" x={esq - 8} y={y((teto * g) / 4) + 4} textAnchor="end">
              {numero((teto * g) / 4)}
            </text>
          </g>
        ))}
        {dias.map((d, i) => (
          <text key={d.dia} className="vg-eixo" x={x(i)} y={A - 14} textAnchor="middle">
            {`${d.dia.slice(8, 10)}/${d.dia.slice(5, 7)}`}
          </text>
        ))}
        {series.map((s, i) => (
          <g key={s.key} className={`vg-serie vg-serie--${i}`}>
            <polyline points={dias.map((d, j) => `${x(j)},${y(d[s.key])}`).join(' ')} />
            <line
              x1={L - dir + 20}
              x2={L - dir + 44}
              y1={topo + 10 + i * 22}
              y2={topo + 10 + i * 22}
            />
            <text className="vg-legenda" x={L - dir + 52} y={topo + 14 + i * 22}>
              {s.nome}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

/**
 * The `showOverviewModal()` modal (template 6411): the portal's legacy `.modal`, `modal-dialog modal-sm`, the illustration on the left (`Chevalet.svg`, which wasn't included in the capture — the column stays empty), and the text from `metrics.overviewHelp`.
 */
function ModalDaVisaoGeral() {
  return (
    <div className="an-modal" id="ajuda-visao-geral" role="dialog" aria-modal="true">
      <a className="an-modal-fundo" href="#" aria-label="Fechar" />
      <div className="an-modal-legado">
        <div className="an-modal-legado-corpo">
          <div className="vg-ajuda">
            <div className="vg-help-image" />
            <div className="vg-ajuda-texto">
              <h4 className="an-t20 vg-ajuda-titulo">O que é a Visão Geral?</h4>
              <p className="an-t14 vg-ajuda-corpo">
                A visão geral permite a visualização das principais métricas do chatbot com objetivo
                de ajudar a tomar decisões rápidas de negócio. O relatório contabiliza todos os
                contatos e mensagens trafegadas, incluindo interações durante o atendimento humano
                ou envio de mensagens ativas.
              </p>
              <br />
              <p className="an-t14 vg-ajuda-corpo">
                A contabilidade é feita diariamente e os dados podem sofrer alterações em um período
                de até dois dias. <br />
                Um painel exibido no dia 10 de dezembro, por exemplo, pode ainda sofrer alterações,
                pois as mensagens trafegadas nos dias 9 e 10 de dezembro ainda estão sendo
                computadas.
              </p>
              <br />
              <div className="vg-ajuda-link">
                <span className="an-t14 vg-ajuda-saiba">Saiba mais sobre as métricas</span>
                <IconePortal nome="abrir-arquivo" tamanho={16} />
                <span className="pt-obra-selo">em breve</span>
              </div>
            </div>
          </div>
        </div>
        <div className="an-modal-legado-pe">
          <a className="an-bds-btn" href="#">
            Ok, entendi
          </a>
        </div>
      </div>
    </div>
  );
}
