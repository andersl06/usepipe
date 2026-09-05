import Link from 'next/link';
import { fusoDoTenant } from '../../lib/banco';
import {
  ABAS,
  abaValida,
  AGRUPAMENTOS,
  agrupamentoValido,
  agrupar,
  carregarListaDeLeads,
  LIMITE_LISTA,
} from '../../lib/leads';
import { classeDaFaixa, desde, numero } from '../../lib/formato';

export const dynamic = 'force-dynamic';

interface Busca {
  aba?: string;
  q?: string;
  agrupar?: string;
}

const ROTULO_STATUS: Record<string, string> = {
  novo: 'Novo',
  em_contato: 'Em contato',
  qualificado: 'Qualificado',
  convertido: 'Convertido',
  desqualificado: 'Desqualificado',
};

const COLUNAS = 9;

export default async function PaginaLeads({ searchParams }: { searchParams: Promise<Busca> }) {
  const params = await searchParams;
  const aba = abaValida(params.aba);
  const busca = params.q ?? '';
  const por = agrupamentoValido(params.agrupar);

  const fuso = await fusoDoTenant();
  const { linhas, contagens } = await carregarListaDeLeads(aba, busca);
  const grupos = agrupar(linhas, por);
  const agora = new Date();

  const comFiltros = (extra: Record<string, string>) => {
    const p = new URLSearchParams({ aba, ...(busca ? { q: busca } : {}), ...extra });
    if (por !== 'nenhum' && !('agrupar' in extra)) p.set('agrupar', por);
    return `/leads?${p.toString()}`;
  };

  return (
    <>
      <div className="board-head">
        <h2>Leads</h2>
        <span className="sub">Dias na fase na listagem — o lead que trava é o que custa dinheiro.</span>
      </div>

      <div className="tblwrap">
        <div className="tabs">
          {ABAS.map((a) => (
            <Link
              key={a.chave}
              href={comFiltros({ aba: a.chave })}
              aria-current={a.chave === aba ? 'true' : undefined}
            >
              {a.rotulo} <span className="qt">{numero(contagens[a.chave])}</span>
            </Link>
          ))}
        </div>

        {/*
          Agrupamento no lugar dos relatórios: "por proprietário" e "origem e campanha"
          eram item de menu e são a mesma lista dobrada por uma coluna.
        */}
        <form className="tblhead" method="get" action="/leads">
          <input type="hidden" name="aba" value={aba} />
          <input
            type="search"
            name="q"
            defaultValue={busca}
            placeholder="Buscar por nome, CPF, telefone ou e-mail"
            aria-label="Buscar lead"
          />
          <label className="campo">
            Agrupar por
            <select name="agrupar" defaultValue={por} aria-label="Agrupar por">
              {AGRUPAMENTOS.map((a) => (
                <option key={a.chave} value={a.chave}>
                  {a.rotulo}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="btn">
            Aplicar
          </button>
          <span className="sub" style={{ marginLeft: 'auto' }}>
            {numero(linhas.length)} leads
            {linhas.length === LIMITE_LISTA ? ` · teto de ${LIMITE_LISTA}` : ''}
          </span>
        </form>

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
              {grupos.map((grupo) => (
                <tbody key={grupo.titulo || 'todos'}>
                  {grupo.titulo ? (
                    <tr className="grupo">
                      <th colSpan={COLUNAS} scope="colgroup">
                        {grupo.titulo} <span className="qt">{numero(grupo.linhas.length)}</span>
                      </th>
                    </tr>
                  ) : null}
                  {grupo.linhas.map((l) => (
                    <tr key={l.id} className={(l.diasNaFase ?? 0) >= 7 ? 'grave' : undefined}>
                      <td className="who">
                        <Link href={`/leads/${l.id}`}>{l.nome}</Link>
                      </td>
                      <td>{l.origem ?? '—'}</td>
                      <td className="num">{l.score === null ? '—' : numero(l.score)}</td>
                      <td>
                        {l.faixa ? <span className={classeDaFaixa(l.score)}>{l.faixa}</span> : '—'}
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
              ))}
            </table>
          </div>
        )}
      </div>
    </>
  );
}
