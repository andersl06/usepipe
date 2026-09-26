'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from 'react';
import { Etiqueta, EmptyState } from '@pipe/ui';
import { assignInBulk, desqualificarInBulk } from '../app/leads/actions';
import { CelulaInline } from './celula-inline';
import {
  groupingColumn,
  columnOrdenavel,
  directionInitial,
  escreverFilters,
  ROTULO_STATUS,
  type Grouping,
  type Direction,
  type SFilter,
  type Grupo,
  type LinhaLead,
  type Order,
  type Proprietario,
} from '../lib/leads-visao';
import { desde, numero } from '../lib/format';
import { useLarguras } from './redimensionar';
import { ControleDeColunas, useColunas } from './colunas';

/**
 * The leads list: column sorting, resizable columns, multiple selection, and
 * bulk actions.
 *
 * All four were read from Twenty and written from scratch — `twenty-front` is
 * AGPL and doesn't go in here. What the reading taught us, which our previous
 * version didn't have:
 *
 * - **Sorting lives in the URL**, not in the component. A sorted list is an
 *   address you can paste into chat, and the browser's back button undoes the
 *   sort like it undoes anything else. It's also what lets sorting happen in
 *   the database, which is where sorting a capped list has to happen.
 * - **Column width belongs to the user**, and survives a reload.
 * - **Selection doesn't draw an empty sixth column**: the checkbox lives in the
 *   first cell, shows on hover, and stays visible when checked.
 * - **The bulk-action bar only exists with something selected.** A permanent bar
 *   with grayed-out buttons is exactly what this product doesn't do.
 *
 * What we didn't copy from them: the column frozen to the left, and the
 * "new record" row at the end of the table. The first only pays off with more
 * columns than we have; the second assumes inline creation, which doesn't exist
 * here yet.
 */

/**
 * The listing's shortcuts.
 *
 * `j`/`k` and the arrows are theirs, read from
 * `record-table/hooks/useRecordTableRowFocusHotkeys.ts` — they pair `ArrowDown`
 * with `j` and `ArrowUp` with `k` on the same hook, which is the terminal
 * convention Gmail and GitHub also use. `/` for search and `Enter` to open are
 * the same family.
 *
 * The listener is a single one, on the document, and steps aside when focus is
 * inside a text field: someone typing "j" into search wants the letter, not the
 * next row. `/` is the one exception it gets, and only from outside a field.
 */
function ehCampoDeTexto(alvo: EventTarget | null): boolean {
  if (!(alvo instanceof HTMLElement)) return false;
  if (alvo.isContentEditable) return true;
  return ['INPUT', 'SELECT', 'TEXTAREA'].includes(alvo.tagName);
}

/**
 * What the cell knows besides its own row. One object, not three positional
 * arguments: the third column that needs one more piece of data doesn't change
 * the other nine's signature.
 */
interface Context {
  timezone: string;
  now: Date;
  owners: Proprietario[];
}

interface ColumnLead {
  key: string;
  rotulo: string;
  /** Right-aligned, tabular monospaced. For numbers, not text. */
  numerica?: boolean;
  /** Starting width, in px. The user changes it and the change is remembered. */
  largura: number;
  celula: (l: LinhaLead, ctx: Context) => ReactNode;
}

/**
 * The columns, in a single list: the header and the row come from the same
 * definition, so there's no way for one to exist without the other.
 *
 * Categories become neutral badges: source, band, queue, and stage are the same
 * kind of thing (a name that classifies) and share the same shape, the
 * package's. None of them get color: a category isn't a state.
 *
 * Color shows up in exactly two cells and nowhere else: a lead stalled for more
 * than seven days, which is what costs money, and a disqualified lead, which is
 * the only terminal state.
 */
