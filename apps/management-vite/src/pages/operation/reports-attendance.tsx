import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Icone } from '@pipe/ui';
import Link from '../../components/link';
import { IconeManagement } from '../../components/icones-management';
import { PanelField, FieldPeriod, PanelFilters } from '../../components/panel-filters';
import { Selection } from '../../components/selection';
import { Dica, Metrica } from '../../components/metrica';
import { useRead } from '../../lib/query';
import type { Catalogos } from '../../lib/history';
import { type ReportAttendance, type LinhaDeQuebra } from '../../lib/attendance';
import { dataOuNada, denominador, duration, numero, uuidOuNada } from '../../lib/format';
import { periodCurrent, periodRotulo } from '../../lib/periodos';
import { contactBase, useContact } from '../flow/contact';
import { attendanceBase } from './shell';

interface RespostaOfReportOfAttendance {
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
  /** Aba do detalhamento por Atendentes/Filas/Tags — só client-side, não vai à API. */
  aba?: string;
}

/**
 * As três abas deles sobre a mesma tabela — `bds-tab-item label="Atendentes|
 * Filas|Tags"` em `desk-relatorio-atendimento__pagina.html`. A aba mora na
 * querystring, como todo filtro desta tela.
 */
const ABAS_BREAKDOWN = [
  { chave: 'atendentes', rotulo: 'Atendentes', eixo: 'Atendente' },
  { chave: 'filas', rotulo: 'Filas', eixo: 'Fila' },
  { chave: 'tags', rotulo: 'Tags', eixo: 'Tag' },
] as const;
type AbaBreakdown = (typeof ABAS_BREAKDOWN)[number]['chave'];

function abaValida(v: string | undefined): AbaBreakdown {
  return ABAS_BREAKDOWN.some((a) => a.chave === v) ? (v as AbaBreakdown) : 'atendentes';
}

/**
 * As colunas da tabela deles, na ordem e no texto exato (`bds-table-th` de
 * `desk-relatorio-atendimento__pagina.html`): o eixo, "Tickets finalizados",
 * "Tempo médio da 1ª resposta", "Tempo médio de espera", "Tempo médio de
 * resposta", "Tempo médio de atendimento", "Atingimento SLA".
 *
 * "Atingimento SLA" ainda não tem consulta nossa — fica com travessão em vez
 * de sumir. As médias carregam a contagem descartada no `title` da célula
 * (a régua de métricas exige o denominador; a tela deles não o mostra, então
 * ele vai para onde não muda a forma).
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
    duration(l.firstResposta.value),
    duration(l.inQueue.value),
    duration(l.resposta.value),
    duration(l.attendance.value),
    '—',
  ];
}

/** O `bds-button-icon icon="download"` de cada aba: baixa a tabela visível em CSV. */
function baixarCsv(nome: string, eixo: string, linhas: LinhaDeQuebra[]) {
  const escapar = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const corpo = [[eixo, ...COLUNAS], ...linhas.map(linhaEmCelulas)]
    .map((l) => l.map(escapar).join(';'))
    .join('\n');
  // BOM por código de caractere, não literal na fonte: o Excel só reconhece UTF-8
  // num CSV com o BOM na frente, e o caractere colado direto é "espaço irregular"
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
      <IconeManagement nome="baixar" tamanho={24} />
    </button>
  );
}

