import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AGRUPAMENTOS,
  agrupamentoValido,
  agruparHistorico,
  alternarTodosVisiveis,
  LIMITE_HISTORICO,
  reconciliarMarcados,
  type Catalogos,
  type LinhaHistorico,
} from '../../lib/historico';
import { useSearchParams } from 'react-router-dom';
import { useLeitura } from '../../lib/consulta';
import { dataHora, dataOuNada, duracao, numero, uuidOuNada } from '../../lib/formato';
import { periodoAtual, rotuloDoPeriodo } from '../../lib/periodos';
import { EstadoVazio, Icone } from '@pipe/ui';
import { IconeGestao } from '../../componentes/icones-gestao';
import { CampoDoPainel, CampoPeriodo, PainelFiltros } from '../../componentes/painel-filtros';
import { Selecao } from '../../componentes/selecao';
import { montarCsv } from '../../lib/csv-historico';
import { ListaHistorico, type CartaoHistorico } from '../../componentes/lista-historico';
import { useContato } from '../fluxo/contato';
import { baseDoAtendimento } from './casca';

interface RespostaDoHistorico {
  fuso: string;
  de: string;
  ate: string;
  catalogos: Catalogos;
  linhas: LinhaHistorico[];
  truncado: boolean;
}

interface Busca {
  de?: string;
  ate?: string;
  fila?: string;
  atendente?: string;
  etiqueta?: string;
  agrupar?: string;
  /* Os dois campos abaixo não existem na consulta ao servidor: a API de
     histórico não filtra por eles (`FiltroHistorico` só tem fila/atendente/
     etiqueta). Filtram as linhas já carregadas, no navegador — ver `casa()`. */
  ticket?: string;
  contato?: string;
}

/**
 * Finalizada é o desfecho normal e fica neutra: era verde em cada linha da
 * lista, e o verde repetido deixa de significar. Perdida e abandonada seguem
 * coloridas, porque são as duas que o supervisor precisa caçar.
 */
const ROTULO_STATUS: Record<string, { texto: string; classe: string }> = {
  perdida: { texto: 'Perdida', classe: 'etiqueta erro' },
  abandonada: { texto: 'Abandonada', classe: 'etiqueta alerta' },
  finalizada: { texto: 'Finalizada', classe: 'etiqueta' },
};

