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
 * As três abas de "Detalhamento das pesquisas" deles — `bds-tab-item label=
 * "Geral|Filas|Atendentes"` em `desk-satisfacao__pagina.html`.
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

/** Rótulo de métrica do cartão interno: 14/600 com o ícone de informação ao lado. */
function Rotulo({ texto, dica }: { texto: string; dica: string }) {
  return (
    <span className="r">
      {texto}
      <Dica rotulo={texto} texto={dica} />
    </span>
  );
}

/**
 * Relatório de satisfação — a tela deles, bloco a bloco, lida em
 * `referencias-blip/desk/desk-satisfacao__pagina.html`:
 *
 * 1. cabeçalho "Relatório de satisfação"; à direita o período em botão
 *    fantasma ("Últimos 30 dias") e "Filtros";
 * 2. bloco "Dados gerais" (`bds-paper bg-surface-1 mt4 pa4`, título 16/700 +
 *    ícone) com quatro cartões brancos (`bg-surface-0 pa4`: rótulo 14/600 +
 *    ícone, valor 20/700): "Média geral de satisfação", "Total de tickets
 *    fechados", "Total de respostas", "Taxa de resposta"; e embaixo dois
 *    cartões brancos de 400px, "Satisfação geral" (pizza) e "Comparativo de
 *    satisfação" (barras, com o seletor Atendentes/Filas);
 * 3. bloco "Análise do período" com um cartão de 400px (série);
 * 4. bloco "Detalhamento das pesquisas" com as abas Geral/Filas/Atendentes.
 *
 * Todo título, rótulo e coluna é o texto deles, literal. A escala de cada
 * pesquisa continua decidindo tudo (§6 da spec de métricas): com mais de uma
 * escala no período a "Média geral" não existe e sai "—", com as médias por
 * escala no balão do ícone. A distribuição por classe — o dado atrás da
 * pizza deles — entra no cartão "Satisfação geral" como tabela; o
 * comparativo por atendente/fila e a série por dia não têm consulta nossa e
 * ficam com o vazio honesto.
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
            className="btn fantasma rel-periodo"
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
      <section className="bloco-rel">
        <h3>
          Dados gerais
          <Dica
            rotulo="Dados gerais"
            texto="Resumo das pesquisas de satisfação respondidas no período"
          />
        </h3>
        <div className="bloco-rel-grade" style={{ '--rel-colunas': 4 } as React.CSSProperties}>
          <div className="cartao-rel">
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
          <div className="cartao-rel">
            <Rotulo
              texto="Total de tickets fechados"
              dica="Conversas encerradas no período — a população que recebeu a pesquisa."
            />
            <span className="v">{numero(report.encerradas)}</span>
          </div>
          <div className="cartao-rel">
            <Rotulo texto="Total de respostas" dica="Pesquisas respondidas com nota no período." />
            <span className="v">{numero(totalRespostas)}</span>
          </div>
          <div className="cartao-rel">
            <Rotulo
              texto="Taxa de resposta"
              dica={`Respostas divididas pelos tickets fechados: ${numero(totalRespostas)} ÷ ${numero(report.encerradas)}.`}
            />
            <span className="v">{percentual(taxa)}</span>
          </div>
        </div>

        <div className="bloco-rel-grade" style={{ '--rel-colunas': 2, marginTop: 20 } as React.CSSProperties}>
          <div className="cartao-rel alto">
            <h4>
              Satisfação geral
              <Dica
                rotulo="Satisfação geral"
                texto="Distribuição das respostas por classe de satisfação"
              />
            </h4>
            {groups.length === 0 || groups.every((g) => g.classes.length === 0) ? (
              <div className="vazio">
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
          <div className="cartao-rel alto">
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
            <div className="vazio">
              <b>Dados insuficientes</b>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ bloco 2 */}
      <section className="bloco-rel">
        <h3>
          Análise do período
          <Dica
            rotulo="Análise do período"
            texto="Evolução da satisfação ao longo do período"
            formula="A série por dia ainda não tem consulta própria."
          />
        </h3>
        <div className="cartao-rel alto">
          <div className="vazio">
            <b>Dados insuficientes</b>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ bloco 3 */}
      <section className="bloco-rel">
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
            <div className="cartao-rel">
              <div className="vazio-linha" style={{ border: 0, minHeight: 0 }}>
                Dados insuficientes
              </div>
            </div>
          ) : (
            <div className="cartao-rel tabela scroll">
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
                      {/* A nota anda com a escala no `title`: um 4 solto não
                          diz se é quase o teto ou um detrator. */}
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
          <div className="cartao-rel tabela scroll">
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
                    <div className="vazio-linha" style={{ border: 0 }}>
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
