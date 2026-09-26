import { useState, type HTMLInputTypeAttribute, type ReactNode } from 'react';
import { IconePortal, type NomeDeIconePortal } from '../../../components/icones-portal';

/**
 * The pieces the Settings screens repeat, each with the source component's name in the comment. Only their LAYOUT: the paint is ours.
 */

/**
 * `<page-header>` (blipComponents.pageHeader): `.container > .full-initial-section > .row.flex.page-header-content.items-center.mb0`. Title on the left (h1 or `custom-title`), `custom-content` on the right, and `additional-info` below.
 */
export function PageHeader({
  titulo,
  actions,
  description,
  id,
}: {
  titulo: ReactNode;
  actions?: ReactNode;
  description?: ReactNode;
  id?: string;
}) {
  return (
    <header className="cf-cabecalho" id={id}>
      <div className="cf-header-section">
        <div className="cf-cabecalho-linha">
          <div className="cf-cabecalho-titulo">{titulo}</div>
          {actions ? <div className="cf-header-actions">{actions}</div> : null}
        </div>
      </div>
      {description ? <div className="cf-cabecalho-info">{description}</div> : null}
    </header>
  );
}

/** `<bds-paper elevation="static">` — surface-1 card, 16 radius, fixed shadow. */
export function Role({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={className ? `cf-paper ${className}` : 'cf-paper'}>{children}</section>;
}

/**
 * `<switch>` (blipComponents.switch): 43×26 `<label>` with 36 radius and the 22×22 dot; `disabled` when it's already the active connection (`disabled="$ctrl.isBuilderActive"`). `curto` is the OAuth block's `<bds-switch size="short">` (37×31 with `pa1`).
 */
export function Interruptor({
  ligado,
  aoMudar,
  rotulo,
  desabilitado,
  curto,
}: {
  ligado: boolean;
  aoMudar: (value: boolean) => void;
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
 * `<input-clipboard>` (blipComponents.inputClipboard): `.input-clipboard-container` — surface-2 pill with a bold, brand-colored `<input readonly>` and the 16px `.icon-copy` button on the right.
 */
export function CampoCopiavel({
  rotulo,
  value,
  aoCopiar,
}: {
  rotulo: string;
  value: string;
  aoCopiar?: () => void;
}) {
  return (
    <div>
      <div className="cf-rotulo-campo">{rotulo}</div>
      <div className="cf-copiavel">
        <input readOnly value={value} aria-label={rotulo} />
        <button
          type="button"
          className="cf-copiavel-botao"
          aria-label={`Copiar ${rotulo}`}
          onClick={() => {
            if (value) void navigator.clipboard?.writeText(value);
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
 * blip-ds's `<bds-input>` / `<bds-input-password>`: 1px border box with 8 radius (`padding: 7px 4px 8px 12px`) with the label (12px/700) INSIDE, above the 36px field. `senha` adds `bds-input-password`'s eye icon.
 *
 * `contador`: `material-input`'s (source) `<span counter-for>` — shows how much is LEFT, not how much has been typed (`maxLength - valor.length`), as in `/configurations/basic` ("Nome do fluxo": 30 - 16 = "14").
 */
export function CampoBds({
  id,
  rotulo,
  value,
  aoMudar,
  placeholder,
  desabilitado,
  senha,
  tipo = 'text',
  obrigatorio,
  maxLength,
  contador,
  linhas,
}: {
  id?: string;
  rotulo: string;
  value: string;
  aoMudar?: (value: string) => void;
  placeholder?: string;
  desabilitado?: boolean;
  senha?: boolean;
  tipo?: HTMLInputTypeAttribute;
  obrigatorio?: boolean;
  maxLength?: number;
  contador?: boolean;
  /** `bds-textarea`: same box as `bds-input`, just with a `<textarea>` inside. */
  linhas?: number;
}) {
  const [senhaVisivel, setSenhaVisivel] = useState(false);

  return (
    <label className={desabilitado ? 'cf-campo cf-campo--desabilitado' : 'cf-campo'}>
      <span className="cf-campo-cabecalho">
        <span className="cf-campo-rotulo">{rotulo}</span>
        {contador && maxLength != null ? (
          <span className="cf-campo-contador">{maxLength - value.length}</span>
        ) : null}
      </span>
      <span className="cf-campo-linha">
        {linhas ? (
          <textarea
            id={id}
            value={value}
            onChange={(evento) => aoMudar?.(evento.target.value)}
            placeholder={placeholder}
            disabled={desabilitado}
            required={obrigatorio}
            maxLength={maxLength}
            rows={linhas}
          />
        ) : (
          <input
            id={id}
            type={senha && !senhaVisivel ? 'password' : tipo}
            value={value}
            onChange={(evento) => aoMudar?.(evento.target.value)}
            placeholder={placeholder}
            disabled={desabilitado}
            required={obrigatorio}
            maxLength={maxLength}
            autoComplete="off"
            autoCapitalize="off"
          />
        )}
        {senha ? (
          <button
            type="button"
            className="cf-campo-olho"
            aria-label={senhaVisivel ? `Ocultar ${rotulo}` : `Mostrar ${rotulo}`}
            aria-pressed={senhaVisivel}
            onClick={() => setSenhaVisivel((visivel) => !visivel)}
          >
            <IconePortal nome="olho" tamanho={20} />
          </button>
        ) : null}
      </span>
    </label>
  );
}

/**
 * `<bds-button>`: 40px tall, 8 radius, `padding: 0 16px`, 14/700 text and `gap: 4px` to the 24px icon. `primary` paints with the brand; `secondary` is text only; `tertiary` has a 1px content-colored border (it's the keys help's "Ok"); `bot` is the old `.bp-btn.bp-btn--bot.bp-btn--small` (42px, 3 radius) from the HTTP form's "Salvar". `perigo` is the `.bp-btn--delete` ("Excluir fluxo", "Excluir chave") — text/border in the error ink, no new solid background so as not to invent a contrast pairing the ruler doesn't have.
 */
export function BotaoBds({
  variante = 'primary',
  icone,
  children,
  ...resto
}: {
  variante?: 'primary' | 'secondary' | 'tertiary' | 'bot' | 'perigo';
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

/** `<bds-button-icon variant="secondary" size="short">`: 40×40, 8 radius, 24px icon. */
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
