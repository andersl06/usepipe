import { useActionState, useId, useRef, useState } from 'react';
import type { ClipboardEvent, KeyboardEvent } from 'react';
import { IconePortal } from '../../../components/icones-portal';
import { convidarMembers } from '../actions';
import type { InvitationResult } from '../actions';
import type { RoleOption } from './tabela';

/**
 * The "Convidar" button and the "Invite people" modal. In the source, the modal lives in the portal's SHELL (`#invite-answer-modal`, template 632 of `portal.js`), not in the fragment. Here it lives next to the table, and the list is refreshed by the action's `revalidatePath`. Every measurement is commented in `contrato.css`; here only the rules remain, all of them theirs: - **Chips** (`bds-input-chips type="email"`): Enter, comma, space, paste, or leaving the field turn text into a chip; a duplicate email doesn't get added; Backspace on an empty field removes the last one. An email over 20 characters shows truncated, with the full value in `title` (their `bds-tooltip` would get clipped by scrolling). - **Bulk import:** reads the `.csv` IN THE BROWSER — one email per line, a `sep=` line discarded. Nothing is uploaded to any server. - **"Convidar" stays disabled** while there's no email, an email is invalid, the permission is missing, or someone on the list is already a member (their `ng-disabled`). Validation here only highlights the field and disables the button: the `api` makes the real decision. **What is NOT theirs:** the step after sending. There it's "Convites enviados com sucesso." and an "OK :)"; here there's no email delivery, so the same page lists each invite's link to copy — without it, the invite never reaches anyone. The link lives only in the modal's state, never in the URL.
 */

/*
 * Their `roleOptions` — icon, color and description per role, in guest → member → admin order — arrives ready-made in `papeis` (`PAPEIS_DA_ORIGEM`, in the page).
 */

/** blip-ds's `emailValidation` is a format check, not a lookup. */
const FORMAT_OF_EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

/** Acima disto o chip corta e o tooltip mostra o resto (medido na tela deles). */
const LETRAS_DO_CHIP = 20;

/*
 * "Veja a formatacão da tabela aqui." downloads a template. A `data:` URL inside an `<a download>` avoids a script, which some browsers block for downloads.
 */
const TEMPLATE_CSV = 'nome@empresa.com.br\noutra.pessoa@empresa.com.br\n';

function separar(texto: string): string[] {
  return texto
    .split(/[\s,;]+/)
    .map((e) => e.trim().replace(/^"|"$/g, ''))
    .filter(Boolean);
}

