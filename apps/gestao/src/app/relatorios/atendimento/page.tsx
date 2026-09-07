import type { ResultadoMetrica } from '@pipe/core';
import { fusoDoTenant, janelaDeDatas, janelaDeHoje } from '../../../lib/banco';
import {
  carregarAtendimento,
  type BlocoDeTempos,
  type LinhaDeQuebra,
} from '../../../lib/atendimento';
import { carregarCatalogos } from '../../../lib/historico';
import { dataIso, denominador, duracao, numero } from '../../../lib/formato';

export const dynamic = 'force-dynamic';

interface Busca {
  de?: string;
  ate?: string;
  fila?: string;
  atendente?: string;
}

/**
 * Métrica de tempo do relatório: valor em cima, DENOMINADOR embaixo, sempre.
 *
 * Não existe versão sem o denominador, de propósito. É a divergência declarada
 * na §2 da spec de métricas: a Blip mostra o tempo de atendimento sozinho, e ele
 * melhora justamente quando mais conversa cai sem resposta. Aqui a contagem
 * excluída fica no mesmo cartão.
 */
function Tempo({
  rotulo,
  resultado,
  fora,
}: {
  rotulo: string;
  resultado: ResultadoMetrica;
  fora: string;
}) {
  return (
    <div className="cartao-rel">
      <span className="r">{rotulo}</span>
      <span className="v">{duracao(resultado.valor)}</span>
      <span className="den">{denominador(resultado, fora)}</span>
    </div>
  );
}

/** Célula de tempo da tabela de quebra: o mesmo par valor/excluídas da grade. */
function CelulaTempo({ resultado, fora }: { resultado: ResultadoMetrica; fora: string }) {
  return (
    <td className="num">
      {duracao(resultado.valor)}
      <span className="den">{denominador(resultado, fora)}</span>
    </td>
  );
}

