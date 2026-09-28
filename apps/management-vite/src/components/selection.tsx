import {
  Children,
  Fragment,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type ComponentPropsWithoutRef,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { Icone } from '@pipe/ui';

type Option = { value: string; rotulo: ReactNode; desabilitada: boolean };

function optionsOf(children: ReactNode): Option[] {
  return Children.toArray(children).flatMap((filho) => {
    if (!isValidElement(filho)) return [];
    if (filho.type === Fragment) return optionsOf((filho.props as { children?: ReactNode }).children);
    if (filho.type !== 'option') return [];
    const props = filho.props as { value?: string | number; disabled?: boolean; children?: ReactNode };
    return [{
      value: String(props.value ?? ''),
      rotulo: props.children,
      desabilitada: Boolean(props.disabled),
    }];
  });
}

/**
 * Provide one Gestao select matching Blip `bds-select` box and list. Its hidden input preserves `name` for existing GET/POST forms, while its event still exposes `.target.value` like the native select it replaces.
 */
export function Selection({
  children,
  className,
  defaultValue,
  disabled,
  name,
  onChange,
  value,
  rotulo,
  'aria-label': ariaLabel,
}: Omit<ComponentPropsWithoutRef<'select'>, 'multiple' | 'size' | 'children'> & {
  children: ReactNode;
  /** Internal label drawn inside `.selection-control`, above the value (`.bl-campo--interno > .sub` pattern). */
  rotulo?: string;
}) {
  const options = optionsOf(children);
  const inicial = String(value ?? defaultValue ?? options.find((option) => !option.desabilitada)?.value ?? '');
  const [selecionado, setSelecionado] = useState(inicial);
  const [aberto, setAberto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLInputElement>(null);
  const listaId = useId();
  const atual = value === undefined ? selecionado : String(value);
  const optionCurrent = options.find((option) => option.value === atual);

  useEffect(() => {
    if (value !== undefined) setSelecionado(String(value));
  }, [value]);

  useEffect(() => {
    function aoClicarFora(evento: MouseEvent) {
      if (!raiz.current?.contains(evento.target as Node)) setAberto(false);
    }
    document.addEventListener('mousedown', aoClicarFora);
    return () => document.removeEventListener('mousedown', aoClicarFora);
  }, []);

  // `escolhido`, not `value`: the parameter must not shadow the `value` prop, which is
  // what tells a controlled select (parent owns the value) from an uncontrolled one.
  function escolher(escolhido: string) {
    if (value === undefined) setSelecionado(escolhido);
    setAberto(false);
    if (campo.current) campo.current.value = escolhido;
    const alvo = campo.current as unknown as HTMLSelectElement;
    onChange?.({ target: alvo, currentTarget: alvo } as ChangeEvent<HTMLSelectElement>);
  }

  function aoTeclar(evento: KeyboardEvent<HTMLButtonElement>) {
    const disponiveis = options.filter((option) => !option.desabilitada);
    const indice = Math.max(0, disponiveis.findIndex((option) => option.value === atual));
    if (evento.key === 'Escape') {
      setAberto(false);
      return;
    }
    if (evento.key === 'Enter' || evento.key === ' ') {
      evento.preventDefault();
      setAberto((state) => !state);
      return;
    }
    const destination =
      evento.key === 'ArrowDown' ? disponiveis[Math.min(indice + 1, disponiveis.length - 1)] :
      evento.key === 'ArrowUp' ? disponiveis[Math.max(indice - 1, 0)] :
      evento.key === 'Home' ? disponiveis[0] :
      evento.key === 'End' ? disponiveis.at(-1) : undefined;
    if (destination) {
      evento.preventDefault();
      escolher(destination.value);
    }
  }

  return (
    <div ref={raiz} className={['selection', className].filter(Boolean).join(' ')}>
      <input ref={campo} type="hidden" name={name} value={atual} />
      <button
        type="button"
        className="selection-control"
        disabled={disabled}
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={aberto}
        aria-controls={listaId}
        aria-haspopup="listbox"
        aria-activedescendant={optionCurrent ? `${listaId}-${optionCurrent.value}` : undefined}
        onClick={() => setAberto((state) => !state)}
        onKeyDown={aoTeclar}
      >
        {rotulo ? <span className="sub">{rotulo}</span> : null}
        <span className={optionCurrent ? undefined : 'selection-placeholder'}>{optionCurrent?.rotulo}</span>
        <Icone nome="baixo" tamanho={16} />
      </button>
      {aberto ? (
        <div id={listaId} className="selection-list" role="listbox" aria-label={ariaLabel}>
          {options.map((option) => (
            <button
              key={option.value}
              id={`${listaId}-${option.value}`}
              type="button"
              role="option"
              aria-selected={option.value === atual}
              disabled={option.desabilitada}
              className={option.value === atual ? 'selecionada' : undefined}
              onClick={(evento) => {
                // Pages wrap the select in a <label>. Without preventDefault the click on an
                // option also activates the label, which clicks the combobox and reopens the list.
                evento.preventDefault();
                escolher(option.value);
              }}
            >
              {option.rotulo}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
