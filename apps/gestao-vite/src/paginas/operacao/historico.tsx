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

interface RespostaDoHistorico {
  fuso: string;
  de: string;
  ate: string;
  catalogos: Catalogos;
  linhas: LinhaHistorico[];
  truncado: boolean;
}
import { ListaHistorico, type CartaoHistorico } from '../../componentes/lista-historico';

interface Busca {
  de?: string;
  ate?: string;
  fila?: string;
  atendente?: string;
  etiqueta?: string;
  agrupar?: string;
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
 * (`docs/capturas/blip/dom/history.html`). "Personalizado" é o nosso par de
 * datas de sempre; os outros só calculam `de`/`ate` e reaproveitam o mesmo
 * formulário GET.
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

/**
 * Histórico — lista de CARTÕES, como na tela deles.
 *
 * Era tabela de dez colunas. Virou cartão porque é o que a Blip faz em seis
 * das oito telas do módulo Atendimento, e a razão é boa: cada campo carrega o
 * próprio rótulo, então o olho não precisa subir até o cabeçalho e descer de
 * volta, e a lista sobrevive a qualquer largura de tela.
 *
 * A ordem da tela é a deles, medida em `docs/pesquisa/blip-telas-atendimento.md`
 * §4: linha do título, faixa de filtros, barra de seleção, lista. A tinta e o
 * conteúdo são nossos.
 *
 * O agrupamento continua — é o nosso, não deles, e é a resposta aos seis itens
 * de relatório que nunca viraram tela. O título do grupo virou um cabeçalho
 * acima dos cartões dele, no lugar da linha que atravessava a tabela.
 */
export function PaginaHistorico() {
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
  if (!leitura.data) return null;
  /* Padrão (na `api`): os últimos sete dias, incluindo hoje. */
  const { fuso, de, ate, catalogos, linhas, truncado } = leitura.data;

  const por = agrupamentoValido(params.agrupar);

  /* Período sempre existe; fila, atendente e etiqueta são o recorte opcional.
     A distinção decide a frase do estado vazio. */
  const temFiltro = Boolean(params.fila || params.atendente || params.etiqueta);

  /* Tudo atravessa para o cartão já formatado: nenhuma Date e nenhum nulo
     passam para lá, e o formato do fuso do tenant fica decidido de um lado só. */
  const emCartao = (l: LinhaHistorico): CartaoHistorico => {
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

  const grupos = agruparHistorico(linhas, por).map((g) => ({
    titulo: g.titulo,
    cartoes: g.linhas.map(emCartao),
  }));

  return (
    <>
      <div className="board-head">
        <h2>Histórico</h2>
        <span className="sub">
          Conversas encerradas, com o cronômetro parado. Status e tempos derivados dos eventos.
        </span>
        <span className="sub filters">
          {numero(linhas.length)} conversas
          {truncado ? ` · as ${LIMITE_HISTORICO} mais recentes` : ''}
        </span>
      </div>

      <form className="quickfilters" method="get" action="/historico">
        <span className="lbl">Período</span>
        <select
          defaultValue={periodoAtual(de, ate, fuso)}
          className="btn"
          aria-label="Atalho de período"
          onChange={(evento) => {
            const calc = calcularPeriodo(evento.currentTarget.value, fuso);
            if (!calc) return;
            const form = evento.currentTarget.form;
            const campoDe = form?.elements.namedItem('de');
            const campoAte = form?.elements.namedItem('ate');
            if (campoDe instanceof HTMLInputElement) campoDe.value = calc.de;
            if (campoAte instanceof HTMLInputElement) campoAte.value = calc.ate;
            form?.requestSubmit();
          }}
        >
          {PERIODOS.map((p) => (
            <option key={p.chave} value={p.chave}>
              {p.rotulo}
            </option>
          ))}
          <option value="personalizado">Personalizado</option>
        </select>
        <input type="date" name="de" defaultValue={de} className="btn" aria-label="De" />
        <input type="date" name="ate" defaultValue={ate} className="btn" aria-label="Até" />

        <select
          name="atendente"
          defaultValue={params.atendente ?? ''}
          className="btn"
          aria-label="Atendente"
        >
          <option value="">Todos os atendentes</option>
          {catalogos.atendentes.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nome}
            </option>
          ))}
        </select>

        <select
          name="etiqueta"
          defaultValue={params.etiqueta ?? ''}
          className="btn"
          aria-label="Etiqueta"
        >
          <option value="">Todas as etiquetas</option>
          {catalogos.etiquetas.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nome}
            </option>
          ))}
        </select>

        <select name="fila" defaultValue={params.fila ?? ''} className="btn" aria-label="Fila">
          <option value="">Todas as filas</option>
          {catalogos.filas.map((f) => (
            <option key={f.id} value={f.id}>
              {f.nome}
            </option>
          ))}
        </select>

        {/*
          Agrupamento no lugar dos relatórios: "por fila", "por atendente" e
          "por etiqueta" eram item de menu e são a mesma lista dobrada por uma
          coluna.
        */}
        <select name="agrupar" defaultValue={por} className="btn" aria-label="Agrupar por">
          {AGRUPAMENTOS.map((a) => (
            <option key={a.chave} value={a.chave}>
              {a.chave === 'nenhum' ? a.rotulo : `Agrupar por ${a.rotulo.toLowerCase()}`}
            </option>
          ))}
        </select>

        <button type="submit" className="btn primary">
          Aplicar
        </button>
        <a href="/historico" className="btn">
          Limpar tudo
        </a>
      </form>

      {linhas.length === 0 ? (
        /* Duas causas, duas frases: recorte que não achou ninguém e período sem
           movimento pedem ações opostas — uma se resolve tirando filtro, a
           outra alargando a data. Uma frase só para as duas manda o gestor
           mexer no controle errado. */
        <div className="vazio">
          {temFiltro ? (
            <>
              <b>Nenhuma conversa encerrada neste recorte.</b>
              <p>
                Entre {de} e {ate}, nenhuma conversa passa por fila, atendente e etiqueta ao mesmo
                tempo. Tire um filtro de cada vez para achar qual deles corta tudo.
              </p>
              <a href={`/historico?de=${de}&ate=${ate}`} className="btn">
                Manter o período e limpar os filtros
              </a>
            </>
          ) : (
            <>
              <b>
                Nenhuma conversa encerrada entre {de} e {ate}.
              </b>
              <p>Só entra aqui conversa já encerrada — as abertas estão em Monitoramento.</p>
              <a href="/monitoramento" className="btn">
                Ver o que está aberto agora
              </a>
            </>
          )}
        </div>
      ) : (
        <ListaHistorico grupos={grupos} />
      )}
    </>
  );
}
