/**
 * Primitives shared by all three applications.
 *
 * Each had been reimplemented in `apps/desk`, `apps/gestao`, and `apps/crm` with nearly identical CSS and values that had already diverged.
 *
 * All are plain React and none imports `next`. Route-dependent information, such as the active navigation item, arrives through props; each application obtains its current path from its own `usePathname`. This keeps the package usable outside Next and testable without a router.
 */

import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from 'react';
import { Icone, type NomeDeIcone } from '../icones';
import { Illustration, type IllustrationName } from '../illustrations';



export type VarianteDeBotao = 'padrao' | 'primario' | 'perigo';

export type PropsDeBotao = {
  variante?: VarianteDeBotao;
  /**
   * @deprecated Use `<Etiqueta aoClicar ativa>`. A saved list segment belongs to the clickable tag, the product's sole tag component. Keep this only while the three applications migrate.
   */
  chip?: boolean;
  icone?: NomeDeIcone;
} & ButtonHTMLAttributes<HTMLButtonElement>;

export function Botao({ variante = 'padrao', chip, icone, className, children, ...resto }: PropsDeBotao) {
  const classes = ['btn'];
  if (variante !== 'padrao') classes.push(variante);
  if (chip) classes.push('chip');
  if (className) classes.push(className);

  return (
    <button type="button" className={classes.join(' ')} {...resto}>
      {icone ? <Icone nome={icone} tamanho={14} /> : null}
      {children}
    </button>
  );
}

export type PropsDeBotaoDeIcone = {
  nome: NomeDeIcone;
  /** Required: an icon-only button needs an accessible name. */
  rotulo: string;
} & ButtonHTMLAttributes<HTMLButtonElement>;

export function BotaoDeIcone({ nome, rotulo, className, ...resto }: PropsDeBotaoDeIcone) {
  return (
    <button
      type="button"
      className={className ? `iconbtn ${className}` : 'iconbtn'}
      title={rotulo}
      aria-label={rotulo}
      {...resto}
    >
      <Icone nome={nome} />
    </button>
  );
}

/* --------------------------------------------------------------- etiqueta */

/**
 * Pipe's sole tag, a first-class component.
 *
 * Neither Chatwoot nor Twenty supplies a generic tag, so each screen would reimplement its own and the set would drift. Blip packages `bds-chip-clickable` to avoid that; we copy the component approach, not its appearance.
 *
 * This component serves four product uses: queue tag (neutral), score band (neutral), SLA status (state), and evaluation concept (state).
 *
 * It starts NEUTRAL deliberately. Queue, channel, source, and stage receive no color: categories are not states, and coloring everything weakens the signal. Color appears only when the tag calls for action, using one of four states, always a pastel background paired with dark content.
 */
export type TomDeEtiqueta = 'neutro' | 'sucesso' | 'alerta' | 'erro' | 'info';

export type PropsDeEtiqueta = {
  tom?: TomDeEtiqueta;
  /** Pill shape, only for rounded counts and elements beside an avatar. */
  redonda?: boolean;
  /**
   * Clickable variant for a saved list segment, toggle filter, or navigation value. With `aoClicar`, the tag is a real `<button>` with keyboard access, focus, and `aria-pressed`; without it, it is a `<span>`.
   */
  aoClicar?: () => void;
  /** Active state. This is the only place where brand color touches a tag. */
  active?: boolean;
  titulo?: string;
  className?: string;
  children: ReactNode;
};

export function Etiqueta({
  tom = 'neutro',
  redonda,
  aoClicar,
  active,
  titulo,
  className,
  children,
}: PropsDeEtiqueta) {
  const classes = ['etiqueta'];
  if (tom !== 'neutro') classes.push(tom);
  if (redonda) classes.push('redonda');
  if (className) classes.push(className);
  const classe = classes.join(' ');

  if (aoClicar) {
    return (
      <button type="button" className={classe} title={titulo} aria-pressed={active} onClick={aoClicar}>
        {children}
      </button>
    );
  }

  return (
    <span className={classe} title={titulo}>
      {children}
    </span>
  );
}



export function Campo({ className, ...resto }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={className ? `campo ${className}` : 'campo'} {...resto} />;
}

export function Seletor({ className, children, ...resto }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={className ? `seletor ${className}` : 'seletor'} {...resto}>
      {children}
    </select>
  );
}

/* ------------------------------------------------------------------ abas */

export type Aba = { key: string; rotulo: string; href: string };

export function Abas({ abas, atual }: { abas: readonly Aba[]; atual: string }) {
  return (
    <div className="tabs" role="tablist">
      {abas.map((aba) => (
        <a
          key={aba.key}
          href={aba.href}
          role="tab"
          aria-current={aba.key === atual ? 'true' : undefined}
        >
          {aba.rotulo}
        </a>
      ))}
    </div>
  );
}

/* ------------------------------------------------------- estado da tela */

/**
 * An empty state with a drawn illustration, never a photo. The illustration is an `Ilustracao` component rather than a standalone image, as in Blip empty states, which also lets it respond to dark mode.
 *
 * Use `ilustracao={false}` inside a table, where a 96px scene would push the next row offscreen.
 */
export function EmptyState({
  titulo,
  illustration = 'vazio',
  children,
}: {
  titulo: string;
  illustration?: IllustrationName | false;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      {illustration ? <Illustration nome={illustration} /> : null}
      <b>{titulo}</b>
      {children}
    </div>
  );
}

export function Carregando({ rotulo = 'Carregando' }: { rotulo?: string }) {
  return <span className="carregando" role="status" aria-label={rotulo} />;
}

/* ---------------------------------------------------------------- avatar */

/** Name initials, at most two: more will not fit in 26px. */
export function initials(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  const first = partes[0]?.[0] ?? '';
  const ultima = partes.length > 1 ? (partes[partes.length - 1]?.[0] ?? '') : '';
  return (first + ultima).toUpperCase();
}

export function Avatar({ nome, className }: { nome: string; className?: string }) {
  return (
    <span className={className ? `avatar ${className}` : 'avatar'} title={nome} aria-hidden="true">
      {initials(nome)}
    </span>
  );
}



export function Card({
  titulo,
  actions,
  className,
  children,
}: {
  titulo?: string;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={className ? `card ${className}` : 'card'}>
      {titulo ? (
        <header className="p-cabecalho">
          <h3>{titulo}</h3>
          {actions ? <div className="p-cabecalho-fim">{actions}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}
