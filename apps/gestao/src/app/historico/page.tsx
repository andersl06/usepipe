import { fusoDoTenant, janelaDeDatas, janelaDeHoje } from '../../lib/banco';
import {
  AGRUPAMENTOS,
  agrupamentoValido,
  agruparHistorico,
  carregarCatalogos,
  carregarHistorico,
  LIMITE_HISTORICO,
  type LinhaHistorico,
} from '../../lib/historico';
import { dataHora, dataIso, duracao, numero } from '../../lib/formato';
import { ListaHistorico, type CartaoHistorico } from '../../componentes/lista-historico';

export const dynamic = 'force-dynamic';

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
export default async function PaginaHistorico({ searchParams }: { searchParams: Promise<Busca> }) {
  const params = await searchParams;
  const fuso = await fusoDoTenant();
  const hoje = await janelaDeHoje(fuso);

  // Padrão: os últimos sete dias, incluindo hoje.
  const ate = params.ate || dataIso(hoje.inicio, fuso);
  const de = params.de || dataIso(new Date(hoje.inicio.getTime() - 6 * 86400e3), fuso);

  const janela = await janelaDeDatas(fuso, de, ate);
  const catalogos = await carregarCatalogos();
  const { linhas, truncado } = await carregarHistorico(janela, {
    filaId: params.fila || undefined,
    atendenteId: params.atendente || undefined,
    etiquetaId: params.etiqueta || undefined,
  });

  const por = agrupamentoValido(params.agrupar);

  /* Período sempre existe; fila, atendente e etiqueta são o recorte opcional.
     A distinção decide a frase do estado vazio. */
  const temFiltro = Boolean(params.fila || params.atendente || params.etiqueta);

  /*
   * O cartão é componente de cliente, porque a seleção múltipla e a exportação
   * moram no navegador. Então tudo atravessa a fronteira já formatado: nenhuma
   * Date e nenhum nulo passam para lá, e o formato do fuso do tenant fica
   * decidido de um lado só.
   */
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
        <input type="date" name="de" defaultValue={de} className="btn" aria-label="De" />
        <input type="date" name="ate" defaultValue={ate} className="btn" aria-label="Até" />

        <select name="fila" defaultValue={params.fila ?? ''} className="btn" aria-label="Fila">
          <option value="">Todas as filas</option>
          {catalogos.filas.map((f) => (
            <option key={f.id} value={f.id}>
              {f.nome}
            </option>
          ))}
        </select>

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
          Limpar
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
              <a href="/" className="btn">
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
