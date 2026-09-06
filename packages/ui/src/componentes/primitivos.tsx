/**
 * Primitivos compartilhados pelos três aplicativos.
 *
 * Cada um deles estava reimplementado em `apps/desk`, `apps/gestao` e
 * `apps/crm` — em CSS quase igual, com valores que já tinham divergido.
 *
 * Todos são React puro: nenhum importa `next`. O que depende de rota (o item
 * ativo da navegação) chega por prop, e cada aplicativo passa o caminho atual
 * a partir do seu próprio `usePathname`. É o que mantém este pacote utilizável
 * fora do Next e testável sem roteador.
 */

import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from 'react';
import { Icone, type NomeDeIcone } from '../icones';

/* ------------------------------------------------------------------ botão */

export type VarianteDeBotao = 'padrao' | 'primario' | 'perigo';

export type PropsDeBotao = {
  variante?: VarianteDeBotao;
  /** Recorte salvo de lista (o antigo "chip"). */
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
  /** Obrigatório: o botão não tem texto, então precisa de nome acessível. */
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
 * O Chip/Badge genérico. Nem Chatwoot nem Twenty têm um, e a nossa pesquisa
 * apontou a lacuna — então este é desenhado, não copiado.
 *
 * Nasce NEUTRA de propósito. Fila, canal, origem e fase não recebem cor:
 * quando tudo é colorido, nada é. Cor só entra quando o que a etiqueta diz
 * exige uma ação, e aí ela é um dos três estados.
 */
export type TomDeEtiqueta = 'neutro' | 'ok' | 'alerta' | 'erro';

export function Etiqueta({
  tom = 'neutro',
  className,
  children,
  ...resto
}: { tom?: TomDeEtiqueta; children: ReactNode } & Omit<HTMLAttributes<HTMLSpanElement>, 'children'>) {
  const classes = ['etiqueta'];
  if (tom !== 'neutro') classes.push(tom);
  if (className) classes.push(className);
  return (
    <span className={classes.join(' ')} {...resto}>
      {children}
    </span>
  );
}

/* ------------------------------------------------------------ formulário */

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

export type Aba = { chave: string; rotulo: string; href: string };

export function Abas({ abas, atual }: { abas: readonly Aba[]; atual: string }) {
  return (
    <div className="tabs" role="tablist">
      {abas.map((aba) => (
        <a
          key={aba.chave}
          href={aba.href}
          role="tab"
          aria-current={aba.chave === atual ? 'true' : undefined}
        >
          {aba.rotulo}
        </a>
      ))}
    </div>
  );
}

/* ------------------------------------------------------- estado da tela */

export function EstadoVazio({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <div className="vazio">
      <b>{titulo}</b>
      {children}
    </div>
  );
}

export function Carregando({ rotulo = 'Carregando' }: { rotulo?: string }) {
  return <span className="carregando" role="status" aria-label={rotulo} />;
}

/* ---------------------------------------------------------------- avatar */

/** Iniciais do nome. Duas, no máximo — mais do que isso não cabe em 26px. */
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  const primeira = partes[0]?.[0] ?? '';
  const ultima = partes.length > 1 ? (partes[partes.length - 1]?.[0] ?? '') : '';
  return (primeira + ultima).toUpperCase();
}

export function Avatar({ nome, className }: { nome: string; className?: string }) {
  return (
    <span className={className ? `avatar ${className}` : 'avatar'} title={nome} aria-hidden="true">
      {iniciais(nome)}
    </span>
  );
}

/* ---------------------------------------------------------------- cartão */

export function Cartao({
  titulo,
  acoes,
  className,
  children,
}: {
  titulo?: string;
  acoes?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={className ? `card ${className}` : 'card'}>
      {titulo ? (
        <header className="p-cabecalho">
          <h3>{titulo}</h3>
          {acoes ? <div className="p-cabecalho-fim">{acoes}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}
