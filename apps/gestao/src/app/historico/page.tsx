import { fusoDoTenant, janelaDeDatas, janelaDeHoje } from '../../lib/banco';
import { carregarCatalogos, carregarHistorico, LIMITE_HISTORICO } from '../../lib/historico';
import { dataHora, dataIso, duracao, numero } from '../../lib/formato';

export const dynamic = 'force-dynamic';

interface Busca {
  de?: string;
  ate?: string;
  fila?: string;
  atendente?: string;
  etiqueta?: string;
}

/**
 * Finalizada é o desfecho normal e fica neutra: era verde em cada linha da
 * lista, e o verde repetido deixa de significar. Perdida e abandonada seguem
 * coloridas, porque são as duas que o supervisor precisa caçar.
 */
const ROTULO_STATUS: Record<string, { texto: string; classe: string }> = {
  perdida: { texto: 'Perdida', classe: 'etiqueta erro' },
  abandonada: { texto: 'Abandonada', classe: 'etiqueta alerta' },
  finalizada: { texto: 'Finalizada', classe: 'etiqueta' },
};

export default async function PaginaHistorico({ searchParams }: { searchParams: Promise<Busca> }) {
  const params = await searchParams;
  const fuso = await fusoDoTenant();
  const hoje = await janelaDeHoje(fuso);

  // Padrão: os últimos sete dias, incluindo hoje.
  const ate = params.ate || dataIso(hoje.inicio, fuso);
  const de = params.de || dataIso(new Date(hoje.inicio.getTime() - 6 * 86400e3), fuso);

  const janela = await janelaDeDatas(fuso, de, ate);
  const catalogos = await carregarCatalogos();
  const { linhas, truncado } = await carregarHistorico(janela, {
    filaId: params.fila || undefined,
    atendenteId: params.atendente || undefined,
    etiquetaId: params.etiqueta || undefined,
  });

  return (
    <>
      <div className="board-head">
        <h2>Histórico</h2>
        <span className="sub">
          Conversas encerradas — o cronômetro parou. Status e tempos derivados dos eventos.
        </span>
      </div>

      <form className="quickfilters" method="get" action="/historico">
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

        <select
          name="etiqueta"
          defaultValue={params.etiqueta ?? ''}
          className="btn"
          aria-label="Etiqueta"
        >
          <option value="">Todas as etiquetas</option>
          {catalogos.etiquetas.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nome}
            </option>
          ))}
        </select>

        <button type="submit" className="btn primary">
          Aplicar
        </button>
        <a href="/historico" className="btn">
          Limpar
        </a>
      </form>

      <div className="tblwrap">
        <div className="tblhead">
          <h3>Conversas encerradas</h3>
          <span className="lbl" style={{ marginLeft: 'auto' }}>
            {numero(linhas.length)} linhas
            {truncado ? ` · mostrando as ${LIMITE_HISTORICO} mais recentes` : ''}
          </span>
        </div>

        {linhas.length === 0 ? (
          <div className="vazio">Nenhuma conversa encerrada com esses filtros.</div>
        ) : (
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>Encerrada</th>
                  <th>Ticket</th>
                  <th>Contato</th>
                  <th>Fila</th>
                  <th>Atendente</th>
                  <th>Espera do cliente</th>
                  <th>1ª resposta</th>
                  <th>Atendimento</th>
                  <th>Status</th>
                  <th>Etiquetas</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => {
                  const status = l.status ? ROTULO_STATUS[l.status] : undefined;
                  return (
                    <tr key={l.id} className={l.status === 'perdida' ? 'critico' : undefined}>
                      <td className="num">{dataHora(l.encerradaEm, fuso)}</td>
                      <td className="num">{l.ticket}</td>
                      <td className="who">{l.contatoNome}</td>
                      <td>{l.filaNome ?? '—'}</td>
                      <td>{l.atendenteNome ?? '—'}</td>
                      <td className="num">{duracao(l.esperaSeg)}</td>
                      <td className="num">{duracao(l.primeiraRespostaSeg)}</td>
                      <td className="num">{duracao(l.atendimentoSeg)}</td>
                      <td>
                        {status ? (
                          <span className={status.classe}>{status.texto}</span>
                        ) : (
                          <span className="etiqueta">Aberta</span>
                        )}
                      </td>
                      <td>{l.etiquetas.join(', ') || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
