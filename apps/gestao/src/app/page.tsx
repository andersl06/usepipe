import { fusoDoTenant, janelaDeHoje } from '../lib/banco';
import { carregarMonitoramento } from '../lib/monitoramento';
import { denominador, duracao, numero } from '../lib/formato';
import { RecargaPeriodica } from '../componentes/recarga-periodica';
import { TelaCheia } from '../componentes/tela-cheia';
import { FiltrosDaLista, FiltrosDaOperacao } from '../componentes/filtros-rapidos';
import { Metrica, Status } from '../componentes/metrica';
import { MonitoramentoDetalhado } from '../componentes/monitoramento-detalhado';
import { CargaPorAtendente } from '../componentes/carga-por-atendente';

export const dynamic = 'force-dynamic';

interface Busca {
  fila?: string;
  atendente?: string;
  contato?: string;
  status?: string;
  aba?: string;
  busca?: string;
}

/**
 * Monitoramento — a mesma disposição da tela deles, de cima para baixo:
 * linha do título com atualizar e tela cheia, faixa de filtros rápidos, grade
 * 2×2 com o cartão largo à esquerda e o estreito à direita nas duas linhas,
 * segunda faixa de filtros, e o cartão do monitoramento detalhado com a busca
 * dentro dele.
 *
 * O que NÃO copiamos é a tinta. Eles pintam de azul os dois números que dizem
 * como está a operação agora; nós pintamos os mesmos dois de moss. Os pontos
 * de status usam os nossos quatro token de estado, e nenhum azul entra.
 *
 * A separação entre "agora" e "hoje" que a spec de métricas exige (§3) é feita
 * pelas LINHAS da grade e pelos títulos dos cartões — "em tempo real" em cima,
 * "hoje" embaixo. Os cabeçalhos de bloco que faziam esse papel saíram: eles
 * custavam duas faixas de altura que a tela deles não gasta, e a tabela caía
 * para fora da primeira dobra por causa disso.
 */
