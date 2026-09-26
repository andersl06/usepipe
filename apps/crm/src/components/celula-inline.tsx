'use client';

import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { salvarCampoDoLead } from '../app/leads/actions';
import { CAMPOS_EDITAVEIS, normalizar, recusar, type KeyField } from '../lib/campos-editaveis';
import type { Proprietario } from '../lib/leads-visao';
import { IconeCrm } from './icones-crm';

/**
 * The field that's edited in place. It's Twenty's `record-inline-cell`, written
 * from scratch — `twenty-front` is AGPL and doesn't go in here. What was copied
 * is measurement and behavior, read from
 * `object-record/record-inline-cell/components/RecordInlineCell*.tsx`:
 *
 * - **No form.** Clicking the value swaps the text for a field in the same spot,
 *   and the rest of the screen doesn't move. The 4px gap the value already has
 *   around it (theirs, `spacing[1]`) is offset with a negative margin: without
 *   that the text shifts 4px when it becomes editable, and a field that jumps
 *   when touched is what makes someone doubt it saved correctly.
 * - **The pencil icon only shows on hover**, and disappears when the field is
 *   empty — because an empty field is already an invitation to click, and the
 *   icon would only take up width.
 * - **Enter and leaving the field save; Esc discards.** That's their contract,
 *   and it's what any spreadsheet does.
 *
 * What we **didn't** copy: they open the editor in a floating portal anchored
 * with `floating-ui`, to fit the date picker and the relation picker over the
 * narrow sidebar. Here the fields are text and a native select, which fit
 * within the row's own width. A portal for a 24px `<input>` would be 200 lines
 * to solve a problem we don't have — and the native `<select>` already opens
 * over everything on its own.
 *
 * **The displayed value is always what the server confirmed.** While saving,
 * the cell shows the new one (otherwise it looks stuck); if it fails, it
 * **reverts to the previous value** and says why. It's the product's rule:
 * never claim success on a row that didn't change.
 */

interface Props {
  leadId: string;
  campo: KeyField;
  /** The saved value. For a selection it's the id; the label comes from `opcoes`. */
  value: string | null;
  /** Only for `tipo: 'selecao'`. Empty in the list means "no owner". */
  options?: Proprietario[];
  /** What shows when there's no value. Default: the field's label. */
  empty?: string;
  /**
   * How to draw the value at rest.
   *
   * It exists because of the listing: there, `origem` is a badge, and swapping it
   * for raw text when making the cell editable would trade formatting information
   * for editability. It's what Twenty's `record-table-cell` does — the cell's
   * display stays the field's own, and only the editing part is shared.
   */
  pintar?: (texto: string) => ReactNode;
}

export function CelulaInline({ leadId, campo, value, options = [], empty, pintar }: Props) {
  const { rotulo, tipo, maximo } = CAMPOS_EDITAVEIS[campo];
  const [gravado, setGravado] = useState<string | null>(value);
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [emCurso, iniciar] = useTransition();
  const campoRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null);
  /**
   * Locks out `blur` when it's Esc that's closing: otherwise it would save what
   * the person just told it to discard.
   */
  const desistindo = useRef(false);

  // The record is server-rendered: after `revalidatePath` it comes back with the new value, and
  // that's the one that counts. Without this, editing, leaving and coming back would show the old
  // local state until a full reload.
  useEffect(() => setGravado(value), [value]);

  useEffect(() => {
    if (!editando) return;
    const el = campoRef.current;
    el?.focus();
    if (el instanceof HTMLInputElement) el.select();
  }, [editando]);

  const rotuloDe = (id: string | null) =>
    id === null ? null : (options.find((o) => o.id === id)?.name ?? id);

  const texto = tipo === 'selecao' ? rotuloDe(gravado) : gravado;
  const placeholder = empty ?? rotulo;

  function abrir() {
    setError(null);
    setRascunho(gravado ?? '');
    setEditando(true);
  }

  function fechar() {
    desistindo.current = true;
    setEditando(false);
    setError(null);
  }

  function gravar(bruto: string) {
    setEditando(false);
    const novo = normalizar(bruto);
    if (novo === gravado) {
      setError(null);
      return;
    }

    // The same rejection the server does, before the round trip: an email without an @ doesn't
    // precisa de ida e volta para ser recusado.
    const queixa = recusar(campo, novo);
    if (queixa) {
      setError(queixa);
      return;
    }

    const anterior = gravado;
    setGravado(novo); // otimista: a célula mostra o novo enquanto grava.
    setError(null);
    iniciar(async () => {
      const r = await salvarCampoDoLead(leadId, campo, bruto, anterior);
      setGravado(r.value);
      setError(r.ok ? null : (r.error ?? 'Não deu para gravar.'));
    });
  }

  if (editando) {
    const comuns = {
      className: 'editar',
      'aria-label': rotulo,
      onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
        if (desistindo.current) {
          desistindo.current = false;
          return;
        }
        gravar(e.currentTarget.value);
      },
      onKeyDown: (e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          fechar();
        }
        // In a `<select>` Enter already closes the list; letting `blur` save avoids
        // gravar duas vezes o mesmo valor.
        if (e.key === 'Enter' && e.currentTarget instanceof HTMLInputElement) {
          e.preventDefault();
          gravar(e.currentTarget.value);
        }
      },
    };

    return (
      <span className="inline">
        {tipo === 'selecao' ? (
          <select
            {...comuns}
            ref={(el) => {
              campoRef.current = el;
            }}
            value={rascunho}
            onChange={(e) => setRascunho(e.target.value)}
          >
            <option value="">sem {rotulo.toLowerCase()}</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        ) : (
          <input
            {...comuns}
            ref={(el) => {
              campoRef.current = el;
            }}
            type="text"
            maxLength={maximo}
            value={rascunho}
            onChange={(e) => setRascunho(e.target.value)}
          />
        )}
      </span>
    );
  }

  return (
    <span className={`inline${emCurso ? ' gravando' : ''}`}>
      <button
        type="button"
        className={texto ? 'ver' : 'ver sem'}
        onClick={abrir}
        title={`Editar ${rotulo.toLowerCase()}`}
      >
        {texto === null ? placeholder : (pintar?.(texto) ?? texto)}
      </button>
      {texto ? (
        <span className="lapis" aria-hidden="true">
          <IconeCrm nome="lapis" tamanho={16} />
        </span>
      ) : null}
      {error ? (
        <span className="queixa" role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}
