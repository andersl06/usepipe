import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Icone } from '@pipe/ui';
import { IconePortal } from '@pipe/ui/icones-portal';
import { PERIODOS, calculatePeriod, periodCurrent } from '../lib/periodos';
import { Select } from '@pipe/ui/select';
import { pedir } from '@pipe/ui/api';

/**
 * Reference Filter sidebar `data-testid="saved-filters-sidebar"` (`referencias-blip/fichas/FICHA-monitoring.md`, `FICHA-history.md`) starts closed, with title/subtitle, New query and Saved filters tabs, screen fields, saved-filter switch, and two footer buttons. Saved filters are structural only: no storage exists, so show an honest empty state; disable the footer switch with a reason. Apply uses a GET form, closes the panel, and navigates while state remains in the URL.
 */
export function PanelFilters({
  aberto,
  aoFechar,
  acao,
  limpar,
  aoAplicar,
  children,
}: {
  aberto: boolean;
  aoFechar: () => void;
  acao: string;
  /**
   * `null` esconde o link "Limpar tudo" — não há o que limpar. Uma função
   * limpa filtro que mora em React state (D-30): não há URL de destino, só
   * a ação de zerar o valor antes de fechar o painel.
   */
  limpar: string | (() => void) | null;
  aoAplicar?: (data: FormData) => void;
  children: ReactNode;
}) {
  const [aba, setAba] = useState<'nova' | 'salvos'>('nova');
  const painel = useRef<HTMLElement>(null);

  /* Focus goes into the panel on open and returns to the pill that opened it on close. */
  useEffect(() => {
    if (!aberto) return;
    const gatilho = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    painel.current?.focus();
    return () => gatilho?.focus();
  }, [aberto]);

  if (!aberto) return null;

  function teclado(evento: KeyboardEvent<HTMLElement>) {
    if (evento.key === 'Escape') {
      evento.stopPropagation();
      aoFechar();
      return;
    }
    if (evento.key !== 'Tab' || !painel.current) return;
    const alvos = [...painel.current.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(
      (el) => !el.hasAttribute('disabled') && el.offsetParent !== null,
    );
    const primeiro = alvos[0];
    const ultimo = alvos[alvos.length - 1];
    if (!primeiro || !ultimo) return;
    if (evento.shiftKey && (document.activeElement === primeiro || document.activeElement === painel.current)) {
      evento.preventDefault();
      ultimo.focus();
    } else if (!evento.shiftKey && document.activeElement === ultimo) {
      evento.preventDefault();
      primeiro.focus();
    }
  }

  return (
    <>
      <div className="panel-background" onClick={aoFechar} />
      <aside ref={painel} tabIndex={-1} className="panel-side" role="dialog" aria-modal="true" aria-label="Filtros" onKeyDown={teclado}>
        <div className="panel-header">
          <div>
            <h3>Filtros</h3>
            <p>Selecione os parâmetros da sua busca ou aplique um filtro salvo</p>
          </div>
          <button
            type="button"
            className="iconbtn"
            onClick={aoFechar}
            title="Fechar"
            aria-label="Fechar"
          >
            <Icone nome="x" tamanho={16} />
          </button>
        </div>

        <div className="panel-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={aba === 'nova'}
            className={aba === 'nova' ? 'active' : undefined}
            onClick={() => setAba('nova')}
          >
            Nova consulta
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={aba === 'salvos'}
            className={aba === 'salvos' ? 'active' : undefined}
            onClick={() => setAba('salvos')}
          >
            Filtros salvos
          </button>
        </div>

        {aba === 'nova' ? (
          <form
            method="get"
            action={acao}
            className="panel-form"
            onSubmit={evento => {
              if (aoAplicar) {
                evento.preventDefault();
                aoAplicar(new FormData(evento.currentTarget));
              } else aoFechar();
            }}
            aria-label="Nova consulta"
          >
            <div className="panel-fields">{children}</div>

            <div className="panel-footer">
              <label
                className="panel-switch"
                title="Filtro salvo ainda não existe nesta versão da tela."
              >
                <input type="checkbox" disabled />
                Criar Filtro Salvo com estes parâmetros
              </label>
              <div className="panel-buttons">
                {limpar ? (
                  typeof limpar === 'function' ? (
                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        limpar();
                        aoFechar();
                      }}
                    >
                      Limpar tudo
                    </button>
                  ) : (
                    <a href={limpar} className="btn" onClick={aoFechar}>
                      Limpar tudo
                    </a>
                  )
                ) : null}
                <button type="submit" className="btn primary">
                  Aplicar
                </button>
              </div>
            </div>
          </form>
        ) : (
          <div className="panel-empty-saved">Nenhum filtro salvo ainda.</div>
        )}
      </aside>
    </>
  );
}


export function PanelField({
  rotulo,
  apoio,
  icone,
  children,
}: {
  rotulo: string;
  apoio?: string;
  icone?: 'fila';
  children: ReactNode;
}) {
  return (
    <div className="panel-field">
      <span className="panel-label">{icone ? <IconePortal nome={icone} tamanho={16} /> : null}{rotulo}</span>
      {apoio ? <span className="panel-support">{apoio}</span> : null}
      {children}
    </div>
  );
}

/**
 * The Period filter matches reference `bds-select data-testid="period-filter-select"` in History and both Reports: `PERIODOS` shortcuts plus Custom, whose choice fills the date pair.
 */