export default async function PaginaMonitoramento({
  searchParams,
}: {
  searchParams: Promise<Busca>;
}) {
  const params = await searchParams;
  const fuso = await fusoDoTenant();
  const janela = await janelaDeHoje(fuso);
  const m = await carregarMonitoramento(janela, fuso, {
    filaId: params.fila || undefined,
    atendenteId: params.atendente || undefined,
  });

  const { tempoReal, atendentes, hoje } = m;

  return (
    <>
      <div className="board-head">
        <h2>Monitoramento</h2>
        <span className="sub">
          Hoje · {janela.inicio.toLocaleDateString('pt-BR', { timeZone: fuso, dateStyle: 'long' })}{' '}
          · {fuso}
        </span>
        <div className="filters">
          <RecargaPeriodica segundos={30} />
          <TelaCheia />
        </div>
      </div>

      <FiltrosDaOperacao filas={m.filas} atendentes={m.listaAtendentes} atual={params} />

      {/* ---------------------------------------------------- grade 2×2 */}
      <div className="mon">
        <div className="card">
          <h3>Atendimentos em tempo real</h3>
          <div className="metrics">
            <Metrica
              destaque
              valor={numero(tempoReal.naFila)}
              rotulo="Na fila"
              dica="Conversas abertas que ainda não foram atribuídas a nenhum atendente. Contagem deste instante, com o cronômetro correndo."
            />
            <Metrica
              valor={duracao(tempoReal.maiorEsperaNaFilaSeg)}
              rotulo="Tempo máximo na fila"
              dica="A maior espera entre as conversas ainda não atribuídas: agora menos criada_em. Fechada, a métrica é atribuida_em menos criada_em."
              /* Máximo também carrega população: 40 minutos entre duas
                 conversas e entre duzentas pedem reações opostas. */
              denominador={`entre ${numero(tempoReal.naFila)} na fila`}
            />
            <Metrica
              valor={duracao(tempoReal.maiorEsperaPrimeiraRespostaSeg)}
              rotulo="Tempo máximo até 1ª resposta"
              dica="A maior espera entre as conversas já atribuídas e ainda sem resposta do atendente: agora menos atribuida_em."
              denominador={`entre ${numero(tempoReal.aguardandoPrimeiraResposta)} aguardando`}
            />
            <Metrica
              destaque
              valor={numero(tempoReal.emAtendimento)}
              rotulo="Em atendimento"
              dica="Conversas abertas com atendente atribuído, neste instante."
            />
            <Metrica
              valor={numero(tempoReal.mediaPorAtendente, 1)}
              rotulo="Média de tickets por atendente"
              dica="Conversas em atendimento divididas pelos atendentes online. Ponderada por volume, nunca média de médias."
              denominador={`${numero(tempoReal.emAtendimento)} ÷ ${numero(tempoReal.atendentesOnline)} online`}
            />
          </div>
        </div>

        <div className="card">
          <h3>Status dos atendentes</h3>
          <div className="statuses">
            <Status valor={numero(atendentes.online)} rotulo="Online" estado="sucesso" />
            <Status valor={numero(atendentes.pausa)} rotulo="Pausa" estado="alerta" />
            <Status valor={numero(atendentes.invisivel)} rotulo="Invisível" estado="neutro" />
          </div>
          <div className="note">
            {atendentes.pausasEstouradas > 0
              ? `${numero(atendentes.pausasEstouradas)} pausa(s) acima da duração sugerida pelo motivo.`
              : 'Nenhuma pausa acima da duração sugerida pelo motivo.'}
          </div>
        </div>

        <div className="card">
          <h3>Atendimento hoje</h3>
          <div className="metrics">
            <Metrica
              valor={duracao(hoje.esperaDoCliente.valor)}
              rotulo="Tempo médio de espera"
              dica="Espera total do cliente. Com resposta: primeira_resposta_em menos criada_em. Sem resposta: encerrada_em menos criada_em. População: todas as conversas encerradas no período."
              denominador={denominador(hoje.esperaDoCliente, 'sem início')}
            />
            <Metrica
              valor={duracao(hoje.tempoDeResposta.valor)}
              rotulo="Tempo médio de resposta"
              dica="Média dos intervalos entre a mensagem do cliente e a próxima mensagem do atendente. População: conversas com pelo menos uma troca completa."
              denominador={`${numero(hoje.tempoDeResposta.conversasConsideradas)} com troca completa · ${numero(hoje.tempoDeResposta.populacao)} intervalos`}
            />
            <Metrica
              valor={duracao(hoje.atePrimeiraResposta.valor)}
              rotulo="Tempo médio até 1ª resposta"
              dica="primeira_resposta_em menos atribuida_em. População: conversas que tiveram resposta do atendente. As que nunca foram respondidas ficam de fora, e o número delas vem ao lado."
              denominador={denominador(hoje.atePrimeiraResposta)}
            />
            <Metrica
              valor={duracao(hoje.tempoDeAtendimento.valor)}
              rotulo="Tempo médio de atendimento"
              dica="encerrada_em menos primeira_resposta_em. População: conversas que tiveram 1ª resposta. A contagem das excluídas é obrigatória ao lado: métrica que esconde o próprio denominador não entra neste produto."
              denominador={denominador(hoje.tempoDeAtendimento)}
            />
          </div>
        </div>

        <div className="card">
          <h3>Status dos tickets hoje</h3>
          <div className="statuses">
            <Status valor={numero(hoje.encerramentos.perdida)} rotulo="Perdidos" estado="erro" />
            <Status
              valor={numero(hoje.encerramentos.abandonada)}
              rotulo="Abandonados"
              estado="alerta"
            />
            <Status
              valor={numero(hoje.encerramentos.finalizada)}
              rotulo="Finalizados"
              estado="sucesso"
            />
            <Status valor={numero(hoje.encerramentos.fechada)} rotulo="Fechados" estado="neutro" />
          </div>
          <div className="note">
            Perdido saiu <b>antes</b> da atribuição, e é capacidade ou fila. Abandonado saiu{' '}
            <b>depois</b>, e é atendimento. Fechados é a soma dos três.
          </div>
        </div>
      </div>

      <FiltrosDaLista atendentes={m.listaAtendentes} atual={params} />

      <MonitoramentoDetalhado
        monitoramento={m}
        aba={params.aba ?? 'atribuido'}
        busca={params.busca ?? ''}
        filtro={params}
      />

      <CargaPorAtendente carga={m.carga} />
    </>
  );
}
