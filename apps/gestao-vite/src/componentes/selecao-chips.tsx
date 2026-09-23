import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import './selecao-chips.css';

type Opcao = { id: string; nome: string };

/** Geometria do bds-select-chips e chip-clickable da referência do Atendimento. */
export function SelecaoChips({
  name,
  rotulo,
  placeholder,
  opcoes,
  valoresIniciais = [],
}: {
  name: string;
  rotulo: string;
  placeholder: string;
  opcoes: readonly Opcao[];
  valoresIniciais?: readonly string[];
}) {
  const [valores, setValores] = useState(() => [...new Set(valoresIniciais)]);
  const [busca, setBusca] = useState('');
  const [aberta, setAberta] = useState(false);
  const [indice, setIndice] = useState(0);
  const raiz = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listaId = useId();
  const normalizar = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase();
  const disponiveis = opcoes.filter(
    (o) => !valores.includes(o.id) && normalizar(o.nome).includes(normalizar(busca)),
  );
  const ativo = disponiveis[Math.min(indice, disponiveis.length - 1)];

  useEffect(() => {
    function fechar(evento: PointerEvent) {
      if (!raiz.current?.contains(evento.target as Node)) setAberta(false);
    }
    document.addEventListener('pointerdown', fechar);
    return () => document.removeEventListener('pointerdown', fechar);
  }, []);

  function adicionar(id: string) {
    setValores((atuais) => (atuais.includes(id) ? atuais : [...atuais, id]));
    setBusca('');
    setIndice(0);
    setAberta(false);
    input.current?.focus();
  }

  function teclar(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      setAberta(false);
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setAberta(true);
      setIndice((i) =>
        !aberta
          ? 0
          : Math.max(0, Math.min(disponiveis.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1))),
      );
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (aberta && ativo) adicionar(ativo.id);
      else setAberta(true);
    }
    if (e.key === 'Backspace' && !busca) setValores((atuais) => atuais.slice(0, -1));
  }

  return (
    <div
      className="at-selecao-chips"
      ref={raiz}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setAberta(false);
      }}
    >
      <div
        className="at-sc-campo"
        onClick={() => {
          input.current?.focus();
          setAberta(true);
        }}
      >
        <div className="at-sc-conteudo">
          {valores.length > 0 && (
            <span className="at-sc-chips">
              {valores.map((id) => {
                const nome = opcoes.find((o) => o.id === id)?.nome ?? id;
                return (
                  <span className="at-sc-chip" key={id}>
                    <span className="at-sc-chip-texto" title={nome}>
                      {nome}
                    </span>
                    <button
                      type="button"
                      className="at-sc-remover"
                      aria-label={`Remover ${nome}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setValores((atuais) => atuais.filter((v) => v !== id));
                        input.current?.focus();
                      }}
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        aria-hidden="true"
                      >
                        <path d="M12 2C10.0222 2 8.08879 2.58649 6.4443 3.6853C4.79981 4.78412 3.51809 6.3459 2.76121 8.17317C2.00433 10.0004 1.8063 12.0111 2.19215 13.9509C2.578 15.8907 3.53041 17.6725 4.92894 19.0711C6.32746 20.4696 8.10929 21.422 10.0491 21.8079C11.9889 22.1937 13.9996 21.9957 15.8268 21.2388C17.6541 20.4819 19.2159 19.2002 20.3147 17.5557C21.4135 15.9112 22 13.9778 22 12C22 10.6868 21.7413 9.38642 21.2388 8.17317C20.7363 6.95991 19.9997 5.85752 19.0711 4.92893C18.1425 4.00035 17.0401 3.26375 15.8268 2.7612C14.6136 2.25866 13.3132 2 12 2ZM15.64 14.34C15.8086 14.5104 15.9031 14.7403 15.9031 14.98C15.9031 15.2197 15.8086 15.4496 15.64 15.62C15.4684 15.7862 15.2389 15.8791 15 15.8791C14.7611 15.8791 14.5316 15.7862 14.36 15.62L12 13.27L9.64 15.64C9.4684 15.8062 9.23888 15.8991 9 15.8991C8.76112 15.8991 8.53161 15.8062 8.36 15.64C8.19146 15.4696 8.09692 15.2397 8.09692 15C8.09692 14.7603 8.19146 14.5304 8.36 14.36L10.73 12L8.36 9.64C8.21825 9.46525 8.14626 9.24419 8.15794 9.01947C8.16962 8.79476 8.26414 8.58235 8.42325 8.42324C8.58235 8.26413 8.79477 8.16961 9.01948 8.15794C9.24419 8.14626 9.46526 8.21824 9.64 8.36L12 10.73L14.36 8.36C14.5348 8.21824 14.7558 8.14626 14.9805 8.15794C15.2052 8.16961 15.4177 8.26413 15.5768 8.42324C15.7359 8.58235 15.8304 8.79476 15.8421 9.01947C15.8537 9.24419 15.7818 9.46525 15.64 9.64L13.27 12L15.64 14.34Z" />
                      </svg>
                    </button>
                  </span>
                );
              })}
            </span>
          )}
          <input
            ref={input}
            className="at-sc-busca"
            type="text"
            role="combobox"
            aria-label={rotulo}
            aria-expanded={aberta}
            aria-controls={listaId}
            aria-autocomplete="list"
            aria-activedescendant={aberta && ativo ? `${listaId}-${ativo.id}` : undefined}
            autoComplete="off"
            placeholder={placeholder}
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value);
              setIndice(0);
              setAberta(true);
            }}
            onKeyDown={teclar}
          />
        </div>
        <button
          type="button"
          className="at-sc-seta"
          aria-label={`Opções de ${rotulo.toLocaleLowerCase()}`}
          aria-expanded={aberta}
          aria-controls={listaId}
          onClick={(e) => {
            e.stopPropagation();
            input.current?.focus();
            setAberta((v) => !v);
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12.1498 15.9001C12.0513 15.9005 11.9537 15.8813 11.8627 15.8435C11.7716 15.8058 11.6891 15.7502 11.6198 15.6801L6.21985 10.2801C6.08737 10.1379 6.01524 9.94985 6.01867 9.75555C6.0221 9.56125 6.10081 9.37586 6.23822 9.23845C6.37564 9.10104 6.56102 9.02233 6.75532 9.0189C6.94963 9.01547 7.13767 9.08759 7.27985 9.22007L12.1498 14.0901L16.9998 9.22007C17.1405 9.07962 17.3311 9.00073 17.5298 9.00073C17.7286 9.00073 17.9192 9.07962 18.0598 9.22007C18.1306 9.28902 18.1868 9.37143 18.2252 9.46246C18.2636 9.55349 18.2834 9.65128 18.2834 9.75007C18.2834 9.84887 18.2636 9.94666 18.2252 10.0377C18.1868 10.1287 18.1306 10.2111 18.0598 10.2801L12.6598 15.6801C12.5255 15.8177 12.3422 15.8968 12.1498 15.9001Z" />
          </svg>
        </button>
      </div>
      {aberta && (
        <div
          className="at-sc-opcoes"
          id={listaId}
          role="listbox"
          aria-label={rotulo}
          aria-multiselectable="true"
        >
          {disponiveis.length ? (
            disponiveis.map((o) => (
              <button
                type="button"
                role="option"
                aria-selected="false"
                id={`${listaId}-${o.id}`}
                key={o.id}
                tabIndex={-1}
                className={ativo?.id === o.id ? 'at-sc-opcao-ativa' : undefined}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => adicionar(o.id)}
              >
                {o.nome}
              </button>
            ))
          ) : (
            <div className="at-sc-vazio">Nenhum resultado encontrado</div>
          )}
        </div>
      )}
      <input type="hidden" name={name} value={valores.join(',')} />
    </div>
  );
}
