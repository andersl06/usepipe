import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Icone } from '@pipe/ui';
import Link from '../../componentes/link';
import { IconeGestao } from '../../componentes/icones-gestao';
import { CampoPeriodo, PainelFiltros } from '../../componentes/painel-filtros';
import { Dica } from '../../componentes/metrica';
import { useLeitura } from '../../lib/consulta';
import { type RelatorioSatisfacao, type GrupoSatisfacao } from '../../lib/satisfacao';
import { dataHora, dataOuNada, numero, percentual } from '../../lib/formato';
import { periodoAtual, rotuloDoPeriodo } from '../../lib/periodos';
import { useContato } from '../fluxo/contato';
import { baseDoAtendimento } from './casca';

interface RespostaDaSatisfacao {
  fuso: string;
  de: string;
  ate: string;
  relatorio: RelatorioSatisfacao;
}

interface Busca {
  de?: string;
  ate?: string;
  aba?: string;
}

const NOME_DO_TIPO: Record<string, string> = { csat: 'CSAT', nps: 'NPS' };

function rotuloDoTipo(tipo: string): string {
  return NOME_DO_TIPO[tipo] ?? tipo.toUpperCase();
}

function escalaDe(grupo: GrupoSatisfacao): string {
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
 * `docs/capturas/blip/desk/desk-satisfacao__pagina.html`:
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
export function PaginaSatisfacao() {
  const { contato } = useContato();
  const base = baseDoAtendimento(contato.tipo, contato.id);
  const [busca] = useSearchParams();
  const crus = Object.fromEntries(busca.entries()) as Busca;
  /* Data torta vira "sem filtro", em vez de virar 500 no `::date` do Postgres. */
  const params: Busca = { de: dataOuNada(crus.de), ate: dataOuNada(crus.ate) };
  const q = new URLSearchParams();
  if (params.de) q.set('de', params.de);
  if (params.ate) q.set('ate', params.ate);
  const leitura = useLeitura<RespostaDaSatisfacao>(`/v1/gestao/relatorios/satisfacao?${q}`);
  const [painelAberto, setPainelAberto] = useState(false);
  if (!leitura.data) return null;
  const { fuso, de, ate, relatorio } = leitura.data;
  const grupos = relatorio.grupos;
  const aba = abaValida(crus.aba);
  const hrefAba = (chave: Aba) => {
    const p = new URLSearchParams(q);
    p.set('aba', chave);
    return `${base}/relatorios/satisfacao?${p}`;
  };

  const totalRespostas = grupos.reduce((t, g) => t + g.respostas, 0);
  const taxa = relatorio.encerradas > 0 ? totalRespostas / relatorio.encerradas : null;
  const unico = grupos.length === 1 ? grupos[0] : undefined;
  const mediasPorEscala = grupos.map((g) => `${escalaDe(g)}: ${numero(g.media, 2)}`).join(' · ');

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
            onClick={() => setPainelAberto(true)}
          >
            {rotuloDoPeriodo(periodoAtual(de, ate, fuso))}
          </button>
          <button type="button" className="btn" onClick={() => setPainelAberto(true)}>
            <Icone nome="funil" tamanho={20} />
            Filtros
          </button>
        </div>
      </div>

      <PainelFiltros
        aberto={painelAberto}
        aoFechar={() => setPainelAberto(false)}
        acao={`${base}/relatorios/satisfacao`}
        limpar={null}
      >
        {crus.aba ? <input type="hidden" name="aba" value={crus.aba} /> : null}
        <CampoPeriodo de={de} ate={ate} fuso={fuso} />
      </PainelFiltros>

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
                  : grupos.length === 0
                    ? 'Nenhuma pesquisa respondida no período.'
                    : `Há mais de uma escala no período, e nota de escalas diferentes não se soma. ${mediasPorEscala}.`
              }
            />
            <span className="v">{unico ? numero(unico.media, 2) : '—'}</span>
          </div>
          <div className="cartao-rel">
            <Rotulo
              texto="Total de tickets fechados"
              dica="Conversas encerradas no período — a população que recebeu a pesquisa."
            />
            <span className="v">{numero(relatorio.encerradas)}</span>
          </div>
          <div className="cartao-rel">
            <Rotulo texto="Total de respostas" dica="Pesquisas respondidas com nota no período." />
            <span className="v">{numero(totalRespostas)}</span>
          </div>
          <div className="cartao-rel">
            <Rotulo
              texto="Taxa de resposta"
              dica={`Respostas divididas pelos tickets fechados: ${numero(totalRespostas)} ÷ ${numero(relatorio.encerradas)}.`}
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
            {grupos.length === 0 || grupos.every((g) => g.classes.length === 0) ? (
              <div className="vazio">
                <b>Dados insuficientes</b>
              </div>
            ) : (
              grupos.map((g) => (
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
                          <td className="num">{numero(c.quantidade)}</td>
                          <td className="num">{percentual(c.fracao)}</td>
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
                <select aria-label="Comparar por" defaultValue="Atendentes" disabled>
                  <option>Atendentes</option>
                  <option>Filas</option>
                </select>
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
            <IconeGestao nome="baixar" tamanho={24} />
          </button>
        </div>

        {aba === 'geral' ? (
          relatorio.comentarios.length === 0 ? (
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
                  {relatorio.comentarios.map((c) => (
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
