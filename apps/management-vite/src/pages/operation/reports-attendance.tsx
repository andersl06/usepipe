import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Icone } from '@pipe/ui';
import Link from '../../components/link';
import { ManagementIcon } from '../../components/icones-management';
import { PanelField, FieldPeriod, PanelFilters } from '../../components/panel-filters';
import { Selection } from '../../components/selection';
import { Dica, Metrica } from '../../components/metrica';
import { useRead } from '../../lib/query';
import type { Catalogos } from '../../lib/history';
import { type ReportAttendance, type LinhaDeQuebra } from '../../lib/attendance';
import { dataOuNada, denominador, duration, numero, uuidOuNada } from '../../lib/format';
import { periodCurrent, periodLabel } from '../../lib/periodos';
import { contactBase, useContact } from '../flow/contact';
import { attendanceBase } from './shell';

interface ResponseOfReportOfAttendance {
  fuso: string;
  de: string;
  ate: string;
  catalogos: Catalogos;
  report: ReportAttendance;
}

interface Search {
  de?: string;
  ate?: string;
  queue?: string;
  agent?: string;
  /** Breakdown tab for Atendentes/Filas/Tags — client-side only, never sent to the API. */
  aba?: string;
}

/**
 * Their three tabs over the same table — `bds-tab-item label="Atendentes|Filas|Tags"` in `desk-relatorio-atendimento__pagina.html`. The tab lives in the querystring, like every filter on this screen.
 */
const TABS_BREAKDOWN = [
  { chave: 'atendentes', rotulo: 'Atendentes', eixo: 'Atendente' },
  { chave: 'filas', rotulo: 'Filas', eixo: 'Fila' },
  { chave: 'tags', rotulo: 'Tags', eixo: 'Tag' },
] as const;
type TabBreakdown = (typeof TABS_BREAKDOWN)[number]['chave'];

function abaValida(v: string | undefined): TabBreakdown {
  return TABS_BREAKDOWN.some((a) => a.chave === v) ? (v as TabBreakdown) : 'atendentes';
}

/**
 * Their table columns, in order and exact text (`bds-table-th` from `desk-relatorio-atendimento__pagina.html`): the axis, "Tickets finalizados", "Tempo médio da 1ª resposta", "Tempo médio de espera", "Tempo médio de resposta", "Tempo médio de atendimento", "Atingimento SLA".
 *
 * "Atingimento SLA" doesn't have our query yet — it gets an em dash instead of disappearing. The averages carry the discarded count in the cell's `title` (the metrics ruler requires the denominator; their screen doesn't show it, so it goes where it doesn't change the shape).
 */
const COLUNAS = [
  'Tickets finalizados',
  'Tempo médio da 1ª resposta',
  'Tempo médio de espera',
  'Tempo médio de resposta',
  'Tempo médio de atendimento',
  'Atingimento SLA',
] as const;

function linhaEmCelulas(l: LinhaDeQuebra): string[] {
  return [
    l.key,
    numero(l.closures.finalizada),
    duration(l.firstResponse.value),
    duration(l.inQueue.value),
    duration(l.resposta.value),
    duration(l.attendance.value),
    '—',
  ];
}

