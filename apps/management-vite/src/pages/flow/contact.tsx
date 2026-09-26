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
 * The contact's URL prefix, based on type — `roteador` for what the source calls `master`, `fluxo` for the rest (`builder`). It's the SAME distinction as `itens.ts`, here on the side that builds the path rather than the menu.
 */
export function contactPrefix(tipo: string): 'router' | 'flow' {
  return tipo === 'roteador' ? 'router' : 'flow';
}

export function contactBase(tipo: string, id: string): string {
  return `/${contactPrefix(tipo)}/${id}`;
}

/**
 * The contact (the `fluxo`) that ALL `/fluxo/:id/**` screens render, read once via `GET /v1/gestao/fluxos/:id` and handed to the children through route context — the origin's `auth.application.detail`, the parent state for all of them.
 *
 * `criadoEm` arrives as text (JSON); whoever displays the date converts it.
 */
export interface ContactLoaded {
  contact: Omit<Contact, 'criadoEm'> & { criadoEm: string | null };
  fuso: string;
}

/*
 * React Context, not the router's `useOutletContext`: that one only reaches the direct child, and the module shells (Contatos, Growth, Configurações) have an `<Outlet>` in between.
 */
const ContactContext = createContext<ContactLoaded | undefined>(undefined);

export function useContact(): ContactLoaded {
  const value = useContext(ContactContext);
  if (!value) throw new Error('useContato fora de RotaDoContato');
  return value;
}

/**
 * The parent route: validates the `id`, loads the contact, and only then renders the child. Anything outside uuid format, or with no contact in the tenant, is a 404 — like the `notFound()` each `page.tsx` used to do.
 *
 * `/fluxo/:id` and `/roteador/:id` render the SAME tree (App.tsx mounts both over the same child routes); whoever enters through the wrong prefix for the contact's type gets redirected here, once, to the right prefix — preserving the rest of the path, the query string, and the hash. It's the safety net for an old link, a bookmark, or a link a not-yet-updated screen still generates.
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
  const prefixCurrent = local.pathname.startsWith('/router/') ? 'router' : 'flow';
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
 * The contact modules' common shell: portal bar, contact bar, and the body with `fx-coluna` — the former `CascaDoModulo`, now without a query.
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

/** The two bars without the standardized content area — for screens that draw their own `main`. */
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

/** The `api` returned an error other than 404: showing what happened is worth more than a blank screen. */
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
