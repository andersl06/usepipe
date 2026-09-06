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
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from 'react';
import { Icone, type NomeDeIcone } from '../icones';
import { Ilustracao, type NomeDeIlustracao } from '../ilustracoes';

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
 * A etiqueta do Pipe, e a única. Componente de primeira classe.
 *
 * Nem Chatwoot nem Twenty têm um genérico, e é por isso que cada tela
 * reimplementa a sua e o conjunto fica inconsistente. A Blip empacota
 * `bds-chip-clickable` justamente para não cair nisso — é a forma que
 * copiamos, não o desenho.
 *
 * Este mesmo componente serve os quatro usos do produto:
 *   etiqueta de fila (neutra) · faixa de score (neutra) ·
 *   status de SLA (estado) · conceito de avaliação (estado)
 *
 * Nasce NEUTRA de propósito. Fila, canal, origem e fase não recebem cor:
 * categoria não é estado, e quando tudo é colorido nada é. Cor só entra
 * quando o que a etiqueta diz exige uma ação, e aí ela é um dos quatro
 * estados — sempre o par fundo pastel com conteúdo escuro.
 */
export type TomDeEtiqueta = 'neutro' | 'sucesso' | 'alerta' | 'erro' | 'info';

export type PropsDeEtiqueta = {
  tom?: TomDeEtiqueta;
  /** Pílula. Só para contagem redonda e para o que acompanha avatar. */
  redonda?: boolean;
  /**
   * Variante clicável: recorte salvo de lista, filtro que liga e desliga,
   * valor que navega. Com `aoClicar` a etiqueta vira `<button>` de verdade —
   * teclado, foco e `aria-pressed` de graça. Sem ele, é um `<span>`.
   */
  aoClicar?: () => void;
  /** Estado ligado. É o único lugar em que a cor de marca toca uma etiqueta. */
  ativa?: boolean;
  titulo?: string;
  className?: string;
  children: ReactNode;
};

export function Etiqueta({
  tom = 'neutro',
  redonda,
  aoClicar,
  ativa,
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
      <button type="button" className={classe} title={titulo} aria-pressed={ativa} onClick={aoClicar}>
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

/**
 * Estado vazio com ilustração desenhada, nunca com foto. Ilustração é
 * componente (`Ilustracao`), não imagem solta — é como a Blip preenche estado
 * vazio, e é o que mantém o desenho respondendo ao tema escuro.
 *
 * `ilustracao={false}` para o vazio que aparece dentro de uma tabela, onde uma
 * cena de 96px empurra a linha seguinte para fora da tela.
 */
export function EstadoVazio({
  titulo,
  ilustracao = 'vazio',
  children,
}: {
  titulo: string;
  ilustracao?: NomeDeIlustracao | false;
  children?: ReactNode;
}) {
  return (
    <div className="vazio">
      {ilustracao ? <Ilustracao nome={ilustracao} /> : null}
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
