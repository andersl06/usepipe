'use client';

import { useActionState, useId, useState, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { Botao } from '@pipe/ui';
import type { Resultado } from '../../lib/settings-comum';

/**
 * The settings area's form, and the only one.
 *
 * Every settings screen is the same thing repeated: fields, a button, and a
 * server response that needs to show up in Portuguese. This lives here once
 * because writing it again across seven screens is how error messages drift
 * apart — three ways to say "it didn't work", one of them in English.
 *
 * Two choices worth explaining:
 *
 * - **A real `<form action={...}>`, with `useActionState`.** The submit is the
 *   browser's; JavaScript only improves it. Without it the page reloads and the
 *   setting still works — which is the minimum for a screen where someone can
 *   disable their own access by mistake.
 * - **The fields come from outside, as `children`.** They're rendered on the
 *   server and arrive ready, so this file — the area's only `'use client'` —
 *   doesn't import anything that pulls in `pg`. `Resultado` is an `import
 * type`, and `configuracoes-comum.ts` never touches the database.
 */

export function Formulario({
  acao,
  children,
  botao,
  rotuloBotao = 'Salvar',
  className,
}: {
  acao: (anterior: Resultado | null, data: FormData) => Promise<Resultado>;
  children: ReactNode;
  /** Replaces the default button — it's how the delete confirmation gets triggered. */
  botao?: ReactNode;
  rotuloBotao?: string;
  className?: string;
}) {
  const [resultado, enviar] = useActionState(acao, null);

  return (
    <form action={enviar} className={className ? `cfg-form ${className}` : 'cfg-form'}>
      {children}
      <div className="cfg-form-fim">
        {botao ?? <BotaoDeEnvio rotulo={rotuloBotao} />}
        <Resposta resultado={resultado} />
      </div>
    </form>
  );
}

/**
 * The form for ONE table row: deactivating a member, revoking a key, canceling
 * an invite.
 *
 * Separate from `Formulario` because its shape is different — no title, no
 * "Saved." and the target comes in a hidden field, not typed. It's still a real
 * `form`: each row submits itself, and without JavaScript the page reloads with
 * the change applied.
 *
 * The id goes in `<input type="hidden">` and is checked with `ehUuid` on the
 * other side before becoming a `where`. A hidden field is a browser suggestion,
 * not a promise.
 */
export function FormularioDeLinha({
  acao,
  campos,
  children,
}: {
  acao: (anterior: Resultado | null, data: FormData) => Promise<Resultado>;
  campos: Record<string, string>;
  children: ReactNode;
}) {
  const [resultado, enviar] = useActionState(acao, null);

  return (
    <form action={enviar} className="cfg-linha-form">
      {Object.entries(campos).map(([nome, value]) => (
        <input key={nome} type="hidden" name={nome} value={value} />
      ))}
      {children}
      {resultado && !resultado.ok ? (
        <span className="cfg-aviso error" role="alert">
          {resultado.error}
        </span>
      ) : null}
    </form>
  );
}

/** Submit button with a waiting state. `useFormStatus` only works inside here. */
export function BotaoDeEnvio({
  rotulo = 'Salvar',
  variante = 'primario',
}: {
  rotulo?: string;
  variante?: 'padrao' | 'primario' | 'perigo';
}) {
  const { pending } = useFormStatus();
  return (
    <Botao type="submit" variante={variante} disabled={pending}>
      {pending ? 'Salvando…' : rotulo}
    </Botao>
  );
}

/**
 * Two-tap confirmation, instead of a browser `confirm()`.
 *
 * The first click arms it and says what's about to happen, with `role="alert"` so
 * that a screen reader user hears the question instead of just finding a new
 * button. The second confirms. No modal dialog: a modal for one sentence is
 * stolen focus and one more keyboard trap to maintain.
 */
export function ConfirmationButton({
  rotulo,
  pergunta,
  rotuloConfirmar = 'Confirmar',
}: {
  rotulo: string;
  pergunta: string;
  rotuloConfirmar?: string;
}) {
  const [armado, setArmado] = useState(false);
  const { pending } = useFormStatus();

  if (!armado) {
    return (
      <Botao variante="perigo" onClick={() => setArmado(true)}>
        {rotulo}
      </Botao>
    );
  }

  return (
    <span className="cfg-confirmar">
      <span role="alert">{pergunta}</span>
      <Botao type="submit" variante="perigo" disabled={pending}>
        {pending ? 'Aplicando…' : rotuloConfirmar}
      </Botao>
      <Botao onClick={() => setArmado(false)}>Cancelar</Botao>
    </span>
  );
}

/**
 * The server's response.
 *
 * Error is `role="alert"` (interrupts: the person needs to know it didn't save);
 * success is `role="status"` (announces without cutting off what's being read).
 * Swapping the two is the classic mistake that makes a screen reader announce
 * "saved" over whatever the person was typing.
 */
function Resposta({ resultado }: { resultado: Resultado | null }) {
  if (!resultado) return null;

  if (!resultado.ok) {
    return (
      <span className="cfg-aviso error" role="alert">
        {resultado.error}
      </span>
    );
  }

  if (resultado.secret) return <Secret value={resultado.secret} />;

  return (
    <span className="cfg-aviso ok" role="status">
      Salvo.
    </span>
  );
}

/**
 * The secret that shows up ONCE: an API key token, an invite link, a webhook
 * secret. The database stores the hash (or the cipher), so reloading the page
 * doesn't bring it back — and the box says so, because finding out later costs a
 * new key.
 *
 * It's `readOnly`, not `disabled`, on purpose: a disabled field doesn't receive
 * focus and can't be copied with the keyboard.
 */
function Secret({ value }: { value: string }) {
  const [copiado, setCopiado] = useState(false);
  const idCampo = useId();

  return (
    <div className="cfg-secret" role="status">
      <label htmlFor={idCampo}>
        Copie agora — isto não aparece de novo.
        <input id={idCampo} className="campo mono" readOnly value={value} />
      </label>
      <Botao
        onClick={() => {
          void navigator.clipboard?.writeText(value).then(() => setCopiado(true));
        }}
      >
        {copiado ? 'Copiado' : 'Copiar'}
      </Botao>
    </div>
  );
}
