import { useActionState, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Botao, Etiqueta } from '@pipe/ui';
import { envioQuePreserva } from './envio-de-formulario';

/**
 * Configuration card follows `blip-telas-cadastro.md` Section 3: 20/700 title, 14/400 description, section switch aligned right, and content below. Save belongs to each card's lower-right corner; reference General Settings has no global Save, and each card starts with Save disabled. A disabled Save communicates no changes, unlike a disabled menu destination; keep it visible so the footer does not jump as the user types. Track dirty state on the whole `<form>` element's `onChange`, relying on React event bubbling instead of N controlled states.
 */

export interface CardResult {
  ok: boolean;
  error?: string;
}

export interface SectionSwitch {
  /** Form field name is included in `FormData` only when the switch is on, like a checkbox. */
  name: string;
  rotulo: string;
  ligado: boolean;
}

export function CardConfig({
  titulo,
  explanation,
  acao,
  interruptor,
  children,
  rodape,
}: {
  titulo: string;
  explanation: ReactNode;
  acao: (anterior: CardResult, data: FormData) => Promise<CardResult>;
  interruptor?: SectionSwitch;
  children: ReactNode;
  /** Text to the left of Save states in one line what this card controls. */
  rodape?: ReactNode;
}) {
  const [resultado, enviar, enviando] = useActionState(acao, { ok: true });
  const [sujo, setSujo] = useState(false);
  const [ligado, setLigado] = useState(interruptor?.ligado ?? true);

  useEffect(() => {
    if (resultado.ok) setSujo(false);
  }, [resultado]);

  const idTitulo = `cfg-${titulo.replace(/\W+/g, '-').toLowerCase()}`;

  return (
    <form
      className="card-config"
      data-ligado={interruptor ? String(ligado) : undefined}
      onChange={() => setSujo(true)}
      onSubmit={envioQuePreserva(enviar)}
      aria-labelledby={idTitulo}
    >
      <header>
        <div>
          <h3 id={idTitulo}>{titulo}</h3>
          <p>{explanation}</p>
        </div>

        {interruptor ? (
          <>
            <button
              type="button"
              className="interruptor"
              role="switch"
              aria-checked={ligado}
              aria-label={interruptor.rotulo}
              title={interruptor.rotulo}
              disabled={enviando}
              onClick={() => {
                setLigado((v) => !v);
                setSujo(true);
              }}
            >
              <span className="interruptor-bolinha" />
            </button>
            {/*
 * React state is invisible to `FormData`; provide a real hidden input only when the switch is on. The action tests `dados.get(name) !== null`.
 */}
            {ligado ? <input type="hidden" name={interruptor.name} value="1" /> : null}
          </>
        ) : null}
      </header>

      <div className="card-config-body">{children}</div>

      {resultado.error ? <Etiqueta tom="erro">{resultado.error}</Etiqueta> : null}

      <footer>
        {rodape ? <span className="sub">{rodape}</span> : null}
        <Botao type="submit" variante="primario" disabled={!sujo || enviando}>
          {enviando ? 'Salvando…' : 'Salvar'}
        </Botao>
      </footer>
    </form>
  );
}
