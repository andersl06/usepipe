import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Icone } from '@pipe/ui';
import Link from '../../componentes/link';
import { IconeGestao } from '../../componentes/icones-gestao';
import { CampoDoPainel, CampoPeriodo, PainelFiltros } from '../../componentes/painel-filtros';
import { Selecao } from '../../componentes/selecao';
import { Dica, Metrica } from '../../componentes/metrica';
import { useLeitura } from '../../lib/consulta';
import type { Catalogos } from '../../lib/historico';
import { type RelatorioAtendimento, type LinhaDeQuebra } from '../../lib/atendimento';
import { dataOuNada, denominador, duracao, numero, uuidOuNada } from '../../lib/formato';
import { periodoAtual, rotuloDoPeriodo } from '../../lib/periodos';
import { baseDoContato, useContato } from '../fluxo/contato';
import { baseDoAtendimento } from './casca';

interface RespostaDoRelatorioDeAtendimento {
  fuso: string;
  de: string;
  ate: string;
  catalogos: Catalogos;
  relatorio: RelatorioAtendimento;
}

interface Busca {
  de?: string;
  ate?: string;
  fila?: string;
  atendente?: string;
  /** Aba do detalhamento por Atendentes/Filas/Tags — só client-side, não vai à API. */
  aba?: string;
}

/**
 * As três abas deles sobre a mesma tabela — `bds-tab-item label="Atendentes|
 * Filas|Tags"` em `desk-relatorio-atendimento__pagina.html`. A aba mora na
 * querystring, como todo filtro desta tela.
 */
const ABAS_DETALHAMENTO = [
  { chave: 'atendentes', rotulo: 'Atendentes', eixo: 'Atendente' },
  { chave: 'filas', rotulo: 'Filas', eixo: 'Fila' },
  { chave: 'tags', rotulo: 'Tags', eixo: 'Tag' },
] as const;
type AbaDetalhamento = (typeof ABAS_DETALHAMENTO)[number]['chave'];

