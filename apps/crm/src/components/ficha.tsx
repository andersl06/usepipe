import Link from 'next/link';
import type { ReactNode } from 'react';
import { Avatar } from '@pipe/ui';

/**
 * The record's building blocks, used by all three: lead, account, and contact.
 *
 * The shape was measured in Twenty (`record-show`) and in Salesforce, which
 * arrived at the same design without talking to each other: an identity strip
 * at the top, a short row of the fields that decide what to do, a sidebar
 * column with the rest of the data in sections that open and close, and tabs for
 * the heavy content.
 *
 * They used to live inside `leads/[id]/page.tsx`, and the account and the
 * contact were two poorer screens for not having them. They're here for the
 * usual reason: three copies of the same header become three different headers
 * by the third month.
 *
 * Everything here is a SERVER component. No piece holds state, and the tab
 * lives in the URL — the whole record works without JavaScript, which is what
 * lets you paste into chat the address of a record already open on the right
 * tab.
 */

export function Campo({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div>
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </div>
  );
}

/**
 * A sidebar column section that opens and closes.
 *
 * Native `<details>`: the browser already knows how to open, close, respond to
 * the keyboard, and announce to a screen reader. Writing this in React would be
 * trading zero lines for thirty and losing in-page search behavior.
 */
export function Section({
  titulo,
  aberta = true,
  children,
}: {
  titulo: string;
  aberta?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="section" open={aberta}>
      <summary>
        <b>{titulo}</b>
      </summary>
      {children}
    </details>
  );
}

export interface CampoPrincipal {
  rotulo: string;
  value: ReactNode;
  /** The second line, in a lighter tone: "12 days ago", the campaign name, the band. */
  nota?: ReactNode;
  /** Tabular monospaced number. For values and counts, not for text. */
  numerico?: boolean;
}

/**
 * The highlight header: identity on top, main fields below.
 *
 * **Five main fields, at most** — that's Salesforce's highlight rule, and more
 * than that stops being a highlight. All three records follow the same one.
 */
export function Destaque({
  trilha,
  nome,
  etiquetas,
  nota,
  main,
}: {
  trilha: { href: string; rotulo: string };
  nome: string;
  /** The state badges, to the right of the name. Color only on what demands action. */
  etiquetas?: ReactNode;
  /** The quiet stamp at the end of the row: "created 3 days ago". */
  nota?: ReactNode;
  main: readonly CampoPrincipal[];
}) {
  return (
    <div className="destaque">
      <div className="identity">
        <Link href={trilha.href} className="trilha">
          {trilha.rotulo}
        </Link>
        <span className="barra" aria-hidden="true">
          /
        </span>
        <Avatar nome={nome} />
        <h2>{nome}</h2>
        {etiquetas}
        {nota ? <span className="criado">{nota}</span> : null}
      </div>

      <dl className="main">
        {main.map((c) => (
          <div key={c.rotulo}>
            <dt>{c.rotulo}</dt>
            <dd className={c.numerico ? 'n' : undefined}>
              {c.value}
              {c.nota ? <em>{c.nota}</em> : null}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export interface AbaDaFicha {
  key: string;
  rotulo: string;
  /** `null` hides the count. Zero is a count, and zero is information. */
  count?: number | null;
}

/**
 * The content tabs. They are LINKS, not client state: the tab lives in the URL,
 * the browser's back button undoes the switch, and the record stays fully
 * server-rendered.
 */
export function AbasDaFicha({
  base,
  aba,
  abas,
  formatar,
}: {
  /** The record's address, with no parameter. The tab comes in as `?aba=`. */
  base: string;
  aba: string;
  abas: readonly AbaDaFicha[];
  /** How to write the number. The screen passes the `numero` in the local format. */
  formatar: (n: number) => string;
}) {
  return (
    <div className="tabs" role="tablist">
      {abas.map((a) => (
        <Link
          key={a.key}
          href={`${base}?tab=${a.key}`}
          role="tab"
          aria-current={a.key === aba ? 'true' : undefined}
          scroll={false}
        >
          {a.rotulo}
          {a.count === null || a.count === undefined ? null : (
            <span className="qt">{formatar(a.count)}</span>
          )}
        </Link>
      ))}
    </div>
  );
}

/**
 * The sidebar's custom-attributes section.
 *
 * All three tables store `atributos` in JSONB — it's the data-model decision
 * that avoids today's 304 custom fields on Salesforce's Lead. Since the shape is
 * the same across the three, so is this section.
 */
export function SectionAttributes({
  atributos,
  titulo = 'Atributos',
  empty = 'Nenhum atributo personalizado.',
}: {
  atributos: Record<string, unknown>;
  titulo?: string;
  empty?: string;
}) {
  const pares = Object.entries(atributos);
  return (
    <Section titulo={titulo} aberta={pares.length > 0}>
      {pares.length === 0 ? (
        <div className="empty">{empty}</div>
      ) : (
        <div className="campos">
          {pares.map(([k, v]) => (
            <Campo key={k} k={k} v={String(v)} />
          ))}
        </div>
      )}
    </Section>
  );
}
