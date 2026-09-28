import { createContext, useContext, type ReactNode } from 'react';
import { Outlet, useParams } from 'react-router-dom';
import { BarraDoPortal } from '../../components/barra-do-portal';
import { portalUseShell } from '../../lib/shell';
import { useRead } from '../../lib/query';
import { ApiError } from '../../lib/api';
import { flowPath } from '../../lib/application-paths';
import { NaoEncontrado } from '../nao-encontrado';
import { ContactBar, type Contact } from './barra-of-contact';
import './flow.css';

/** `/application/detail/<shortName>[/<rest>]` — the single builder for a contact's own tree (D-52). */
export function contactPath(contact: Pick<Contact, 'shortName'>, ...rest: string[]): string {
  return flowPath(contact.shortName, ...rest);
}

/**
 * The contact (the `fluxo`) that ALL `/application/detail/:shortName/**` screens render, read
 * once via `GET /v1/management/flows/short-name/:shortName` and handed to the children through
 * route context — the origin's `auth.application.detail`, the parent state for all of them.
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
 * The parent route: reads the `shortName` from the URL (`GET
 * short-name/:shortName`, plan 01-43), and only then renders the child. A shortName absent from
 * this tenant, or belonging to an archived flow, is a 404 — like the `notFound()` each
 * `page.tsx` used to do.
 *
 * `/application/detail/:shortName` renders ONE tree for both flow and router (App.tsx mounts it
 * once, D-52) — there is no type segment in the URL to get wrong.
 */
export function ContactRoute() {
  const { shortName = '' } = useParams();
  const read = useRead<ContactLoaded>(
    shortName ? `/v1/management/flows/short-name/${encodeURIComponent(shortName)}` : null,
  );

  if (!shortName || (read.error instanceof ApiError && read.error.status === 404)) {
    return <NaoEncontrado />;
  }
  if (read.error) return <ReadFailure error={read.error} />;
  if (!read.data) return null;

  return (
    <ContactContext.Provider value={read.data}>
      <Outlet />
    </ContactContext.Provider>
  );
}

/**
 * The contact modules' common shell: portal bar, contact bar, and the body with `fx-coluna` — the former `CascaDoModulo`, now without a query.
 */
export function ShellModule({ ativo, children }: { ativo?: string; children: ReactNode }) {
  const { contact } = useContact();
  const shell = portalUseShell();
  return (
    <div className="pt-app">
      <BarraDoPortal data={shell} />
      <ContactBar contact={contactWithData(contact)} ativo={ativo} />
      <main className="pt-conteudo fx-miolo">
        <div className="fx-column">{children}</div>
      </main>
    </div>
  );
}

/** The two bars without the standardized content area — for screens that draw their own `main`. */
export function ContactBars({ ativo }: { ativo?: string }) {
  const { contact } = useContact();
  const shell = portalUseShell();
  return (
    <>
      <BarraDoPortal data={shell} />
      <ContactBar contact={contactWithData(contact)} ativo={ativo} />
    </>
  );
}

function contactWithData(contact: ContactLoaded['contact']): Contact {
  return { ...contact, criadoEm: contact.criadoEm ? new Date(contact.criadoEm) : null };
}

/** The `api` returned an error other than 404: showing what happened is worth more than a blank screen. */
export function ReadFailure({ error }: { error: Error }) {
  return (
    <div className="pt-app">
      <main className="pt-conteudo fx-miolo">
        <div className="fx-column">
          <p role="alert">Não foi possível carregar esta tela: {error.message}</p>
        </div>
      </main>
    </div>
  );
}
