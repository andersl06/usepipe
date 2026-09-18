import { useCallback, useMemo, useState } from 'react';
import {
  AGRUPAMENTOS,
  agrupamentoValido,
  agruparHistorico,
  LIMITE_HISTORICO,
  type Catalogos,
  type LinhaHistorico,
} from '../../lib/historico';
import { useSearchParams } from 'react-router-dom';
import { useLeitura } from '../../lib/consulta';
import { dataHora, dataIso, dataOuNada, duracao, numero, uuidOuNada } from '../../lib/formato';
import { EstadoVazio, Icone } from '@pipe/ui';
import { IconeGestao } from '../../componentes/icones-gestao';
import { CampoDoPainel, PainelFiltros } from '../../componentes/painel-filtros';
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

/**
 * Atalhos de período — os rótulos exatos do filtro deles
 * (`docs/capturas/blip/dom/FICHA-history.md` §3). "Personalizado" é o nosso
 * par de datas de sempre; os outros só calculam `de`/`ate`.
 */
const PERIODOS = [
  { chave: 'hoje', rotulo: 'Hoje' },
  { chave: 'ontem', rotulo: 'Ontem' },
  { chave: '7', rotulo: 'Últimos 7 dias' },
  { chave: '15', rotulo: 'Últimos 15 dias' },
  { chave: '30', rotulo: 'Últimos 30 dias' },
  { chave: '60', rotulo: 'Últimos 60 dias' },
  { chave: '90', rotulo: 'Últimos 90 dias' },
  { chave: '120', rotulo: 'Últimos 120 dias' },
  { chave: '180', rotulo: 'Últimos 180 dias' },
] as const;

function calcularPeriodo(chave: string, fuso: string): { de: string; ate: string } | undefined {
  const agora = new Date();
  const hoje = dataIso(agora, fuso);
  if (chave === 'hoje') return { de: hoje, ate: hoje };
  if (chave === 'ontem') {
    const ontem = dataIso(new Date(agora.getTime() - 86_400_000), fuso);
    return { de: ontem, ate: ontem };
  }
  const dias = Number(chave);
  if (!Number.isInteger(dias)) return undefined;
  const inicio = dataIso(new Date(agora.getTime() - (dias - 1) * 86_400_000), fuso);
  return { de: inicio, ate: hoje };
}

/** Qual atalho corresponde ao `de`/`ate` atuais, se algum — senão, "personalizado". */
function periodoAtual(de: string, ate: string, fuso: string): string {
  const achado = PERIODOS.find((p) => {
    const calc = calcularPeriodo(p.chave, fuso);
    return calc !== undefined && calc.de === de && calc.ate === ate;
  });
  return achado?.chave ?? 'personalizado';
}

function rotuloDoPeriodo(chave: string): string {
  return PERIODOS.find((p) => p.chave === chave)?.rotulo ?? 'Personalizado';
}

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
 * `docs/capturas/blip/dom/FICHA-history.md`: cabeçalho com "Enviar por
 * e-mail", faixa "Filtros rápidos:" com os três atalhos e o período à
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
  const selecionados = todos.filter((c) => marcados.has(c.id));

  if (!dados) return null;
  /* Padrão (na `api`): os últimos sete dias, incluindo hoje. */
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
          <button
            type="button"
            className="btn"
            disabled={selecionados.length === 0}
            onClick={() => baixarCsv(selecionados)}
          >
            <IconeGestao nome="email" tamanho={14} />
            Enviar por e-mail
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
          <button type="button" className="btn" onClick={() => setPainelAberto(true)}>
            {rotuloDoPeriodo(periodoAtual(de, ate, fuso))}
          </button>
          <button type="button" className="btn" onClick={() => setPainelAberto(true)}>
            <Icone nome="funil" tamanho={14} />
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
        <CampoDoPainel rotulo="Período" apoio="Selecione um intervalo de datas">
          <select
            name="periodo"
            defaultValue={periodoAtual(de, ate, fuso)}
            aria-label="Atalho de período"
            onChange={(e) => {
              const calc = calcularPeriodo(e.currentTarget.value, fuso);
              if (!calc) return;
              const form = e.currentTarget.form;
              const campoDe = form?.elements.namedItem('de');
              const campoAte = form?.elements.namedItem('ate');
              if (campoDe instanceof HTMLInputElement) campoDe.value = calc.de;
              if (campoAte instanceof HTMLInputElement) campoAte.value = calc.ate;
            }}
          >
            {PERIODOS.map((p) => (
              <option key={p.chave} value={p.chave}>
                {p.rotulo}
              </option>
            ))}
            <option value="personalizado">Personalizado</option>
          </select>
          <div className="painel-datas">
            <input type="date" name="de" defaultValue={de} aria-label="De" />
            <input type="date" name="ate" defaultValue={ate} aria-label="Até" />
          </div>
        </CampoDoPainel>

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
          <select name="atendente" defaultValue={params.atendente ?? ''} aria-label="Atendentes">
            <option value="">Selecione os atendentes</option>
            {catalogos.atendentes.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome}
              </option>
            ))}
          </select>
        </CampoDoPainel>

        <CampoDoPainel rotulo="Tags" apoio="Selecione uma ou mais tags">
          <select name="etiqueta" defaultValue={params.etiqueta ?? ''} aria-label="Tags">
            <option value="">Selecione as tags</option>
            {catalogos.etiquetas.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome}
              </option>
            ))}
          </select>
        </CampoDoPainel>

        <CampoDoPainel rotulo="Filas" apoio="Selecione uma ou mais filas">
          <select name="fila" defaultValue={params.fila ?? ''} aria-label="Filas">
            <option value="">Selecione as filas</option>
            {catalogos.filas.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </select>
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
            <a href={limparFiltros} className="btn">
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
              <select
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
              </select>
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
              marcados={marcados}
              aoAlternar={aoAlternar}
              aoAlternarTodos={() =>
                setMarcados(
                  marcados.size === todos.length ? new Set() : new Set(todos.map((c) => c.id)),
                )
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