const COLUNAS: readonly ColumnLead[] = [
  {
    key: 'lead',
    rotulo: 'Lead',
    largura: 230,
    celula: (l) => <Link href={`/leads/${l.id}`}>{l.nome}</Link>,
  },
  {
    key: 'origem',
    rotulo: 'Origem',
    largura: 132,
    // Editable right in the list. The badge stays the display-at-rest shape —
    // it's their `record-table-cell`: the display stays the field's own, only the editing is shared.
    celula: (l) => (
      <CelulaInline
        leadId={l.id}
        campo="origem"
        value={l.origem}
        empty="—"
        pintar={(t) => <Etiqueta>{t}</Etiqueta>}
      />
    ),
  },
  {
    key: 'score',
    rotulo: 'Score',
    numerica: true,
    largura: 86,
    celula: (l) => (l.score === null ? '—' : numero(l.score)),
  },
  {
    key: 'faixa',
    rotulo: 'Faixa',
    largura: 120,
    celula: (l) => (l.faixa ? <Etiqueta>{l.faixa}</Etiqueta> : '—'),
  },
  {
    key: 'fila',
    rotulo: 'Fila',
    largura: 132,
    celula: (l) => (l.queue ? <Etiqueta>{l.queue}</Etiqueta> : '—'),
  },
  {
    key: 'proprietario',
    rotulo: 'Proprietário',
    largura: 160,
    // Swapping the owner right in the list, which is the most common reason someone
    // opens the record. The bulk action still serves selecting many at once.
    celula: (l, ctx) => (
      <CelulaInline
        leadId={l.id}
        campo="proprietario"
        value={l.proprietarioId}
        options={ctx.owners}
        empty="—"
      />
    ),
  },
  {
    key: 'fase',
    rotulo: 'Fase',
    largura: 136,
    celula: (l) =>
      l.status === 'desqualificado' ? (
        <Etiqueta tom="erro">{ROTULO_STATUS['desqualificado']}</Etiqueta>
      ) : l.fase ? (
        <Etiqueta>{l.fase}</Etiqueta>
      ) : (
        <Etiqueta>{ROTULO_STATUS[l.status] ?? l.status}</Etiqueta>
      ),
  },
  {
    key: 'dias',
    rotulo: 'Dias na fase',
    numerica: true,
    largura: 118,
    celula: (l) =>
      l.diasNaFase === null ? (
        '—'
      ) : l.diasNaFase >= 7 && l.status !== 'desqualificado' ? (
        <Etiqueta tom="alerta">{numero(l.diasNaFase)}</Etiqueta>
      ) : (
        numero(l.diasNaFase)
      ),
  },
  {
    key: 'atividade',
    rotulo: 'Última atividade',
    largura: 190,
    celula: (l, ctx) =>
      l.ultimaActivity
        ? `${l.ultimaActivityTipo ?? 'atividade'} · ${desde(l.ultimaActivity, ctx.timezone, ctx.now)}`
        : '—',
  },
];

const DEFAULTS = Object.fromEntries(COLUNAS.map((c) => [c.key, c.largura]));
const ROTULOS = Object.fromEntries(COLUNAS.map((c) => [c.key, c.rotulo]));

/**
 * The column that doesn't hide or move. It's Twenty's `labelIdentifier`: the one
 * that says who the row is, and the only one that leads to the record.
 */
const COLUMN_FIXA = 'lead';

interface Props {
  groups: Grupo[];
  fuso: string;
  agora: Date;
  aba: string;
  search: string;
  by: Grouping;
  order: Order;
  direction: Direction;
  filters: SFilter;
  proprietarios: Proprietario[];
  /** How many rows came back, so the selection footer can talk in real numbers. */
  total: number;
}

