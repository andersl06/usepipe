import Link from 'next/link';
import { Campo, Seletor } from '@pipe/ui';
import { Filtro } from '../../componentes/filtros';
import { ListaDeLeads } from '../../componentes/lista-de-leads';
import { VisoesSalvas } from '../../componentes/visoes-salvas';
import { fusoDoTenant } from '../../lib/banco';
import {
  ABAS,
  abaValida,
  AGRUPAMENTOS,
  agrupamentoValido,
  agrupar,
  carregarListaDeLeads,
  direcaoValida,
  escreverFiltros,
  lerFiltros,
  LIMITE_LISTA,
  listarProprietarios,
  opcoesDeFiltro,
  ordemValida,
  type Filtros,
} from '../../lib/leads';
import { numero } from '../../lib/formato';

export const dynamic = 'force-dynamic';

interface Busca {
  aba?: string;
  q?: string;
  agrupar?: string;
  ordem?: string;
  dir?: string;
  /** Os `f.*` do filtro por coluna. `lerFiltros` decide quais valem. */
  [chave: string]: string | string[] | undefined;
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
export default async function PaginaLeads({ searchParams }: { searchParams: Promise<Busca> }) {
  const params = await searchParams;
  const aba = abaValida(typeof params.aba === 'string' ? params.aba : undefined);
  const busca = typeof params.q === 'string' ? params.q : '';
  const por = agrupamentoValido(typeof params.agrupar === 'string' ? params.agrupar : undefined);
  const ordem = ordemValida(typeof params.ordem === 'string' ? params.ordem : undefined);
  const direcao = direcaoValida(typeof params.dir === 'string' ? params.dir : undefined);
  const filtros = lerFiltros(params);

  const fuso = await fusoDoTenant();
  const { linhas, contagens } = await carregarListaDeLeads(aba, busca, ordem, direcao, filtros);
  const proprietarios = await listarProprietarios();
  const opcoes = await opcoesDeFiltro();
  const grupos = agrupar(linhas, por);

  const consulta = (extra: Record<string, string> = {}, comFiltros: Filtros = filtros) => {
    const p = new URLSearchParams({ aba, ...(busca ? { q: busca } : {}), ...extra });
    if (por !== 'nenhum' && !('agrupar' in extra)) p.set('agrupar', por);
    if (ordem !== 'nenhuma') {
      p.set('ordem', ordem);
      p.set('dir', direcao);
    }
    // O filtro entra por último, e por isso a visão salva o guarda: `consulta()`
    // sem argumento é exatamente o endereço da tela como ela está agora.
    return escreverFiltros(p, comFiltros).toString();
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
              href={`/leads?${consulta({ aba: a.chave })}`}
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
          {ordem !== 'nenhuma' ? (
            <>
              <input type="hidden" name="ordem" value={ordem} />
              <input type="hidden" name="dir" value={direcao} />
            </>
          ) : null}
          {/* O filtro sobrevive ao envio da busca. Sem estes campos, digitar no
              campo de busca apagaria o filtro em silêncio — e o formulário GET
              só manda o que ele mesmo carrega. */}
          {Object.entries(filtros).map(([chave, valor]) => (
            <input key={chave} type="hidden" name={`f.${chave}`} value={valor} />
          ))}
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
          <Filtro
            filtros={filtros}
            opcoes={opcoes}
            href={(proximos) => `/leads?${consulta({}, proximos)}`}
          />
          <VisoesSalvas consultaAtual={consulta()} />
          {/* Atalho que ninguém descobre é atalho que ninguém usa: a régua fica
              escrita ao lado da contagem, na mesma linha, sem ocupar tela. */}
          <span className="sub" style={{ marginLeft: 'auto' }}>
            {numero(linhas.length)} leads
            {linhas.length === LIMITE_LISTA ? ` · teto de ${LIMITE_LISTA}` : ''} ·{' '}
            <kbd>/</kbd> busca, <kbd>j</kbd>/<kbd>k</kbd> anda, <kbd>Enter</kbd> abre
          </span>
        </form>

        <ListaDeLeads
          grupos={grupos}
          fuso={fuso}
          agora={new Date()}
          aba={aba}
          busca={busca}
          por={por}
          ordem={ordem}
          direcao={direcao}
          filtros={filtros}
          proprietarios={proprietarios}
          total={linhas.length}
        />
      </div>
    </>
  );
}
