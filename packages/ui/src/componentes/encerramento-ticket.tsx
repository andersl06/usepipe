import { useState } from 'react';
import { Icone } from '../icones';
import { encerramentoPodeConfirmar, type EtiquetaDeEncerramento } from '../regras-encerramento';

/**
 * Modal compartilhado, baseado no `close-ticket-modal` compilado do Desk e
 * nas traduções do modal `closeTicket` de Monitoramento.
 */
export function CartaoEncerramentoTicket({
  numero,
  etiquetas,
  selecionadas,
  erro,
  enviando = false,
  aoSelecionar,
  aoCancelar,
  aoFinalizar,
}: {
  numero: string;
  etiquetas: readonly EtiquetaDeEncerramento[];
  selecionadas: readonly string[];
  erro?: string | null;
  enviando?: boolean;
  aoSelecionar: (ids: string[]) => void;
  aoCancelar: () => void;
  aoFinalizar: () => void;
}) {
  const [listaAberta, setListaAberta] = useState(false);
  const podeFinalizar = encerramentoPodeConfirmar(etiquetas, selecionadas, enviando);
  const selecionadasVisiveis = etiquetas.filter((etiqueta) => selecionadas.includes(etiqueta.id));

  function alternar(id: string) {
    aoSelecionar(selecionadas.includes(id)
      ? selecionadas.filter((selecionada) => selecionada !== id)
      : [...selecionadas, id]);
  }

  return (
    <div className="pipe-encerramento-fundo" role="presentation" onClick={aoCancelar}>
      <section
        className="pipe-encerramento"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pipe-encerramento-titulo"
        onClick={(evento) => evento.stopPropagation()}
        >
        <button type="button" className="pipe-encerramento-x" aria-label="Fechar" onClick={aoCancelar}>
          <Icone nome="x" tamanho={20} />
        </button>
        <div className="pipe-encerramento-conteudo">
          <div className="pipe-encerramento-ilustracao" aria-hidden="true" />
          <div className="pipe-encerramento-detalhes">
            <h2 id="pipe-encerramento-titulo">Finalizar atendimento do Ticket {numero.startsWith('#') ? numero : `#${numero}`}</h2>
            {etiquetas.length === 0 ? (
              <div className="pipe-encerramento-sem-tags">
                <p>Finalizar o atendimento zera as ações do usuário com o bot.<br />Novas interações geram um novo Ticket.</p>
                <p className="forte">Deseja continuar?</p>
              </div>
            ) : (
              <div className="pipe-encerramento-tags">
                <div
                  className="pipe-encerramento-seletor"
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
                  <span className="pipe-encerramento-chips">
                    {selecionadasVisiveis.length
                      ? selecionadasVisiveis.map((etiqueta) => (
                          <button
                            type="button"
                            className="pipe-encerramento-chip"
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
                      : <span className="pipe-encerramento-placeholder">Selecione as tags</span>}
                  </span>
                  <Icone nome="baixo" tamanho={16} />
                </div>
                {listaAberta ? (
                  <div className="pipe-encerramento-opcoes" role="group" aria-label="Tags de encerramento">
                    {etiquetas.map((etiqueta) => {
                      const marcada = selecionadas.includes(etiqueta.id);
                      return (
                        <button
                          type="button"
                          key={etiqueta.id}
                          aria-pressed={marcada}
                          onClick={() => alternar(etiqueta.id)}
                        >
                          <span className={marcada ? 'pipe-encerramento-caixa marcada' : 'pipe-encerramento-caixa'} />
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
        {erro ? <p className="pipe-encerramento-erro" role="alert">{erro}</p> : null}
        <div className="pipe-encerramento-acoes">
          <button type="button" className="secundario" onClick={aoCancelar} disabled={enviando}>Cancelar</button>
          <button type="button" className="primario" onClick={aoFinalizar} disabled={!podeFinalizar}>Finalizar</button>
        </div>
      </section>
    </div>
  );
}
