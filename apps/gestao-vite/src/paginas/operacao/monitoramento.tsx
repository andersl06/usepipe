import { useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { Monitoramento } from '../../lib/monitoramento';
import { useLeitura } from '../../lib/consulta';
import { denominador, duracao, numero, uuidOuNada } from '../../lib/formato';
import { IconeGestao } from '../../componentes/icones-gestao';
import { FiltrosDaLista, FiltrosDaOperacao } from '../../componentes/filtros-rapidos';
import { Metrica } from '../../componentes/metrica';
import { MonitoramentoDetalhado } from '../../componentes/monitoramento-detalhado';

interface RespostaDoMonitoramento {
  fuso: string;
  janela: { inicio: string; fim: string };
  dados: Monitoramento;
}

interface Busca {
  fila?: string;
  atendente?: string;
  contato?: string;
  status?: string;
  aba?: string;
  busca?: string;
}

/**
 * O ícone "Atualizar tela" do cabeçalho da página — `bds-button icon="refresh"
 * variant="secondary"` com o glifo de 24 (`dom/monitoring.html`). Invalida a
 * leitura da `api` e a tela refaz a consulta.
 */
function BotaoAtualizar() {
  const fila = useQueryClient();
  return (
    <button
      type="button"
      className="iconbtn"
      title="Atualizar tela"
      aria-label="Atualizar tela"
      onClick={() => void fila.invalidateQueries({ queryKey: ['api'] })}
    >
      <IconeGestao nome="atualizar" tamanho={24} />
    </button>
  );
}

/**
 * O cartão de métrica deles: `bds-paper pa4 bg-surface-1` com o título
 * `fs-14 semi-bold` e NADA MAIS no topo — os ícones de atualizar/expandir
 * moram só no cabeçalho da página (nenhum `bds-button` dentro dos quatro
 * `bds-paper` em `dom/monitoring.html`; a ficha dizia o contrário, o DOM não).
 */
function CartaoMetrica({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="card">
      <div className="card-cabecalho">
        <h3>{titulo}</h3>
      </div>
      {children}
    </div>
  );
}

/**
 * Recarrega a leitura a cada 30 segundos, em silêncio. Não é um controle da
 * tela deles — é o ponto de extensão do realtime, registrado desde a entrega
 * anterior — então não ganha ícone nem texto próprio: só mantém o painel
 * fresco enquanto o supervisor olha.
 */
function useRecargaSilenciosa(segundos: number) {
  const fila = useQueryClient();
  useEffect(() => {
    const id = setInterval(() => void fila.invalidateQueries({ queryKey: ['api'] }), segundos * 1000);
    return () => clearInterval(id);
  }, [fila, segundos]);
}

/**
 * "Expandir tela": o segundo ícone do cabeçalho, ao lado de "Atualizar tela"
 * (`bds-button icon="screen-full"`, `data-testid="fullscreen-change-to-enable"`).
 */
function BotaoExpandirPagina() {
  const [cheia, setCheia] = useState(false);
  useEffect(() => {
    const aoTrocar = () => setCheia(document.fullscreenElement !== null);
    document.addEventListener('fullscreenchange', aoTrocar);
    return () => document.removeEventListener('fullscreenchange', aoTrocar);
  }, []);
  function alternar() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen().catch(() => undefined);
  }
  return (
    <button
      type="button"
      className="iconbtn"
      title="Expandir tela"
      aria-label="Expandir tela"
      aria-pressed={cheia}
      onClick={alternar}
    >
      <IconeGestao nome="telaCheia" tamanho={24} />
    </button>
  );
}

