import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Icone } from '@pipe/ui';
import type { Monitoramento } from '../../lib/monitoramento';
import { useLeitura } from '../../lib/consulta';
import { denominador, duracao, numero, uuidOuNada } from '../../lib/formato';
import { IconeGestao } from '../../componentes/icones-gestao';
import { Metrica, Status } from '../../componentes/metrica';
import { MonitoramentoDetalhado } from '../../componentes/monitoramento-detalhado';
import { CampoDoPainel, PainelFiltros } from '../../componentes/painel-filtros';

interface RespostaDoMonitoramento {
  fuso: string;
  janela: { inicio: string; fim: string };
  dados: Monitoramento;
}

interface Busca {
  fila?: string;
  atendente?: string;
  status?: string;
  aba?: string;
  busca?: string;
}

/**
 * As quatro opções do dropdown "Status do atendente" no painel de filtros,
 * literais de `FICHA-monitoring.md` §3.
 */
const ESTADOS_DE_ATENDENTE = [
  { id: 'online', nome: 'Online' },
  { id: 'pausa', nome: 'Em Pausa' },
  { id: 'invisivel', nome: 'Invisível' },
  { id: 'offline', nome: 'Offline' },
] as const;

/**
 * O ícone "Atualizar tela": aparece uma vez no cabeçalho da página e de novo
 * em cada um dos quatro cartões de métrica (`FICHA-monitoring.md` §2 e §5).
 * É sempre o mesmo botão — invalida a leitura da `api` e a tela refaz a
 * consulta.
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
      <IconeGestao nome="atualizar" tamanho={14} />
    </button>
  );
}

/**
 * O cartão de métrica com os dois ícones do canto deles: atualizar e
 * expandir. "Expandir tela" usa a `Fullscreen API` no PRÓPRIO cartão, não na
 * página inteira — é o cartão que vira o painel de parede, não a tela toda.
 */
function CartaoMetrica({ titulo, children }: { titulo: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [cheio, setCheio] = useState(false);

  useEffect(() => {
    const aoTrocar = () => setCheio(document.fullscreenElement === ref.current);
    document.addEventListener('fullscreenchange', aoTrocar);
    return () => document.removeEventListener('fullscreenchange', aoTrocar);
  }, []);

  function expandir() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void ref.current?.requestFullscreen().catch(() => undefined);
  }

  return (
    <div className="card" ref={ref}>
      <div className="card-cabecalho">
        <h3>{titulo}</h3>
        <div className="card-acoes">
          <BotaoAtualizar />
          <button
            type="button"
            className="iconbtn"
            title="Expandir tela"
            aria-label="Expandir tela"
            aria-pressed={cheio}
            onClick={expandir}
          >
            <IconeGestao nome="telaCheia" tamanho={14} />
          </button>
        </div>
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
 * Monitoramento — a mesma disposição da tela deles, medida em
 * `docs/capturas/blip/dom/FICHA-monitoring.md`: cabeçalho com "Atualizar
 * tela" e "Filtros", painel lateral de filtros fechado por padrão, grade 2×2
 * de cartões (largo à esquerda, estreito à direita, nas duas linhas) e o
 * cartão "Monitoramento detalhado" com busca, abas, tabela e paginação.
 *
 * O que NÃO copiamos é a tinta. Eles pintam de azul os dois números que dizem
 * como está a operação agora; nós pintamos os mesmos dois de moss. Os pontos
 * de status usam os nossos quatro token de estado, e nenhum azul entra.
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
  const [painelAberto, setPainelAberto] = useState(false);
  useRecargaSilenciosa(30);

  if (!leitura.data) return null;
  const { dados: m } = leitura.data;
  const { tempoReal, atendentes, hoje } = m;

  const algumFiltro = Boolean(params.fila || params.atendente || params.status);

  return (
    <>
      <div className="board-head">
        <h2>Monitoramento</h2>
        <div className="filters">
          <BotaoAtualizar />
          <button type="button" className="btn" onClick={() => setPainelAberto(true)}>
            <Icone nome="funil" tamanho={14} />
            Filtros
          </button>
        </div>
      </div>

      <PainelFiltros
        aberto={painelAberto}
        aoFechar={() => setPainelAberto(false)}
        acao="/monitoramento"
        limpar={algumFiltro ? '/monitoramento' : null}
      >
        {/* A aba e a busca do cartão de baixo não são campo do painel, mas
            precisam sobreviver ao "Aplicar" — senão aplicar um filtro jogava
            a tabela de volta para a primeira aba. */}
        <input type="hidden" name="aba" value={params.aba ?? 'atribuido'} />
        {params.busca ? <input type="hidden" name="busca" value={params.busca} /> : null}

        <CampoDoPainel rotulo="Filas" apoio="Selecione uma ou mais filas">
          <select name="fila" defaultValue={params.fila ?? ''} aria-label="Filas">
            <option value="">Selecione as filas</option>
            {m.filas.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </select>
        </CampoDoPainel>

        <CampoDoPainel rotulo="Atendentes" apoio="Selecione um ou mais atendentes">
          <select name="atendente" defaultValue={params.atendente ?? ''} aria-label="Atendentes">
            <option value="">Selecione os atendentes</option>
            {m.listaAtendentes.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome}
              </option>
            ))}
          </select>
        </CampoDoPainel>

        <CampoDoPainel rotulo="Status do atendente" apoio="Selecione um status">
          <select name="status" defaultValue={params.status ?? ''} aria-label="Status do atendente">
            <option value="">Selecione o status</option>
            {ESTADOS_DE_ATENDENTE.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nome}
              </option>
            ))}
          </select>
        </CampoDoPainel>
      </PainelFiltros>

      {/* ---------------------------------------------------- grade 2×2 */}
      <div className="mon">
        <CartaoMetrica titulo="Atendimentos em tempo real">
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
        </CartaoMetrica>

        <CartaoMetrica titulo="Status dos atendentes">
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
        </CartaoMetrica>

        <CartaoMetrica titulo="Atendimento hoje">
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
        </CartaoMetrica>

        <CartaoMetrica titulo="Status dos tickets hoje">
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
        </CartaoMetrica>
      </div>

      <MonitoramentoDetalhado
        monitoramento={m}
        aba={params.aba ?? 'atribuido'}
        busca={params.busca ?? ''}
        filtro={params}
      />
    </>
  );
}
