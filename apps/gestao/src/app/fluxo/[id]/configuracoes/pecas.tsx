'use client';

import type { ReactNode } from 'react';
import { IconePortal, type NomeDeIconePortal } from '../../../../componentes/icones-portal';

/**
 * As peças que as telas de Configurações repetem, cada uma com o nome do
 * componente da origem no comentário. Só o DESENHO deles: a tinta é a nossa.
 */

/**
 * `<page-header>` (blipComponents.pageHeader): `.container > .full-initial-section
 * > .row.flex.page-header-content.items-center.mb0`. Título à esquerda (h1 ou
 * `custom-title`), `custom-content` à direita, e embaixo a `additional-info`.
 */
export function CabecalhoDaPagina({
  titulo,
  acoes,
  descricao,
  id,
}: {
  titulo: ReactNode;
  acoes?: ReactNode;
  descricao?: ReactNode;
  id?: string;
}) {
  return (
    <header className="cf-cabecalho" id={id}>
      <div className="cf-cabecalho-secao">
        <div className="cf-cabecalho-linha">
          <div className="cf-cabecalho-titulo">{titulo}</div>
          {acoes ? <div className="cf-cabecalho-acoes">{acoes}</div> : null}
        </div>
      </div>
      {descricao ? <div className="cf-cabecalho-info">{descricao}</div> : null}
    </header>
  );
}

/** `<bds-paper elevation="static">` — cartão de superfície 1, raio 16, sombra fixa. */
export function Papel({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={className ? `cf-papel ${className}` : 'cf-papel'}>{children}</section>;
}

/**
 * `<switch>` (blipComponents.switch): `<label>` 43×26 com raio 36 e a bolinha
 * 22×22; `disabled` quando já é a conexão ativa (`disabled="$ctrl.isBuilderActive"`).
 * `curto` é o `<bds-switch size="short">` do bloco OAuth (37×31 com `pa1`).
 */
export function Interruptor({
  ligado,
  aoMudar,
  rotulo,
  desabilitado,
  curto,
}: {
  ligado: boolean;
  aoMudar: (valor: boolean) => void;
  rotulo: string;
  desabilitado?: boolean;
  curto?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      aria-label={rotulo}
      disabled={desabilitado}
      className={[
        'cf-interruptor',
        ligado ? 'cf-interruptor--ligado' : '',
        curto ? 'cf-interruptor--curto' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={() => aoMudar(!ligado)}
    >
      <span className="cf-interruptor-bolinha" />
    </button>
  );
}

/**
 * `<input-clipboard>` (blipComponents.inputClipboard): `.input-clipboard-container`
 * — pílula de superfície 2 com `<input readonly>` em negrito na cor da marca e
 * o botão `.icon-copy` de 16px à direita.
 */
export function CampoCopiavel({
  rotulo,
  valor,
  aoCopiar,
}: {
  rotulo: string;
  valor: string;
  aoCopiar?: () => void;
}) {
  return (
    <div>
      <div className="cf-rotulo-campo">{rotulo}</div>
      <div className="cf-copiavel">
        <input readOnly value={valor} aria-label={rotulo} />
        <button
          type="button"
          className="cf-copiavel-botao"
          aria-label={`Copiar ${rotulo}`}
          onClick={() => {
            if (valor) void navigator.clipboard?.writeText(valor);
            aoCopiar?.();
          }}
        >
          <IconePortal nome="copiar" tamanho={16} />
        </button>
      </div>
    </div>
  );
}

/**
 * `<bds-input>` / `<bds-input-password>` do blip-ds: caixa de borda 1px e raio
 * 8 (`padding: 7px 4px 8px 12px`) com o rótulo (12px/700) DENTRO, em cima do
 * campo de 36px. `senha` acrescenta o olho do `bds-input-password`.
 */
export function CampoBds({
  id,
  rotulo,
  valor,
  aoMudar,
  placeholder,
  desabilitado,
  senha,
  obrigatorio,
  maxLength,
}: {
  id?: string;
  rotulo: string;
  valor: string;
  aoMudar?: (valor: string) => void;
  placeholder?: string;
  desabilitado?: boolean;
  senha?: boolean;
  obrigatorio?: boolean;
  maxLength?: number;
}) {
  return (
    <label className={desabilitado ? 'cf-campo cf-campo--desabilitado' : 'cf-campo'}>
      <span className="cf-campo-rotulo">{rotulo}</span>
      <span className="cf-campo-linha">
        <input
          id={id}
          type={senha ? 'password' : 'text'}
          value={valor}
          onChange={(evento) => aoMudar?.(evento.target.value)}
          placeholder={placeholder}
          disabled={desabilitado}
          required={obrigatorio}
          maxLength={maxLength}
          autoComplete="off"
          autoCapitalize="off"
        />
        {senha ? (
          <span className="cf-campo-olho" aria-hidden="true">
            <IconePortal nome="olho" tamanho={20} />
          </span>
        ) : null}
      </span>
    </label>
  );
}

/**
 * `<bds-button>`: 40px de altura, raio 8, `padding: 0 16px`, texto 14/700 e
 * `gap: 4px` até o ícone de 24. `primary` pinta com a marca; `secondary` é só
 * texto; `tertiary` tem borda 1px de conteúdo (é o "Ok" da ajuda das chaves);
 * `bot` é o `.bp-btn.bp-btn--bot.bp-btn--small` antigo (42px, raio 3) do
 * "Salvar" do formulário HTTP.
 */
export function BotaoBds({
  variante = 'primary',
  icone,
  children,
  ...resto
}: {
  variante?: 'primary' | 'secondary' | 'tertiary' | 'bot';
  icone?: NomeDeIconePortal;
  children: ReactNode;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'>) {
  return (
    <button type="button" {...resto} className={`cf-botao cf-botao--${variante}`}>
      {icone ? <IconePortal nome={icone} tamanho={24} /> : null}
      <span>{children}</span>
    </button>
  );
}

/** `<bds-button-icon variant="secondary" size="short">`: 40×40, raio 8, ícone de 24. */
export function BotaoDeIcone({
  icone,
  rotulo,
  ...resto
}: { icone: NomeDeIconePortal; rotulo: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" {...resto} className="cf-botao-icone" aria-label={rotulo} title={rotulo}>
      <IconePortal nome={icone} tamanho={24} />
    </button>
  );
}
