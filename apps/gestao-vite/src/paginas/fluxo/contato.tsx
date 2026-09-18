import { createContext, useContext, type ReactNode } from 'react';
import { Navigate, Outlet, useLocation, useParams } from 'react-router-dom';
import { BarraDoPortal } from '../../componentes/barra-do-portal';
import { useCascaDoPortal } from '../../lib/casca';
import { useLeitura } from '../../lib/consulta';
import { ErroDaApi } from '../../lib/api';
import { NaoEncontrado } from '../nao-encontrado';
import { BarraDoContato, UUID, type Contato } from './barra-do-contato';
import './fluxo.css';

/**
 * O prefixo da URL do contato, conforme o tipo — `roteador` para o que a
 * origem chama `master`, `fluxo` para o resto (`builder`). É a MESMA
 * distinção de `itens.ts`, aqui do lado de quem monta o caminho, não o menu.
 */
export function prefixoDoContato(tipo: string): 'roteador' | 'fluxo' {
  return tipo === 'roteador' ? 'roteador' : 'fluxo';
}

export function baseDoContato(tipo: string, id: string): string {
  return `/${prefixoDoContato(tipo)}/${id}`;
}

/**
 * O contato (o `fluxo`) que TODAS as telas de `/fluxo/:id/**` desenham, lido
 * uma vez em `GET /v1/gestao/fluxos/:id` e entregue às filhas pelo contexto da
 * rota — o `auth.application.detail` da origem, que é o estado-pai de todas.
 *
 * `criadoEm` chega como texto (JSON); quem mostra data converte.
 */
export interface ContatoCarregado {
  contato: Omit<Contato, 'criadoEm'> & { criadoEm: string | null };
  fuso: string;
}

/* Contexto do React, e não o `useOutletContext` do roteador: este só alcança
   a filha direta, e as cascas de módulo (Contatos, Growth, Configurações)
   têm um `<Outlet>` no meio do caminho. */
const ContextoDoContato = createContext<ContatoCarregado | undefined>(undefined);

export function useContato(): ContatoCarregado {
  const valor = useContext(ContextoDoContato);
  if (!valor) throw new Error('useContato fora de RotaDoContato');
  return valor;
}

/**
 * A rota-pai: valida o `id`, carrega o contato e só então desenha a filha.
 * Fora do padrão de uuid ou sem contato no tenant é 404 — como o `notFound()`
 * que cada `page.tsx` fazia.
 *
 * `/fluxo/:id` e `/roteador/:id` desenham a MESMA árvore (App.tsx monta as
 * duas sobre as mesmas rotas-filhas); quem entra pelo prefixo errado para o
 * tipo do contato é redirecionado aqui, uma vez só, para o prefixo certo —
 * preservando o resto do caminho, a busca e o hash. É a rede de segurança
 * para link antigo, favorito ou o link que uma tela ainda não ajustada gera.
 */
export function RotaDoContato() {
  const { id = '' } = useParams();
  const local = useLocation();
  const valido = UUID.test(id);
  const leitura = useLeitura<ContatoCarregado>(valido ? `/v1/gestao/fluxos/${id}` : null);

  if (!valido || (leitura.error instanceof ErroDaApi && leitura.error.status === 404)) {
    return <NaoEncontrado />;
  }
  if (leitura.error) return <FalhaDeLeitura erro={leitura.error} />;
  if (!leitura.data) return null;

  const prefixoCerto = prefixoDoContato(leitura.data.contato.tipo);
  const prefixoAtual = local.pathname.startsWith('/roteador/') ? 'roteador' : 'fluxo';
  if (prefixoAtual !== prefixoCerto) {
    const resto = local.pathname.slice(`/${prefixoAtual}/${id}`.length);
    return <Navigate to={`/${prefixoCerto}/${id}${resto}${local.search}${local.hash}`} replace />;
  }

  return (
    <ContextoDoContato.Provider value={leitura.data}>
      <Outlet />
    </ContextoDoContato.Provider>
  );
}

/**
 * A casca comum dos módulos do contato: barra do portal, barra do contato e o
 * miolo com a `fx-coluna` — o `CascaDoModulo` de antes, agora sem consulta.
 */
export function CascaDoModulo({ ativo, children }: { ativo?: string; children: ReactNode }) {
  const { contato } = useContato();
  const casca = useCascaDoPortal();
  return (
    <div className="pt-app">
      <BarraDoPortal dados={casca} />
      <BarraDoContato contato={contatoComData(contato)} ativo={ativo} />
      <main className="pt-conteudo fx-miolo">
        <div className="fx-coluna">{children}</div>
      </main>
    </div>
  );
}

/** As duas barras sem o miolo padronizado — para as telas que desenham o próprio `main`. */
export function BarrasDoContato({ ativo }: { ativo?: string }) {
  const { contato } = useContato();
  const casca = useCascaDoPortal();
  return (
    <>
      <BarraDoPortal dados={casca} />
      <BarraDoContato contato={contatoComData(contato)} ativo={ativo} />
    </>
  );
}

function contatoComData(contato: ContatoCarregado['contato']): Contato {
  return { ...contato, criadoEm: contato.criadoEm ? new Date(contato.criadoEm) : null };
}

/** A `api` respondeu erro que não é 404: dizer o que houve vale mais que a tela em branco. */
export function FalhaDeLeitura({ erro }: { erro: Error }) {
  return (
    <div className="pt-app">
      <main className="pt-conteudo fx-miolo">
        <div className="fx-coluna">
          <p role="alert">Não foi possível carregar esta tela: {erro.message}</p>
        </div>
      </main>
    </div>
  );
}