function baixarCsv(cartoes: readonly CartaoHistorico[]) {
  const url = URL.createObjectURL(
    new Blob([montarCsv(cartoes)], { type: 'text/csv;charset=utf-8' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = `historico-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Campos que o formulário do painel não mostra mas precisa carregar, senão some ao aplicar. */
function CamposEscondidos({ atual, exceto }: { atual: Busca; exceto: readonly string[] }) {
  const pares: [string, string | undefined][] = [
    ['de', atual.de],
    ['ate', atual.ate],
    ['fila', atual.fila],
    ['atendente', atual.atendente],
    ['etiqueta', atual.etiqueta],
    ['agrupar', atual.agrupar],
    ['ticket', atual.ticket],
    ['contato', atual.contato],
  ];
  return (
    <>
      {pares
        .filter(([chave, valor]) => valor && !exceto.includes(chave))
        .map(([chave, valor]) => (
          <input key={chave} type="hidden" name={chave} value={valor} />
        ))}
    </>
  );
}

/**
 * Histórico — a mesma disposição da tela deles, medida em
 * `referencias-blip/fichas/FICHA-history.md`: cabeçalho com a ação de exportar
 * CSV disponível, faixa "Filtros rápidos:" com os três atalhos e o período à
 * direita, painel lateral de filtros fechado por padrão, e a área de
 * resultados — vazia com o texto e a ilustração deles, ou a nossa LISTA DE
 * CARTÕES quando há conversa.
 *
 * A lista de cartões continua sendo nossa: seis das oito telas do módulo
 * Atendimento da Blip usam cartão, e nenhuma usa tabela — o material não
 * chegou a capturar esta tela com resultado, então a régua "IGUAL" não tem o
 * que comparar aqui, e a decisão registrada em `blip-telas-atendimento.md`
 * §3/§5.2 continua de pé.
 */
export function PaginaHistorico() {
  const { contato } = useContato();
  const base = baseDoAtendimento(contato.tipo, contato.id);
  const [busca] = useSearchParams();
  const crus = Object.fromEntries(busca.entries()) as Busca;
  /* Conferido na entrada: id torto e data torta viram "sem filtro", em vez de
     virarem erro de servidor no `::uuid` e no `::date` do Postgres. */
  const params: Busca = {
    ...crus,
    fila: uuidOuNada(crus.fila),
    atendente: uuidOuNada(crus.atendente),
    etiqueta: uuidOuNada(crus.etiqueta),
    de: dataOuNada(crus.de),
    ate: dataOuNada(crus.ate),
  };
  const q = new URLSearchParams();
  for (const chave of ['fila', 'atendente', 'etiqueta', 'de', 'ate'] as const) {
    if (params[chave]) q.set(chave, params[chave] as string);
  }
  const leitura = useLeitura<RespostaDoHistorico>(`/v1/gestao/historico?${q}`);
  const [painelAberto, setPainelAberto] = useState(false);
  const [marcados, setMarcados] = useState<ReadonlySet<string>>(new Set());

  const aoAlternar = useCallback(
    (id: string) =>
      setMarcados((atual) => {
        const proximo = new Set(atual);
        if (!proximo.delete(id)) proximo.add(id);
        return proximo;
      }),
    [],
  );

  /* Todo hook precisa rodar em toda renderização, inclusive na primeira, antes
     da consulta voltar — por isso o `useMemo` entra ANTES do `if` que decide
     se há dado para desenhar, e não depois dele. */
  const dados = leitura.data;
  const por = agrupamentoValido(params.agrupar);

  /* Os dois filtros de cliente: a API não tem `?ticket=` nem `?contato=`, mas
     as linhas já trazem `ticket` e `contatoNome` — filtrar aqui não custa uma
     ida a mais ao servidor, e não inventa dado que a consulta não devolveu. */
  const idsDosTickets = (params.ticket ?? '')
    .split(/[\s,]+/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  const contatoBuscado = (params.contato ?? '').trim().toLowerCase();

  /* Tudo atravessa para o cartão já formatado: nenhuma Date e nenhum nulo
     passam para lá, e o formato do fuso do tenant fica decidido de um lado só. */
  const emCartao = (fuso: string) =>
    (l: LinhaHistorico): CartaoHistorico => {
      const status = l.status ? ROTULO_STATUS[l.status] : undefined;
      return {
        id: l.id,
        ticket: l.ticket,
        encerrada: dataHora(l.encerradaEm, fuso),
        contato: l.contatoNome,
        fila: l.filaNome ?? '—',
        atendente: l.atendenteNome ?? '—',
        espera: duracao(l.esperaSeg),
        primeiraResposta: duracao(l.primeiraRespostaSeg),
        atendimento: duracao(l.atendimentoSeg),
        statusTexto: status?.texto ?? 'Aberta',
        statusClasse: status?.classe ?? 'etiqueta',
        critico: l.status === 'perdida',
        etiquetas: l.etiquetas,
      };
    };

  const linhas = useMemo(() => {
    if (!dados) return [];
    return dados.linhas.filter((l) => {
      if (
        idsDosTickets.length > 0 &&
        !idsDosTickets.some((id) => l.ticket.toLowerCase().includes(id))
      ) {
        return false;
      }
      if (contatoBuscado && !l.contatoNome.toLowerCase().includes(contatoBuscado)) return false;
      return true;
    });
    // Dependências reais: as duas strings da URL, não os arrays derivados
    // delas (novos a cada render).
  }, [dados, params.ticket, params.contato]);

  const grupos = useMemo(() => {
    if (!dados) return [];
    return agruparHistorico(linhas, por).map((g) => ({
      titulo: g.titulo,
      cartoes: g.linhas.map(emCartao(dados.fuso)),
    }));
  }, [dados, linhas, por]);

  /* A lista única, sem repetir por grupo: quem manda no "selecionar todos", no
     CSV e no botão do cabeçalho. */
  const todos = useMemo(() => {
    const vistos = new Map<string, CartaoHistorico>();
    for (const g of grupos) for (const c of g.cartoes) vistos.set(c.id, c);
    return [...vistos.values()];
  }, [grupos]);
  const idsVisiveis = useMemo(() => todos.map((c) => c.id), [todos]);
  const marcadosVisiveis = reconciliarMarcados(marcados, idsVisiveis);
  const selecionados = todos.filter((c) => marcadosVisiveis.has(c.id));

  useEffect(() => {
    setMarcados((atual) => reconciliarMarcados(atual, idsVisiveis));
  }, [idsVisiveis]);

  if (!dados && leitura.isError) {
    return (
      <div className="hist-pagina">
        <div className="board-head"><h2>Histórico</h2></div>
        <div className="card hist-erro" role="alert">
          <h3>Não foi possível carregar o histórico</h3>
          <p>Verifique a conexão e tente novamente.</p>
          <button type="button" className="btn" onClick={() => void leitura.refetch()}>
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }
  if (!dados) {
    return (
      <div className="hist-pagina" role="status" aria-label="Carregando histórico">
        <div className="board-head"><h2>Histórico</h2></div>
        <div className="card hist-carregando">Carregando histórico…</div>
      </div>
    );
  }
  /* Padrão (na `api`): os últimos trinta dias, incluindo hoje. */
  const { fuso, de, ate, catalogos, truncado } = dados;

  /* Período sempre existe; fila, atendente, etiqueta, ticket e contato são o
     recorte opcional. A distinção decide a frase do estado vazio do servidor
     (truncamento) — o texto da tela em si é fixo, como na deles. */
  const temFiltro = Boolean(
    params.fila || params.atendente || params.etiqueta || params.ticket || params.contato,
  );
  const limparFiltros = `${base}/historico?de=${de}&ate=${ate}`;

  return (
    <>
      <div className="board-head">
        <h2>Histórico</h2>
        <div className="filters">
          {/* A ação disponível baixa o CSV das conversas selecionadas. */}
          <button
            type="button"
            className="btn primario"
            disabled={selecionados.length === 0}
            onClick={() => baixarCsv(selecionados)}
          >
            <IconeGestao nome="baixar" tamanho={24} />
            Exportar CSV
          </button>
        </div>
      </div>

      {/* "Filtros rápidos:", os três atalhos deles e o período à direita —
          `FICHA-history.md` §2.2. Cada atalho abre o mesmo painel; nenhum é
          consulta própria. */}
      <div className="quickfilters">
        <span className="lbl">Filtros rápidos:</span>
        <button
          type="button"
          className={params.ticket ? 'pilula ativa' : 'pilula'}
          onClick={() => setPainelAberto(true)}
        >
          <span className="pilula-rotulo">IDs dos tickets</span>
        </button>
        <button
          type="button"
          className={params.atendente ? 'pilula ativa' : 'pilula'}
          onClick={() => setPainelAberto(true)}
        >
          <span className="pilula-rotulo">Atendentes</span>
          {params.atendente ? (
            <span>{catalogos.atendentes.find((a) => a.id === params.atendente)?.nome}</span>
          ) : null}
        </button>
        <button
          type="button"
          className={params.etiqueta ? 'pilula ativa' : 'pilula'}
          onClick={() => setPainelAberto(true)}
        >
          <span className="pilula-rotulo">Tags</span>
          {params.etiqueta ? (
            <span>{catalogos.etiquetas.find((e) => e.id === params.etiqueta)?.nome}</span>
          ) : null}
        </button>

        <div className="faixa-fim">
          {/* "Últimos 30 dias" é `bds-button variant="text"`: sem borda, só o
              rótulo (`dom/history.html`). O funil é `bds-icon size="small"`,
              20px. */}
          <button type="button" className="btn fantasma" onClick={() => setPainelAberto(true)}>
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
        acao={`${base}/historico`}
        limpar={temFiltro ? limparFiltros : null}
      >
        <CamposEscondidos atual={params} exceto={['de', 'ate']} />
        <CampoPeriodo de={de} ate={ate} fuso={fuso} />

        <CampoDoPainel
          rotulo="IDs dos tickets"
          apoio="Informe os IDs de um ou mais tickets para buscar"
        >
          <input
            type="text"
            name="ticket"
            defaultValue={params.ticket ?? ''}
            placeholder="Informe os IDs dos tickets"
            aria-label="IDs dos tickets"
          />
        </CampoDoPainel>

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

        <CampoDoPainel rotulo="Tags" apoio="Selecione uma ou mais tags">
          <Selecao name="etiqueta" defaultValue={params.etiqueta ?? ''} aria-label="Tags">
            <option value="">Selecione as tags</option>
            {catalogos.etiquetas.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome}
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

        <CampoDoPainel rotulo="Contato" apoio="Selecione um contato">
          <input
            type="text"
            name="contato"
            defaultValue={params.contato ?? ''}
            placeholder="Digite parte do nome do contato"
            aria-label="Contato"
          />
        </CampoDoPainel>
      </PainelFiltros>

      {/* "Área de resultados", `FICHA-history.md` §2: o vazio deles OU a nossa
          lista, e o link "Termo de responsabilidade" no canto — ele mora
          nesta área nos DOIS estados, porque é onde a captura o registrou
          (a captura deles está vazia, e o link está lá mesmo assim). */}
      <div className="hist-resultados">
        {linhas.length === 0 ? (
          /* O texto é o deles, literal — `FICHA-history.md` §6. */
          <EstadoVazio titulo="Nenhum resultado encontrado" ilustracao="busca">
            <p>
              Não encontramos nenhum resultado a partir da pesquisa realizada.
              <br />
              Que tal refazer a sua busca?
            </p>
            {/* `bds-button variant="outline" color="primary" class="mt4"`: a
                borda na cor de marca (`button 135x40 b=1px rgb(74,93,35)`
                na cópia viva), 20px abaixo do texto. */}
            <a href={limparFiltros} className="btn contorno-marca">
              Redefinir filtros
            </a>
          </EstadoVazio>
        ) : (
          <>
            {/* "Agrupar por" é nosso, não deles — a resposta aos seis itens de
                relatório que nunca viraram tela (`historico.ts`). Fica FORA do
                painel de propósito: o painel só tem os campos que a ficha lista. */}
            <form method="get" action={`${base}/historico`} className="hist-agrupar">
              <CamposEscondidos atual={params} exceto={['agrupar']} />
              <label className="lbl" htmlFor="agrupar">
                Agrupar por
              </label>
              <Selecao
                id="agrupar"
                name="agrupar"
                defaultValue={por}
                onChange={(e) => e.currentTarget.form?.requestSubmit()}
              >
                {AGRUPAMENTOS.map((a) => (
                  <option key={a.chave} value={a.chave}>
                    {a.chave === 'nenhum' ? a.rotulo : `Agrupar por ${a.rotulo.toLowerCase()}`}
                  </option>
                ))}
              </Selecao>
              {truncado ? (
                <span className="sub">
                  {numero(linhas.length)} conversas · as {LIMITE_HISTORICO} mais recentes
                </span>
              ) : (
                <span className="sub">{numero(linhas.length)} conversas</span>
              )}
            </form>

            <ListaHistorico
              grupos={grupos}
              todos={todos}
              marcados={marcadosVisiveis}
              aoAlternar={aoAlternar}
              aoAlternarTodos={() =>
                setMarcados((atual) => alternarTodosVisiveis(atual, idsVisiveis))
              }
            />
          </>
        )}

        <a href="/termo-de-responsabilidade" className="termo-de-responsabilidade">
          <IconeGestao nome="documento" tamanho={14} />
          Termo de responsabilidade
        </a>
      </div>
    </>
  );
}
