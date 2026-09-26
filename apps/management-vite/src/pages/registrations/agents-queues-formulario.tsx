import { useEffect, useRef, useState } from 'react';
import { useActionState } from 'react';
import { Botao, Campo, Etiqueta } from '@pipe/ui';
import { salvarQueue } from '../../lib/actions';
import { envioQuePreserva } from '../../components/envio-de-formulario';

/**
 * The "Criar nova fila" modal — the FORM matches the source, and it's minimal (`referencias-blip/fichas/FICHA-atendentes-filas-pausas.md` §a.2, extracted from the `bds-modal` that `queue-management.html` carries in the DOM with `open="false"`):
 *
 *   title    "Criar nova fila"
 *   text     "Dê um nome para essa fila de atendimento"
 *   field    placeholder "Nome da fila"
 *   hint     "Use apenas letras, números, hifens (-) e sublinhados (_)"
 *   buttons  "Cancelar"  "Salvar"  (the second disabled until there's a name)
 *
 * **Only one field, and the other four went to the edit page.** This form used to have color, default capacity, order, schedule, and "ativa" in the same box — five fields the source doesn't ask for here. They didn't disappear: they live in "Dados da fila", on the `atendentes/filas/:id/editar` page, which is also where the source puts queue configuration. What still travels along at creation are the DEFAULTS (capacity 5, order 0, active), in a hidden field, because `criarFila` requires `capacidadePadrao` between 1 and 200 and a queue is born active.
 *
 * The character hint is literal from the source. We don't reject names with accents (`nomeDeFilaConferido` only requires non-empty), so it's guidance, not a promise of validation — stated that way on purpose.
 */
export function FormularioQueue({
  aoSalvar,
}: {
  /** Closes the modal when the save succeeds. */
  aoSalvar?: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  /*
   * Controlled only so "Salvar" starts disabled, like the source's `save-button` — not to hold the value, which `FormData` already carries.
   */
  const [nome, setNome] = useState('');
  const [resultado, enviar, enviando] = useActionState(salvarQueue, { ok: true });
  /*
   * See the equivalent comment in `regras-atendimento-formulario.tsx`: `useActionState`'s initial value isn't a submission confirmation.
   */
  const stateInitial = useRef(resultado);

  useEffect(() => {
    if (resultado === stateInitial.current) return;
    if (resultado.ok) {
      formRef.current?.reset();
      setNome('');
      aoSalvar?.();
    }
  }, [resultado]);

  return (
    <form ref={formRef} onSubmit={envioQuePreserva(enviar)} className="form-registration">
      <p className="sub">Dê um nome para essa fila de atendimento</p>

      <label className="form-campo">
        <Campo
          name="nome"
          placeholder="Nome da fila"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          required
          disabled={enviando}
        />
      </label>
      <p className="note">Use apenas letras, números, hifens (-) e sublinhados (_)</p>

      {/*
 * The new queue's defaults. Editable in "Dados da fila", on the edit page — they only exist here because `criarFila` requires the capacity.
 */}
      <input type="hidden" name="capacidadePadrao" value={5} />
      <input type="hidden" name="ordem" value={0} />
      <input type="hidden" name="ativa" value="on" />

      {resultado.error ? <Etiqueta tom="erro">{resultado.error}</Etiqueta> : null}

      <div className="cl-actions">
        <Botao type="button" onClick={aoSalvar} disabled={enviando}>
          Cancelar
        </Botao>
        <Botao type="submit" variante="primario" disabled={enviando || nome.trim() === ''}>
          {enviando ? 'Salvando…' : 'Salvar'}
        </Botao>
      </div>
    </form>
  );
}
