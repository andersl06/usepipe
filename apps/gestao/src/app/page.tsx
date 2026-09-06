import { fusoDoTenant, janelaDeHoje } from '../lib/banco';
import { carregarMonitoramento } from '../lib/monitoramento';
import { denominador, duracao, numero } from '../lib/formato';
import { RecargaPeriodica } from '../componentes/recarga-periodica';
import { FiltrosRapidos } from '../componentes/filtros-rapidos';
import { MonitoramentoDetalhado } from '../componentes/monitoramento-detalhado';
import { CargaPorAtendente } from '../componentes/carga-por-atendente';

export const dynamic = 'force-dynamic';

interface Busca {
  fila?: string;
  atendente?: string;
  aba?: string;
  busca?: string;
}

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
          Hoje ·{' '}
          {janela.inicio.toLocaleDateString('pt-BR', { timeZone: fuso, dateStyle: 'long' })} ·{' '}
          {fuso}
        </span>
        <div className="filters">
          <RecargaPeriodica segundos={30} />
        </div>
      </div>

      <FiltrosRapidos filas={m.filas} atendentes={m.listaAtendentes} atual={params} />

      {/* ------------------------------------------------ bloco 1: AGORA */}
      <section className="bloco" aria-label="Agora">
        <header>
          <span className="lbl">Agora</span>
          <span className="quando">
            Conversas ainda abertas neste instante — o cronômetro está correndo.
          </span>
        </header>

        <div className="mon">
          <div className="card">
            <h3>Atendimentos em tempo real</h3>
            <div className="metrics">
              <div className="metric">
                <span className="v">{numero(tempoReal.naFila)}</span>
                <span className="k">Na fila</span>
              </div>
              <div className="metric">
                <span className="v">{duracao(tempoReal.maiorEsperaNaFilaSeg)}</span>
                <span className="k">Tempo máximo na fila</span>
              </div>
              <div className="metric">
                <span className="v">{duracao(tempoReal.maiorEsperaPrimeiraRespostaSeg)}</span>
                <span className="k">Máximo até 1ª resposta</span>
              </div>
              <div className="metric">
                <span className="v">{numero(tempoReal.emAtendimento)}</span>
                <span className="k">Em atendimento</span>
              </div>
              <div className="metric">
                <span className="v">{numero(tempoReal.mediaPorAtendente, 1)}</span>
                <span className="k">Média por atendente</span>
                <span className="den">
                  {numero(tempoReal.emAtendimento)} ÷ {numero(tempoReal.atendentesOnline)} online
                </span>
              </div>
            </div>
            <div className="note">
              Cronômetro correndo — conversas ainda abertas neste instante.
            </div>
          </div>

          <div className="card">
            <h3>Status dos atendentes</h3>
            {/*
              Os números voltaram ao neutro. Estar online é o normal, e moss em
              coisa que não pede ação é o que o dono leu como carrossel. Só a
              pausa acima do tempo pede ação, e ela já aparece na nota abaixo.
            */}
            <div className="statuses">
              <div>
                <b>{numero(atendentes.online)}</b>
                <span>Online</span>
              </div>
              <div>
                <b>{numero(atendentes.pausa)}</b>
                <span>Pausa</span>
              </div>
              <div>
                <b>{numero(atendentes.invisivel)}</b>
                <span>Invisível</span>
              </div>
            </div>
            <div className="note">
              {atendentes.pausasEstouradas > 0
                ? `${numero(atendentes.pausasEstouradas)} pausa(s) acima da duração sugerida pelo motivo.`
                : 'Nenhuma pausa acima da duração sugerida pelo motivo.'}
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ bloco 2: HOJE */}
      {/*
        Bloco secundário: o assunto desta tela é o tempo real, e "hoje" existe
        para dar contexto a ele. Quem desce de peso é o secundário — inflar o
        principal só aumentaria a tela inteira.
      */}
      <section className="bloco secundario" aria-label="Hoje">
        <header>
          <span className="lbl">Hoje</span>
          <span className="quando">
            Conversas encerradas dentro do período — o cronômetro parou. Toda média vem com o
            denominador.
          </span>
        </header>

        <div className="mon">
          <div className="card">
            <h3>Atendimento hoje</h3>
            <div className="metrics">
              <div className="metric">
                <span className="v">{duracao(hoje.esperaDoCliente.valor)}</span>
                <span className="k">Espera do cliente</span>
                <span className="den">{denominador(hoje.esperaDoCliente, 'sem início')}</span>
              </div>
              <div className="metric">
                <span className="v">{duracao(hoje.atePrimeiraResposta.valor)}</span>
                <span className="k">Até a 1ª resposta</span>
                <span className="den">{denominador(hoje.atePrimeiraResposta)}</span>
              </div>
              <div className="metric">
                <span className="v">{duracao(hoje.tempoDeAtendimento.valor)}</span>
                <span className="k">Tempo de atendimento</span>
                <span className="den">{denominador(hoje.tempoDeAtendimento)}</span>
              </div>
              <div className="metric">
                <span className="v">{duracao(hoje.tempoDeResposta.valor)}</span>
                <span className="k">Tempo de resposta</span>
                <span className="den">
                  {numero(hoje.tempoDeResposta.conversasConsideradas)} com troca completa ·{' '}
                  {numero(hoje.tempoDeResposta.populacao)} intervalos
                </span>
              </div>
            </div>
            <div className="note">
              Cronômetro parado — conversas encerradas dentro do período. O denominador ao lado de
              cada média é obrigatório: sem ele, o número melhora justamente quando o atendimento
              piora.
            </div>
          </div>

          <div className="card">
            <h3>Status dos tickets hoje</h3>
            {/*
              Quatro números, e antes quatro cores — terracota, ocre, moss e
              neutro lado a lado, o que é a definição de carrossel. Perdido e
              abandonado continuam sendo os dois que o supervisor caça, e é a
              etiqueta de estado que os marca; o número é número.
            */}
            <div className="statuses">
              <div>
                <b>{numero(hoje.encerramentos.perdida)}</b>
                <span>
                  <span className="etiqueta erro">Perdidos</span>
                </span>
              </div>
              <div>
                <b>{numero(hoje.encerramentos.abandonada)}</b>
                <span>
                  <span className="etiqueta alerta">Abandonados</span>
                </span>
              </div>
              <div>
                <b>{numero(hoje.encerramentos.finalizada)}</b>
                <span>Finalizados</span>
              </div>
              <div>
                <b>{numero(hoje.encerramentos.fechada)}</b>
                <span>Fechados</span>
              </div>
            </div>
            <div className="note">
              Perdido saiu <b>antes</b> de ser atribuído — problema de capacidade ou de fila.
              Abandonado saiu <b>depois</b> — problema de atendimento.
            </div>
          </div>
        </div>
      </section>

      <MonitoramentoDetalhado monitoramento={m} aba={params.aba ?? 'atribuido'} busca={params.busca ?? ''} filtro={params} />

      <CargaPorAtendente carga={m.carga} />
    </>
  );
}
