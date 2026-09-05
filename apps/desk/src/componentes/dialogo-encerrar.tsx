'use client';

import { useActionState, useEffect, useRef } from 'react';
import { encerrarConversa } from '../app/acoes';
import type { EtiquetaDoDesk } from '../servidor/consultas';

/**
 * Encerramento com etiqueta obrigatória.
 *
 * O diálogo é um só e vive no rodapé da conversa; tanto o botão "Encerrar" do cabeçalho
 * quanto o comando `/encerrar` do compositor abrem este mesmo elemento por `id`. É o que
 * evita duas cópias do mesmo formulário só porque o gatilho está em outro canto da tela.
 */

export const ID_DIALOGO_ENCERRAR = 'dialogo-encerrar';

export function abrirDialogoEncerrar(): void {
  const elemento = document.getElementById(ID_DIALOGO_ENCERRAR);
  if (elemento instanceof HTMLDialogElement) elemento.showModal();
}

export function DialogoEncerrar({
  conversaId,
  etiquetas,
}: {
  conversaId: string;
  etiquetas: EtiquetaDoDesk[];
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [resultado, enviar, enviando] = useActionState(encerrarConversa, { ok: true });

  useEffect(() => {
    if (resultado.ok) dialogo.current?.close();
  }, [resultado]);

  const deEncerramento = etiquetas.filter((e) => e.obrigatoriaNoEncerramento);

  return (
    <dialog id={ID_DIALOGO_ENCERRAR} ref={dialogo} aria-label="Encerrar atendimento">
      <form action={enviar}>
        <input type="hidden" name="conversaId" value={conversaId} />
        <h4>Encerrar atendimento</h4>
        <p>
          A etiqueta de encerramento é obrigatória: conversa fechada sem motivo é relatório que
          não explica nada depois.
        </p>

        <div className="opcoes">
          {deEncerramento.length === 0 ? (
            <p className="erro">
              Nenhuma etiqueta de encerramento cadastrada. O gestor cadastra em Pipe Gestão.
            </p>
          ) : (
            deEncerramento.map((etiqueta) => (
              <label className="opcao" key={etiqueta.id}>
                <input type="radio" name="etiquetaId" value={etiqueta.id} required />
                <span
                  className="dot"
                  style={{ ['--estado-cor' as string]: etiqueta.cor ?? 'var(--ink-3)' }}
                />
                {etiqueta.nome}
              </label>
            ))
          )}
        </div>

        {resultado.erro ? <p className="erro">{resultado.erro}</p> : null}

        <div className="rodape">
          <button
            type="button"
            className="btn"
            onClick={() => dialogo.current?.close()}
            disabled={enviando}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="btn primary"
            disabled={enviando || deEncerramento.length === 0}
          >
            {enviando ? 'Encerrando…' : 'Encerrar'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
