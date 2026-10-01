'use client';

import { useState } from 'react';
import { Icone } from '../icones';
import { closureCanConfirm, type ClosureTag } from '../rules-closure';

/**
 * Shared modal based on the compiled Desk `close-ticket-modal` and Monitoring's `closeTicket` modal translations.
 */
export function CardClosureTicket({
  numero,
  etiquetas,
  selecionadas,
  error,
  enviando = false,
  aoSelecionar,
  aoCancelar,
  aoFinalizar,
}: {
  numero: string;
  etiquetas: readonly ClosureTag[];
  selecionadas: readonly string[];
  error?: string | null;
  enviando?: boolean;
  aoSelecionar: (ids: string[]) => void;
  aoCancelar: () => void;
  aoFinalizar: () => void;
}) {
  const [listaAberta, setListaAberta] = useState(false);
  const podeFinalizar = closureCanConfirm(etiquetas, selecionadas, enviando);
  const selecionadasVisiveis = etiquetas.filter((etiqueta) => selecionadas.includes(etiqueta.id));

  function alternar(id: string) {
    aoSelecionar(selecionadas.includes(id)
      ? selecionadas.filter((selecionada) => selecionada !== id)
      : [...selecionadas, id]);
  }

  return (
    <div className="pipe-closure-background" role="presentation" onClick={aoCancelar}>
      <section
        className="pipe-closure"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pipe-encerramento-titulo"
        onClick={(evento) => evento.stopPropagation()}
        >
        <button type="button" className="pipe-closure-x" aria-label="Fechar" onClick={aoCancelar}>
          <Icone nome="x" tamanho={20} />
        </button>
        <div className="pipe-closure-content">
          <div className="pipe-closure-illustration" aria-hidden="true" />
          <div className="pipe-closure-details">
            <h2 id="pipe-encerramento-titulo">Finalizar atendimento do Ticket {numero.startsWith('#') ? numero : `#${numero}`}</h2>
            {etiquetas.length === 0 ? (
              <div className="pipe-closure-no-tags">
                <p>Finalizar o atendimento zera as ações do usuário com o bot.<br />Novas interações geram um novo Ticket.</p>
                <p className="forte">Deseja continuar?</p>
              </div>
            ) : (
              <div className="pipe-closure-tags">
                <div
                  className="pipe-closure-selector"
                  role="combobox"
                  aria-label="Tags"
                  aria-haspopup="listbox"
                  aria-expanded={listaAberta}
                  tabIndex={enviando ? -1 : 0}
                  onClick={() => setListaAberta((aberta) => !aberta)}
                  onKeyDown={(evento) => {
                    if (evento.key === 'Enter' || evento.key === ' ') {
                      evento.preventDefault();
                      setListaAberta((aberta) => !aberta);
                    }
                  }}
                >
                  <span className="pipe-closure-chips">
                    {selecionadasVisiveis.length
                      ? selecionadasVisiveis.map((etiqueta) => (
                          <button
                            type="button"
                            className="pipe-closure-chip"
                            key={etiqueta.id}
                            aria-label={`Remover tag ${etiqueta.nome}`}
                            disabled={enviando}
                            onClick={(evento) => {
                              evento.stopPropagation();
                              alternar(etiqueta.id);
                            }}
                          >
                            {etiqueta.nome}
                            <span aria-hidden="true">×</span>
                          </button>
                        ))
                      : <span className="pipe-closure-placeholder">Selecione as tags</span>}
                  </span>
                  <Icone nome="baixo" tamanho={16} />
                </div>
                {listaAberta ? (
                  <div className="pipe-closure-options" role="group" aria-label="Tags de encerramento">
                    {etiquetas.map((etiqueta) => {
                      const marcada = selecionadas.includes(etiqueta.id);
                      return (
                        <button
                          type="button"
                          key={etiqueta.id}
                          aria-pressed={marcada}
                          onClick={() => alternar(etiqueta.id)}
                        >
                          <span className={marcada ? 'pipe-closure-box marcada' : 'pipe-closure-box'} />
                          {etiqueta.nome}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
        {error ? <p className="pipe-closure-error" role="alert">{error}</p> : null}
        <div className="pipe-closure-actions">
          <button type="button" className="secundario" autoFocus onClick={aoCancelar} disabled={enviando}>Cancelar</button>
          <button type="button" className="primario" onClick={aoFinalizar} disabled={!podeFinalizar}>Finalizar</button>
        </div>
      </section>
    </div>
  );
}