export function ConvidarMembers({
  papeis,
  membersEmails,
}: {
  papeis: RoleOption[];
  /** Lowercased. Anyone already in the contract can't be invited again. */
  membersEmails: string[];
}) {
  const modal = useRef<HTMLDialogElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const campoDeTexto = useRef<HTMLInputElement>(null);
  const roleButton = useRef<HTMLButtonElement>(null);
  const lista = useRef<HTMLUListElement>(null);
  const id = useId();

  const [chips, definirChips] = useState<string[]>([]);
  const [texto, definirTexto] = useState('');
  const [roleId, escolherRoleId] = useState('');
  const [aberta, abrirLista] = useState(false);
  const [active, definirActive] = useState(0);
  const [copiado, marcarCopiado] = useState<string | null>(null);
  /*
   * The action result survives closing; this tracks what the person already saw, so the modal reopens clean.
   */
  const [visto, marcarVisto] = useState<InvitationResult | null>(null);
  const [resultado, enviar, enviando] = useActionState(convidarMembers, null);

  const options = papeis;
  const role = options.find((p) => p.id === roleId) ?? null;
  const novo = resultado !== visto ? resultado : null;

  const invalido = chips.some((c) => !FORMAT_OF_EMAIL.test(c));
  const alreadyMember = chips.some((c) => membersEmails.includes(c.toLowerCase()));
  const travado = chips.length === 0 || invalido || !role || alreadyMember || enviando;

  function acrescentar(novos: string[]) {
    definirChips((antes) => {
      const juntos = [...antes];
      for (const e of novos) {
        if (!juntos.some((j) => j.toLowerCase() === e.toLowerCase())) juntos.push(e);
      }
      return juntos;
    });
  }

  function confirmarTexto() {
    if (texto.trim()) acrescentar(separar(texto));
    definirTexto('');
  }

  function teclaNoCampo(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
      e.preventDefault();
      confirmarTexto();
    } else if (e.key === 'Backspace' && texto === '') {
      definirChips((antes) => antes.slice(0, -1));
    }
  }

  function colar(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    acrescentar(separar(texto + e.clipboardData.getData('text')));
    definirTexto('');
  }

  async function importarArquivo(lido: File | undefined) {
    if (!lido) return;
    const linhas = (await lido.text())
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.toLowerCase().startsWith('sep='));
    acrescentar(linhas.flatMap(separar));
    if (file.current) file.current.value = '';
  }

  function escolher(p: RoleOption) {
    escolherRoleId(p.id);
    abrirLista(false);
    roleButton.current?.focus();
  }

  function abrir() {
    definirActive(
      Math.max(
        0,
        options.findIndex((p) => p.id === roleId),
      ),
    );
    abrirLista(true);
    requestAnimationFrame(() => lista.current?.focus());
  }

  function teclaNaLista(e: KeyboardEvent<HTMLUListElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const passo = e.key === 'ArrowDown' ? 1 : -1;
      definirActive((a) => (a + passo + options.length) % options.length);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (options[active]) escolher(options[active]);
    } else if (e.key === 'Escape') {
      /* Without this, Esc would close the whole `<dialog>`, not just the list. */
      e.preventDefault();
      abrirLista(false);
      roleButton.current?.focus();
    }
  }

  function fechar() {
    modal.current?.close();
    definirChips([]);
    definirTexto('');
    escolherRoleId('');
    abrirLista(false);
    marcarCopiado(null);
    marcarVisto(resultado);
  }

  async function copiar(url: string) {
    await navigator.clipboard.writeText(url);
    marcarCopiado(url);
  }

  return (
    <>
      <button
        type="button"
        className="mb-btn mb-btn--escuro mb-convidar"
        onClick={() => modal.current?.showModal()}
      >
        Convidar
      </button>

      <dialog ref={modal} className="mb-modal" aria-labelledby={`${id}-titulo`} onClose={fechar}>
        {novo && novo.links.length > 0 ? (
          <div className="mb-convite-feito">
            <h1 id={`${id}-titulo`}>Convites criados</h1>
            <p>Copie o link de cada pessoa: ele não aparece de novo.</p>
            <ul className="mb-links">
              {novo.links.map((l) => (
                <li key={l.url}>
                  <span>{l.email}</span>
                  <button type="button" className="mb-link" onClick={() => copiar(l.url)}>
                    {copiado === l.url ? 'Copiado' : 'Copiar link'}
                  </button>
                </li>
              ))}
            </ul>
            {novo.errors.length > 0 ? <SError errors={novo.errors} /> : null}
            <button type="button" className="mb-botao" onClick={fechar}>
              OK :)
            </button>
          </div>
        ) : (
          <>
            {enviando ? (
              <p className="mb-convite-espera" role="status">
                Enviando convites...
              </p>
            ) : null}

            <form action={enviar} hidden={enviando}>
              <input type="hidden" name="emails" value={chips.join(',')} />
              {/* The API matches the role by its DB NAME — the `roleId`, not the label. */}
              <input type="hidden" name="papel" value={role?.roleId ?? ''} />

              <div className="mb-convite-topo">
                {/*
 * ponytail: their `/fonts/invite_envelope.svg` isn't in any capture; the illustration spot stays empty until the file arrives.
 */}
                <div className="mb-convite-titulos">
                  <h1 id={`${id}-titulo`}>Convidar pessoas</h1>
                  <span>
                    Convide membros do seu time para trabalhar em projetos relacionados a este
                    contrato:
                  </span>
                </div>
              </div>

              <div className="mb-convite-campos">
                <div className="mb-chips-bloco">
                  <div
                    className={`mb-campo${invalido ? ' mb-campo--erro' : ''}`}
                    onClick={() => campoDeTexto.current?.focus()}
                  >
                    <label className="mb-campo-rotulo" htmlFor={`${id}-email`}>
                      E-mail
                    </label>
                    <div className="mb-chips">
                      {chips.map((c, i) => (
                        <span key={c} className="mb-chip">
                          {/*
 * Their `bds-tooltip` would get clipped here: the chip list scrolls, and scrolling cuts off anything rising above the first row. The full email goes in the `title`.
 */}
                          <span
                            className="mb-chip-texto"
                            title={c.length > LETRAS_DO_CHIP ? c : undefined}
                          >
                            {c.length > LETRAS_DO_CHIP ? `${c.slice(0, LETRAS_DO_CHIP)}...` : c}
                          </span>
                          <button
                            type="button"
                            className="mb-chip-fechar"
                            aria-label={`Remover ${c}`}
                            onClick={() => definirChips((antes) => antes.filter((_, j) => j !== i))}
                          >
                            <IconePortal nome="fechar-chip" tamanho={16} />
                          </button>
                        </span>
                      ))}
                      <input
                        ref={campoDeTexto}
                        id={`${id}-email`}
                        type="email"
                        value={texto}
                        onChange={(e) => definirTexto(e.target.value)}
                        onKeyDown={teclaNoCampo}
                        onPaste={colar}
                        onBlur={confirmarTexto}
                        aria-invalid={invalido}
                        aria-describedby={invalido ? `${id}-erro-email` : undefined}
                      />
                    </div>
                  </div>
                  {invalido ? (
                    <p className="mb-campo-erro" id={`${id}-erro-email`} role="alert">
                      <IconePortal nome="fechar-chip" tamanho={16} />
                      Formato de endereço e-mail inválido
                    </p>
                  ) : null}
                </div>

                <div className="mb-select">
                  {/*
 * The label sits inside the border, like `bds-select`; the button's accessible name is "Permissão" followed by the value.
 */}
                  <button
                    ref={roleButton}
                    type="button"
                    className={`mb-campo mb-select-campo${aberta ? ' mb-campo--aberto' : ''}`}
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
                    <span className="mb-select-corpo">
                      <span className="mb-campo-rotulo" id={`${id}-rotulo-papel`}>
                        Permissão
                      </span>
                      <span className={`mb-select-valor${role ? '' : ' mb-select-vazio'}`}>
                        {role?.rotulo ?? 'Selecione'}
                      </span>
                    </span>
                    <IconePortal nome="baixo" tamanho={20} />
                  </button>
                  {aberta ? (
                    <ul
                      ref={lista}
                      role="listbox"
                      tabIndex={-1}
                      className="mb-opcoes"
                      aria-labelledby={`${id}-rotulo-papel`}
                      aria-activedescendant={`${id}-opcao-${active}`}
                      onKeyDown={teclaNaLista}
                      onBlur={(e) => {
                        if (e.relatedTarget !== roleButton.current) abrirLista(false);
                      }}
                    >
                      {options.map((p, i) => (
                        <li
                          key={p.id}
                          id={`${id}-opcao-${i}`}
                          role="option"
                          aria-selected={p.id === roleId}
                          className={`mb-opcao${i === active ? ' mb-opcao--ativa' : ''}`}
                          onMouseDown={(e) => e.preventDefault()}
                          onMouseEnter={() => definirActive(i)}
                          onClick={() => escolher(p)}
                        >
                          <IconePortal
                            nome={p.icone}
                            tamanho={20}
                            className={`mb-opcao-icone ${p.classe}`}
                          />
                          <span className="mb-opcao-texto">
                            <span className="mb-opcao-titulo">{p.rotulo}</span>
                            <span className="mb-opcao-descricao">{p.description}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>

              {alreadyMember ? (
                <div className="mb-convite-aviso" role="alert">
                  <IconePortal nome="alerta" tamanho={40} />
                  <span>
                    Existem pessoas que já fazem parte desse contrato. Para editar o
                    permissionamento desses membros{' '}
                    <button type="button" className="mb-link" onClick={fechar}>
                      clique aqui
                    </button>
                  </span>
                </div>
              ) : null}

              <div className="mb-convite-importar">
                <div>
                  <p>ou</p>
                  <button
                    type="button"
                    className="mb-botao mb-botao--fantasma mb-botao--curto"
                    onClick={() => file.current?.click()}
                  >
                    <IconePortal nome="planilha" tamanho={24} />
                    Importar vários
                  </button>
                  <input
                    ref={file}
                    type="file"
                    accept=".csv"
                    hidden
                    onChange={(e) => importarArquivo(e.target.files?.[0])}
                  />
                </div>
                {/* The unaccented "formatacão" in the right place is theirs. */}
                <a
                  className="mb-convite-modelo"
                  href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE_CSV)}`}
                  download="modelo-convite.csv"
                >
                  Veja a formatacão da tabela aqui.
                </a>
              </div>

              {novo?.errors.length ? <SError errors={novo.errors} /> : null}

              <div className="mb-convite-rodape">
                <button type="button" className="mb-botao mb-botao--secundario" onClick={fechar}>
                  Cancelar
                </button>
                <button type="submit" className="mb-botao" disabled={travado}>
                  Convidar
                </button>
              </div>
            </form>
          </>
        )}
      </dialog>
    </>
  );
}

function SError({ errors }: { errors: string[] }) {
  return (
    <ul className="mb-erros" role="alert">
      {errors.map((e) => (
        <li key={e}>{e}</li>
      ))}
    </ul>
  );
}
