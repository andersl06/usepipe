import type { ResultadoMetrica } from '@pipe/core';
import { useSearchParams } from 'react-router-dom';
import Link from '../../componentes/link';
import { useLeitura } from '../../lib/consulta';
import type { Catalogos } from '../../lib/historico';
import {
  type RelatorioAtendimento,
  type BlocoDeTempos,
  type LinhaDeQuebra,
} from '../../lib/atendimento';
import { dataOuNada, denominador, duracao, numero, uuidOuNada } from '../../lib/formato';
import { useContato } from '../fluxo/contato';
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

/**
 * O corpo de uma quebra (tabela ou vazio), sem título — para poder viver
 * tanto sob um `<h3>` fixo ("Por caixa de entrada") quanto sob uma aba
 * ("Atendentes"/"Filas"/"Tags", a mesma tabela deles em `bds-tab-item`).
 *
 * Colunas na ordem e no texto da tabela por atendente/fila/tag deles
 * (`FICHA-relatorio-atendimento.md` §4); "Atingimento SLA" é a coluna deles
 * que ainda não tem consulta nossa — fica com travessão em vez de sumir, e
 * "Fechadas/Perdidas/Abandonadas/Finalizadas" é o desfecho que JÁ buscamos e
 * que a tabela deles não abre neste recorte — mantido, não é dado inventado.
 */
function CorpoDeQuebra({
  eixo,
  linhas,
  recorte,
}: {
  eixo: string;
  linhas: LinhaDeQuebra[];
  /** `null` quando não há filtro além do período. Muda a causa do vazio. */
  recorte: string | null;
}) {
  if (linhas.length === 0) {
    /* Culpar o período quando o corte foi de fila ou atendente manda o
       gestor alargar a data e continuar sem ver nada. */
    return (
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
    );
  }
  return (
    <div className="cartao-rel tabela scroll">
      <table>
        <thead>
          <tr>
            <th>{eixo}</th>
            <th>Fechadas</th>
            <th>Perdidas</th>
            <th>Abandonadas</th>
            <th>Finalizadas</th>
            <th>Tempo médio de espera na fila</th>
            <th>Tempo médio até 1ª resposta</th>
            <th>Tempo médio de resposta</th>
            <th>Tempo médio de atendimento</th>
            <th title="A Blip calcula um % de conversas dentro do prazo de SLA nesta tabela; ainda não temos essa consulta agregada por período.">
              Atingimento SLA
            </th>
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
              <td className="num">—</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
  recorte: string | null;
  /** Aviso de população, quando ela não é a mesma do bloco geral. */
  nota?: React.ReactNode;
}) {
  return (
    <section className="bloco-rel">
      <h3>{titulo}</h3>
      {nota ? <p className="note">{nota}</p> : null}
      <CorpoDeQuebra eixo={eixo} linhas={linhas} recorte={recorte} />
    </section>
  );
}

/**
 * As três abas deles sobre a mesma tabela — `<bds-tab-item label="Atendentes|
 * Filas|Tags">` em `desk-relatorio-atendimento__pagina.html` — em vez das
 * seções empilhadas que tínhamos para as mesmas três quebras. A aba mora na
 * querystring, como todo filtro desta tela: assim o link "Aplicar" não perde
 * a aba escolhida.
 */
const ABAS_DETALHAMENTO = [
  { chave: 'atendentes', rotulo: 'Atendentes', eixo: 'Atendente' },
  { chave: 'filas', rotulo: 'Filas', eixo: 'Fila' },
  { chave: 'tags', rotulo: 'Tags', eixo: 'Etiqueta' },
] as const;
type AbaDetalhamento = (typeof ABAS_DETALHAMENTO)[number]['chave'];

