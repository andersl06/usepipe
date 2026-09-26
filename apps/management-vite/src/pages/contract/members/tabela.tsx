import { useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { IconePortal, IconeSearch } from '../../../components/icones-portal';
import type { NomeDeIconePortal } from '../../../components/icones-portal';
import { excluirMembers, reenviarInvitation, switchRole } from '../actions';
import type { ResultadoDoReenvio } from '../actions';

/**
 * The contract Members table, following the source's mechanics. Their `TenantMembers` component (`main.e8593b01.chunk.js`, minified as `$t`) is a SELECTION table: nothing happens row by row. You select one or several, and then two menus appear in the header corner that act on the whole block — change the role and delete. Every measurement is commented in `contrato.css`; here only the rules remain. The four that change behavior, all copied: 1. **You don't appear in your own list** (their filter, `e.userIdentity !== o.identity`). Anyone who wants to leave uses "Deixar contrato", not this screen. 2. **The selection column only exists for those who can write** (`canSelect: canEdit`), and with it both menus disappear — read-only users see just the list and nothing else. 3. **The menus only appear once something is selected** (`selectedItems.length > 0`). 4. **"Aplicar" stays disabled until a role is chosen** (`disabled: undefined === selectedRole`). This is client-side because the source is: selecting, sorting and searching are screen state, and without JavaScript there'd be no way to show "3 selecionado(s)". The WRITES remain Server Actions that re-check the permission on the server (`../acoes.ts`) — the screen hiding the menu is a design choice, not access control.
 */

export interface MemberLinha {
  id: string;
  tipo: 'usuario' | 'convite';
  nome: string;
  email: string;
  /** The account role label — "Admin", "Pode editar", "Pode visualizar". */
  role: string;
}

/** One of the three account roles, already with what the screen shows for it. */
export interface RoleOption {
  id: string;
  /** `admin`, `member` or `guest` — the DB name, which is what the API matches. */
  roleId: string;
  rotulo: string;
  description: string;
  icone: NomeDeIconePortal;
  classe: string;
}

/** The screen's texts, in pt-BR, like the source's `Wt.pt` dictionary. */
const TEXTO = {
  nome: 'Nome',
  email: 'Email',
  papel: 'Papel',
  editar: 'Editar',
  members: 'membro(s)',
  cancelar: 'Cancelar',
  aplicar: 'Aplicar',
  escolhaOPapel: 'Escolha o papel',
  excluir: 'Excluir',
  mensagemDeExclusao: 'Tem certeza que deseja excluir esse(s) membro(s)?',
  pendente: 'Pendente',
  /*
   * `j.pt.emptyMessage` from the generic table and `aa.pt.emptyMessage` from the pending tab; the tabs are `ca.pt`.
   */
  semDados: 'Não há dados',
  semPendentes: 'Não há solicitações pendentes',
  abaMembros: 'Membros do contrato',
  abaPendentes: 'Pendentes',
} as const;

type Campo = 'nome' | 'email' | 'papel';

/** O que cada coluna mostra, na ordem do `tableModel` deles. */
const COLUNAS: { campo: Campo; rotulo: string }[] = [
  { campo: 'nome', rotulo: TEXTO.nome },
  { campo: 'email', rotulo: TEXTO.email },
  { campo: 'papel', rotulo: TEXTO.papel },
];

function value(linha: MemberLinha, campo: Campo): string {
  if (campo === 'nome') {
    /*
     * `"".concat(fullName, " (", pendingInvitation, ")")` — an invitee who hasn't joined yet carries that state in their own name, which is why they're also included in search and sorting.
     */
    return linha.tipo === 'convite' ? `${linha.nome} (${TEXTO.pendente})` : linha.nome;
  }
  if (campo === 'email') return linha.email;
  /*
   * `roleId: content[roleId]` — the cell shows the role's LABEL ("Admin", "Pode editar", "Pode visualizar"), never the raw `roleId`.
   */
  return linha.role;
}

export function MembersTabela({
  members,
  papeis,
  podeEscrever,
}: {
  members: MemberLinha[];
  papeis: RoleOption[];
  podeEscrever: boolean;
}) {
  const [search, definirSearch] = useState('');
  const [searchAberta, abrirSearch] = useState(false);
  const [order, definirOrder] = useState<{ campo: Campo; sentido: 'asc' | 'desc' } | null>(null);
  const [marcados, definirMarcados] = useState<readonly string[]>([]);
  const [menu, abrirMenu] = useState<'papel' | 'excluir' | null>(null);
  const [roleEscolhido, escolherRole] = useState<RoleOption | null>(null);
  /*
   * The "Reenviar" result (`../acoes.ts`): with no email delivery in Pipe, the new link only exists here, and leaves the screen on close — it never goes into the URL.
   */
  const [reenviando, definirReenviando] = useState<string | null>(null);
  const [reenvio, definirReenvio] = useState<(ResultadoDoReenvio & { id: string }) | null>(null);

  async function reenviar(id: string) {
    definirReenviando(id);
    const resultado = await reenviarInvitation(id);
    definirReenviando(null);
    definirReenvio({ ...resultado, id });
  }

  const visiveis = useMemo(() => {
    const termo = search.trim().toLowerCase();
    const achados = termo
      ? members.filter(
          (m) => m.nome.toLowerCase().includes(termo) || m.email.toLowerCase().includes(termo),
        )
      : members;
    if (!order) return achados;
    const sinal = order.sentido === 'asc' ? 1 : -1;
    return [...achados].sort(
      (a, b) => sinal * value(a, order.campo).localeCompare(value(b, order.campo), 'pt-BR'),
    );
  }, [members, search, order]);

  const marcadosVisiveis = visiveis.filter((m) => marcados.includes(key(m)));
  const todosMarcados = visiveis.length > 0 && marcadosVisiveis.length === visiveis.length;

  function alternar(linha: MemberLinha) {
    const id = key(linha);
    definirMarcados((antes) =>
      antes.includes(id) ? antes.filter((x) => x !== id) : [...antes, id],
    );
  }

  function limpar() {
    definirMarcados([]);
    escolherRole(null);
    abrirMenu(null);
  }

  return (
    <div className="mb-membros">
      {/*
 * `BlipSearch`: the magnifying glass is a button, and the field starts at zero width and grows to 200px on focus. Closes on blur.
 */}
      <div className={`mb-busca${searchAberta || search ? ' mb-busca--aberta' : ''}`}>
        <button type="button" onClick={() => abrirSearch(true)} aria-label="Buscar membro">
          <IconeSearch tamanho={20} />
        </button>
        <input
          type="text"
          value={search}
          onChange={(e) => definirSearch(e.target.value)}
          onFocus={() => abrirSearch(true)}
          onBlur={() => abrirSearch(false)}
          aria-label="Buscar membro"
        />
      </div>

      <table className="mb-tabela">
        <thead>
          <tr>
            {podeEscrever && visiveis.length > 0 ? (
              <th className="mb-col-marca">
                <Marca
                  marcado={todosMarcados}
                  alternar={() =>
                    definirMarcados(todosMarcados ? [] : visiveis.map((m) => key(m)))
                  }
                  rotulo="Marcar todos"
                />
              </th>
            ) : null}

            {COLUNAS.map((column) => (
              <th key={column.campo}>
                <button
                  type="button"
                  className="mb-ordenar"
                  onClick={() =>
                    definirOrder({
                      campo: column.campo,
                      sentido:
                        order?.campo === column.campo && order.sentido === 'asc' ? 'desc' : 'asc',
                    })
                  }
                >
                  {column.rotulo}
                  {/*
 * Our icon set is missing their `arrow-up`. This is THEIR `arrow-down` flipped — same stroke, opposite direction —, not a new icon.
 */}
                  <IconePortal
                    nome="baixo"
                    tamanho={16}
                    className={`mb-seta${order?.campo === column.campo ? ' mb-seta--firme' : ''}${order?.campo === column.campo && order.sentido === 'asc'
                                            ? ' mb-seta--sobe'
                                            : ''}`}
                  />
                </button>
              </th>
            ))}

            {podeEscrever ? (
              <th className="mb-col-acoes">
                <div className={`mb-selecao${marcadosVisiveis.length > 0 ? '' : ' mb-oculto'}`}>
                  <p>{marcadosVisiveis.length} selecionado(s)</p>

                  <Menu
                    aberto={menu === 'papel'}
                    alternar={() => abrirMenu(menu === 'papel' ? null : 'papel')}
                    rotulo={TEXTO.editar}
                    icone="editar"
                    acao={switchRole}
                    aoEnviar={limpar}
                    alvos={marcadosVisiveis.map(key)}
                    rodape={
                      <>
                        <button
                          type="submit"
                          className="mb-btn mb-btn--texto mb-btn--marca"
                          disabled={!roleEscolhido}
                        >
                          {TEXTO.aplicar}
                        </button>
                        <button
                          type="button"
                          className="mb-btn mb-btn--texto mb-btn--calado"
                          onClick={limpar}
                        >
                          {TEXTO.cancelar}
                        </button>
                      </>
                    }
                  >
                    <p>
                      {TEXTO.editar} <span className="mb-numero">{marcadosVisiveis.length}</span>{' '}
                      {TEXTO.members}
                    </p>
                    <RoleEscolha
                      papeis={papeis}
                      escolhido={roleEscolhido}
                      escolher={escolherRole}
                    />
                    {/*
 * The description of the chosen role, as in the source: it lives HERE, below the selector, not in a caption at the bottom.
 */}
                    <p className="mb-descricao">{roleEscolhido?.description ?? ''}</p>
                  </Menu>

                  <Menu
                    aberto={menu === 'excluir'}
                    alternar={() => abrirMenu(menu === 'excluir' ? null : 'excluir')}
                    rotulo={TEXTO.excluir}
                    icone="lixeira"
                    acao={excluirMembers}
                    aoEnviar={limpar}
                    alvos={marcadosVisiveis.map(key)}
                    rodape={
                      <>
                        <button type="submit" className="mb-btn mb-btn--texto mb-btn--perigo">
                          {TEXTO.excluir}
                        </button>
                        <button
                          type="button"
                          className="mb-btn mb-btn--texto mb-btn--calado"
                          onClick={limpar}
                        >
                          {TEXTO.cancelar}
                        </button>
                      </>
                    }
                  >
                    <p>
                      {TEXTO.excluir}{' '}
                      <span className="mb-numero mb-numero--perigo">{marcadosVisiveis.length}</span>{' '}
                      {TEXTO.members}
                    </p>
                    <p className="mb-aviso">{TEXTO.mensagemDeExclusao}</p>
                  </Menu>
                </div>
              </th>
            ) : null}
          </tr>
        </thead>

        <tbody>
          {visiveis.length === 0 ? (
            <LinhaVazia colunas={COLUNAS.length + 1} texto={TEXTO.semDados} />
          ) : null}
          {visiveis.map((linha) => {
            const marcado = marcados.includes(key(linha));
            return (
              <tr key={key(linha)} className={marcado ? 'mb-marcada' : ''}>
                {podeEscrever ? (
                  <td className="mb-col-marca">
                    <Marca
                      marcado={marcado}
                      alternar={() => alternar(linha)}
                      rotulo={`Marcar ${linha.nome}`}
                    />
                  </td>
                ) : null}
                {COLUNAS.map((column) => (
                  /*
                   * `title={n[a.key]}`: the cell doesn't wrap and truncates with an ellipsis, so the full value goes in the attribute.
                   */
                  <td key={column.campo} title={value(linha, column.campo)}>
                    <span>{value(linha, column.campo)}</span>
                  </td>
                ))}
                {podeEscrever ? (
                  <td className="mb-col-acoes">
                    {/*
 * Only a pending invite can be resent: the user already joined, so there's nothing to resend for them. It's not bulk — each invite has its own email and its own new link.
 */}
                    {linha.tipo === 'convite' ? (
                      <button
                        type="button"
                        className="mb-btn mb-btn--texto"
                        disabled={reenviando === linha.id}
                        onClick={() => reenviar(linha.id)}
                      >
                        {reenviando === linha.id ? 'Reenviando...' : 'Reenviar'}
                      </button>
                    ) : null}
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>

      <InvitationReenvio resultado={reenvio} aoFechar={() => definirReenvio(null)} />
    </div>
  );
}

/**
 * What "Reenviar" shows: the same single-link panel as a freshly created invite (`convidar.tsx`), because it's the same gap — with no email delivery, someone has to copy the link by hand. Failures come from the API (`ResultadoDoReenvio.erro`), like an invite already expired by another tab while this one still showed the row.
 */
function InvitationReenvio({
  resultado,
  aoFechar,
}: {
  resultado: (ResultadoDoReenvio & { id: string }) | null;
  aoFechar: () => void;
}) {
  const [copiado, marcarCopiado] = useState(false);
  if (!resultado) return null;

  async function copiar(url: string) {
    await navigator.clipboard.writeText(url);
    marcarCopiado(true);
  }

  function fechar() {
    marcarCopiado(false);
    aoFechar();
  }

  return (
    <dialog open className="mb-modal" aria-label="Convite reenviado" onClose={fechar}>
      {resultado.ok && resultado.url ? (
        <div className="mb-convite-feito">
          <h1>Convite reenviado</h1>
          <p>O link anterior parou de funcionar. Copie o novo para enviar de novo:</p>
          <ul className="mb-links">
            <li>
              <span>{resultado.email}</span>
              <button type="button" className="mb-link" onClick={() => copiar(resultado.url!)}>
                {copiado ? 'Copiado' : 'Copiar link'}
              </button>
            </li>
          </ul>
          <button type="button" className="mb-botao" onClick={fechar}>
            OK :)
          </button>
        </div>
      ) : (
        <div className="mb-convite-feito">
          <h1>Não foi possível reenviar</h1>
          <ul className="mb-erros" role="alert">
            <li>{resultado.error ?? 'Tente de novo.'}</li>
          </ul>
          <button type="button" className="mb-botao" onClick={fechar}>
            Fechar
          </button>
        </div>
      )}
    </dialog>
  );
}

/**
 * Their table `Checkbox`: the `input` is hidden and what shows is a small box with a "✓". Here the `input` stays in focus and in the screen reader.
 */
function Marca({
  marcado,
  alternar,
  rotulo,
}: {
  marcado: boolean;
  alternar: () => void;
  rotulo: string;
}) {
  return (
    <label className="mb-marca">
      <input type="checkbox" checked={marcado} onChange={alternar} aria-label={rotulo} />
      <span aria-hidden="true">{'✓'}</span>
    </label>
  );
}

/**
 * The Edit menu's `BlipSelect`: label "Papel" inside the border, empty state "Escolha o papel", and the list below the field with each role's name. It's a sibling of the invite's Permission list (same keyboard: ↑↓, Enter, Esc), but the design differs — that one is the new `bds-select`, with an icon and description per option —, so they're two separate components. The value goes into the hidden `papelId`.
 */
function RoleEscolha({
  papeis,
  escolhido,
  escolher,
}: {
  papeis: RoleOption[];
  escolhido: RoleOption | null;
  escolher: (role: RoleOption) => void;
}) {
  const [aberta, abrirLista] = useState(false);
  const [active, definirActive] = useState(0);
  const botao = useRef<HTMLButtonElement>(null);
  const lista = useRef<HTMLUListElement>(null);
  const id = useId();

  function abrir() {
    definirActive(
      Math.max(
        0,
        papeis.findIndex((p) => p.id === escolhido?.id),
      ),
    );
    abrirLista(true);
    requestAnimationFrame(() => lista.current?.focus());
  }

  function pegar(p: RoleOption) {
    escolher(p);
    abrirLista(false);
    botao.current?.focus();
  }

  function tecla(e: KeyboardEvent<HTMLUListElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const passo = e.key === 'ArrowDown' ? 1 : -1;
      definirActive((a) => (a + passo + papeis.length) % papeis.length);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (papeis[active]) pegar(papeis[active]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      abrirLista(false);
      botao.current?.focus();
    }
  }

  return (
    <div className="mb-escolha">
      <input type="hidden" name="papelId" value={escolhido?.id ?? ''} />
      <div className="mb-escolha-caixa">
        <button
          ref={botao}
          type="button"
          className={`mb-escolha-campo${aberta ? ' mb-escolha-campo--aberto' : ''}`}
          aria-haspopup="listbox"
          aria-expanded={aberta}
          onClick={() => (aberta ? abrirLista(false) : abrir())}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              abrir();
            }
          }}
        >
          <span className="mb-escolha-rotulo" id={`${id}-rotulo`}>
            {TEXTO.papel}
          </span>
          <span className={`mb-escolha-valor${escolhido ? '' : ' mb-escolha-vazio'}`}>
            {escolhido?.rotulo ?? TEXTO.escolhaOPapel}
          </span>
          <IconePortal nome="baixo" tamanho={20} className="mb-escolha-seta" />
        </button>
        {aberta ? (
          <ul
            ref={lista}
            role="listbox"
            tabIndex={-1}
            className="mb-escolha-opcoes"
            aria-labelledby={`${id}-rotulo`}
            aria-activedescendant={`${id}-opcao-${active}`}
            onKeyDown={tecla}
            onBlur={(e) => {
              if (e.relatedTarget !== botao.current) abrirLista(false);
            }}
          >
            {papeis.map((p, i) => (
              <li
                key={p.id}
                id={`${id}-opcao-${i}`}
                role="option"
                aria-selected={p.id === escolhido?.id}
                className={`mb-escolha-opcao${i === active ? ' mb-escolha-opcao--ativa' : ''}`}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => definirActive(i)}
                onClick={() => pegar(p)}
              >
                {p.rotulo}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

/** The row key: their `userIdentity`, which here needs to say which table it came from. */
function key(linha: { tipo: string; id: string }): string {
  return `${linha.tipo}:${linha.id}`;
}

/**
 * The `BlipDropdownButton`: a button, a backdrop that closes on click, and a card with the content on top, a divider, and the footer in `flex-row-reverse` — which is why "Cancelar" is written after "Aplicar" and appears to its left.
 */
function Menu({
  aberto,
  alternar,
  rotulo,
  icone,
  acao,
  aoEnviar,
  alvos,
  rodape,
  children,
}: {
  aberto: boolean;
  alternar: () => void;
  rotulo: string;
  /** In the source the trigger is icon-only (`edit`/`trash`, `desk` color); here the word becomes the accessible name. */
  icone: NomeDeIconePortal;
  acao: (data: FormData) => void;
  aoEnviar: () => void;
  alvos: string[];
  rodape: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mb-menu">
      <button
        type="button"
        className="mb-btn mb-btn--texto mb-btn--icone"
        onClick={alternar}
        aria-label={rotulo}
        aria-expanded={aberto}
      >
        <IconePortal nome={icone} tamanho={24} />
      </button>
      {aberto ? (
        <>
          <button type="button" className="mb-capa" aria-label="Fechar" onClick={alternar} />
          <form className="mb-menu-cartao" action={acao} onSubmit={aoEnviar}>
            {alvos.map((alvo) => (
              <input key={alvo} type="hidden" name="alvo" value={alvo} />
            ))}
            <div className="mb-menu-corpo">{children}</div>
            <div className="mb-regua" />
            <div className="mb-menu-rodape">{rodape}</div>
          </form>
        </>
      ) : null}
    </div>
  );
}

/** `tr.bp-bg-offwhite.tc > td[colSpan] > p.empty-message.pa5` — o vazio da tabela deles. */
function LinhaVazia({ colunas, texto }: { colunas: number; texto: string }) {
  return (
    <tr className="mb-vazia">
      <td colSpan={colunas}>
        <p>{texto}</p>
      </td>
    </tr>
  );
}

/**
 * Their `#tab-nav`: "Membros do contrato" and "Pendentes", both for anyone who can read members. Pendentes is for whoever REQUESTED to join (`PendingTenant`) — a door Pipe doesn't have —, so it always opens empty, matching the source, without the count badge, which there only appears once someone is in the queue.
 */
export function MembersAbas({
  podeEscrever,
  children,
}: {
  podeEscrever: boolean;
  children: ReactNode;
}) {
  const [aba, escolherAba] = useState<'membros' | 'pendentes'>('membros');
  const abas = [
    { id: 'membros', rotulo: TEXTO.abaMembros },
    { id: 'pendentes', rotulo: TEXTO.abaPendentes },
  ] as const;

  return (
    <div>
      <ul className="mb-abas-nav" role="tablist">
        {abas.map((a) => (
          <li key={a.id} role="presentation" className={aba === a.id ? 'mb-aba-ativa' : undefined}>
            <button
              type="button"
              role="tab"
              id={`mb-aba-${a.id}`}
              aria-selected={aba === a.id}
              aria-controls={`mb-painel-${a.id}`}
              onClick={() => escolherAba(a.id)}
            >
              {a.rotulo}
            </button>
          </li>
        ))}
      </ul>

      <div
        role="tabpanel"
        id="mb-painel-membros"
        aria-labelledby="mb-aba-membros"
        className="mb-aba-conteudo"
        hidden={aba !== 'membros'}
      >
        {children}
      </div>

      <div
        role="tabpanel"
        id="mb-painel-pendentes"
        aria-labelledby="mb-aba-pendentes"
        className="mb-aba-conteudo"
        hidden={aba !== 'pendentes'}
      >
        {/*
 * `TenantPendingMembers`: the same table, without search, with Nome and Email; no row, not even the header checkbox appears.
 */}
        <div className="mb-membros">
          <table className="mb-tabela">
            <thead>
              <tr>
                {[TEXTO.nome, TEXTO.email].map((rotulo) => (
                  <th key={rotulo}>
                    <span className="mb-ordenar">
                      {rotulo}
                      <IconePortal nome="baixo" tamanho={16} className="mb-seta mb-seta--sobe" />
                    </span>
                  </th>
                ))}
                {podeEscrever ? <th className="mb-col-acoes" /> : null}
              </tr>
            </thead>
            <tbody>
              <LinhaVazia colunas={3} texto={TEXTO.semPendentes} />
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
