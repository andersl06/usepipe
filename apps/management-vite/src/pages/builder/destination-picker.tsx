import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Icone } from '@pipe/ui';
import type { Block } from './model';
import { filterDestinations } from './variables';
import { ROTULOS_DAS_SAIDAS } from './conditions';

/**
 * The block-destination field behind every "Ir para" in the outputs panel (normal output, availability output,
 * default output): a search combobox — type part of the title or id, no accent/case sensitivity — matching the
 * reference's `bds-autocomplete` "Ir para" (label above the field, arrow-down indicator, dropdown list on the
 * panel surface, border highlighted while active).
 *
 * A destination pointing at an id no longer in the map still shows as `<id> (não existe)`, without losing the
 * value. The origin block can be its own destination too — the map allows the loopback, so this list never
 * excludes it (see `arestasDe` in `model.ts`). The search filter itself (`filterDestinations`) lives in
 * `variables.ts`, alongside the other search filters of this editor.
 */

export function DestinationPicker({
  valor,
  blocos,
  rotulo,
  onEscolher,
}: {
  valor: string;
  blocos: readonly Block[];
  rotulo: string;
  onEscolher: (id: string) => void;
}) {
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const raiz = useRef<HTMLLabelElement>(null);
  const listaId = useId();

  const atual = blocos.find((b) => b.id === valor);
  const rotuloAtual = atual ? atual.$title || atual.id : valor ? `${valor} (não existe)` : '';
  const opcoes = filterDestinations(blocos, busca);

  useEffect(() => {
    function aoClicarFora(evento: MouseEvent) {
      if (!raiz.current?.contains(evento.target as Node)) {
        setAberto(false);
        setBusca('');
      }
    }
    document.addEventListener('mousedown', aoClicarFora);
    return () => document.removeEventListener('mousedown', aoClicarFora);
  }, []);

  function escolher(id: string): void {
    onEscolher(id);
    setAberto(false);
    setBusca('');
  }

  function aoTeclar(evento: KeyboardEvent<HTMLInputElement>): void {
    if (evento.key === 'Escape') {
      setAberto(false);
      setBusca('');
      return;
    }
    if (evento.key === 'ArrowDown') {
      evento.preventDefault();
      setAberto(true);
      setAtivo((i) => Math.min(i + 1, opcoes.length - 1));
      return;
    }
    if (evento.key === 'ArrowUp') {
      evento.preventDefault();
      setAtivo((i) => Math.max(i - 1, 0));
      return;
    }
    if (evento.key === 'Enter') {
      evento.preventDefault();
      const escolhido = opcoes[ativo];
      if (escolhido) escolher(escolhido.id);
    }
  }

  return (
    <label className="bl-campo bl-campo--interno bl-destination-picker" ref={raiz}>
      <span className="sub">{rotulo}</span>
      <input
        type="text"
        role="combobox"
        aria-expanded={aberto}
        aria-controls={listaId}
        aria-haspopup="listbox"
        aria-activedescendant={aberto && opcoes[ativo] ? `${listaId}-${opcoes[ativo]!.id}` : undefined}
        className="campo bl-destination-picker-input"
        placeholder="Buscar bloco de destino…"
        value={aberto ? busca : rotuloAtual}
        onFocus={() => {
          setAberto(true);
          setBusca('');
          setAtivo(0);
        }}
        onBlur={() => {
          setAberto(false);
          setBusca('');
        }}
        onChange={(e) => {
          setBusca(e.target.value);
          setAtivo(0);
        }}
        onKeyDown={aoTeclar}
      />
      <Icone nome="baixo" tamanho={24} className="bl-destination-picker-arrow" />
      {aberto ? (
        <div id={listaId} className="bl-destination-picker-list" role="listbox" aria-label={rotulo}>
          <button
            type="button"
            role="option"
            aria-selected={!valor}
            className={!valor ? 'bl-destination-picker-option selecionada' : 'bl-destination-picker-option'}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => escolher('')}
          >
            {ROTULOS_DAS_SAIDAS.direcionar}
          </button>
          {opcoes.map((b, i) => (
            <button
              key={b.id}
              id={`${listaId}-${b.id}`}
              type="button"
              role="option"
              aria-selected={b.id === valor}
              className={[
                'bl-destination-picker-option',
                i === ativo ? 'bl-destination-picker-option--ativa' : '',
                b.id === valor ? 'selecionada' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setAtivo(i)}
              onClick={() => escolher(b.id)}
            >
              {b.$title || b.id}
            </button>
          ))}
          {opcoes.length === 0 ? (
            <p className="sub bl-destination-picker-empty">Nenhum bloco encontrado.</p>
          ) : null}
        </div>
      ) : null}
    </label>
  );
}
