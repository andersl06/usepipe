import Link from 'next/link';
import { Icone } from '@pipe/ui';
import { ROTULOS_PRIORIDADE, type NivelPrioridade } from '@pipe/core/conversa';
import {
  ordenarFilaDeEspera,
  type LinhaConversaAberta,
  type Monitoramento,
} from '../lib/monitoramento';
import { duracao, numero } from '../lib/formato';
import { IconeGestao } from './icones-gestao';

/**
 * Monitoramento detalhado: o cartão do fim da tela deles.
 *
 * Disposição copiada: o título à esquerda e o CAMPO DE BUSCA à direita, dentro
 * do cartão; abaixo as abas; abaixo a tabela, com a coluna de Ações no fim.
 *
 * A aba e a busca vivem na querystring, como o filtro — assim a recarga
 * periódica não joga o supervisor de volta para a primeira aba nem apaga o que
 * ele digitou a cada 30 segundos.
 *
 * Severidade colore a linha inteira, não só o texto: a lição do `blip-dash`
 * registrada no §3 do desenho.
 */

/*
 * Os rótulos das abas são os DELES, literais, lidos no pacote do módulo de
 * Atendimento (`blip-gestao-medidas.md` §8). A última é a exceção consciente:
 * lá ela se chama "Tags" e aqui se chama "Etiquetas", porque `etiqueta` é o
 * nome do componente e da coluna no nosso domínio inteiro — trocar só o rótulo
 * desta aba daria dois nomes para a mesma coisa, que é justamente a confusão
 * que manter o vocabulário deles evita.
 */
const ABAS = [
  { chave: 'atribuido', rotulo: 'Atribuído/Em andamento' },
  { chave: 'aguardando', rotulo: 'Aguardando atendimento' },
  { chave: 'atendentes', rotulo: 'Atendentes' },
  { chave: 'filas', rotulo: 'Filas' },
  { chave: 'etiquetas', rotulo: 'Etiquetas' },
] as const;

/** O app do atendente vive em outra origem; a ação da linha aponta para lá. */
const URL_DESK = process.env['NEXT_PUBLIC_PIPE_DESK_URL'] ?? 'http://localhost:3200';

type Filtro = {
  fila?: string;
  atendente?: string;
  contato?: string;
  status?: string;
  busca?: string;
};

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
 * O estado vazio deles, com o texto literal e o botão de redefinir. Título,
 * explicação e SAÍDA — as três partes. O nosso antigo tinha só a primeira
 * ("Nenhuma conversa nesta aba com os filtros atuais"), e deixava a pessoa
 * olhando para a tela sem dizer o que fazer a respeito.
 */
function SemDados({ aba }: { aba: string }) {
  return (
    <div className="vazio">
      <b>Nenhum dado encontrado</b>
      <p>
        Não encontramos dados com os filtros aplicados. Tente ajustar os filtros ou redefinir a
        busca para ver outros resultados.
      </p>
      <Link className="btn" href={`/?aba=${encodeURIComponent(aba)}`}>
        Redefinir filtros
      </Link>
    </div>
  );
}