function abaValida(v: string | undefined): AbaDetalhamento {
  return ABAS_DETALHAMENTO.some((a) => a.chave === v) ? (v as AbaDetalhamento) : 'atendentes';
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
    l.chave,
    numero(l.encerramentos.finalizada),
    duracao(l.primeiraResposta.valor),
    duracao(l.naFila.valor),
    duracao(l.resposta.valor),
    duracao(l.atendimento.valor),
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
      <IconeGestao nome="baixar" tamanho={24} />
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
            <tr key={l.chave}>
              <td className="who">{l.chave}</td>
              <td className="num">{numero(l.encerramentos.finalizada)}</td>
              <td className="num" title={denominador(l.primeiraResposta, 'sem 1ª resposta')}>
                {duracao(l.primeiraResposta.valor)}
              </td>
              <td className="num" title={denominador(l.naFila, 'sem atribuição')}>
                {duracao(l.naFila.valor)}
              </td>
              <td className="num" title={denominador(l.resposta, 'sem troca completa')}>
                {duracao(l.resposta.valor)}
              </td>
              <td className="num" title={denominador(l.atendimento, 'nunca respondidas')}>
                {duracao(l.atendimento.valor)}
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
 * `docs/capturas/blip/desk/desk-relatorio-atendimento__pagina.html`:
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
export function PaginaAtendimento() {
  const { contato } = useContato();
  const base = baseDoAtendimento(contato.tipo, contato.id);
  const gerenciador = `${baseDoContato(contato.tipo, contato.id)}/analise/gerenciador-de-relatorios`;
  const [busca] = useSearchParams();
  const crus = Object.fromEntries(busca.entries()) as Busca;
  /* Conferido na entrada: id torto e data torta viram "sem filtro". Sem isso,
     um link colado com `?fila=abc` derruba o relatório inteiro em 500. */
  const params: Busca = {
    fila: uuidOuNada(crus.fila),
    atendente: uuidOuNada(crus.atendente),
    de: dataOuNada(crus.de),
    ate: dataOuNada(crus.ate),
  };
  const q = new URLSearchParams();
  for (const chave of ['fila', 'atendente', 'de', 'ate'] as const) {
    if (params[chave]) q.set(chave, params[chave] as string);
  }
  const leitura = useLeitura<RespostaDoRelatorioDeAtendimento>(
    `/v1/gestao/relatorios/atendimento?${q}`,
  );
  const [painelAberto, setPainelAberto] = useState(false);
  if (!leitura.data) return null;
  const { fuso, de, ate, catalogos, relatorio } = leitura.data;
  const geral = relatorio.geral;
  const enc = geral.encerramentos;

  const nomeDaFila = catalogos.filas.find((f) => f.id === params.fila)?.nome;
  const nomeDoAtendente = catalogos.atendentes.find((a) => a.id === params.atendente)?.nome;
  const temFiltro = Boolean(params.fila || params.atendente);

  const aba = abaValida(crus.aba);
  const hrefAba = (chave: AbaDetalhamento) => {
    const p = new URLSearchParams(q);
    p.set('aba', chave);
    return `${base}/relatorios/atendimento?${p}`;
  };
  const linhasDaAba: Record<AbaDetalhamento, LinhaDeQuebra[]> = {
    atendentes: relatorio.porAtendente,
    filas: relatorio.porFila,
    tags: relatorio.porEtiqueta,
  };
  const abaAtual = ABAS_DETALHAMENTO.find((a) => a.chave === aba) ?? ABAS_DETALHAMENTO[0];

  return (
    <>
      <div className="board-head">
        <h2>Relatório de atendimento</h2>
        <div className="filters">
          <Link href={gerenciador} className="btn">
            Gerenciador de Relatórios
            <IconeGestao nome="baixo" tamanho={20} style={{ transform: 'rotate(-90deg)' }} />
          </Link>
        </div>
      </div>

      <div className="quickfilters">
        <span className="lbl">Filtros rápidos:</span>
        <button
          type="button"
          className={params.atendente ? 'pilula ativa' : 'pilula'}
          onClick={() => setPainelAberto(true)}
        >
          <span className="pilula-rotulo">Atendentes</span>
          {nomeDoAtendente ? <span className="pilula-valor">{nomeDoAtendente}</span> : null}
        </button>
        <button
          type="button"
          className={params.fila ? 'pilula ativa' : 'pilula'}
          onClick={() => setPainelAberto(true)}
        >
          <span className="pilula-rotulo">Filas</span>
          {nomeDaFila ? <span className="pilula-valor">{nomeDaFila}</span> : null}
        </button>
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
        acao={`${base}/relatorios/atendimento`}
        limpar={temFiltro ? `${base}/relatorios/atendimento?de=${de}&ate=${ate}` : null}
      >
        {crus.aba ? <input type="hidden" name="aba" value={crus.aba} /> : null}
        <CampoPeriodo de={de} ate={ate} fuso={fuso} />
        <CampoDoPainel rotulo="Atendentes" apoio="Selecione um ou mais atendentes">
          <Selecao name="atendente" defaultValue={params.atendente ?? ''} aria-label="Atendentes">
            <option value="">Selecione os atendentes</option>
            {catalogos.atendentes.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome}
              </option>
            ))}
          </Selecao>
        </CampoDoPainel>
        <CampoDoPainel rotulo="Filas" apoio="Selecione uma ou mais filas">
          <Selecao name="fila" defaultValue={params.fila ?? ''} aria-label="Filas">
            <option value="">Selecione as filas</option>
            {catalogos.filas.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </Selecao>
        </CampoDoPainel>
      </PainelFiltros>

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
              valor="—"
              rotulo="Tempo máximo de espera na fila"
              dica="Maior tempo que um ticket ficou aguardando na fila"
              formula="Ainda calculamos só a média do período, não o pico."
            />
            <Metrica
              valor="—"
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
              valor="—"
              rotulo="Abertos"
              dica="Tickets abertos no período"
              formula="Conversa aberta não entra nesta consulta — o retrato ao vivo é o de Monitoramento."
            />
            <Metrica
              tom="erro"
              valor={numero(enc.perdida)}
              rotulo="Perdidos"
              dica="Tickets perdidos (fechados pelo cliente antes de serem atribuídos a atendente)"
              formula="Perdido saiu ANTES da atribuição, e é capacidade ou fila."
            />
            <Metrica
              tom="erro"
              valor={numero(enc.abandonada)}
              rotulo="Abandonados"
              dica="Tickets retirados (cancelados pelo cliente após atribuição)"
              formula="Abandonado saiu DEPOIS da atribuição, e é atendimento."
            />
            <Metrica
              valor={numero(enc.finalizada)}
              rotulo="Finalizados"
              dica="Tickets finalizados ou transferidos por gestor/atendente"
            />
            <Metrica
              valor={numero(enc.fechada)}
              rotulo="Fechados"
              dica="Total de tickets fechados (soma de perdido + retirado + finalizado)"
              denominador={`${numero(geral.conversas)} conversas no recorte.`}
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
            valor={duracao(geral.naFila.valor)}
            rotulo="Tempo médio de espera na fila"
            dica="Tempo médio que os tickets ficaram aguardando na fila"
            denominador={denominador(geral.naFila, 'sem atribuição')}
          />
          <Metrica
            valor={duracao(geral.primeiraResposta.valor)}
            rotulo="Tempo médio até 1ª resposta"
            dica="Tempo médio até a primeira resposta do atendente"
            formula="primeira_resposta_em menos atribuida_em. População: conversas que tiveram resposta do atendente."
            denominador={denominador(geral.primeiraResposta, 'sem 1ª resposta')}
          />
          <Metrica
            valor={duracao(geral.esperaTotal.valor)}
            rotulo="Tempo médio de espera total"
            dica="Tempo médio de espera do cliente, da abertura à primeira resposta"
            denominador={denominador(geral.esperaTotal, 'sem início ou fim')}
          />
          <Metrica
            valor={duracao(geral.resposta.valor)}
            rotulo="Tempo médio de resposta"
            dica="Tempo médio entre a mensagem do cliente e a resposta do atendente"
            formula={`Média de INTERVALOS: ${numero(geral.resposta.populacao)} trocas em ${numero(geral.resposta.conversasConsideradas)} conversas.`}
            denominador={denominador(geral.resposta, 'sem troca completa')}
          />
          <Metrica
            valor={duracao(geral.atendimento.valor)}
            rotulo="Tempo médio de atendimento"
            dica="Tempo médio de duração dos atendimentos"
            formula="Encerramento menos 1ª resposta — a mesma fórmula da Blip, para ser comparável; descarta a conversa que nunca foi respondida."
            denominador={denominador(geral.atendimento, 'nunca respondidas')}
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
            {ABAS_DETALHAMENTO.map((a) => (
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
          <IconeGestao nome="informacao" tamanho={16} />
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
