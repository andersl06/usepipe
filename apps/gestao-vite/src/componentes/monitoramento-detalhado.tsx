import { useState, type FormEvent, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Link from './link';
import { Icone } from '@pipe/ui';
import { ROTULOS_PRIORIDADE, type NivelPrioridade } from '@pipe/core/conversa';
import {
  ordenarFilaDeEspera,
  type LinhaConversaAberta,
  type Monitoramento,
} from '../lib/monitoramento';
import { duracao, numero } from '../lib/formato';
import { api } from '../lib/api';
import { IconeGestao } from './icones-gestao';
import { Paginacao, usePagina } from './paginacao';
import { Selecao } from './selecao';
import { useLeitura } from '../lib/consulta';
import { ModalFinalizarMonitoramento } from './modal-finalizar-monitoramento';

/**
 * Monitoramento detalhado: o cartão do fim da tela deles.
 *
 * Disposição copiada: o título à esquerda e o CAMPO DE BUSCA à direita, dentro
 * do cartão; abaixo as abas; abaixo a tabela, com a coluna de Ações no fim;
 * abaixo o rodapé de paginação — as cinco peças do cartão em
 * `FICHA-monitoring.md` §2.5.
 *
 * A aba e a busca vivem na querystring, como o filtro — assim a recarga
 * periódica não joga o supervisor de volta para a primeira aba nem apaga o que
 * ele digitou a cada 30 segundos. A PÁGINA da tabela é de cliente e não entra
 * na URL: a consulta já trouxe tudo numa transação só.
 *
 * Severidade colore a linha inteira, não só o texto: a lição do `blip-dash`
 * registrada no §3 do desenho.
 */

/*
 * Os rótulos das abas são os DELES, literais, lidos em `FICHA-monitoring.md`
 * §4. A quinta aba se chama "Tags" lá, e agora se chama "Tags" aqui também —
 * a chave interna continua `etiquetas`, que é o nome do domínio inteiro, mas o
 * TEXTO na tela é o texto deles: a régua desta entrega não admite "aproximado"
 * em rótulo visível.
 */
const ABAS = [
  { chave: 'atribuido', rotulo: 'Atribuído/Em andamento' },
  { chave: 'aguardando', rotulo: 'Aguardando atendimento' },
  { chave: 'atendentes', rotulo: 'Atendentes' },
  { chave: 'filas', rotulo: 'Filas' },
  { chave: 'etiquetas', rotulo: 'Tags' },
] as const;

type Filtro = {
  fila?: string;
  atendente?: string;
  contato?: string;
  status?: string;
  busca?: string;
};

type AcoesDoMonitoramento = Pick<Monitoramento, 'filas' | 'listaAtendentes' | 'etiquetas'>;

/** `transfer` da Blip é exclusivo desta coluna; fica local para não tocar nos ícones da barra lateral. */
function IconeTransferir() {
  return (
    <svg className="mon-icone-transferir" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 7h11M15 3l4 4l-4 4M17 17H6M9 13l-4 4l4 4" />
    </svg>
  );
}

function querystring(filtro: Filtro, aba: string): URLSearchParams {
  const p = new URLSearchParams();
  if (filtro.fila) p.set('fila', filtro.fila);
  if (filtro.atendente) p.set('atendente', filtro.atendente);
  if (filtro.contato) p.set('contato', filtro.contato);
  if (filtro.status) p.set('status', filtro.status);
  if (filtro.busca) p.set('busca', filtro.busca);
  p.set('aba', aba);
  return p;
}

/**
 * Severidade da linha, em três degraus e nesta ordem de precedência.
 *
 * O terceiro degrau é regra deles, e estava faltando: **a linha fica destacada
 * enquanto o contato aguarda a 1ª resposta do atendente**
 * (`blip-gestao-funcoes.md` §1). É o único destaque da tela que não vem de SLA,
 * e existe porque a espera pela primeira resposta é a que o cliente sente e a
 * que a régua de SLA às vezes ainda considera dentro do prazo.
 *
 * O SLA estourado ganha do resto porque já passou do prazo; o alerta e a espera
 * pela 1ª resposta dividem o mesmo degrau amarelo, e ter os dois na mesma cor é
 * de propósito — os dois pedem a mesma coisa do supervisor.
 */
function classeDaLinha(linha: LinhaConversaAberta): string | undefined {
  if (linha.sla.estado === 'estourado') return 'critico';
  if (linha.sla.estado === 'alerta') return 'grave';
  if (linha.primeiraRespostaCorrendo) return 'grave';
  return undefined;
}

/**
 * A prioridade nasce NEUTRA, como toda etiqueta de categoria. Só os dois
 * degraus de cima recebem tinta, porque só eles mudam o que o supervisor faz
 * agora; pintar os cinco níveis transformaria a coluna num carrossel e tiraria
 * o significado do vermelho no resto da tela.
 *
 * Máxima é erro e Alta é alerta — a distância entre as duas é o ponto de existir
 * um degrau acima de "alta". Os três de baixo, inclusive a ausência, ficam
 * neutros.
 *
 * O rótulo sai de `ROTULOS_PRIORIDADE`, e não de um mapa local: a régua tem um
 * dono só, que é quem também define a ordem da fila.
 */
function PillPrioridade({ nivel }: { nivel: string }) {
  const rotulo = ROTULOS_PRIORIDADE[nivel as NivelPrioridade] ?? nivel;
  const tinta = nivel === 'maxima' ? ' erro' : nivel === 'alta' ? ' alerta' : '';
  return <span className={`etiqueta${tinta}`}>{rotulo}</span>;
}

/**
 * O estado vazio deles, literal e de UMA linha: "Dados insuficientes",
 * centrado no corpo da tabela (`FICHA-monitoring.md` §6,
 * `desk-grid-tabled-paginated-empty-*`). Sem explicação e sem botão — o que
 * o nosso acrescentava era texto que a tela deles não tem.
 */
function SemDados() {
  return <div className="vazio-linha">Dados insuficientes</div>;
}

/** O atalho para abrir a conversa no app do atendente, igual nas duas tabelas. */
function AcoesDoTicket({
  linha,
  catalogos,
  aoAbrir,
}: {
  linha: LinhaConversaAberta;
  catalogos: AcoesDoMonitoramento;
  aoAbrir: (id: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [modal, setModal] = useState<'transferir' | 'finalizar' | null>(null);
  return (
    <td className="acts" onClick={(evento) => evento.stopPropagation()}>
      <div className="mon-acoes">
        <button
          type="button"
          className="iconbtn"
          title="Transferir"
          aria-label={`Transferir ticket ${linha.ticket}`}
          onClick={() => setModal('transferir')}
        >
          <IconeTransferir />
        </button>
        <button type="button" className="iconbtn" title="Falar com atendente" aria-label={`Falar com atendente do ticket ${linha.ticket}`} onClick={() => aoAbrir(linha.id)}>
          <Icone nome="balao" tamanho={24} />
        </button>
        <button
          type="button"
          className="iconbtn"
          title="Mais opções"
          aria-label={`Mais opções do ticket ${linha.ticket}`}
          aria-expanded={aberto}
          onClick={() => setAberto((valor) => !valor)}
        >
          <span className="mon-reticencias" aria-hidden="true">⋮</span>
        </button>
        {aberto ? (
          <div className="mon-menu-acoes" role="menu" aria-label={`Ações do ${linha.ticket}`}>
            <button type="button" role="menuitem" onClick={() => aoAbrir(linha.id)}>Abrir conversa</button>
            <button type="button" role="menuitem" className="perigo" onClick={() => { setAberto(false); setModal('finalizar'); }}>
              Finalizar
            </button>
          </div>
        ) : null}
      </div>
      {modal === 'transferir' ? (
        <ModalTransferirMonitoramento
          linha={linha}
          catalogos={catalogos}
          aoFechar={() => setModal(null)}
        />
      ) : null}
      {modal === 'finalizar' ? (
        <ModalFinalizarMonitoramento
          linha={linha}
          aoFechar={() => setModal(null)}
        />
      ) : null}
    </td>
  );
}

function ModalTransferirMonitoramento({
  linha,
  catalogos,
  aoFechar,
}: {
  linha: LinhaConversaAberta;
  catalogos: AcoesDoMonitoramento;
  aoFechar: () => void;
}) {
  const [alvo, setAlvo] = useState<'fila' | 'atendente'>('fila');
  const [destino, setDestino] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const consultas = useQueryClient();
  const opcoes = alvo === 'fila' ? catalogos.filas : catalogos.listaAtendentes;

  async function transferir() {
    if (!destino) return;
    setEnviando(true);
    setErro(null);
    try {
      await api.post(`/v1/gestao/monitoramento/conversas/${linha.id}/transferir`,
        alvo === 'fila' ? { para_fila_id: destino } : { para_atendente_id: destino },
      );
      await consultas.invalidateQueries({ queryKey: ['api'] });
      aoFechar();
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : 'Não foi possível transferir o ticket.');
      setEnviando(false);
    }
  }

  return (
    <ModalDoMonitoramento titulo={`Transferir atendimento do Ticket ${linha.ticket}`} aoFechar={aoFechar}>
      <div className="mon-radios">
        <label>
          <input type="radio" checked={alvo === 'fila'} onChange={() => { setAlvo('fila'); setDestino(''); }} />
          Fila
        </label>
        <label>
          <input type="radio" checked={alvo === 'atendente'} onChange={() => { setAlvo('atendente'); setDestino(''); }} />
          Atendente
        </label>
      </div>
      <label className="mon-campo">
        {alvo === 'fila' ? 'Fila' : 'Atendente'}
        <Selecao value={destino} onChange={(evento) => setDestino(evento.target.value)} aria-label={alvo === 'fila' ? 'Fila' : 'Atendente'}>
          <option value="">{alvo === 'fila' ? 'Selecionar fila' : 'Selecionar atendente'}</option>
          {opcoes.map((opcao) => (
            <option key={opcao.id} value={opcao.id}>{opcao.nome}</option>
          ))}
        </Selecao>
      </label>
      <p className="mon-modal-aviso">A transferência encerra este ticket e cria um novo no destino.</p>
      {erro ? <p className="mon-modal-erro">{erro}</p> : null}
      <div className="mon-modal-acoes">
        <button type="button" className="btn" onClick={aoFechar}>Cancelar</button>
        <button type="button" className="btn primary" disabled={!destino || enviando} onClick={() => void transferir()}>
          Transferir ticket
        </button>
      </div>
    </ModalDoMonitoramento>
  );
}

function ModalDoMonitoramento({
  titulo,
  children,
  aoFechar,
}: {
  titulo: string;
  children: ReactNode;
  aoFechar: () => void;
}) {
  return (
    <div className="mon-modal-fundo" role="presentation" onClick={aoFechar}>
      <section className="mon-modal" role="dialog" aria-modal="true" aria-label={titulo} onClick={(evento) => evento.stopPropagation()}>
        <h2>{titulo}</h2>
        {children}
      </section>
    </div>
  );
}

/**
 * A ação da linha de atendente: abre a aba "Atribuído/Em andamento" já
 * filtrada por ele. É a mesma coluna de Ações que a ficha lista para esta
 * aba — sem inventar dado novo, só reaproveitando o filtro que a tela já tem.
 */
function AcaoVerConversas({ filtro, atendenteId }: { filtro: Filtro; atendenteId: string }) {
  return (
    <td className="acts">
      <Link
        className="iconbtn"
        href={`?${querystring({ ...filtro, atendente: atendenteId }, 'atribuido').toString()}`}
        title="Ver as conversas deste atendente"
        aria-label="Ver as conversas deste atendente"
      >
        <IconeGestao nome="externo" tamanho={24} />
      </Link>
    </td>
  );
}

/**
 * As duas abas de conversa têm COLUNAS DIFERENTES, e isso é regra deles, não
 * economia nossa (`blip-gestao-funcoes.md` §1).
 *
 * Uma tabela só para as duas era a nossa divergência mais cara: na aba
 * "Aguardando atendimento" nenhum ticket tem atendente, então as colunas
 * Atendente, 1ª resposta e Atendimento saíam com travessão em TODA linha, e
 * três colunas mortas empurravam para fora da tela a única que importa ali —
 * a prioridade, que é o que decide quem sai da fila primeiro.
 *
 * A coluna de Ações é nossa em ambas, e vale nas duas: eles também deixam o
 * gestor abrir a conversa de um ticket que ainda está na fila.
 */

/**
 * Atribuído / em andamento — na ordem de coluna deles, `FICHA-monitoring.md`
 * §4: os dois tempos, depois o tempo de atendimento, o ticket, e só então quem
 * é e onde está.
 *
 * **O indicador de SLA mora DENTRO da coluna de atendimento**, e não numa
 * coluna própria. É onde ele fica na tela deles, e faz sentido: SLA é um juízo
 * sobre aquele tempo, não um dado ao lado dele.
 */
function TabelaAtribuidas({
  linhas,
  catalogos,
  aoAbrir,
}: {
  linhas: readonly LinhaConversaAberta[];
  catalogos: AcoesDoMonitoramento;
  aoAbrir: (id: string) => void;
}) {
  const pg = usePagina(linhas);
  if (linhas.length === 0) return <SemDados />;
  return (
    <div className="scroll">
      <table>
        <thead>
          <tr>
            <th>Tempo na fila</th>
            <th>Tempo de 1ª resposta</th>
            <th>Tempo de atendimento</th>
            <th>Ticket</th>
            <th>Contato</th>
            <th>Fila</th>
            <th>Atendente</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {pg.visiveis.map((l) => (
            <tr key={l.id} className={classeDaLinha(l)} onClick={() => aoAbrir(l.id)}>
              <td className="num">
                {duracao(l.naFilaSeg)}
                {l.filaCorrendo ? ' ⟳' : ''}
              </td>
              <td className="num">
                {duracao(l.primeiraRespostaSeg)}
                {l.primeiraRespostaCorrendo ? ' ⟳' : ''}
              </td>
              <td className="tempo-sla">
                {/* Enquanto não houve 1ª resposta não existe tempo de
                    atendimento para medir, e o vazio deles não é travessão: é
                    "Aguardando...". Travessão diz "não se aplica"; "Aguardando"
                    diz "o cronômetro ainda não começou", que é o caso. */}
                {l.atendimentoSeg === null ? (
                  <span className="g-vazio-espera">Aguardando...</span>
                ) : (
                  <span className="num">{duracao(l.atendimentoSeg)}</span>
                )}
                {l.emEspera ? (
                  <span className="etiqueta">Em espera</span>
                ) : (
                  <PillSlaView linha={l} />
                )}
              </td>
              <td className="num"><button type="button" className="mon-ticket" onClick={() => aoAbrir(l.id)}>{l.ticket}</button></td>
              <td className="who">{l.contatoNome}</td>
              <td>{l.filaNome ?? '—'}</td>
              <td>{l.atendenteNome ?? '—'}</td>
              <AcoesDoTicket linha={l} catalogos={catalogos} aoAbrir={aoAbrir} />
            </tr>
          ))}
        </tbody>
      </table>

      {/* A legenda do destaque amarelo, com a frase deles. Ela mora sob a
          tabela e existe porque a cor sozinha não diz o que significa. */}
      <p className="tbl-legenda">
        O destaque amarelo sinaliza que um ticket foi atribuído a um atendente, mas o contato ainda
        não recebeu a primeira resposta.
      </p>
      <Paginacao estado={pg} />
    </div>
  );
}

/**
 * Aguardando atendimento — as colunas deles, nesta ordem: tempo na fila,
 * PRIORIDADE, ticket, contato, fila. Nada de atendente, porque por definição
 * não há.
 */
function TabelaAguardando({
  linhas,
  catalogos,
  aoAbrir,
}: {
  linhas: readonly LinhaConversaAberta[];
  catalogos: AcoesDoMonitoramento;
  aoAbrir: (id: string) => void;
}) {
  const pg = usePagina(linhas);
  if (linhas.length === 0) return <SemDados />;
  return (
    <div className="scroll">
      <table>
        <thead>
          <tr>
            <th>Tempo na fila</th>
            <th>Prioridade</th>
            <th>Ticket</th>
            <th>Contato</th>
            <th>Fila</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {pg.visiveis.map((l) => (
            <tr key={l.id} className={classeDaLinha(l)} onClick={() => aoAbrir(l.id)}>
              <td className="num">
                {duracao(l.naFilaSeg)}
                {l.filaCorrendo ? ' ⟳' : ''}
              </td>
              <td>
                <PillPrioridade nivel={l.prioridade} />
              </td>
              <td className="num"><button type="button" className="mon-ticket" onClick={() => aoAbrir(l.id)}>{l.ticket}</button></td>
              <td className="who">{l.contatoNome}</td>
              <td>{l.filaNome ?? '—'}</td>
              <AcoesDoTicket linha={l} catalogos={catalogos} aoAbrir={aoAbrir} />
            </tr>
          ))}
        </tbody>
      </table>
      <Paginacao estado={pg} />
    </div>
  );
}

/**
 * Atendentes — as colunas da ficha. "Tempo médio de resposta" e "Tempo médio
 * de atendimento" saem travessão: a consulta de carga por atendente
 * (`CargaAtendente`) não traz média nenhuma, só contagem e limite. Inventar um
 * número ali seria pior do que o travessão — é a régua do trabalho: dado que a
 * API não tem fica vazio, honesto, e registrado no relato desta entrega.
 */
function TabelaAtendentes({
  atendentes,
  filtro,
}: {
  atendentes: Monitoramento['carga'];
  filtro: Filtro;
}) {
  const pg = usePagina(atendentes);
  if (atendentes.length === 0) return <SemDados />;
  return (
    <div className="scroll">
      <table>
        <thead>
          <tr>
            <th>Atendente</th>
            <th>Tickets em atendimento</th>
            <th>Tempo médio de resposta</th>
            <th>Tempo médio de atendimento</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {pg.visiveis.map((a) => (
            <tr key={a.id}>
              <td className="who">{a.nome}</td>
              <td className="num">{numero(a.ativas)}</td>
              <td className="num">{duracao(a.tempoMedioRespostaSeg)}</td>
              <td className="num">{duracao(a.tempoMedioAtendimentoSeg)}</td>
              <AcaoVerConversas filtro={filtro} atendenteId={a.id} />
            </tr>
          ))}
        </tbody>
      </table>
      <Paginacao estado={pg} />
    </div>
  );
}

/**
 * Filas — idem: "maior espera" que já tínhamos NÃO é "tempo médio de espera",
 * e as duas não são a mesma métrica — mostrar o máximo sob o rótulo de média
 * seria o número que inventa, não o número que falta. As três colunas de
 * média ficam honestamente vazias até a consulta trazer o dado certo.
 */
function TabelaFilas({ filas }: { filas: Monitoramento['filas'] }) {
  const pg = usePagina(filas);
  if (filas.length === 0) return <SemDados />;
  return (
    <div className="scroll">
      <table>
        <thead>
          <tr>
            <th>Fila</th>
            <th>Tickets aguardando</th>
            <th>Tickets em atendimento</th>
            <th>Tempo médio de espera</th>
            <th>Tempo médio de resposta</th>
            <th>Tempo médio de atendimento</th>
          </tr>
        </thead>
        <tbody>
          {pg.visiveis.map((f) => (
            <tr
              key={f.id}
              className={f.atendentesOnline === 0 && f.naFila > 0 ? 'critico' : undefined}
            >
              <td className="who">{f.nome}</td>
              <td className="num">{numero(f.naFila)}</td>
              <td className="num">{numero(f.emAtendimento)}</td>
              <td className="num">{duracao(f.tempoMedioNaFilaSeg)}</td>
              <td className="num">{duracao(f.tempoMedioRespostaSeg)}</td>
              <td className="num">{duracao(f.tempoMedioAtendimentoSeg)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Paginacao estado={pg} />
    </div>
  );
}

/**
 * Tags — a ficha pede "Tickets finalizados", e o que a consulta de etiquetas
 * traz é `abertas` (conversas ABERTAS com a tag), uma métrica diferente. Trocar
 * o rótulo para caber no dado que já temos seria a mesma mentira ao contrário;
 * o travessão fica até existir uma consulta de encerradas por etiqueta.
 */
function TabelaTags({ etiquetas }: { etiquetas: Monitoramento['etiquetas'] }) {
  const pg = usePagina(etiquetas);
  if (etiquetas.length === 0) return <SemDados />;
  return (
    <div className="scroll">
      <table>
        <thead>
          <tr>
            <th>Tag</th>
            <th>Tickets finalizados</th>
            <th>Tempo médio de atendimento</th>
          </tr>
        </thead>
        <tbody>
          {pg.visiveis.map((e) => (
            <tr key={e.id}>
              <td className="who">{e.nome}</td>
              <td className="num">{numero(e.finalizadas)}</td>
              <td className="num">{duracao(e.tempoMedioAtendimentoSeg)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Paginacao estado={pg} />
    </div>
  );
}

/**
 * Etiqueta de SLA. Só os dois estados que pedem ação recebem cor: estourado é
 * erro, alerta é alerta. Sem regra e cumprido são neutros, porque não há o que
 * fazer a respeito deles — e pintar o que está normal foi o que tirou o
 * significado da cor na tela inteira.
 */
function PillSlaView({ linha }: { linha: LinhaConversaAberta }) {
  const { estado, rotulo, excedidoSeg } = linha.sla;
  if (estado === 'sem_regra') return <span className="etiqueta">Sem regra</span>;
  if (estado === 'estourado') {
    return <span className="etiqueta erro">{`${rotulo} ${duracao(excedidoSeg)}`}</span>;
  }
  if (estado === 'alerta') return <span className="etiqueta alerta">{rotulo}</span>;
  return <span className="etiqueta">{rotulo}</span>;
}

type Previa = {
  id: string;
  ticket: string;
  contatoNome: string;
  filaNome: string | null;
  atendenteNome: string | null;
  itens: { id: string; em: string; tipo: 'mensagem' | 'nota'; direcao?: string; texto: string; autor?: string | null }[];
};

function PreviaDaConversa({ id, aoFechar }: { id: string; aoFechar: () => void }) {
  const leitura = useLeitura<Previa>(`/v1/gestao/monitoramento/conversas/${id}`);
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const consultas = useQueryClient();

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (!texto.trim() || enviando) return;
    setEnviando(true);
    setErro(null);
    try {
      await api.post(`/v1/gestao/monitoramento/conversas/${id}/notas`, { texto });
      setTexto('');
      await consultas.invalidateQueries({ queryKey: ['api', `/v1/gestao/monitoramento/conversas/${id}`] });
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : 'Não foi possível falar com o atendente.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <div className="mon-previa-fundo" onClick={aoFechar} />
      <aside className="mon-previa" role="dialog" aria-modal="true" aria-label="Conversa">
        <header>
          <div>
            <h3>{leitura.data ? `Ticket ${leitura.data.ticket}` : 'Conversa'}</h3>
            {leitura.data ? <p>{leitura.data.contatoNome}{leitura.data.atendenteNome ? ` · ${leitura.data.atendenteNome}` : ''}</p> : null}
          </div>
          <button type="button" className="iconbtn" aria-label="Fechar conversa" onClick={aoFechar}><Icone nome="x" tamanho={16} /></button>
        </header>
        <div className="mon-previa-historico" aria-live="polite">
          {leitura.isLoading ? <p>Carregando conversa…</p> : null}
          {leitura.isError ? <p>Não foi possível carregar a conversa.</p> : null}
          {leitura.data?.itens.map((item) => (
            item.tipo === 'nota' ? <p key={item.id} className="mon-previa-nota"><b>{item.autor ?? 'Nota interna'}</b>{item.texto}</p> :
            <div key={item.id} className={item.direcao === 'entrada' ? 'mon-balao entrada' : 'mon-balao saida'}>
              <p>{item.texto || 'Conteúdo sem texto'}</p><small>{item.autor ?? ''}</small>
            </div>
          ))}
        </div>
        <form className="mon-previa-compositor" onSubmit={enviar}>
          <label htmlFor="mensagem-atendente">Falar com atendente</label>
          <textarea id="mensagem-atendente" value={texto} onChange={(evento) => setTexto(evento.target.value)} placeholder="Escreva uma mensagem..." rows={3} />
          {erro ? <p className="mon-modal-erro">{erro}</p> : null}
          <button type="submit" className="btn primary" disabled={!texto.trim() || enviando}>Enviar</button>
        </form>
      </aside>
    </>
  );
}

export function MonitoramentoDetalhado({
  monitoramento,
  aba,
  busca,
  filtro,
}: {
  monitoramento: Monitoramento;
  aba: string;
  busca: string;
  filtro: Filtro;
}) {
  const [conversaAberta, setConversaAberta] = useState<string | null>(null);
  const termo = busca.trim().toLowerCase();
  const contato = (filtro.contato ?? '').trim().toLowerCase();

  /* Estado do atendente por id: `carga` já traz o estado de cada um, então o
     filtro "Status do atendente" do painel não custa consulta nova. */
  const estadoPorAtendente = new Map(monitoramento.carga.map((a) => [a.id, a.estado]));

  const casa = (l: LinhaConversaAberta) => {
    /* A busca do cartão é PELO NÚMERO DO TICKET, e só — é onde ela mora na
       tela deles. "Contato" tem campo próprio na faixa de filtros. */
    if (termo && !l.ticket.toLowerCase().includes(termo)) return false;
    if (contato && !l.contatoNome.toLowerCase().includes(contato)) return false;
    if (filtro.status) {
      const estado = l.atendenteId ? estadoPorAtendente.get(l.atendenteId) : undefined;
      if (estado !== filtro.status) return false;
    }
    return true;
  };

  const atribuidas = monitoramento.abertas.filter((l) => l.atendenteId !== null).filter(casa);
  /* A fila de espera sai ORDENADA POR PRIORIDADE; a lista de atribuídas fica na
     ordem de criação que a consulta já devolve. Ver `ordenarFilaDeEspera`. */
  const aguardando = ordenarFilaDeEspera(
    monitoramento.abertas.filter((l) => l.atendenteId === null).filter(casa),
  );
  const catalogosDeAcoes: AcoesDoMonitoramento = {
    filas: monitoramento.filas,
    listaAtendentes: monitoramento.listaAtendentes,
    etiquetas: monitoramento.etiquetas,
  };

  return (
    <div className="tblwrap">
      <div className="tblhead">
        <h3>Monitoramento detalhado</h3>

        {/* A busca da Blip mora AQUI, dentro do cartão, e não na faixa de
            filtros. Ela procura pelo número do ticket. */}
        <form className="tbl-busca" method="get">
          {[...querystring(filtro, aba)]
            .filter(([chave]) => chave !== 'busca')
            .map(([chave, valor]) => (
              <input key={chave} type="hidden" name={chave} value={valor} />
            ))}
          <Icone nome="busca" tamanho={20} />
          <input
            type="search"
            name="busca"
            defaultValue={busca}
            placeholder="Buscar pelo Nº do ticket"
            aria-label="Buscar pelo Nº do ticket"
          />
        </form>
      </div>

      <div className="tabs" role="tablist">
        {ABAS.map((a) => (
          <Link
            key={a.chave}
            href={`?${querystring(filtro, a.chave).toString()}`}
            aria-current={aba === a.chave ? 'true' : undefined}
          >
            {a.rotulo}
          </Link>
        ))}
      </div>

      {aba === 'aguardando' ? <TabelaAguardando linhas={aguardando} catalogos={catalogosDeAcoes} aoAbrir={setConversaAberta} /> : null}
      {aba === 'atribuido' ? <TabelaAtribuidas linhas={atribuidas} catalogos={catalogosDeAcoes} aoAbrir={setConversaAberta} /> : null}
      {aba === 'atendentes' ? (
        <TabelaAtendentes atendentes={monitoramento.carga} filtro={filtro} />
      ) : null}
      {aba === 'filas' ? <TabelaFilas filas={monitoramento.filas} /> : null}
      {aba === 'etiquetas' ? <TabelaTags etiquetas={monitoramento.etiquetas} /> : null}
      {conversaAberta ? <PreviaDaConversa id={conversaAberta} aoFechar={() => setConversaAberta(null)} /> : null}
    </div>
  );
}