/**
 * Monitoramento — a mesma disposição da tela deles, lida em
 * `docs/capturas/blip/dom/monitoring.html` (e confirmada na captura real,
 * `desk/desk-monitoria__pagina.html`): cabeçalho com "Atualizar tela" e
 * "Expandir tela", DUAS faixas "Filtros rápidos:" (a de cima só com "Filas";
 * a de baixo com "Atendentes", "Contato" e "Status do atendente"), grade de
 * cartões 62%/38% em duas linhas, e o cartão "Monitoramento detalhado" com
 * busca, abas, tabela e paginação.
 *
 * Cada cartão é título 14/600 e uma fila de colunas centradas: número 24/400,
 * rótulo 12/400 com o ícone de informação ao lado. "Atendimentos em tempo
 * real" divide as colunas em dois grupos, `w-30` (a fila) e `w-70` (o
 * atendimento), com o fio vertical entre eles. Os TEXTOS dos rótulos e das
 * dicas são os deles, literais.
 *
 * O que NÃO copiamos é a tinta. Eles pintam de azul os dois números que dizem
 * como está a operação agora; nós pintamos os mesmos dois de moss. "Perdidos"
 * e "Abandonados" saem na tinta de erro, como o `color-delete` deles.
 *
 * A fórmula de cada número (spec de métricas) e a população ("entre 6 na
 * fila") continuam existindo — dentro do balão do ícone de informação. Na
 * tela deles o cartão não tem terceira linha sob o rótulo, e a régua desta
 * rodada é a forma deles; a informação nossa não some, muda de lugar.
 */
