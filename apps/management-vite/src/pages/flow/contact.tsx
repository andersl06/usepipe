import { createContext, useContext, type ReactNode } from 'react';
import { Navigate, Outlet, useLocation, useParams } from 'react-router-dom';
import { BarraDoPortal } from '../../components/barra-do-portal';
import { portalUseShell } from '../../lib/shell';
import { useRead } from '../../lib/query';
import { ApiError } from '../../lib/api';
import { NaoEncontrado } from '../nao-encontrado';
import { ContactBarra, UUID, type Contact } from './barra-of-contact';
import './flow.css';

/**
 * O prefixo da URL do contato, conforme o tipo — `roteador` para o que a
 * origem chama `master`, `fluxo` para o resto (`builder`). É a MESMA
 * distinção de `itens.ts`, aqui do lado de quem monta o caminho, não o menu.
 */
export function contactPrefix(tipo: string): 'roteador' | 'fluxo' {
  return tipo === 'roteador' ? 'roteador' : 'fluxo';
}

export function contactBase(tipo: string, id: string): string {
  return `/${contactPrefix(tipo)}/${id}`;
}

/**
 * O contato (o `fluxo`) que TODAS as telas de `/fluxo/:id/**` desenham, lido
 * uma vez em `GET /v1/gestao/fluxos/:id` e entregue às filhas pelo contexto da
 * rota — o `auth.application.detail` da origem, que é o estado-pai de todas.
 *
 * `criadoEm` chega como texto (JSON); quem mostra data converte.
 */
export interface ContactLoaded {
  contact: Omit<Contact, 'criadoEm'> & { criadoEm: string | null };
  fuso: string;
}

/* Contexto do React, e não o `useOutletContext` do roteador: este só alcança
   a filha direta, e as cascas de módulo (Contatos, Growth, Configurações)
   têm um `<Outlet>` no meio do caminho. */
const ContactContext = createContext<ContactLoaded | undefined>(undefined);

export function useContact(): ContactLoaded {
  const value = useContext(ContactContext);
  if (!value) throw new Error('useContato fora de RotaDoContato');
  return value;
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
export function ContactRota() {
  const { id = '' } = useParams();
  const local = useLocation();
  const valido = UUID.test(id);
  const read = useRead<ContactLoaded>(valido ? `/v1/management/flows/${id}` : null);

  if (!valido || (read.error instanceof ApiError && read.error.status === 404)) {
    return <NaoEncontrado />;
  }
  if (read.error) return <ReadFalha error={read.error} />;
  if (!read.data) return null;

  const prefixCerto = contactPrefix(read.data.contact.tipo);
  const prefixCurrent = local.pathname.startsWith('/roteador/') ? 'roteador' : 'fluxo';
  if (prefixCurrent !== prefixCerto) {
    const resto = local.pathname.slice(`/${prefixCurrent}/${id}`.length);
    return <Navigate to={`/${prefixCerto}/${id}${resto}${local.search}${local.hash}`} replace />;
  }

  return (
    <ContactContext.Provider value={read.data}>
      <Outlet />
    </ContactContext.Provider>
  );
}

/**
 * A casca comum dos módulos do contato: barra do portal, barra do contato e o
 * miolo com a `fx-coluna` — o `CascaDoModulo` de antes, agora sem consulta.
 */
export function ModuloShell({ ativo, children }: { ativo?: string; children: ReactNode }) {
  const { contact } = useContact();
  const shell = portalUseShell();
  return (
    <div className="pt-app">
      <BarraDoPortal data={shell} />
      <ContactBarra contact={contactWithData(contact)} ativo={ativo} />
      <main className="pt-conteudo fx-miolo">
        <div className="fx-coluna">{children}</div>
      </main>
    </div>
  );
}

/** As duas barras sem o miolo padronizado — para as telas que desenham o próprio `main`. */
export function ContactBarras({ ativo }: { ativo?: string }) {
  const { contact } = useContact();
  const shell = portalUseShell();
  return (
    <>
      <BarraDoPortal data={shell} />
      <ContactBarra contact={contactWithData(contact)} ativo={ativo} />
    </>
  );
}

function contactWithData(contact: ContactLoaded['contact']): Contact {
  return { ...contact, criadoEm: contact.criadoEm ? new Date(contact.criadoEm) : null };
}

/** A `api` respondeu erro que não é 404: dizer o que houve vale mais que a tela em branco. */
export function ReadFalha({ error }: { error: Error }) {
  return (
    <div className="pt-app">
      <main className="pt-conteudo fx-miolo">
        <div className="fx-coluna">
          <p role="alert">Não foi possível carregar esta tela: {error.message}</p>
        </div>
      </main>
    </div>
  );
}
