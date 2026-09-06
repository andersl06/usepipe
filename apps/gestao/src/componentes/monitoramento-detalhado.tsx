import Link from 'next/link';
import { Icone } from '@pipe/ui';
import type { LinhaConversaAberta, Monitoramento } from '../lib/monitoramento';
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

const ABAS = [
  { chave: 'atribuido', rotulo: 'Atribuído / em andamento' },
  { chave: 'aguardando', rotulo: 'Aguardando atendimento' },
  { chave: 'atendentes', rotulo: 'Atendentes' },
  { chave: 'filas', rotulo: 'Filas' },
  { chave: 'etiquetas', rotulo: 'Etiquetas' },
] as const;

/** O app do atendente vive em outra origem; a ação da linha aponta para lá. */
const URL_DESK = process.env['NEXT_PUBLIC_PIPE_DESK_URL'] ?? 'http://localhost:3200';

type Filtro = { fila?: string; atendente?: string; contato?: string; status?: string; busca?: string };

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

function classeDaLinha(linha: LinhaConversaAberta): string | undefined {
  if (linha.sla.estado === 'estourado') return 'critico';
  if (linha.sla.estado === 'alerta') return 'grave';
  return undefined;
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
 * A coluna de Ações voltou, e voltou com uma ação que FUNCIONA: abrir a
 * conversa no Pipe Desk, que é `?conversa=<id>` na outra origem. Ela tinha
 * saído porque os dois botões de antes estavam desabilitados em toda linha, e
 * item que não funciona não aparece. Transferir entra aqui quando abrir.
 */
function TabelaConversas({ linhas }: { linhas: readonly LinhaConversaAberta[] }) {
  if (linhas.length === 0) {
    return <div className="vazio">Nenhuma conversa nesta aba com os filtros atuais.</div>;
  }
  return (
    <div className="scroll">
      <table>
        <thead>
          <tr>
            <th>Na fila</th>
            <th>1ª resposta</th>
            <th>Atendimento</th>
            <th>Ticket</th>
            <th>Contato</th>
            <th>Fila</th>
            <th>Atendente</th>
            <th>SLA</th>
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
              <td className="num">{duracao(l.atendimentoSeg)}</td>
              <td className="num">{l.ticket}</td>
              <td className="who">{l.contatoNome}</td>
              <td>{l.filaNome ?? '—'}</td>
              <td>{l.atendenteNome ?? '—'}</td>
              <td>
                {l.emEspera ? <span className="etiqueta">Em espera</span> : <PillSlaView linha={l} />}
              </td>
              <td className="acts">
                <a
                  className="iconbtn"
                  href={`${URL_DESK}/?conversa=${encodeURIComponent(l.id)}`}
                  target="_blank"
                  rel="noreferrer"
                  title="Abrir a conversa no Pipe Desk"
                  aria-label="Abrir a conversa no Pipe Desk"
                >
                  <IconeGestao nome="externo" tamanho={14} />
                </a>
              </td>
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
    if (termo && !l.ticket.toLowerCase().includes(termo) && !l.contatoNome.toLowerCase().includes(termo)) {
      return false;
    }
    if (contato && !l.contatoNome.toLowerCase().includes(contato)) return false;
    if (filtro.status) {
      const estado = l.atendenteId ? estadoPorAtendente.get(l.atendenteId) : undefined;
      if (estado !== filtro.status) return false;
    }
    return true;
  };

  const atribuidas = monitoramento.abertas.filter((l) => l.atendenteId !== null).filter(casa);
  const aguardando = monitoramento.abertas.filter((l) => l.atendenteId === null).filter(casa);

  return (
    <div className="tblwrap">
      <div className="tblhead">
        <h3>Monitoramento detalhado</h3>
        <span className="qt">{numero(monitoramento.abertas.length)} conversas abertas</span>

        {/* A busca da Blip mora AQUI, dentro do cartão, e não na faixa de
            filtros. Ela varre ticket e contato da tabela. */}
        <form className="tbl-busca" method="get" action="/">
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
            placeholder="Buscar ticket ou contato"
            aria-label="Buscar ticket ou contato"
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

      {aba === 'aguardando' ? <TabelaConversas linhas={aguardando} /> : null}
      {aba === 'atribuido' ? <TabelaConversas linhas={atribuidas} /> : null}

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
                <th>Na fila</th>
                <th>Em atendimento</th>
                <th>Maior espera</th>
                <th>Atendentes online</th>
              </tr>
            </thead>
            <tbody>
              {monitoramento.filas.map((f) => (
                <tr key={f.id} className={f.atendentesOnline === 0 && f.naFila > 0 ? 'critico' : undefined}>
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