export function PaginaMonitoramento() {
  const [busca] = useSearchParams();
  const crus = Object.fromEntries(busca.entries()) as Busca;
  /* O que veio da URL, já conferido: id que não é UUID vira "sem filtro" em vez
     de virar 500 no `::uuid` do Postgres. */
  const params: Busca = {
    ...crus,
    fila: uuidOuNada(crus.fila),
    atendente: uuidOuNada(crus.atendente),
  };
  const q = new URLSearchParams();
  if (params.fila) q.set('fila', params.fila);
  if (params.atendente) q.set('atendente', params.atendente);
  const leitura = useLeitura<RespostaDoMonitoramento>(`/v1/gestao/monitoramento?${q}`, {
    staleTime: 0,
  });
  useRecargaSilenciosa(30);

  if (!leitura.data) return null;
  const { dados: m } = leitura.data;
  const { tempoReal, atendentes, hoje } = m;

  return (
    <>
      <div className="board-head">
        <h2>Monitoramento</h2>
        <div className="filters">
          <BotaoAtualizar />
          <BotaoExpandirPagina />
        </div>
      </div>

      {/* A faixa "Filtros rápidos:", com o próprio botão "Filtros" no fim —
          é ali que ele mora nesta tela, não no cabeçalho. */}
      <FiltrosDaOperacao filas={m.filas} atual={params} />

      {/* ---------------------------------------------------- grade 2×2 */}
      <div className="mon">
        <CartaoMetrica titulo="Atendimentos em tempo real">
          <div className="metrics">
            <div className="metrics-grupo estreito">
              <Metrica
                destaque
                valor={numero(tempoReal.naFila)}
                rotulo="Na fila"
                dica="Número de atendimentos aguardando por um atendente"
                formula="Conversas abertas que ainda não foram atribuídas a nenhum atendente. Contagem deste instante, com o cronômetro correndo."
              />
              <Metrica
                valor={duracao(tempoReal.maiorEsperaNaFilaSeg)}
                rotulo="Tempo máximo na fila"
                dica="Tempo máximo que um atendimento ficou na fila"
                formula="A maior espera entre as conversas ainda não atribuídas: agora menos criada_em."
                denominador={`Entre ${numero(tempoReal.naFila)} na fila.`}
              />
            </div>
            <div className="metrics-grupo largo">
              <Metrica
                valor={duracao(tempoReal.maiorEsperaPrimeiraRespostaSeg)}
                rotulo="Tempo máximo até 1ª resposta"
                dica="Tempo máximo que um atendimento ficou sem resposta"
                formula="A maior espera entre as conversas já atribuídas e ainda sem resposta do atendente: agora menos atribuida_em."
                denominador={`Entre ${numero(tempoReal.aguardandoPrimeiraResposta)} aguardando.`}
              />
              <Metrica
                destaque
                valor={numero(tempoReal.emAtendimento)}
                rotulo="Em atendimento"
                dica="Número de atendimentos em andamento"
                formula="Conversas abertas com atendente atribuído, neste instante."
              />
              <Metrica
                valor={numero(tempoReal.mediaPorAtendente, 1)}
                rotulo="Média de tickets por atendente"
                dica="Número de atendimentos por atendente"
                formula="Conversas em atendimento divididas pelos atendentes online. Ponderada por volume, nunca média de médias."
                denominador={`${numero(tempoReal.emAtendimento)} ÷ ${numero(tempoReal.atendentesOnline)} online.`}
              />
            </div>
          </div>
        </CartaoMetrica>

        <CartaoMetrica titulo="Status dos atendentes">
          <div className="metrics">
            <Metrica
              valor={numero(atendentes.online)}
              rotulo="Online"
              dica="Número de atendentes online"
            />
            <Metrica
              valor={numero(atendentes.pausa)}
              rotulo="Pausa"
              dica="Número de atendentes em pausa"
              denominador={
                atendentes.pausasEstouradas > 0
                  ? `${numero(atendentes.pausasEstouradas)} pausa(s) acima da duração sugerida pelo motivo.`
                  : undefined
              }
            />
            <Metrica
              valor={numero(atendentes.invisivel)}
              rotulo="Invisível"
              dica="Número de atendentes invisíveis"
            />
          </div>
        </CartaoMetrica>

        <CartaoMetrica titulo="Atendimento hoje">
          <div className="metrics">
            <Metrica
              valor={duracao(hoje.esperaDoCliente.valor)}
              rotulo="Tempo médio de espera"
              dica="Tempo médio de espera para atendimento"
              formula="Espera total do cliente. Com resposta: primeira_resposta_em menos criada_em. Sem resposta: encerrada_em menos criada_em. População: todas as conversas encerradas no período."
              denominador={denominador(hoje.esperaDoCliente, 'sem início')}
            />
            <Metrica
              valor={duracao(hoje.tempoDeResposta.valor)}
              rotulo="Tempo médio de resposta"
              dica="Tempo médio de resposta para atendimento"
              formula="Média dos intervalos entre a mensagem do cliente e a próxima mensagem do atendente. População: conversas com pelo menos uma troca completa."
              denominador={`${numero(hoje.tempoDeResposta.conversasConsideradas)} com troca completa · ${numero(hoje.tempoDeResposta.populacao)} intervalos.`}
            />
            <Metrica
              valor={duracao(hoje.atePrimeiraResposta.valor)}
              rotulo="Tempo médio até 1ª resposta"
              dica="Tempo médio de primeira resposta para atendimento"
              formula="primeira_resposta_em menos atribuida_em. População: conversas que tiveram resposta do atendente."
              denominador={denominador(hoje.atePrimeiraResposta)}
            />
            <Metrica
              valor={duracao(hoje.tempoDeAtendimento.valor)}
              rotulo="Tempo médio de atendimento"
              dica="Tempo médio de atendimento"
              formula="encerrada_em menos primeira_resposta_em. População: conversas que tiveram 1ª resposta."
              denominador={denominador(hoje.tempoDeAtendimento)}
            />
          </div>
        </CartaoMetrica>

        <CartaoMetrica titulo="Status dos tickets hoje">
          <div className="metrics">
            <Metrica
              tom="erro"
              valor={numero(hoje.encerramentos.perdida)}
              rotulo="Perdidos"
              dica="Número de tickets que foram perdidos hoje"
              formula="Perdido saiu ANTES da atribuição, e é capacidade ou fila."
            />
            <Metrica
              tom="erro"
              valor={numero(hoje.encerramentos.abandonada)}
              rotulo="Abandonados"
              dica="Número de tickets fechados pelo cliente hoje"
              formula="Abandonado saiu DEPOIS da atribuição, e é atendimento."
            />
            <Metrica
              valor={numero(hoje.encerramentos.finalizada)}
              rotulo="Finalizados"
              dica="Número de tickets que foram atendidos hoje"
            />
            <Metrica
              valor={numero(hoje.encerramentos.fechada)}
              rotulo="Fechados"
              dica="Número de tickets que foram fechados hoje"
              formula="Fechados é a soma de perdidos, abandonados e finalizados."
            />
          </div>
        </CartaoMetrica>
      </div>

      <FiltrosDaLista atendentes={m.listaAtendentes} atual={params} />

      <MonitoramentoDetalhado
        monitoramento={m}
        aba={params.aba ?? 'atribuido'}
        busca={params.busca ?? ''}
        filtro={params}
      />
    </>
  );
}
