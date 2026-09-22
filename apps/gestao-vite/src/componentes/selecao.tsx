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

type Opcao = { valor: string; rotulo: ReactNode; desabilitada: boolean };

function opcoesDe(children: ReactNode): Opcao[] {
  return Children.toArray(children).flatMap((filho) => {
    if (!isValidElement(filho)) return [];
    if (filho.type === Fragment) return opcoesDe((filho.props as { children?: ReactNode }).children);
    if (filho.type !== 'option') return [];
    const props = filho.props as { value?: string | number; disabled?: boolean; children?: ReactNode };
    return [{
      valor: String(props.value ?? ''),
      rotulo: props.children,
      desabilitada: Boolean(props.disabled),
    }];
  });
}

/**
 * Um único select da Gestão, com a caixa e a lista do `bds-select` da Blip.
 * O input hidden preserva `name` e o envio GET/POST dos formulários existentes;
 * o evento continua expondo `.target.value`, como o select nativo substituído.
 */
export function Selecao({
  children,
  className,
  defaultValue,
  disabled,
  name,
  onChange,
  value,
  'aria-label': ariaLabel,
}: Omit<ComponentPropsWithoutRef<'select'>, 'multiple' | 'size' | 'children'> & { children: ReactNode }) {
  const opcoes = opcoesDe(children);
  const inicial = String(value ?? defaultValue ?? opcoes.find((opcao) => !opcao.desabilitada)?.valor ?? '');
  const [selecionado, setSelecionado] = useState(inicial);
  const [aberto, setAberto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLInputElement>(null);
  const listaId = useId();
  const atual = value === undefined ? selecionado : String(value);
  const opcaoAtual = opcoes.find((opcao) => opcao.valor === atual);

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

  function escolher(valor: string) {
    if (value === undefined) setSelecionado(valor);
    setAberto(false);
    if (campo.current) campo.current.value = valor;
    const alvo = campo.current as unknown as HTMLSelectElement;
    onChange?.({ target: alvo, currentTarget: alvo } as ChangeEvent<HTMLSelectElement>);
  }

  function aoTeclar(evento: KeyboardEvent<HTMLButtonElement>) {
    const disponiveis = opcoes.filter((opcao) => !opcao.desabilitada);
    const indice = Math.max(0, disponiveis.findIndex((opcao) => opcao.valor === atual));
    if (evento.key === 'Escape') {
      setAberto(false);
      return;
    }
    if (evento.key === 'Enter' || evento.key === ' ') {
      evento.preventDefault();
      setAberto((estado) => !estado);
      return;
    }
    const destino =
      evento.key === 'ArrowDown' ? disponiveis[Math.min(indice + 1, disponiveis.length - 1)] :
      evento.key === 'ArrowUp' ? disponiveis[Math.max(indice - 1, 0)] :
      evento.key === 'Home' ? disponiveis[0] :
      evento.key === 'End' ? disponiveis.at(-1) : undefined;
    if (destino) {
      evento.preventDefault();
      escolher(destino.valor);
    }
  }

  return (
    <div ref={raiz} className={['selecao', className].filter(Boolean).join(' ')}>
      <input ref={campo} type="hidden" name={name} value={atual} />
      <button
        type="button"
        className="selecao-controle"
        disabled={disabled}
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={aberto}
        aria-controls={listaId}
        aria-haspopup="listbox"
        aria-activedescendant={opcaoAtual ? `${listaId}-${opcaoAtual.valor}` : undefined}
        onClick={() => setAberto((estado) => !estado)}
        onKeyDown={aoTeclar}
      >
        <span className={opcaoAtual ? undefined : 'selecao-placeholder'}>{opcaoAtual?.rotulo}</span>
        <Icone nome="baixo" tamanho={16} />
      </button>
      {aberto ? (
        <div id={listaId} className="selecao-lista" role="listbox" aria-label={ariaLabel}>
          {opcoes.map((opcao) => (
            <button
              key={opcao.valor}
              id={`${listaId}-${opcao.valor}`}
              type="button"
              role="option"
              aria-selected={opcao.valor === atual}
              disabled={opcao.desabilitada}
              className={opcao.valor === atual ? 'selecionada' : undefined}
              onClick={() => escolher(opcao.valor)}
            >
              {opcao.rotulo}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
