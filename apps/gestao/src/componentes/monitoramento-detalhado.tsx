import Link from 'next/link';
import type { LinhaConversaAberta, Monitoramento } from '../lib/monitoramento';
import { duracao, numero } from '../lib/formato';

/**
 * Monitoramento detalhado: a tabela com abas do mockup.
 *
 * A aba vive na querystring, como o filtro — assim a recarga periódica não joga o
 * supervisor de volta para a primeira aba a cada 30 segundos.
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

type Filtro = { fila?: string; atendente?: string; busca?: string };

function comAba(filtro: Filtro, aba: string): string {
  const p = new URLSearchParams();
  if (filtro.fila) p.set('fila', filtro.fila);
  if (filtro.atendente) p.set('atendente', filtro.atendente);
  if (filtro.busca) p.set('busca', filtro.busca);
  p.set('aba', aba);
  return `/?${p.toString()}`;
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
 *
 * A caixa alta também saiu: o rótulo é conteúdo, não título de seção.
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

function Acoes() {
  return (
    <td className="acts">
      <button type="button" className="iconbtn" title="Abrir no Desk" disabled>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
        </svg>
      </button>
      <button type="button" className="iconbtn" title="Transferir" disabled>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 8h13m0 0-4-4m4 4-4 4M20 16H7m0 0 4-4m-4 4 4 4" />
        </svg>
      </button>
    </td>
  );
}

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
              <Acoes />
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
  const casa = (l: LinhaConversaAberta) =>
    termo === '' ||
    l.ticket.toLowerCase().includes(termo) ||
    l.contatoNome.toLowerCase().includes(termo);

  const atribuidas = monitoramento.abertas.filter((l) => l.atendenteId !== null).filter(casa);
  const aguardando = monitoramento.abertas.filter((l) => l.atendenteId === null).filter(casa);

  return (
    <div className="tblwrap">
      <div className="tblhead">
        <h3>Monitoramento detalhado</h3>
        <span className="lbl" style={{ marginLeft: 'auto' }}>
          {numero(monitoramento.abertas.length)} conversas abertas
        </span>
      </div>

      <div className="tabs" role="tablist">
        {ABAS.map((a) => (
          <Link
            key={a.chave}
            href={comAba(filtro, a.chave)}
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
                  <td className="who">
                    <i className="sw" style={{ background: e.cor ?? 'var(--sage)' }} /> {e.nome}
                  </td>
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