/** O atalho para abrir a conversa no app do atendente, igual nas duas tabelas. */
function AcaoAbrir({ id }: { id: string }) {
  return (
    <td className="acts">
      <a
        className="iconbtn"
        href={`${URL_DESK}/?conversa=${encodeURIComponent(id)}`}
        target="_blank"
        rel="noreferrer"
        title="Abrir a conversa no Pipe Desk"
        aria-label="Abrir a conversa no Pipe Desk"
      >
        <IconeGestao nome="externo" tamanho={14} />
      </a>
    </td>
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
 * Atribuído / em andamento — na ordem de coluna deles: os dois tempos de
 * espera, depois quem é e onde está, e o tempo de atendimento no fim, junto do
 * ticket.
 *
 * **O indicador de SLA mora DENTRO da coluna de atendimento**, e não numa
 * coluna própria. É onde ele fica na tela deles, e faz sentido: SLA é um juízo
 * sobre aquele tempo, não um dado ao lado dele.
 */
function TabelaAtribuidas({ linhas }: { linhas: readonly LinhaConversaAberta[] }) {
  if (linhas.length === 0) return <SemDados aba="atribuido" />;
  return (
    <div className="scroll">
      <table>
        <thead>
          <tr>
            <th>Tempo na fila</th>
            <th>Tempo de 1ª resposta</th>
            <th>Contato</th>
            <th>Fila</th>
            <th>Atendente</th>
            <th>Tempo de atendimento</th>
            <th>Ticket</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.id} className={classeDaLinha(l)}>
              <td className="num">
                {duracao(l.naFilaSeg)}
                {l.filaCorrendo ? ' ⟳' : ''}
              </td>
              <td className="num">
                {duracao(l.primeiraRespostaSeg)}
                {l.primeiraRespostaCorrendo ? ' ⟳' : ''}
              </td>
              <td className="who">{l.contatoNome}</td>
              <td>{l.filaNome ?? '—'}</td>
              <td>{l.atendenteNome ?? '—'}</td>
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
              <td className="num">{l.ticket}</td>
              <AcaoAbrir id={l.id} />
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
    </div>
  );
}

/**
 * Aguardando atendimento — as cinco colunas deles: tempo na fila, contato,
 * fila, ticket e PRIORIDADE. Nada de atendente, porque por definição não há.
 */
function TabelaAguardando({ linhas }: { linhas: readonly LinhaConversaAberta[] }) {
  if (linhas.length === 0) return <SemDados aba="aguardando" />;
  return (
    <div className="scroll">
      <table>
        <thead>
          <tr>
            <th>Tempo na fila</th>
            <th>Contato</th>
            <th>Fila</th>
            <th>Ticket</th>
            <th>Prioridade</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.id} className={classeDaLinha(l)}>
              <td className="num">
                {duracao(l.naFilaSeg)}
                {l.filaCorrendo ? ' ⟳' : ''}
              </td>
              <td className="who">{l.contatoNome}</td>
              <td>{l.filaNome ?? '—'}</td>
              <td className="num">{l.ticket}</td>
              <td>
                <PillPrioridade nivel={l.prioridade} />
              </td>
              <AcaoAbrir id={l.id} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
  const termo = busca.trim().toLowerCase();
  const contato = (filtro.contato ?? '').trim().toLowerCase();

  /* Estado do atendente por id: `carga` já traz o estado de cada um, então o
     filtro "Status do atendente" da segunda faixa não custa consulta nova. */
  const estadoPorAtendente = new Map(monitoramento.carga.map((a) => [a.id, a.estado]));

  const casa = (l: LinhaConversaAberta) => {
    /* A busca do cartão é PELO NÚMERO DO TICKET, e só. Nome de contato tem
       campo próprio na faixa de filtros, e é lá que ele mora na tela deles —
       fazer a busca varrer os dois deixava dois caminhos para a mesma coisa e
       nenhum dos dois exato. */
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

  return (
    <div className="tblwrap">
      <div className="tblhead">
        <h3>Monitoramento detalhado</h3>
        <span className="qt">{numero(monitoramento.abertas.length)} conversas abertas</span>

        {/* A busca da Blip mora AQUI, dentro do cartão, e não na faixa de
            filtros. Ela procura pelo número do ticket. */}
        <form className="tbl-busca" method="get" action="/monitoramento">
          {[...querystring(filtro, aba)]
            .filter(([chave]) => chave !== 'busca')
            .map(([chave, valor]) => (
              <input key={chave} type="hidden" name={chave} value={valor} />
            ))}
          <Icone nome="busca" tamanho={14} />
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
            href={`/?${querystring(filtro, a.chave).toString()}`}
            aria-current={aba === a.chave ? 'true' : undefined}
          >
            {a.rotulo}
          </Link>
        ))}
      </div>

      {aba === 'aguardando' ? <TabelaAguardando linhas={aguardando} /> : null}
      {aba === 'atribuido' ? <TabelaAtribuidas linhas={atribuidas} /> : null}

      {aba === 'atendentes' ? (
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Atendente</th>
                <th>Status</th>
                <th>Ativas</th>
                <th>Aguardando o atendente</th>
                <th>Limite</th>
                <th>Carga ponderada</th>
              </tr>
            </thead>
            <tbody>
              {monitoramento.carga.map((a) => (
                <tr key={a.id}>
                  <td className="who">{a.nome}</td>
                  <td>
                    {/* Estado de atendente é informação, não alerta: o gestor age pelo número
                        de tickets ao lado, não pela cor da palavra. */}
                    <span className="etiqueta">{a.estado}</span>
                  </td>
                  <td className="num">{numero(a.ativas)}</td>
                  <td className="num">{numero(a.aguardandoAtendente)}</td>
                  <td className="num">{numero(a.limite)}</td>
                  <td className="num">{numero(a.carga)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {aba === 'filas' ? (
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Fila</th>
                <th>Tickets aguardando</th>
                <th>Tickets em atendimento</th>
                <th>Maior espera</th>
                <th>Atendentes online</th>
              </tr>
            </thead>
            <tbody>
              {monitoramento.filas.map((f) => (
                <tr
                  key={f.id}
                  className={f.atendentesOnline === 0 && f.naFila > 0 ? 'critico' : undefined}
                >
                  <td className="who">{f.nome}</td>
                  <td className="num">{numero(f.naFila)}</td>
                  <td className="num">{numero(f.emAtendimento)}</td>
                  <td className="num">{duracao(f.maiorEsperaSeg)}</td>
                  <td className="num">{numero(f.atendentesOnline)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {aba === 'etiquetas' ? (
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Etiqueta</th>
                <th>Conversas abertas</th>
              </tr>
            </thead>
            <tbody>
              {monitoramento.etiquetas.map((e) => (
                <tr key={e.id}>
                  {/* Sem o quadradinho colorido: a cor da etiqueta é escolha de
                      cadastro, e repetida por linha ela põe na tela tantos
                      matizes quantas etiquetas o tenant criou. O nome informa. */}
                  <td className="who">{e.nome}</td>
                  <td className="num">{numero(e.abertas)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