export function FieldPeriod({ de, ate, fuso }: { de: string; ate: string; fuso: string }) {
  return (
    <PanelField rotulo="Período" apoio="Selecione um intervalo de datas">
      <Select
        name="periodo"
        defaultValue={periodCurrent(de, ate, fuso)}
        aria-label="Atalho de período"
        onChange={(e) => {
          const calc = calculatePeriod(e.currentTarget.value, fuso);
          if (!calc) return;
          const form = e.currentTarget.form;
          const campoDe = form?.elements.namedItem('de');
          const campoAte = form?.elements.namedItem('ate');
          if (campoDe instanceof HTMLInputElement) campoDe.value = calc.de;
          if (campoAte instanceof HTMLInputElement) campoAte.value = calc.ate;
        }}
      >
        {PERIODOS.map((p) => (
          <option key={p.chave} value={p.chave}>
            {p.rotulo}
          </option>
        ))}
        <option value="personalizado">Personalizado</option>
      </Select>
      <div className="panel-dates">
        <input type="date" name="de" defaultValue={de} aria-label="De" />
        <input type="date" name="ate" defaultValue={ate} aria-label="Até" />
      </div>
    </PanelField>
  );
}

interface ContactOption {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
}

const idShort = (id: string) => id.slice(0, 8);
/** Phone or e-mail when there is one; otherwise the short Pipe id. */
const contactIdentifier = (c: ContactOption) => c.phone ?? c.email ?? idShort(c.id);
const contactLabel = (c: ContactOption) => `${c.name?.trim() || 'Contato sem nome'} - ${contactIdentifier(c)}`;

/**
 * Contact filter as an autocomplete (reference `bds-autocomplete` server-side, `ref/verificacao/filtro-contato.md`): searches the server while typing (250 ms debounce, 2+ characters, stale requests aborted, 20 results) and submits the chosen name, which is what the screens filter on.
 */
export function FieldContact({ name, defaultValue }: { name: string; defaultValue: string }) {
  const listaId = useId();
  const [texto, setTexto] = useState(defaultValue);
  const [opcoes, setOpcoes] = useState<ContactOption[]>([]);
  const [aberta, setAberta] = useState(false);
  const [buscou, setBuscou] = useState(false);
  const [ativo, setAtivo] = useState(-1);
  const [carregando, setCarregando] = useState(false);
  const pedido = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      pedido.current?.abort();
    },
    [],
  );

  function digitar(valor: string) {
    setTexto(valor);
    setAtivo(-1);
    if (timer.current) clearTimeout(timer.current);
    pedido.current?.abort();
    if (valor.trim().length < 2) {
      setOpcoes([]);
      setBuscou(false);
      setCarregando(false);
      setAberta(false);
      return;
    }
    setCarregando(true);
    timer.current = setTimeout(() => {
      const controle = new AbortController();
      pedido.current = controle;
      pedir<{ contacts: ContactOption[] }>(`/v1/management/contacts/search?q=${encodeURIComponent(valor.trim())}`, { signal: controle.signal })
        .then((r) => {
          setOpcoes(r.contacts);
          setBuscou(true);
          setAberta(true);
          setCarregando(false);
        })
        .catch((erro: unknown) => {
          if (erro instanceof DOMException && erro.name === 'AbortError') return;
          setOpcoes([]);
          setBuscou(true);
          setAberta(true);
          setCarregando(false);
        });
    }, 250);
  }

  function escolher(c: ContactOption) {
    setTexto(c.name?.trim() || contactIdentifier(c));
    setAberta(false);
    setAtivo(-1);
  }

  function teclado(evento: KeyboardEvent<HTMLInputElement>) {
    if (evento.key === 'Escape' && aberta) {
      evento.stopPropagation();
      setAberta(false);
    } else if (evento.key === 'ArrowDown' && opcoes.length) {
      evento.preventDefault();
      setAberta(true);
      setAtivo((i) => (i + 1) % opcoes.length);
    } else if (evento.key === 'ArrowUp' && opcoes.length) {
      evento.preventDefault();
      setAtivo((i) => (i <= 0 ? opcoes.length - 1 : i - 1));
    } else if (evento.key === 'Enter' && aberta && ativo >= 0 && opcoes[ativo]) {
      evento.preventDefault();
      escolher(opcoes[ativo]);
    }
  }

  return (
    <div className="panel-contact">
      <input
        type="text"
        name={name}
        value={texto}
        autoComplete="off"
        placeholder="Digite parte do nome, e-mail ou telefone do contato"
        aria-label="Contato"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={aberta}
        aria-controls={listaId}
        aria-activedescendant={ativo >= 0 ? `${listaId}-${ativo}` : undefined}
        aria-busy={carregando}
        onChange={(e) => digitar(e.currentTarget.value)}
        onKeyDown={teclado}
        onBlur={() => setAberta(false)}
      />
      {aberta ? (
        <div className="panel-contact-options" id={listaId} role="listbox" aria-label="Contatos">
          {opcoes.length ? (
            opcoes.map((c, i) => (
              <div
                key={c.id}
                id={`${listaId}-${i}`}
                role="option"
                aria-selected={i === ativo}
                className={i === ativo ? 'active' : undefined}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => escolher(c)}
              >
                {contactLabel(c)}
              </div>
            ))
          ) : buscou ? (
            <div className="panel-contact-empty">Nenhum contato encontrado.</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