function TabelaDeQuebra({ eixo, linhas }: { eixo: string; linhas: LinhaDeQuebra[] }) {
  if (linhas.length === 0) return <div className="vazio-linha">Dados insuficientes</div>;
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
              <td className="num" title={denominador(l.firstResposta, 'sem 1ª resposta')}>
                {duration(l.firstResposta.value)}
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
 * Relatório de atendimento — a tela deles, bloco a bloco, lida em
 * `referencias-blip/desk/desk-relatorio-atendimento__pagina.html`:
 *
 * 1. cabeçalho "Relatório de atendimento" com "Gerenciador de Relatórios" à
 *    direita (`bds-button variant="secondary" arrow`);
 * 2. faixa "Filtros rápidos:" com "Atendentes" e "Filas", e à direita o
 *    período em botão fantasma ("Últimos 7 dias") e "Filtros";
 * 3. cartão "Indicadores de SLA" (título 20/700 + ícone de informação);
 * 4. linha com "Tempo máximo" (2 métricas) e "Status dos tickets" (5);
 * 5. cartão "Tempo médio" (5 métricas);
 * 6. cartão "Tickets Abertos x Fechados" (gráfico);
 * 7. cartão com as abas Atendentes/Filas/Tags sobre a mesma tabela, cada uma
 *    com o botão de baixar, e a nota sobre os filtros;
 * 8. cartão "Disponibilidade de atendentes".
 *
 * Os cartões de métrica são os MESMOS do Monitoramento (`bds-paper pa4` com
 * título 14/600 e colunas 24/400 sobre 12/400) — não o bloco-com-cartões da
 * Satisfação. Todo rótulo, título e dica é o texto deles, literal.
 *
 * Onde a nossa consulta não tem o dado — pico do período, SLA agregado,
 * "Abertos", o gráfico e a disponibilidade — o lugar fica com o vazio
 * honesto ("—" ou "Dados insuficientes"), nunca com número inventado. A
 * fórmula da spec de métricas e a contagem descartada continuam no balão do
 * ícone de informação e no `title` da célula.
 */
export function PageAttendance() {
  const { contact } = useContact();
  const base = attendanceBase(contact.tipo, contact.id);
  const manager = `${contactBase(contact.tipo, contact.id)}/analise/gerenciador-de-relatorios`;
  const [search] = useSearchParams();
  const crus = Object.fromEntries(search.entries()) as Search;
  /* Conferido na entrada: id torto e data torta viram "sem filtro". Sem isso,
     um link colado com `?fila=abc` derruba o relatório inteiro em 500. */
  const params: Search = {
    queue: uuidOuNada(crus.queue),
    agent: uuidOuNada(crus.agent),
    de: dataOuNada(crus.de),
    ate: dataOuNada(crus.ate),
  };
  const q = new URLSearchParams();
  for (const key of ['fila', 'atendente', 'de', 'ate'] as const) {
    if (params[key]) q.set(key, params[key] as string);
  }
  const read = useRead<RespostaOfReportOfAttendance>(
    `/v1/management/reports/attendance?${q}`,
  );
  const [panelAberto, setPanelAberto] = useState(false);
  if (!read.data) return null;
  const { fuso, de, ate, catalogos, report } = read.data;
  const geral = report.geral;
  const enc = geral.closures;

  const queueName = catalogos.queues.find((f) => f.id === params.queue)?.nome;
  const agentName = catalogos.agents.find((a) => a.id === params.agent)?.nome;
  const temFilter = Boolean(params.queue || params.agent);

  const aba = abaValida(crus.aba);
  const hrefAba = (key: AbaBreakdown) => {
    const p = new URLSearchParams(q);
    p.set('aba', key);
    return `${base}/relatorios/atendimento?${p}`;
  };
  const linhasDaAba: Record<AbaBreakdown, LinhaDeQuebra[]> = {
    atendentes: report.byAgent,
    filas: report.byQueue,
    tags: report.byTag,
  };
  const abaAtual = ABAS_BREAKDOWN.find((a) => a.chave === aba) ?? ABAS_BREAKDOWN[0];

  return (
    <>
      <div className="board-head">
        <h2>Relatório de atendimento</h2>
        <div className="filters">
          <Link href={manager} className="btn">
            Gerenciador de Relatórios
            <IconeManagement nome="baixo" tamanho={20} style={{ transform: 'rotate(-90deg)' }} />
          </Link>
        </div>
      </div>

      <div className="quickfilters">
        <span className="lbl">Filtros rápidos:</span>
        <button
          type="button"
          className={params.agent ? 'pilula ativa' : 'pilula'}
          onClick={() => setPanelAberto(true)}
        >
          <span className="pilula-rotulo">Atendentes</span>
          {agentName ? <span className="pilula-valor">{agentName}</span> : null}
        </button>
        <button
          type="button"
          className={params.queue ? 'pilula ativa' : 'pilula'}
          onClick={() => setPanelAberto(true)}
        >
          <span className="pilula-rotulo">Filas</span>
          {queueName ? <span className="pilula-valor">{queueName}</span> : null}
        </button>
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
        acao={`${base}/relatorios/atendimento`}
        limpar={temFilter ? `${base}/relatorios/atendimento?de=${de}&to=${ate}` : null}
      >
        {crus.aba ? <input type="hidden" name="aba" value={crus.aba} /> : null}
        <FieldPeriod de={de} ate={ate} fuso={fuso} />
        <PanelField rotulo="Atendentes" apoio="Selecione um ou mais atendentes">
          <Selection name="atendente" defaultValue={params.agent ?? ''} aria-label="Atendentes">
            <option value="">Selecione os atendentes</option>
            {catalogos.agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome}
              </option>
            ))}
          </Selection>
        </PanelField>
        <PanelField rotulo="Filas" apoio="Selecione uma ou mais filas">
          <Selection name="fila" defaultValue={params.queue ?? ''} aria-label="Filas">
            <option value="">Selecione as filas</option>
            {catalogos.queues.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </Selection>
        </PanelField>
      </PanelFilters>

      {/* ------------------------------------------------------------ bloco 1
          "Indicadores de SLA": gráfico de área deles. SLA agregado por
          período ainda não tem consulta própria aqui — o vazio é o texto
          literal do vazio deles. */}
      <section className="card">
        <h3 className="grande">
          Indicadores de SLA
          <Dica
            rotulo="Indicadores de SLA"
            texto="Atingimento das metas de SLA das filas no período."
            formula="O estado de SLA de cada conversa já existe em Monitoramento; o indicador agregado por período ainda não tem consulta própria."
          />
        </h3>
        <div className="vazio">
          <b>Não foram encontradas métricas de SLA no período informado</b>
        </div>
      </section>

      {/* ------------------------------------------------------------ bloco 2
          "Tempo máximo" e "Status dos tickets", lado a lado. Hoje só
          calculamos MÉDIA; o PICO do período é consulta que falta, e
          "Abertos" (tickets abertos no período) também. */}
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

      {/* ------------------------------------------------------------ bloco 3
          "Tempo médio" — as cinco métricas, com o texto exato do cartão
          deles em cada rótulo. */}
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
            value={duration(geral.firstResposta.value)}
            rotulo="Tempo médio até 1ª resposta"
            dica="Tempo médio até a primeira resposta do atendente"
            formula="primeira_resposta_em menos atribuida_em. População: conversas que tiveram resposta do atendente."
            denominador={denominador(geral.firstResposta, 'sem 1ª resposta')}
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
            formula={`Média de INTERVALOS: ${numero(geral.resposta.population)} trocas em ${numero(geral.resposta.conversationsConsideradas)} conversas.`}
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

      {/* ------------------------------------------------------------ bloco 4
          "Tickets Abertos x Fechados": a série diária deles. Sem consulta
          por dia aqui — o lugar fica, vazio. */}
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
        <div className="vazio">
          <b>Dados insuficientes</b>
        </div>
      </section>

      {/* ------------------------------------------------------------ bloco 5
          As três abas deles sobre a MESMA tabela, cada uma com o botão de
          baixar encostado à direita (`bds-button-icon icon="download"
          class="ml-a"`). */}
      <section className="tblwrap">
        <div className="rel-aba-cabecalho">
          <div className="tabs" role="tablist">
            {ABAS_BREAKDOWN.map((a) => (
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
          <IconeManagement nome="informacao" tamanho={16} />
          Os filtros de Canais, Atendentes, Filas e Tags não se aplicam à tabela abaixo.
        </p>
      </section>

      {/* ------------------------------------------------------------ bloco 6
          "Disponibilidade de atendentes" (Atendente, Online, Em pausa,
          Invisível, Tempo total). É tempo em status por período — consulta
          que ainda não existe aqui; a tabela fica com o vazio. */}
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
                  <div className="vazio-linha" style={{ border: 0 }}>
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
