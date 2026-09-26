import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Icone } from '@pipe/ui';
import Link from '../../components/link';
import { IconeManagement } from '../../components/icones-management';
import { FieldPeriod, PanelFilters } from '../../components/panel-filters';
import { Selection } from '../../components/selection';
import { Dica } from '../../components/metrica';
import { useRead } from '../../lib/query';
import { type ReportSatisfaction, type GroupSatisfaction } from '../../lib/satisfaction';
import { dataHora, dataOuNada, numero, percentual } from '../../lib/format';
import { periodCurrent, periodRotulo } from '../../lib/periodos';
import { useContact } from '../flow/contact';
import { attendanceBase } from './shell';

interface SatisfactionResposta {
  fuso: string;
  de: string;
  ate: string;
  report: ReportSatisfaction;
}

interface Search {
  de?: string;
  ate?: string;
  aba?: string;
}

const NOME_DO_TIPO: Record<string, string> = { csat: 'CSAT', nps: 'NPS' };

function rotuloDoTipo(tipo: string): string {
  return NOME_DO_TIPO[tipo] ?? tipo.toUpperCase();
}

function escalaDe(grupo: GroupSatisfaction): string {
  return `${rotuloDoTipo(grupo.tipo)}, escala ${numero(grupo.escalaMin)} a ${numero(grupo.escalaMax)}`;
}

/**
 * Their three "Detalhamento das pesquisas" tabs — `bds-tab-item label="Geral|Filas|Atendentes"` in `desk-satisfacao__pagina.html`.
 */
const ABAS = [
  { chave: 'geral', rotulo: 'Geral' },
  { chave: 'filas', rotulo: 'Filas' },
  { chave: 'atendentes', rotulo: 'Atendentes' },
] as const;
type Aba = (typeof ABAS)[number]['chave'];

function abaValida(v: string | undefined): Aba {
  return ABAS.some((a) => a.chave === v) ? (v as Aba) : 'geral';
}

/** Internal card's metric label: 14/600 with the info icon beside it. */
function Rotulo({ texto, dica }: { texto: string; dica: string }) {
  return (
    <span className="r">
      {texto}
      <Dica rotulo={texto} texto={dica} />
    </span>
  );
}

/**
 * Satisfaction report — their screen, block by block, read from `referencias-blip/desk/desk-satisfacao__pagina.html`:
 *
 * 1. "Relatório de satisfação" header; on the right the period as a ghost button ("Últimos 30 dias") and "Filtros";
 * 2. "Dados gerais" block (`bds-paper bg-surface-1 mt4 pa4`, 16/700 title + icon) with four white cards (`bg-surface-0 pa4`: 14/600 label + icon, 20/700 value): "Média geral de satisfação", "Total de tickets fechados", "Total de respostas", "Taxa de resposta"; and below two 400px white cards, "Satisfação geral" (pie) and "Comparativo de satisfação" (bars, with the Atendentes/Filas selector);
 * 3. "Análise do período" block with a 400px card (series);
 * 4. "Detalhamento das pesquisas" block with the Geral/Filas/Atendentes tabs.
 *
 * Every title, label and column is their text, literal. Each survey's scale still decides everything (§6 of the metrics spec): with more than one scale in the period, "Média geral" doesn't exist and shows "—", with per-scale averages in the icon's tooltip. The distribution by class — the data behind their pie chart — goes into the "Satisfação geral" card as a table; the per-attendant/queue comparison and the daily series don't have our query and get the honest empty state.
 */
