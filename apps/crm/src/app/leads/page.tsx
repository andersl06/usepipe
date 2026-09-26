import Link from 'next/link';
import { Campo, Seletor } from '@pipe/ui';
import { Filter } from '../../components/filters';
import { ListaDeLeads } from '../../components/lista-de-leads';
import { ViewsSalvas } from '../../components/views-salvas';
import { fusoDoTenant } from '../../lib/database';
import {
  ABAS,
  abaValida,
  GROUPINGS,
  groupingValid,
  agrupar,
  carregarListaDeLeads,
  directionValid,
  escreverFilters,
  readFilters,
  LIMITE_LISTA,
  listarProprietarios,
  filterOptions,
  orderValid,
  type SFilter,
} from '../../lib/leads';
import { numero } from '../../lib/format';

export const dynamic = 'force-dynamic';

interface Search {
  aba?: string;
  q?: string;
  groupBy?: string;
  order?: string;
  dir?: string;
  /** Os `f.*` do filtro por coluna. `lerFiltros` decide quais valem. */
  [key: string]: string | string[] | undefined;
}

/**
 * A listagem de leads.
 *
 * A tela é servidor: o recorte, a busca e a ordenação vivem na URL e viram
 * `where` e `order by`. Só o que exige o navegador (largura de coluna, seleção,
 * visão salva) desce para o cliente, e desce em componente separado.
 *
 * A ordenação NÃO acontece sobre as linhas já buscadas. A lista tem teto de 200,
 * e ordenar depois de buscar responderia "os 200 leads mais novos, dispostos por
 * score" quando a pergunta é "os 200 de maior score".
 */
export default async function PageLeads({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const aba = abaValida(typeof params.aba === 'string' ? params.aba : undefined);
  const search = typeof params.q === 'string' ? params.q : '';
  const by = groupingValid(typeof params.groupBy === 'string' ? params.groupBy : undefined);
  const order = orderValid(typeof params.order === 'string' ? params.order : undefined);
  const direction = directionValid(typeof params.dir === 'string' ? params.dir : undefined);
  const filters = readFilters(params);

  const fuso = await fusoDoTenant();
  const { linhas, contagens } = await carregarListaDeLeads(aba, search, order, direction, filters);
  const proprietarios = await listarProprietarios();
  const options = await filterOptions();
  const groups = agrupar(linhas, by);

  const query = (extra: Record<string, string> = {}, withFilters: SFilter = filters) => {
    const p = new URLSearchParams({ aba, ...(search ? { q: search } : {}), ...extra });
    if (by !== 'nenhum' && !('groupBy' in extra)) p.set('groupBy', by);
    if (order !== 'nenhuma') {
      p.set('order', order);
      p.set('dir', direction);
    }
    // O filtro entra por último, e por isso a visão salva o guarda: `consulta()`
    // sem argumento é exatamente o endereço da tela como ela está agora.
    return escreverFilters(p, withFilters).toString();
  };

  return (
    <>
      <div className="p-cabecalho">
        <h2>Leads</h2>
        <span className="sub">
          Dias na fase na listagem. O lead que trava é o que custa dinheiro.
        </span>
      </div>

      <div className="tblwrap">
        <div className="tabs" role="tablist">
          {ABAS.map((a) => (
            <Link
              key={a.chave}
              href={`/leads?${query({ aba: a.chave })}`}
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
          {order !== 'nenhuma' ? (
            <>
              <input type="hidden" name="order" value={order} />
              <input type="hidden" name="dir" value={direction} />
            </>
          ) : null}
          {/* O filtro sobrevive ao envio da busca. Sem estes campos, digitar no
              campo de busca apagaria o filtro em silêncio — e o formulário GET
              só manda o que ele mesmo carrega. */}
          {Object.entries(filters).map(([key, value]) => (
            <input key={key} type="hidden" name={`f.${key}`} value={value} />
          ))}
          <Campo
            type="search"
            name="q"
            defaultValue={search}
            placeholder="Buscar por nome, CPF, telefone ou e-mail"
            aria-label="Buscar lead"
          />
          <label className="agrupador">
            Agrupar por
            <Seletor name="groupBy" defaultValue={by} aria-label="Agrupar por">
              {GROUPINGS.map((a) => (
                <option key={a.chave} value={a.chave}>
                  {a.rotulo}
                </option>
              ))}
            </Seletor>
          </label>
          <button type="submit" className="btn">
            Aplicar
          </button>
          <Filter
            filters={filters}
            options={options}
            href={(proximos) => `/leads?${query({}, proximos)}`}
          />
          <ViewsSalvas queryCurrent={query()} />
          {/* Atalho que ninguém descobre é atalho que ninguém usa: a régua fica
              escrita ao lado da contagem, na mesma linha, sem ocupar tela. */}
          <span className="sub" style={{ marginLeft: 'auto' }}>
            {numero(linhas.length)} leads
            {linhas.length === LIMITE_LISTA ? ` · teto de ${LIMITE_LISTA}` : ''} ·{' '}
            <kbd>/</kbd> busca, <kbd>j</kbd>/<kbd>k</kbd> anda, <kbd>Enter</kbd> abre
          </span>
        </form>

        <ListaDeLeads
          groups={groups}
          fuso={fuso}
          agora={new Date()}
          aba={aba}
          search={search}
          by={by}
          order={order}
          direction={direction}
          filters={filters}
          proprietarios={proprietarios}
          total={linhas.length}
        />
      </div>
    </>
  );
}