function abaValida(v: string | undefined): AbaDetalhamento {
  return ABAS_DETALHAMENTO.some((a) => a.chave === v) ? (v as AbaDetalhamento) : 'atendentes';
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
export function PaginaAtendimento() {
  const { contato } = useContato();
  const base = baseDoAtendimento(contato.tipo, contato.id);
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
  if (!leitura.data) return null;
  const { de, ate, catalogos, relatorio } = leitura.data;
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

  /* A aba do detalhamento (Atendentes/Filas/Tags) mora na querystring, como
     todo o resto do filtro — não vai para a API porque as três quebras já
     vêm juntas na mesma resposta. */
  const aba = abaValida(crus.aba);
  const hrefAba = (chave: AbaDetalhamento) => {
    const p = new URLSearchParams(q);
    p.set('aba', chave);
    return `${base}/relatorios/atendimento?${p}`;
  };

  return (
    <>
      <div className="board-head">
        <h2>Relatório de atendimento</h2>
        <span className="sub">
          Conversas encerradas no período, com o cronômetro parado. Tempos e desfecho derivados dos
          eventos, nunca do campo da conversa.
        </span>
      </div>

      <form className="quickfilters" method="get" action={`${base}/relatorios/atendimento`}>
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
          <a href={`${base}/relatorios/atendimento`} className="btn">
            Limpar
          </a>
          <button type="submit" className="btn primary">
            Aplicar
          </button>
        </div>
      </form>

      {/* ------------------------------------------------------------ bloco 1
          "Indicadores de SLA" é o primeiro bloco deles (gráfico de área, e no
          período capturado veio vazio: "Não foram encontradas métricas de SLA
          no período informado"). Não copiamos gráfico nenhum — só o lugar e a
          honestidade do vazio: SLA por conversa já existe em Monitoramento,
          mas agregado por período ainda não tem consulta própria aqui. */}
      <section className="bloco-rel">
        <h3>Indicadores de SLA</h3>
        <div className="cartao-rel">
          <div className="vazio">
            <b>Ainda não agregamos SLA por período nesta tela.</b>
            <p>
              O estado de SLA de cada conversa já existe (regra da fila, aviso e estouro, vistos em
              Monitoramento); o indicador agregado por período — o gráfico que a Blip mostra aqui —
              ainda não tem consulta própria.
            </p>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ bloco 2
          "Tempo máximo": dois cartões, na ordem e no texto deles. Hoje só
          calculamos MÉDIA (§2); o PICO do período é consulta que falta. */}
      <section className="bloco-rel">
        <h3>Tempo máximo</h3>
        <div className="bloco-rel-grade" style={{ '--rel-colunas': 2 } as React.CSSProperties}>
          <div className="cartao-rel">
            <span className="r">Tempo máximo de espera na fila</span>
            <span className="v">—</span>
            <span className="den">ainda calculamos só a média do período, não o pico</span>
          </div>
          <div className="cartao-rel">
            <span className="r">Tempo máximo até 1ª resposta</span>
            <span className="v">—</span>
            <span className="den">idem — falta a consulta de máximo</span>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ bloco 3
          §4. Perdida e abandonada são linhas separadas e nunca somadas: a
          fronteira entre as duas é a existência de atribuição. O nome do
          bloco continua "Desfecho", e não "Status dos tickets" (o deles): eles
          somam "Aberto" na mesma grade, e conversa aberta não entra aqui —
          é o Monitoramento, de propósito (ver comentário da função). */}
      <section className="bloco-rel">
        <h3>Desfecho</h3>
        <div className="bloco-rel-grade" style={{ '--rel-colunas': 4 } as React.CSSProperties}>
          <div className="cartao-rel">
            <span className="r" title="Tickets perdidos (fechados pelo cliente antes de serem atribuídos a atendente)">
              Perdidas
            </span>
            <span className="v">{numero(enc.perdida)}</span>
            <span className="den">cliente saiu antes da atribuição — capacidade da fila</span>
          </div>
          <div className="cartao-rel">
            <span className="r" title="Tickets retirados (cancelados pelo cliente após atribuição)">
              Abandonadas
            </span>
            <span className="v">{numero(enc.abandonada)}</span>
            <span className="den">cliente saiu depois da atribuição — atendimento</span>
          </div>
          <div className="cartao-rel">
            <span className="r" title="Tickets finalizados ou transferidos por gestor/atendente">
              Finalizadas
            </span>
            <span className="v">{numero(enc.finalizada)}</span>
            <span className="den">encerradas pelo atendente, ou transferidas</span>
          </div>
          <div className="cartao-rel">
            <span className="r" title="Total de tickets fechados (soma de perdido + retirado + finalizado)">
              Fechadas
            </span>
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

      {/* ------------------------------------------------------------ bloco 4
          "Tempo médio" — mesmas cinco métricas da §2, agora com o texto
          exato do card deles em cada rótulo. */}
      <section className="bloco-rel">
        <h3>
          Tempo médio <span className="sub">{`${de} → ${ate}`}</span>
        </h3>
        <div className="bloco-rel-grade" style={{ '--rel-colunas': 5 } as React.CSSProperties}>
          <Tempo
            rotulo="Tempo médio de espera na fila"
            resultado={geral.naFila}
            fora="sem atribuição"
          />
          <Tempo
            rotulo="Tempo médio até 1ª resposta"
            resultado={geral.primeiraResposta}
            fora="sem 1ª resposta"
          />
          <Tempo
            rotulo="Tempo médio de espera total"
            resultado={geral.esperaTotal}
            fora="sem início ou fim"
          />
          <Tempo
            rotulo="Tempo médio de resposta"
            resultado={geral.resposta}
            fora="sem troca completa"
          />
          <Tempo
            rotulo="Tempo médio de atendimento"
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

      {/* ------------------------------------------------------------ bloco 5
          As três abas deles sobre a MESMA tabela — `bds-tab-item label=
          "Atendentes"/"Filas"/"Tags"` — no lugar das três seções empilhadas
          que tínhamos para as mesmas três quebras. */}
      <section className="bloco-rel">
        <h3>Detalhamento</h3>
        <div className="tabs" role="tablist">
          {ABAS_DETALHAMENTO.map((a) => (
            <Link key={a.chave} href={hrefAba(a.chave)} aria-current={aba === a.chave ? 'true' : undefined}>
              {a.rotulo}
            </Link>
          ))}
        </div>
        {aba === 'tags' ? (
          <p className="note">
            <b>População diferente das outras abas.</b> Conversa com três etiquetas entra em três
            linhas, então a soma das linhas passa do total do período — é o preço de perguntar
            “quanto custa um atendimento de cobrança”, e ele fica dito em vez de escondido.{' '}
            {numero(relatorio.semEtiqueta)} conversa(s) encerrada(s) no período não têm etiqueta
            nenhuma e não aparecem em linha alguma; enquanto esse número for grande, esta tabela
            mede o que sobrou. A exigência de etiqueta no encerramento se liga em Preferências ├
            Configurações gerais.
          </p>
        ) : null}
        {aba === 'atendentes' ? (
          <CorpoDeQuebra eixo="Atendente" linhas={relatorio.porAtendente} recorte={recorte} />
        ) : null}
        {aba === 'filas' ? (
          <CorpoDeQuebra eixo="Fila" linhas={relatorio.porFila} recorte={recorte} />
        ) : null}
        {aba === 'tags' ? (
          <CorpoDeQuebra eixo="Etiqueta" linhas={relatorio.porEtiqueta} recorte={recorte} />
        ) : null}
      </section>

      {/* ---------------------------------------------------- bônus do Chatwoot
          O Chatwoot tem relatório por agente, por equipe, por rótulo e por caixa
          de entrada (`docs/pesquisa/chatwoot.md`). A Blip não tem aba de caixa
          de entrada — esta seção é NOSSA, mantida como bloco à parte porque
          responde pergunta que as abas de cima não respondem: "de qual canal
          vem o atendimento mais lento". */}
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

      {/* ------------------------------------------------------------ bloco 6
          Último bloco deles: "Disponibilidade de atendentes" (Online, Em
          pausa, Invisível, Tempo total). É status EM TEMPO REAL — não existe
          "disponibilidade" de um período fechado — e por isso não temos
          consulta para ele aqui; o retrato ao vivo é o de Monitoramento. */}
      <section className="bloco-rel">
        <h3>Disponibilidade de atendentes</h3>
        <div className="cartao-rel">
          <div className="vazio">
            <b>Esta tabela é sobre o período fechado, e disponibilidade é status ao vivo.</b>
            <p>
              Online, em pausa, invisível e tempo total nesses estados não têm sentido para um
              recorte de datas já encerrado — o retrato de agora mesmo é o de Monitoramento. Não
              inventamos uma versão "média do período" para isso.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