export function PageSatisfaction() {
  const { contact } = useContact();
  const base = attendanceBase(contact.tipo, contact.id);
  const [search] = useSearchParams();
  const crus = Object.fromEntries(search.entries()) as Search;
  /* Data torta vira "sem filtro", em vez de virar 500 no `::date` do Postgres. */
  const params: Search = { de: dataOuNada(crus.de), ate: dataOuNada(crus.ate) };
  const q = new URLSearchParams();
  if (params.de) q.set('de', params.de);
  if (params.ate) q.set('ate', params.ate);
  const read = useRead<SatisfactionResposta>(`/v1/management/reports/satisfaction?${q}`);
  const [panelAberto, setPanelAberto] = useState(false);
  if (!read.data) return null;
  const { fuso, de, ate, report } = read.data;
  const groups = report.groups;
  const aba = abaValida(crus.aba);
  const hrefAba = (key: Aba) => {
    const p = new URLSearchParams(q);
    p.set('aba', key);
    return `${base}/reports/satisfaction?${p}`;
  };

  const totalRespostas = groups.reduce((t, g) => t + g.respostas, 0);
  const taxa = report.encerradas > 0 ? totalRespostas / report.encerradas : null;
  const unico = groups.length === 1 ? groups[0] : undefined;
  const mediasByEscala = groups.map((g) => `${escalaDe(g)}: ${numero(g.media, 2)}`).join(' · ');

  return (
    <>
      <div className="board-head">
        <h2>Relatório de satisfação</h2>
      </div>

      <div className="quickfilters">
        <div className="faixa-fim">
          <button
            type="button"
            className="btn fantasma rel-period"
            title={`${de} → ${ate}`}
            onClick={() => setPanelAberto(true)}
          >
            {periodRotulo(periodCurrent(de, ate, fuso))}
          </button>
          <button type="button" className="btn" onClick={() => setPanelAberto(true)}>
            <Icone nome="funil" tamanho={20} />
            Filtros
          </button>
        </div>
      </div>

      <PanelFilters
        aberto={panelAberto}
        aoFechar={() => setPanelAberto(false)}
        acao={`${base}/reports/satisfaction`}
        limpar={null}
      >
        {crus.aba ? <input type="hidden" name="aba" value={crus.aba} /> : null}
        <FieldPeriod de={de} ate={ate} fuso={fuso} />
      </PanelFilters>

      {/* ------------------------------------------------------------ bloco 1 */}
      <section className="block-rel">
        <h3>
          Dados gerais
          <Dica
            rotulo="Dados gerais"
            texto="Resumo das pesquisas de satisfação respondidas no período"
          />
        </h3>
        <div className="block-rel-grid" style={{ '--rel-colunas': 4 } as React.CSSProperties}>
          <div className="card-rel">
            <Rotulo
              texto="Média geral de satisfação"
              dica={
                unico
                  ? `Média das notas na ${escalaDe(unico)}.`
                  : groups.length === 0
                    ? 'Nenhuma pesquisa respondida no período.'
                    : `Há mais de uma escala no período, e nota de escalas diferentes não se soma. ${mediasByEscala}.`
              }
            />
            <span className="v">{unico ? numero(unico.media, 2) : '—'}</span>
          </div>
          <div className="card-rel">
            <Rotulo
              texto="Total de tickets fechados"
              dica="Conversas encerradas no período — a população que recebeu a pesquisa."
            />
            <span className="v">{numero(report.encerradas)}</span>
          </div>
          <div className="card-rel">
            <Rotulo texto="Total de respostas" dica="Pesquisas respondidas com nota no período." />
            <span className="v">{numero(totalRespostas)}</span>
          </div>
          <div className="card-rel">
            <Rotulo
              texto="Taxa de resposta"
              dica={`Respostas divididas pelos tickets fechados: ${numero(totalRespostas)} ÷ ${numero(report.encerradas)}.`}
            />
            <span className="v">{percentual(taxa)}</span>
          </div>
        </div>

        <div className="block-rel-grid" style={{ '--rel-colunas': 2, marginTop: 20 } as React.CSSProperties}>
          <div className="card-rel alto">
            <h4>
              Satisfação geral
              <Dica
                rotulo="Satisfação geral"
                texto="Distribuição das respostas por classe de satisfação"
              />
            </h4>
            {groups.length === 0 || groups.every((g) => g.classes.length === 0) ? (
              <div className="empty">
                <b>Dados insuficientes</b>
              </div>
            ) : (
              groups.map((g) => (
                <div key={`${g.tipo}-${g.escalaMin}-${g.escalaMax}`} className="scroll" style={{ marginTop: 20 }}>
                  <table>
                    <thead>
                      <tr>
                        <th>{escalaDe(g)}</th>
                        <th>Respostas</th>
                        <th>Participação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.classes.map((c) => (
                        <tr key={c.nome}>
                          <td className="who">{c.nome}</td>
                          <td className="num">{numero(c.quantity)}</td>
                          <td className="num">{percentual(c.fraction)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))
            )}
          </div>
          <div className="card-rel alto">
            <h4>
              Comparativo de satisfação
              <Dica
                rotulo="Comparativo de satisfação"
                texto="Satisfação por atendente ou por fila"
                formula="A consulta de satisfação ainda não cruza a resposta com o atendente ou a fila do ticket."
              />
              <span className="faixa-fim">
                <Selection aria-label="Comparar por" defaultValue="Atendentes" disabled>
                  <option>Atendentes</option>
                  <option>Filas</option>
                </Selection>
              </span>
            </h4>
            <div className="empty">
              <b>Dados insuficientes</b>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ bloco 2 */}
      <section className="block-rel">
        <h3>
          Análise do período
          <Dica
            rotulo="Análise do período"
            texto="Evolução da satisfação ao longo do período"
            formula="A série por dia ainda não tem consulta própria."
          />
        </h3>
        <div className="card-rel alto">
          <div className="empty">
            <b>Dados insuficientes</b>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ bloco 3 */}
      <section className="block-rel">
        <h3>
          Detalhamento das pesquisas
          <Dica
            rotulo="Detalhamento das pesquisas"
            texto="Cada pesquisa respondida, e o resumo por fila e por atendente"
          />
        </h3>
        <div className="rel-aba-cabecalho">
          <div className="tabs" role="tablist">
            {ABAS.map((a) => (
              <Link key={a.chave} href={hrefAba(a.chave)} aria-current={aba === a.chave ? 'true' : undefined}>
                {a.rotulo}
              </Link>
            ))}
          </div>
          <button type="button" className="iconbtn" title="Baixar tabela" aria-label="Baixar tabela" disabled>
            <IconeManagement nome="baixar" tamanho={24} />
          </button>
        </div>

        {aba === 'geral' ? (
          report.comentarios.length === 0 ? (
            <div className="card-rel">
              <div className="empty-line" style={{ border: 0, minHeight: 0 }}>
                Dados insuficientes
              </div>
            </div>
          ) : (
            <div className="card-rel tabela scroll">
              <table>
                <thead>
                  <tr>
                    <th>Ticket</th>
                    <th>Data</th>
                    <th>Fila</th>
                    <th>Atendente</th>
                    <th>Cliente</th>
                    <th>Nota</th>
                    <th>Avaliação</th>
                    <th>Comentário</th>
                  </tr>
                </thead>
                <tbody>
                  {report.comentarios.map((c) => (
                    <tr key={c.id}>
                      <td className="num">—</td>
                      <td className="num">{dataHora(c.em, fuso)}</td>
                      <td>—</td>
                      <td>—</td>
                      <td>—</td>
                      {/*
 * The score travels with its scale in the `title`: a bare 4 doesn't say whether it's near the ceiling or a detractor.
 */}
                      <td className="num" title={`${rotuloDoTipo(c.tipo)}, escala ${numero(c.escalaMin)} a ${numero(c.escalaMax)}`}>
                        {numero(c.nota)}
                      </td>
                      <td>{c.classe ?? '—'}</td>
                      <td className="comentario">{c.texto}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}

        {aba !== 'geral' ? (
          <div className="card-rel tabela scroll">
            <table>
              <thead>
                <tr>
                  <th>{aba === 'filas' ? 'Filas' : 'Atendente'}</th>
                  <th>Média geral</th>
                  <th>Total de tickets</th>
                  <th>Total de respostas</th>
                  <th>Não respondidas</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={5}>
                    <div className="empty-line" style={{ border: 0 }}>
                      Dados insuficientes
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </>
  );
}