export function ListaDeLeads({
  groups,
  fuso,
  agora,
  aba,
  search,
  by,
  order,
  direction,
  filters,
  proprietarios,
  total,
}: Props) {
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  /** Where the Shift range starts: the last row marked without it. */
  const [ancora, setAncora] = useState<number | null>(null);
  const [recado, setRecado] = useState<string | null>(null);
  const [emCurso, iniciar] = useTransition();
  const larguras = useLarguras('pipe.crm.leads.larguras', DEFAULTS);
  /** The row under the keyboard cursor. `null` is "nobody", the initial state. */
  const [focada, setFocada] = useState<number | null>(null);
  const tabela = useRef<HTMLTableElement | null>(null);
  const router = useRouter();

  // The column the group header is already stating drops out of the table:
  // repeating it
  // on every row would spend width to say what was just said.
  const disponiveis = useMemo(() => {
    const redundante = groupingColumn(by);
    return redundante ? COLUNAS.filter((c) => c.key !== redundante) : COLUNAS;
  }, [by]);

  const context = useMemo<Context>(
    () => ({ timezone: fuso, now: agora, owners: proprietarios }),
    [fuso, agora, proprietarios],
  );

  const arranjo = useColunas(
    'pipe.crm.leads.colunas',
    useMemo(() => disponiveis.map((c) => c.key), [disponiveis]),
    COLUMN_FIXA,
  );

  // The fixed one always comes first, and the rest in the order the person arranged. The
  // `<colgroup>`, the header and the row all come from here, so there's no way for one
  // to drift out of sync with the other.
  const colunas = useMemo(() => {
    const byKey = new Map(disponiveis.map((c) => [c.key, c]));
    return [COLUMN_FIXA, ...arranjo.visiveis]
      .map((key) => byKey.get(key))
      .filter((c): c is ColumnLead => c !== undefined);
  }, [disponiveis, arranjo.visiveis]);

  const todos = useMemo(() => groups.flatMap((g) => g.linhas), [groups]);
  /**
   * Each lead's position in the flattened list, so the Shift range knows how to
   * count across group boundaries.
   */
  const position = useMemo(() => new Map(todos.map((l, i) => [l.id, i])), [todos]);
  const todosMarcados = todos.length > 0 && marcados.size === todos.length;

  /**
   * A single listener, on the document. It re-registers on every move because
   * `Enter` needs to know where the cursor is right now — and swapping an
   * `addEventListener` per keystroke costs less than the `ref` that would avoid it.
   */
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === '/' && !ehCampoDeTexto(e.target)) {
        const search = document.querySelector<HTMLInputElement>('input[type="search"][name="q"]');
        if (!search) return;
        e.preventDefault();
        search.focus();
        search.select();
        return;
      }

      if (ehCampoDeTexto(e.target)) return;
      if (todos.length === 0) return;

      const desce = e.key === 'j' || e.key === 'ArrowDown';
      const sobe = e.key === 'k' || e.key === 'ArrowUp';

      if (desce || sobe) {
        e.preventDefault();
        setFocada((atual) => {
          // No cursor yet: `j` starts on the first row, `k` on the last. That's what
          // makes the first tap do something visible instead of nothing.
          if (atual === null) return desce ? 0 : todos.length - 1;
          const proximo = atual + (desce ? 1 : -1);
          // No wrapping around: the list has a start and an end, and going past the end to the
          // start without warning is how you lose your place in a list of 200.
          return Math.min(Math.max(proximo, 0), todos.length - 1);
        });
        return;
      }

      if (e.key === 'Enter' && focada !== null) {
        const alvo = todos[focada];
        if (!alvo) return;
        e.preventDefault();
        router.push(`/leads/${alvo.id}`);
        return;
      }

      if (e.key === 'Escape') setFocada(null);
    }

    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [todos, focada, router]);

  // The focused row scrolls into view on its own. `block: 'nearest'` scrolls the minimum:
  // with `'center'` the list jumps on every keystroke and the eye loses its place.
  useEffect(() => {
    if (focada === null) return;
    const alvo = todos[focada];
    if (!alvo) return;
    tabela.current
      ?.querySelector(`tr[data-lead="${alvo.id}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [focada, todos]);

  // Changing the slice, the search, or the sort rebuilds the list: a cursor
  // pointing at position 12 of the old list points at nothing.
  useEffect(() => setFocada(null), [todos]);

  /**
   * Mark from one row to another with Shift, like in any file list.
   *
   * `ancora` is the last row marked without Shift. Marking fifteen leads in a row
   * with fifteen clicks is the kind of work that makes someone give up on the
   * bulk action and do them one by one in the record.
   */
  function alternar(id: string, indice: number, comShift: boolean) {
    setRecado(null);
    setMarcados((atual) => {
      const proximo = new Set(atual);
      if (comShift && ancora !== null) {
        const de = Math.min(ancora, indice);
        const ate = Math.max(ancora, indice);
        // The whole range gets the OPPOSITE state of the clicked row, which is
        // o que o Explorer e o Finder fazem: o clique manda, o resto acompanha.
        const ligar = !proximo.has(id);
        for (const l of todos.slice(de, ate + 1)) {
          if (ligar) proximo.add(l.id);
          else proximo.delete(l.id);
        }
        return proximo;
      }
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
    if (!comShift) setAncora(indice);
  }

  function alternarTodos() {
    setRecado(null);
    setMarcados(todosMarcados ? new Set() : new Set(todos.map((l) => l.id)));
  }

  /**
   * This same list's address with one parameter swapped. `comFiltros` only
   * changes when the whole point is dropping the filter.
   */
  function endereco(extra: Record<string, string | null>, withFilters: SFilter = filters) {
    const p = new URLSearchParams({ aba });
    if (search) p.set('q', search);
    if (by !== 'nenhum') p.set('groupBy', by);
    if (order !== 'nenhuma') {
      p.set('order', order);
      p.set('dir', direction);
    }
    // The filter follows along: a "Clear search" that also erased the filter would send
    // a pessoa procurar o lead sumido no lugar errado.
    escreverFilters(p, withFilters);
    for (const [key, value] of Object.entries(extra)) {
      if (value === null) p.delete(key);
      else p.set(key, value);
    }
    return `/leads?${p.toString()}`;
  }

  /**
   * Clicking the header: a column that isn't sorting yet enters in its natural
   * direction, one that's already sorting flips, and one that already flipped
   * goes back to the screen's default. Three clicks close the cycle, and the
   * third is the only way to undo without touching the address bar.
   */
  function sorting(key: string) {
    if (order !== key) return endereco({ order: key, dir: directionInitial(key) });
    if (direction === directionInitial(key)) {
      return endereco({ ordem: key, dir: direction === 'asc' ? 'desc' : 'asc' });
    }
    return endereco({ ordem: null, dir: null });
  }

  function executar(acao: () => Promise<{ mudadas: number; pedidas: number }>, feito: string) {
    iniciar(async () => {
      const { mudadas, pedidas } = await acao();
      setMarcados(new Set());
      setRecado(
        mudadas === pedidas
          ? `${numero(mudadas)} ${feito}.`
          : `${numero(mudadas)} de ${numero(pedidas)} ${feito}. O resto o banco recusou: ou já foi excluído, ou já estava convertido.`,
      );
    });
  }

  // The empty state has FOUR causes and four exits, which Twenty separates and we didn't
  // used to: the search that found nothing, the filter that matched nothing, the slice that
  // has nobody in it, and a truly empty base. One text for all four sends
  // the person looking for the problem in the wrong place — and the filter is the most
  // treacherous case, because it stays active between visits within the same view.
  if (total === 0) {
    const filtrado = Object.keys(filters).length > 0;
    if (filtrado && !search) {
      return (
        <EmptyState titulo="Nenhum lead para este filtro." illustration="busca">
          <span>
            O filtro está ativo e nenhum lead casa com ele. A base não está vazia — o recorte
            está.
          </span>
          <span className="acoes-erro">
            <Link className="btn" href={endereco({}, {})}>
              Limpar o filtro
            </Link>
          </span>
        </EmptyState>
      );
    }
    if (search) {
      return (
        <EmptyState titulo="Nenhum lead para esta busca." illustration="busca">
          <span>Nada casou com “{search}” em nome, CPF, telefone ou e-mail.</span>
          <span className="acoes-erro">
            <Link className="btn" href={endereco({ q: null })}>
              Limpar a busca
            </Link>
          </span>
        </EmptyState>
      );
    }
    if (aba !== 'todos') {
      return (
        <EmptyState titulo="Nenhum lead neste recorte." illustration="concluido">
          <span>
            Este é um recorte vazio, não uma base vazia. Nenhum lead se encaixa nele agora.
          </span>
          <span className="acoes-erro">
            <Link className="btn" href={endereco({ aba: 'todos' })}>
              Ver todos os leads
            </Link>
          </span>
        </EmptyState>
      );
    }
    return (
      <EmptyState titulo="Nenhum lead ainda." illustration="vazio">
        <span>
          Lead entra por formulário, por importação ou pela API. Assim que o primeiro entrar, ele
          aparece aqui já pontuado.
        </span>
      </EmptyState>
    );
  }

  return (
    <>
      {recado ? (
        <p className="recado" role="status">
          {recado}
        </p>
      ) : null}

      {/*
 * Pinned to the right, right above the table it governs. Twenty puts the same
 * control at the end of the view bar, for the same reason: it's an adjustment,
 * not a filter, and an adjustment doesn't compete for space with search.
 */}
      <div className="barra-lista">
        <ControleDeColunas
          rotulos={ROTULOS}
          fixa={COLUMN_FIXA}
          visiveis={arranjo.visiveis}
          ocultas={arranjo.ocultas}
          aoOcultar={arranjo.ocultar}
          aoMostrar={arranjo.mostrar}
          aoMover={arranjo.mover}
          toRestore={arranjo.restaurar}
        />
      </div>

      <div className="scroll">
        <table className="listagem" ref={tabela}>
          <colgroup>
            <col style={{ width: '32px' }} />
            {colunas.map((c) => (
              <col key={c.key} style={{ width: `${larguras.largura(c.key)}px` }} />
            ))}
            {/*
 * Spare column. Without it the browser stretches the others to fill a wide
 * screen, and the dragged width stops holding.
 */}
            <col />
          </colgroup>

          <thead>
            <tr>
              <th className="sel">
                <input
                  type="checkbox"
                  checked={todosMarcados}
                  ref={(el) => {
                    if (el) el.indeterminate = marcados.size > 0 && !todosMarcados;
                  }}
                  onChange={alternarTodos}
                  aria-label="Selecionar todos os leads da lista"
                />
              </th>
              {colunas.map((c) => {
                const active = order === c.key;
                return (
                  <th
                    key={c.key}
                    aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : undefined}
                    className={larguras.columnInArraste === c.key ? 'arrastando' : undefined}
                  >
                    {columnOrdenavel(c.key) ? (
                      <Link href={sorting(c.key)} className="ord" scroll={false}>
                        {c.rotulo}
                        <span className="seta" aria-hidden="true">
                          {active ? (direction === 'asc' ? '↑' : '↓') : ''}
                        </span>
                      </Link>
                    ) : (
                      c.rotulo
                    )}
                    <span
                      className="redim"
                      role="separator"
                      aria-orientation="vertical"
                      aria-label={`Largura da coluna ${c.rotulo}`}
                      tabIndex={0}
                      onPointerDown={larguras.aoPegar(c.key)}
                      onPointerMove={larguras.aoMover}
                      onPointerUp={larguras.aoSoltar}
                      onPointerCancel={larguras.aoSoltar}
                      onKeyDown={larguras.aoTeclar(c.key)}
                      onDoubleClick={larguras.toRestore(c.key)}
                    />
                  </th>
                );
              })}
              <th />
            </tr>
          </thead>

          {groups.map((grupo) => (
            <tbody key={grupo.titulo || 'todos'}>
              {grupo.titulo ? (
                <tr className="grupo">
                  <th colSpan={colunas.length + 2} scope="colgroup">
                    {grupo.titulo} <span className="qt">{numero(grupo.linhas.length)}</span>
                  </th>
                </tr>
              ) : null}
              {grupo.linhas.map((l) => (
                <tr
                  key={l.id}
                  data-lead={l.id}
                  className={
                    [
                      marcados.has(l.id) ? 'marcada' : '',
                      focada !== null && todos[focada]?.id === l.id ? 'focada' : '',
                    ]
                      .filter(Boolean)
                      .join(' ') || undefined
                  }
                >
                  <td className="sel">
                    {/*
 * The mark comes from `click`, not `change`: only the click carries
 * `shiftKey`, and that's what gives the range. The spacebar on the keyboard
 * also fires `click`, with Shift false, so the keyboard path stays whole.
 */}
                    <input
                      type="checkbox"
                      checked={marcados.has(l.id)}
                      onChange={() => {}}
                      onClick={(e) => alternar(l.id, position.get(l.id) ?? 0, e.shiftKey)}
                      aria-label={`Selecionar ${l.nome}`}
                    />
                  </td>
                  {colunas.map((c) => (
                    <td
                      key={c.key}
                      className={c.numerica ? 'num' : c.key === 'lead' ? 'who' : undefined}
                    >
                      {c.celula(l, context)}
                    </td>
                  ))}
                  <td />
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>

      {marcados.size > 0 ? (
        <BarraInBulk
          quantos={marcados.size}
          proprietarios={proprietarios}
          emCurso={emCurso}
          aoLimpar={() => setMarcados(new Set())}
          aoAtribuir={(id) =>
            executar(() => assignInBulk([...marcados], id), 'leads passaram de proprietário')
          }
          aoDesqualificar={() =>
            executar(() => desqualificarInBulk([...marcados]), 'leads foram desqualificados')
          }
        />
      ) : null}
    </>
  );
}

/**
 * The bulk-action bar. It only exists when there's a selection, and disappears
 * when the selection does: it's the "an item that doesn't work doesn't appear"
 * rule applied to a whole bar instead of one button.
 *
 * It stays pinned at the bottom and centered, away from the table the person is
 * reading and close to the thumb on a laptop. Disqualifying asks for
 * confirmation because it writes to a terminal-state field with no undo.
 */
function BarraInBulk({
  quantos,
  proprietarios,
  emCurso,
  aoLimpar,
  aoAtribuir,
  aoDesqualificar,
}: {
  quantos: number;
  proprietarios: Proprietario[];
  emCurso: boolean;
  aoLimpar: () => void;
  aoAtribuir: (proprietarioId: string) => void;
  aoDesqualificar: () => void;
}) {
  const [dono, setDono] = useState('');

  return (
    <div className="em-massa" role="region" aria-label="Ações para os leads selecionados">
      <b>
        {numero(quantos)} {quantos === 1 ? 'lead selecionado' : 'leads selecionados'}
      </b>

      {proprietarios.length > 0 ? (
        <>
          <select
            className="seletor"
            value={dono}
            aria-label="Novo proprietário"
            onChange={(e) => setDono(e.target.value)}
          >
            <option value="">Passar para</option>
            {proprietarios.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {/*
 * The button only exists once someone has been picked. A grayed-out button
 * waiting for a selector is the most common shape of a dead item.
 */}
          {dono ? (
            <button
              type="button"
              className="btn primario"
              onClick={() => {
                aoAtribuir(dono);
                setDono('');
              }}
            >
              {emCurso ? 'Passando…' : 'Passar'}
            </button>
          ) : null}
        </>
      ) : null}

      <button
        type="button"
        className="btn perigo"
        onClick={() => {
          const texto =
            quantos === 1
              ? 'Desqualificar este lead?'
              : `Desqualificar estes ${quantos} leads?`;
          if (window.confirm(`${texto} Não há como desfazer pela tela.`)) aoDesqualificar();
        }}
      >
        {emCurso ? 'Desqualificando…' : 'Desqualificar'}
      </button>

      <button type="button" className="btn" onClick={aoLimpar}>
        Limpar
      </button>
    </div>
  );
}
