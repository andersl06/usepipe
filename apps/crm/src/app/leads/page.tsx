import Link from 'next/link';
import { fusoDoTenant } from '../../lib/banco';
import { ABAS, abaValida, contarAbas, listarLeads, LIMITE_LISTA } from '../../lib/leads';
import { classeDaFaixa, desde, numero } from '../../lib/formato';

export const dynamic = 'force-dynamic';

interface Busca {
  aba?: string;
  q?: string;
}

const ROTULO_STATUS: Record<string, string> = {
  novo: 'Novo',
  em_contato: 'Em contato',
  qualificado: 'Qualificado',
  convertido: 'Convertido',
  desqualificado: 'Desqualificado',
};

export default async function PaginaLeads({ searchParams }: { searchParams: Promise<Busca> }) {
  const params = await searchParams;
  const aba = abaValida(params.aba);
  const busca = params.q ?? '';

  const fuso = await fusoDoTenant();
  const contagens = await contarAbas();
  const linhas = await listarLeads(aba, busca);
  const agora = new Date();

  return (
    <>
      <div className="board-head">
        <h2>Leads</h2>
        <span className="sub">
          Dias na fase na própria listagem — o lead que trava é o que custa dinheiro.
        </span>
      </div>

      <div className="tblwrap">
        <div className="tblhead">
          <h3>Leads</h3>
          <form method="get" action="/leads">
            <input type="hidden" name="aba" value={aba} />
            <input
              type="search"
              name="q"
              defaultValue={busca}
              placeholder="Buscar por nome, CPF, telefone ou e-mail"
              aria-label="Buscar lead"
            />
          </form>
          <span className="lbl" style={{ marginLeft: 'auto' }}>
            {numero(linhas.length)} linhas
            {linhas.length === LIMITE_LISTA ? ` · teto de ${LIMITE_LISTA}` : ''}
          </span>
        </div>

        <div className="tabs">
          {ABAS.map((a) => (
            <Link
              key={a.chave}
              href={`/leads?aba=${a.chave}${busca ? `&q=${encodeURIComponent(busca)}` : ''}`}
              aria-current={a.chave === aba ? 'true' : undefined}
            >
              {a.rotulo} <span className="mono">{numero(contagens[a.chave])}</span>
            </Link>
          ))}
        </div>

        {linhas.length === 0 ? (
          <div className="vazio">Nenhum lead nesta aba.</div>
        ) : (
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>Lead</th>
                  <th>Origem</th>
                  <th>Score</th>
                  <th>Faixa</th>
                  <th>Fila</th>
                  <th>Proprietário</th>
                  <th>Fase</th>
                  <th>Dias na fase</th>
                  <th>Última atividade</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.id} className={(l.diasNaFase ?? 0) >= 7 ? 'grave' : undefined}>
                    <td className="who">
                      <Link href={`/leads/${l.id}`}>{l.nome}</Link>
                    </td>
                    <td>{l.origem ?? '—'}</td>
                    <td className="num">{l.score === null ? '—' : numero(l.score)}</td>
                    <td>
                      {l.faixa ? (
                        <span className={classeDaFaixa(l.score)}>{l.faixa.toUpperCase()}</span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>{l.fila ?? '—'}</td>
                    <td>{l.proprietario ?? '—'}</td>
                    <td>{l.fase ?? ROTULO_STATUS[l.status] ?? l.status}</td>
                    <td className="num">{l.diasNaFase === null ? '—' : numero(l.diasNaFase)}</td>
                    <td>
                      {l.ultimaAtividade
                        ? `${l.ultimaAtividadeTipo ?? 'atividade'} · ${desde(l.ultimaAtividade, fuso, agora)}`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