/** Each tab's `bds-button-icon icon="download"`: downloads the visible table as CSV. */
function baixarCsv(nome: string, eixo: string, linhas: LinhaDeQuebra[]) {
  const escapar = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const corpo = [[eixo, ...COLUNAS], ...linhas.map(linhaEmCelulas)]
    .map((l) => l.map(escapar).join(';'))
    .join('\n');
  // BOM by character code, not literal in the source: Excel only recognizes UTF-8
  // in a CSV with the BOM up front, and a directly pasted character is "irregular whitespace"
  // para o eslint (`no-irregular-whitespace`).
  const bom = String.fromCharCode(0xfeff);
  const url = URL.createObjectURL(new Blob([bom + corpo], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${nome}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function BotaoBaixar({ aoClicar, desabilitado }: { aoClicar: () => void; desabilitado: boolean }) {
  return (
    <button
      type="button"
      className="iconbtn"
      title="Baixar tabela"
      aria-label="Baixar tabela"
      disabled={desabilitado}
      onClick={aoClicar}
    >
      <ManagementIcon nome="baixar" tamanho={24} />
    </button>
  );
}

function TabelaDeQuebra({ eixo, linhas }: { eixo: string; linhas: LinhaDeQuebra[] }) {
  if (linhas.length === 0) return <div className="empty-line">Dados insuficientes</div>;
  return (
    <div className="scroll">
      <table>
        <thead>
          <tr>
            <th>{eixo}</th>
            {COLUNAS.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.key}>
              <td className="who">{l.key}</td>
              <td className="num">{numero(l.closures.finalizada)}</td>
              <td className="num" title={denominador(l.firstResponse, 'sem 1ª resposta')}>
                {duration(l.firstResponse.value)}
              </td>
              <td className="num" title={denominador(l.inQueue, 'sem atribuição')}>
                {duration(l.inQueue.value)}
              </td>
              <td className="num" title={denominador(l.resposta, 'sem troca completa')}>
                {duration(l.resposta.value)}
              </td>
              <td className="num" title={denominador(l.attendance, 'nunca respondidas')}>
                {duration(l.attendance.value)}
              </td>
              <td className="num">—</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Attendance report — their screen, block by block, read from `referencias-blip/desk/desk-relatorio-atendimento__pagina.html`:
 *
 * 1. "Relatório de atendimento" header with "Gerenciador de Relatórios" on the right (`bds-button variant="secondary" arrow`);
 * 2. "Filtros rápidos:" strip with "Atendentes" and "Filas", and on the right the period as a ghost button ("Últimos 7 dias") and "Filtros";
 * 3. "Indicadores de SLA" card (20/700 title + info icon);
 * 4. row with "Tempo máximo" (2 metrics) and "Status dos tickets" (5);
 * 5. "Tempo médio" card (5 metrics);
 * 6. "Tickets Abertos x Fechados" card (chart);
 * 7. card with the Atendentes/Filas/Tags tabs over the same table, each with a download button, and the note about the filters;
 * 8. "Disponibilidade de atendentes" card.
 *
 * The metric cards are the SAME ones from Monitoramento (`bds-paper pa4` with a 14/600 title and 24/400 columns over 12/400) — not the card-within-a-block from Satisfação. Every label, title and tooltip is their text, literal.
 *
 * Wherever our query doesn't have the data — period peak, aggregated SLA, "Abertos", the chart and availability — the spot gets the honest empty state ("—" or "Dados insuficientes"), never a made-up number. The metrics-spec formula and the discarded count still live in the info icon's tooltip and in the cell's `title`.
 */
export function PageAttendance() {
  const { contact } = useContact();
  const base = attendanceBase(contact.tipo, contact.id);
  const manager = `${contactBase(contact.tipo, contact.id)}/analytics/report-manager`;
  const [search] = useSearchParams();
  const crus = Object.fromEntries(search.entries()) as Search;
  /*
   * Checked on the way in: a malformed id or malformed date becomes "no filter". Without this, a pasted link with `?fila=abc` would take down the whole report with a 500.
   */
  const params: Search = {
    queue: uuidOuNada(crus.queue),
    agent: uuidOuNada(crus.agent),
    de: dataOuNada(crus.de),
    ate: dataOuNada(crus.ate),
  };
  const q = new URLSearchParams();
  for (const key of ['queue', 'agent', 'de', 'ate'] as const) {
    if (params[key]) q.set(key === "de" ? "from" : key === "ate" ? "to" : key, params[key] as string);
  }
  const read = useRead<ResponseOfReportOfAttendance>(
    `/v1/management/reports/attendance?${q}`,
  );
  const [panelOpen, setPanelOpen] = useState(false);
  if (!read.data) return null;
  const { fuso, de, ate, catalogos, report } = read.data;
  const geral = report.geral;
  const enc = geral.closures;

  const queueName = catalogos.queues.find((f) => f.id === params.queue)?.name;
  const agentName = catalogos.agents.find((a) => a.id === params.agent)?.name;
  const hasFilter = Boolean(params.queue || params.agent);

  const aba = abaValida(crus.aba);
  const hrefAba = (key: TabBreakdown) => {
    const p = new URLSearchParams(q);
    p.set('aba', key);
    return `${base}/reports/attendance?${p}`;
  };
  const linhasDaAba: Record<TabBreakdown, LinhaDeQuebra[]> = {
    atendentes: report.byAgent,
    filas: report.byQueue,
    tags: report.byTag,
  };
  const abaAtual = TABS_BREAKDOWN.find((a) => a.chave === aba) ?? TABS_BREAKDOWN[0];

  return (
    <>
      <div className="board-head">
        <h2>Relatório de atendimento</h2>
        <div className="filters">
          <Link href={manager} className="btn">
            Gerenciador de Relatórios
            <ManagementIcon nome="baixo" tamanho={20} style={{ transform: 'rotate(-90deg)' }} />
          </Link>
        </div>
      </div>

      <div className="quickfilters">
        <span className="lbl">Filtros rápidos:</span>
        <button
          type="button"
          className={params.agent ? 'pilula active' : 'pilula'}
          onClick={() => setPanelOpen(true)}
        >
          <span className="pilula-rotulo">Atendentes</span>
          {agentName ? <span className="pill-value">{agentName}</span> : null}
        </button>
        <button
          type="button"
          className={params.queue ? 'pilula active' : 'pilula'}
          onClick={() => setPanelOpen(true)}
        >
          <span className="pilula-rotulo">Filas</span>
          {queueName ? <span className="pill-value">{queueName}</span> : null}
        </button>
        <div className="faixa-fim">
          <button
            type="button"
            className="btn fantasma rel-period"
            title={`${de} → ${ate}`}
            onClick={() => setPanelOpen(true)}
          >
            {periodLabel(periodCurrent(de, ate, fuso))}
          </button>
          <button type="button" className="btn" onClick={() => setPanelOpen(true)}>
            <Icone nome="funil" tamanho={20} />
            Filtros
          </button>
        </div>
      </div>

      <PanelFilters
        aberto={panelOpen}
        aoFechar={() => setPanelOpen(false)}
        acao={`${base}/reports/attendance`}
        limpar={hasFilter ? `${base}/reports/attendance?de=${de}&to=${ate}` : null}
      >
        {crus.aba ? <input type="hidden" name="aba" value={crus.aba} /> : null}
        <FieldPeriod de={de} ate={ate} fuso={fuso} />
        <PanelField rotulo="Atendentes" apoio="Selecione um ou mais atendentes">
          <Selection name="atendente" defaultValue={params.agent ?? ''} aria-label="Atendentes">
            <option value="">Selecione os atendentes</option>
            {catalogos.agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Selection>
        </PanelField>
        <PanelField rotulo="Filas" apoio="Selecione uma ou mais filas">
          <Selection name="fila" defaultValue={params.queue ?? ''} aria-label="Filas">
            <option value="">Selecione as filas</option>
            {catalogos.queues.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </Selection>
        </PanelField>
      </PanelFilters>

      {/*
 * ------------------------------------------------------------ block 1
 * "Indicadores de SLA": their area chart. Aggregated SLA per period doesn't have its own query here yet — the empty state is their literal empty-state text.
 */}
      <section className="card">
        <h3 className="grande">
          Indicadores de SLA
          <Dica
            rotulo="Indicadores de SLA"
            texto="Atingimento das metas de SLA das filas no período."
            formula="O estado de SLA de cada conversa já existe em Monitoramento; o indicador agregado por período ainda não tem consulta própria."
          />
        </h3>
        <div className="empty">
          <b>Não foram encontradas métricas de SLA no período informado</b>
        </div>
      </section>

      {/*
 * ------------------------------------------------------------ block 2
 * "Tempo máximo" and "Status dos tickets", side by side. Today we only compute the AVERAGE; the period's PEAK is a missing query, and so is "Abertos" (tickets opened in the period).
 */}
      <div className="rel-linha">
        <section className="card estreito">
          <div className="card-cabecalho">
            <h3>Tempo máximo</h3>
          </div>
          <div className="metrics">
            <Metrica
              value="—"
              rotulo="Tempo máximo de espera na fila"
              dica="Maior tempo que um ticket ficou aguardando na fila"
              formula="Ainda calculamos só a média do período, não o pico."
            />
            <Metrica
              value="—"
              rotulo="Tempo máximo até 1ª resposta"
              dica="Maior tempo que um ticket ficou sem a primeira resposta"
              formula="Ainda calculamos só a média do período, não o pico."
            />
          </div>
        </section>

        <section className="card">
          <div className="card-cabecalho">
            <h3>Status dos tickets</h3>
          </div>
          <div className="metrics">
            <Metrica
              value="—"
              rotulo="Abertos"
              dica="Tickets abertos no período"
              formula="Conversa aberta não entra nesta consulta — o retrato ao vivo é o de Monitoramento."
            />
            <Metrica
              tom="erro"
              value={numero(enc.perdida)}
              rotulo="Perdidos"
              dica="Tickets perdidos (fechados pelo cliente antes de serem atribuídos a atendente)"
              formula="Perdido saiu ANTES da atribuição, e é capacidade ou fila."
            />
            <Metrica
              tom="erro"
              value={numero(enc.abandonada)}
              rotulo="Abandonados"
              dica="Tickets retirados (cancelados pelo cliente após atribuição)"
              formula="Abandonado saiu DEPOIS da atribuição, e é atendimento."
            />
            <Metrica
              value={numero(enc.finalizada)}
              rotulo="Finalizados"
              dica="Tickets finalizados ou transferidos por gestor/atendente"
            />
            <Metrica
              value={numero(enc.fechada)}
              rotulo="Fechados"
              dica="Total de tickets fechados (soma de perdido + retirado + finalizado)"
              denominador={`${numero(geral.conversations)} conversas no recorte.`}
            />
          </div>
        </section>
      </div>

      {/*
 * ------------------------------------------------------------ block 3
 * "Tempo médio" — the five metrics, with their card's exact text in each label.
 */}
      <section className="card">
        <div className="card-cabecalho">
          <h3>Tempo médio</h3>
        </div>
        <div className="metrics">
          <Metrica
            value={duration(geral.inQueue.value)}
            rotulo="Tempo médio de espera na fila"
            dica="Tempo médio que os tickets ficaram aguardando na fila"
            denominador={denominador(geral.inQueue, 'sem atribuição')}
          />
          <Metrica
            value={duration(geral.firstResponse.value)}
            rotulo="Tempo médio até 1ª resposta"
            dica="Tempo médio até a primeira resposta do atendente"
            formula="primeira_resposta_em menos atribuida_em. População: conversas que tiveram resposta do atendente."
            denominador={denominador(geral.firstResponse, 'sem 1ª resposta')}
          />
          <Metrica
            value={duration(geral.esperaTotal.value)}
            rotulo="Tempo médio de espera total"
            dica="Tempo médio de espera do cliente, da abertura à primeira resposta"
            denominador={denominador(geral.esperaTotal, 'sem início ou fim')}
          />
          <Metrica
            value={duration(geral.resposta.value)}
            rotulo="Tempo médio de resposta"
            dica="Tempo médio entre a mensagem do cliente e a resposta do atendente"
            formula={`Média de INTERVALOS: ${numero(geral.resposta.population)} trocas em ${numero(geral.resposta.conversationsConsidered)} conversas.`}
            denominador={denominador(geral.resposta, 'sem troca completa')}
          />
          <Metrica
            value={duration(geral.attendance.value)}
            rotulo="Tempo médio de atendimento"
            dica="Tempo médio de duração dos atendimentos"
            formula="Encerramento menos 1ª resposta — a mesma fórmula da Blip, para ser comparável; descarta a conversa que nunca foi respondida."
            denominador={denominador(geral.attendance, 'nunca respondidas')}
          />
        </div>
      </section>

      {/*
 * ------------------------------------------------------------ block 4
 * "Tickets Abertos x Fechados": their daily series. No per-day query here — the slot stays, empty.
 */}
      <section className="card">
        <div className="card-cabecalho">
          <h3>
            Tickets Abertos x Fechados
            <Dica
              rotulo="Tickets Abertos x Fechados"
              texto="Tickets abertos e fechados por dia no período"
              formula="A série por dia ainda não tem consulta própria."
            />
          </h3>
        </div>
        <div className="empty">
          <b>Dados insuficientes</b>
        </div>
      </section>

      {/*
 * ------------------------------------------------------------ block 5
 * Their three tabs over the SAME table, each with a download button flush to the right (`bds-button-icon icon="download" class="ml-a"`).
 */}
      <section className="tblwrap">
        <div className="rel-aba-cabecalho">
          <div className="tabs" role="tablist">
            {TABS_BREAKDOWN.map((a) => (
              <Link
                key={a.chave}
                href={hrefAba(a.chave)}
                aria-current={aba === a.chave ? 'true' : undefined}
              >
                {a.rotulo}
              </Link>
            ))}
          </div>
          <BotaoBaixar
            desabilitado={linhasDaAba[aba].length === 0}
            aoClicar={() => baixarCsv(abaAtual.chave, abaAtual.eixo, linhasDaAba[aba])}
          />
        </div>
        <TabelaDeQuebra eixo={abaAtual.eixo} linhas={linhasDaAba[aba]} />
        <p className="rel-nota">
          <ManagementIcon nome="informacao" tamanho={16} />
          Os filtros de Canais, Atendentes, Filas e Tags não se aplicam à tabela abaixo.
        </p>
      </section>

      {/*
 * ------------------------------------------------------------ block 6
 * "Disponibilidade de atendentes" (Atendente, Online, Em pausa, Invisível, Tempo total). It's time-in-status per period — a query that doesn't exist here yet; the table stays empty.
 */}
      <section className="tblwrap">
        <div className="rel-aba-cabecalho">
          <div className="card-cabecalho" style={{ marginBottom: 0, flex: 1 }}>
            <h3>Disponibilidade de atendentes</h3>
          </div>
          <BotaoBaixar desabilitado aoClicar={() => undefined} />
        </div>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Atendente</th>
                <th>Online</th>
                <th>Em pausa</th>
                <th>Invisível</th>
                <th>Tempo total</th>
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
      </section>
    </>
  );
}
