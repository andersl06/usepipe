import Link from 'next/link';
import type { ReactNode } from 'react';
import { Campo, Etiqueta, Seletor, EstadoVazio } from '@pipe/ui';
import { fusoDoTenant } from '../../lib/banco';
import {
  ABAS,
  abaValida,
  AGRUPAMENTOS,
  agrupamentoValido,
  agrupar,
  carregarListaDeLeads,
  colunaDoAgrupamento,
  LIMITE_LISTA,
  ROTULO_STATUS,
  type Agrupamento,
  type LinhaLead,
} from '../../lib/leads';
import { desde, numero } from '../../lib/formato';

export const dynamic = 'force-dynamic';

interface Busca {
  aba?: string;
  q?: string;
  agrupar?: string;
}

interface ColunaLead {
  chave: string;
  rotulo: string;
  numerica?: boolean;
  celula: (l: LinhaLead, fuso: string, agora: Date) => ReactNode;
}

/**
 * As colunas da listagem, numa lista só — o cabeçalho e a linha saem da mesma
 * definição, então não há como uma existir sem a outra.
 *
 * Categoria vira etiqueta neutra: origem, faixa, fila e fase são o mesmo tipo
 * de coisa (um nome que classifica) e passam a ter a mesma forma, a do pacote.
 * Nenhuma delas recebe cor: categoria não é estado.
 *
 * Cor entra em duas células e em nenhuma outra — o lead parado há mais de sete
 * dias, que é o que custa dinheiro, e o lead desqualificado, que é o único
 * estado terminal. Antes a linha inteira do lead parado ficava ocre, o que
 * pintava um terço da tabela e fazia o sinal deixar de ser sinal.
 */
const COLUNAS: readonly ColunaLead[] = [
  {
    chave: 'lead',
    rotulo: 'Lead',
    celula: (l) => <Link href={`/leads/${l.id}`}>{l.nome}</Link>,
  },
  { chave: 'origem', rotulo: 'Origem', celula: (l) => (l.origem ? <Etiqueta>{l.origem}</Etiqueta> : '—') },
  {
    chave: 'score',
    rotulo: 'Score',
    numerica: true,
    celula: (l) => (l.score === null ? '—' : numero(l.score)),
  },
  { chave: 'faixa', rotulo: 'Faixa', celula: (l) => (l.faixa ? <Etiqueta>{l.faixa}</Etiqueta> : '—') },
  { chave: 'fila', rotulo: 'Fila', celula: (l) => (l.fila ? <Etiqueta>{l.fila}</Etiqueta> : '—') },
  { chave: 'proprietario', rotulo: 'Proprietário', celula: (l) => l.proprietario ?? '—' },
  {
    chave: 'fase',
    rotulo: 'Fase',
    celula: (l) =>
      l.status === 'desqualificado' ? (
        <Etiqueta tom="erro">{ROTULO_STATUS['desqualificado']}</Etiqueta>
      ) : l.fase ? (
        <Etiqueta>{l.fase}</Etiqueta>
      ) : (
        <Etiqueta>{ROTULO_STATUS[l.status] ?? l.status}</Etiqueta>
      ),
  },
  {
    chave: 'dias',
    rotulo: 'Dias na fase',
    numerica: true,
    celula: (l) =>
      l.diasNaFase === null ? (
        '—'
      ) : l.diasNaFase >= 7 && l.status !== 'desqualificado' ? (
        <Etiqueta tom="alerta">{numero(l.diasNaFase)}</Etiqueta>
      ) : (
        numero(l.diasNaFase)
      ),
  },
  {
    chave: 'atividade',
    rotulo: 'Última atividade',
    celula: (l, fuso, agora) =>
      l.ultimaAtividade
        ? `${l.ultimaAtividadeTipo ?? 'atividade'} · ${desde(l.ultimaAtividade, fuso, agora)}`
        : '—',
  },
];

/** A coluna que o agrupamento já diz sai da tabela. Ver `colunaDoAgrupamento`. */
function colunasVisiveis(por: Agrupamento): readonly ColunaLead[] {
  const redundante = colunaDoAgrupamento(por);
  return redundante ? COLUNAS.filter((c) => c.chave !== redundante) : COLUNAS;
}

export default async function PaginaLeads({ searchParams }: { searchParams: Promise<Busca> }) {
  const params = await searchParams;
  const aba = abaValida(params.aba);
  const busca = params.q ?? '';
  const por = agrupamentoValido(params.agrupar);

  const fuso = await fusoDoTenant();
  const { linhas, contagens } = await carregarListaDeLeads(aba, busca);
  const grupos = agrupar(linhas, por);
  const colunas = colunasVisiveis(por);
  const agora = new Date();

  const comFiltros = (extra: Record<string, string>) => {
    const p = new URLSearchParams({ aba, ...(busca ? { q: busca } : {}), ...extra });
    if (por !== 'nenhum' && !('agrupar' in extra)) p.set('agrupar', por);
    return `/leads?${p.toString()}`;
  };

  return (
    <>
      <div className="p-cabecalho">
        <h2>Leads</h2>
        <span className="sub">
          Dias na fase na listagem — o lead que trava é o que custa dinheiro.
        </span>
      </div>

      <div className="tblwrap">
        <div className="tabs" role="tablist">
          {ABAS.map((a) => (
            <Link
              key={a.chave}
              href={comFiltros({ aba: a.chave })}
              role="tab"
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
          <Campo
            type="search"
            name="q"
            defaultValue={busca}
            placeholder="Buscar por nome, CPF, telefone ou e-mail"
            aria-label="Buscar lead"
          />
          <label className="agrupador">
            Agrupar por
            <Seletor name="agrupar" defaultValue={por} aria-label="Agrupar por">
              {AGRUPAMENTOS.map((a) => (
                <option key={a.chave} value={a.chave}>
                  {a.rotulo}
                </option>
              ))}
            </Seletor>
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
          <EstadoVazio titulo="Nenhum lead nesta aba." ilustracao={busca ? 'busca' : 'vazio'}>
            {busca ? <span>Nenhum resultado para “{busca}”.</span> : null}
          </EstadoVazio>
        ) : (
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  {colunas.map((c) => (
                    <th key={c.chave}>{c.rotulo}</th>
                  ))}
                </tr>
              </thead>
              {grupos.map((grupo) => (
                <tbody key={grupo.titulo || 'todos'}>
                  {grupo.titulo ? (
                    <tr className="grupo">
                      <th colSpan={colunas.length} scope="colgroup">
                        {grupo.titulo} <span className="qt">{numero(grupo.linhas.length)}</span>
                      </th>
                    </tr>
                  ) : null}
                  {grupo.linhas.map((l) => (
                    <tr key={l.id}>
                      {colunas.map((c) => (
                        <td
                          key={c.chave}
                          className={c.numerica ? 'num' : c.chave === 'lead' ? 'who' : undefined}
                        >
                          {c.celula(l, fuso, agora)}
                        </td>
                      ))}
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