function Quebra({
  titulo,
  eixo,
  linhas,
  recorte,
  nota,
}: {
  titulo: string;
  eixo: string;
  linhas: LinhaDeQuebra[];
  /** `null` quando não há filtro além do período. Muda a causa do vazio. */
  recorte: string | null;
  /** Aviso de população, quando ela não é a mesma do bloco geral. */
  nota?: React.ReactNode;
}) {
  return (
    <section className="bloco-rel">
      <h3>{titulo}</h3>
      {nota ? <p className="note">{nota}</p> : null}
      {linhas.length === 0 ? (
        /* Culpar o período quando o corte foi de fila ou atendente manda o
           gestor alargar a data e continuar sem ver nada. */
        <div className="cartao-rel">
          <div className="vazio">
            {recorte ? (
              <>
                <b>Nada dentro deste recorte.</b>
                <p>
                  O recorte <b>{recorte}</b> não tem conversa encerrada no período. Volte o filtro
                  para “todas” e o bloco reaparece.
                </p>
              </>
            ) : (
              <>
                <b>Nenhuma conversa encerrada neste período.</b>
                <p>Conversa ainda aberta não entra aqui — ela está em Monitoramento.</p>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="cartao-rel tabela scroll">
          <table>
            <thead>
              <tr>
                <th>{eixo}</th>
                <th>Fechadas</th>
                <th>Perdidas</th>
                <th>Abandonadas</th>
                <th>Finalizadas</th>
                <th>Na fila</th>
                <th>Até 1ª resposta</th>
                <th>Resposta</th>
                <th>Atendimento</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.chave}>
                  <td className="who">{l.chave}</td>
                  <td className="num">{numero(l.encerramentos.fechada)}</td>
                  <td className="num">{numero(l.encerramentos.perdida)}</td>
                  <td className="num">{numero(l.encerramentos.abandonada)}</td>
                  <td className="num">{numero(l.encerramentos.finalizada)}</td>
                  <CelulaTempo resultado={l.naFila} fora="sem atribuição" />
                  <CelulaTempo resultado={l.primeiraResposta} fora="sem 1ª resposta" />
                  <CelulaTempo resultado={l.resposta} fora="sem troca completa" />
                  <CelulaTempo resultado={l.atendimento} fora="nunca respondidas" />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/**
 * Relatório de atendimento — §2, §3 e §4 da spec de métricas.
 *
 * Estrutura de bloco da Blip, a mesma do relatório de Esforço: bloco com recuo
 * 20 e raio 16, título 16/700, grade de 20, métrica em 14/600 com o valor 20/700
 * embaixo. Faixa de filtros de 56px e linha de título de 40px vêm de cima.
 *
 * A população é uma só e está dita no subtítulo: conversas ENCERRADAS dentro do
 * período (§3). Nada aqui olha conversa aberta — isso é o Monitoramento, e
 * misturar as duas é o erro clássico de painel de atendimento.
 */
export default async function PaginaAtendimento({
  searchParams,
}: {
  searchParams: Promise<Busca>;
}) {
  const params = await searchParams;
  const fuso = await fusoDoTenant();
  const hoje = await janelaDeHoje(fuso);

  const ate = params.ate || dataIso(hoje.inicio, fuso);
  const de = params.de || dataIso(new Date(hoje.inicio.getTime() - 6 * 86400e3), fuso);
  const janela = await janelaDeDatas(fuso, de, ate);

  const catalogos = await carregarCatalogos();
  const relatorio = await carregarAtendimento(janela, {
    filaId: params.fila || undefined,
    atendenteId: params.atendente || undefined,
  });
  const geral: BlocoDeTempos = relatorio.geral;
  const enc = geral.encerramentos;

  /* Quem foi escolhido no filtro, escrito por extenso — é o que o estado vazio
     precisa nomear para o gestor saber em qual controle mexer. */
  const nomeDaFila = catalogos.filas.find((f) => f.id === params.fila)?.nome;
  const nomeDoAtendente = catalogos.atendentes.find((a) => a.id === params.atendente)?.nome;
  const recorte =
    [nomeDaFila && `fila ${nomeDaFila}`, nomeDoAtendente && `atendente ${nomeDoAtendente}`]
      .filter(Boolean)
      .join(' + ') || null;

  return (
    <>
      <div className="board-head">
        <h2>Relatório de atendimento</h2>
        <span className="sub">
          Conversas encerradas no período, com o cronômetro parado. Tempos e desfecho derivados dos
          eventos, nunca do campo da conversa.
        </span>
      </div>

      <form className="quickfilters" method="get" action="/relatorios/atendimento">
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

        <div className="faixa-fim">
          <a href="/relatorios/atendimento" className="btn">
            Limpar
          </a>
          <button type="submit" className="btn primary">
            Aplicar
          </button>
        </div>
      </form>

      {/* ------------------------------------------------------------ bloco 1
          As cinco métricas de tempo da §2, na ordem da spec. Cada uma carrega o
          próprio denominador: população usada, total candidato e quantas
          ficaram de fora. */}
      <section className="bloco-rel">
        <h3>
          Tempos médios <span className="sub">{`${de} → ${ate}`}</span>
        </h3>
        <div className="bloco-rel-grade" style={{ '--rel-colunas': 5 } as React.CSSProperties}>
          <Tempo rotulo="Tempo na fila" resultado={geral.naFila} fora="sem atribuição" />
          <Tempo
            rotulo="Até a 1ª resposta"
            resultado={geral.primeiraResposta}
            fora="sem 1ª resposta"
          />
          <Tempo
            rotulo="Espera total do cliente"
            resultado={geral.esperaTotal}
            fora="sem início ou fim"
          />
          <Tempo rotulo="Tempo de resposta" resultado={geral.resposta} fora="sem troca completa" />
          <Tempo
            rotulo="Tempo de atendimento"
            resultado={geral.atendimento}
            fora="nunca respondidas"
          />
        </div>
        <p className="note">
          O tempo de atendimento usa a mesma fórmula da Blip — encerramento menos 1ª resposta — para
          ser comparável, e por isso descarta a conversa que nunca foi respondida. A contagem
          descartada fica ao lado do número: sem ela, a média melhora justamente quando o
          atendimento piora. Vale igual para o tempo até a 1ª resposta. O tempo de resposta é média
          de INTERVALOS: {numero(geral.resposta.populacao)} trocas em{' '}
          {numero(geral.resposta.conversasConsideradas)} conversas.
        </p>
      </section>

      {/* ------------------------------------------------------------ bloco 2
          §4. Perdida e abandonada são linhas separadas e nunca somadas: a
          fronteira entre as duas é a existência de atribuição. */}
      <section className="bloco-rel">
        <h3>Desfecho</h3>
        <div className="bloco-rel-grade" style={{ '--rel-colunas': 4 } as React.CSSProperties}>
          <div className="cartao-rel">
            <span className="r">Perdidas</span>
            <span className="v">{numero(enc.perdida)}</span>
            <span className="den">cliente saiu antes da atribuição — capacidade da fila</span>
          </div>
          <div className="cartao-rel">
            <span className="r">Abandonadas</span>
            <span className="v">{numero(enc.abandonada)}</span>
            <span className="den">cliente saiu depois da atribuição — atendimento</span>
          </div>
          <div className="cartao-rel">
            <span className="r">Finalizadas</span>
            <span className="v">{numero(enc.finalizada)}</span>
            <span className="den">encerradas pelo atendente, ou transferidas</span>
          </div>
          <div className="cartao-rel">
            <span className="r">Fechadas</span>
            <span className="v">{numero(enc.fechada)}</span>
            <span className="den">
              soma das três · {numero(geral.conversas)} conversas no recorte
              {enc.abertas > 0 ? ` · ${numero(enc.abertas)} reabertas depois do fechamento` : ''}
            </span>
          </div>
        </div>
        <p className="note">
          Perdida e abandonada nunca aparecem somadas. Uma é problema de capacidade — não havia quem
          atendesse — e a outra é problema de atendimento, com a conversa já na mão de alguém. Somar
          as duas apaga exatamente a informação que torna o número acionável.
        </p>
      </section>

      <Quebra titulo="Por fila" eixo="Fila" linhas={relatorio.porFila} recorte={recorte} />
      <Quebra
        titulo="Por atendente"
        eixo="Atendente"
        linhas={relatorio.porAtendente}
        recorte={recorte}
      />

      {/* ---------------------------------------------------- as duas do Chatwoot
          O Chatwoot tem relatório por agente, por equipe, por rótulo e por caixa
          de entrada (`docs/pesquisa/chatwoot.md`). Agente já tínhamos; equipe
          não existe no nosso modelo — quem recorta grupo de gente aqui é a
          FILA, e um "por equipe" seria a mesma tabela com outro nome. Faltavam
          estas duas, e as duas respondem pergunta que as de cima não respondem:
          "de qual canal vem o atendimento mais lento" e "qual assunto custa
          mais tempo". */}
      <Quebra
        titulo="Por caixa de entrada"
        eixo="Caixa de entrada"
        linhas={relatorio.porInbox}
        recorte={recorte}
        nota={
          <>
            A caixa de entrada é por onde a conversa chegou — o canal e a conexão. É ela, e não o
            canal, que carrega a fila padrão, então uma caixa lenta com fila certa é problema de
            volume, e uma caixa lenta com fila errada é problema de roteamento.
          </>
        }
      />

      <Quebra
        titulo="Por etiqueta"
        eixo="Etiqueta"
        linhas={relatorio.porEtiqueta}
        recorte={recorte}
        nota={
          <>
            <b>População diferente das tabelas acima.</b> Conversa com três etiquetas entra em três
            linhas, então a soma das linhas passa do total do período — é o preço de perguntar
            “quanto custa um atendimento de cobrança”, e ele fica dito em vez de escondido.{' '}
            {numero(relatorio.semEtiqueta)} conversa(s) encerrada(s) no período não têm etiqueta
            nenhuma e não aparecem em linha alguma; enquanto esse número for grande, esta tabela
            mede o que sobrou. A exigência de etiqueta no encerramento se liga em Preferências ├
            Configurações gerais.
          </>
        }
      />
    </>
  );
}
