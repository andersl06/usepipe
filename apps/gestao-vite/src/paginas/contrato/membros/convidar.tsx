import { useActionState, useId, useRef, useState } from 'react';
import type { ClipboardEvent, KeyboardEvent } from 'react';
import { IconePortal } from '../../../componentes/icones-portal';
import { convidarMembros } from '../acoes';
import type { ResultadoDoConvite } from '../acoes';
import type { OpcaoDePapel } from './tabela';

/**
 * O botão "Convidar" e o modal "Convidar pessoas".
 *
 * Na origem o modal mora no SHELL do portal (`#invite-answer-modal`, template
 * 632 do `portal.js`), e não no fragmento. Aqui ele vive ao lado da tabela, e
 * quem recarrega a lista é o `revalidatePath` da ação. Cada medida está
 * comentada em `contrato.css`; aqui ficam só as regras, todas as deles:
 *
 * - **Chips** (`bds-input-chips type="email"`): Enter, vírgula, espaço, colar
 *   ou sair do campo viram chip; e-mail repetido não entra; Backspace no campo
 *   vazio tira o último. E-mail com mais de 20 letras aparece cortado, com o
 *   inteiro no `title` (o `bds-tooltip` deles seria recortado pela rolagem).
 * - **Importar vários:** lê o `.csv` NO NAVEGADOR — um e-mail por linha, linha
 *   `sep=` descartada. Nada sobe para servidor nenhum.
 * - **"Convidar" travado** enquanto não houver e-mail, houver e-mail inválido,
 *   faltar a permissão ou alguém da lista já for membro (`ng-disabled` deles).
 *
 * A validação daqui só pinta o campo e trava o botão: quem decide é a `api`.
 *
 * **O que NÃO é deles:** o passo depois do envio. Lá é "Convites enviados com
 * sucesso." e um "OK :)"; aqui não existe envio de e-mail, então a mesma página
 * lista o link de cada convite para copiar — sem ele o convite não chega a
 * ninguém. O link vive só no estado do modal, nunca na URL.
 */

/* `roleOptions` deles — ícone, cor e descrição por papel, na ordem guest →
   member → admin — chega pronto em `papeis` (`PAPEIS_DA_ORIGEM`, na página). */

/** O `emailValidation` do blip-ds é um formato, não uma consulta. */
const FORMATO_DE_EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

/** Acima disto o chip corta e o tooltip mostra o resto (medido na tela deles). */
const LETRAS_DO_CHIP = 20;

/* "Veja a formatacão da tabela aqui." baixa um modelo. Um `data:` num `<a
   download>` dispensa script, que alguns navegadores bloqueiam para download. */
const MODELO_CSV = 'nome@empresa.com.br\noutra.pessoa@empresa.com.br\n';

function separar(texto: string): string[] {
  return texto
    .split(/[\s,;]+/)
    .map((e) => e.trim().replace(/^"|"$/g, ''))
    .filter(Boolean);
}

export function ConvidarMembros({
  papeis,
  emailsDeMembros,
}: {
  papeis: OpcaoDePapel[];
  /** Em minúsculas. Quem já está no contrato não pode ser convidado de novo. */
  emailsDeMembros: string[];
}) {
  const modal = useRef<HTMLDialogElement>(null);
  const arquivo = useRef<HTMLInputElement>(null);
  const campoDeTexto = useRef<HTMLInputElement>(null);
  const botaoDoPapel = useRef<HTMLButtonElement>(null);
  const lista = useRef<HTMLUListElement>(null);
  const id = useId();

  const [chips, definirChips] = useState<string[]>([]);
  const [texto, definirTexto] = useState('');
  const [papelId, escolherPapelId] = useState('');
  const [aberta, abrirLista] = useState(false);
  const [ativa, definirAtiva] = useState(0);
  const [copiado, marcarCopiado] = useState<string | null>(null);
  /* O resultado da ação sobrevive ao fechar; este é o que a pessoa já viu, para
     o modal reabrir limpo. */
  const [visto, marcarVisto] = useState<ResultadoDoConvite | null>(null);
  const [resultado, enviar, enviando] = useActionState(convidarMembros, null);

  const opcoes = papeis;
  const papel = opcoes.find((p) => p.id === papelId) ?? null;
  const novo = resultado !== visto ? resultado : null;

  const invalido = chips.some((c) => !FORMATO_DE_EMAIL.test(c));
  const jaMembro = chips.some((c) => emailsDeMembros.includes(c.toLowerCase()));
  const travado = chips.length === 0 || invalido || !papel || jaMembro || enviando;

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

  async function importar(lido: File | undefined) {
    if (!lido) return;
    const linhas = (await lido.text())
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.toLowerCase().startsWith('sep='));
    acrescentar(linhas.flatMap(separar));
    if (arquivo.current) arquivo.current.value = '';
  }

  function escolher(p: OpcaoDePapel) {
    escolherPapelId(p.id);
    abrirLista(false);
    botaoDoPapel.current?.focus();
  }

  function abrir() {
    definirAtiva(
      Math.max(
        0,
        opcoes.findIndex((p) => p.id === papelId),
      ),
    );
    abrirLista(true);
    requestAnimationFrame(() => lista.current?.focus());
  }

  function teclaNaLista(e: KeyboardEvent<HTMLUListElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const passo = e.key === 'ArrowDown' ? 1 : -1;
      definirAtiva((a) => (a + passo + opcoes.length) % opcoes.length);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (opcoes[ativa]) escolher(opcoes[ativa]);
    } else if (e.key === 'Escape') {
      /* Sem isto o Esc fecharia o `<dialog>` inteiro, e não só a lista. */
      e.preventDefault();
      abrirLista(false);
      botaoDoPapel.current?.focus();
    }
  }

  function fechar() {
    modal.current?.close();
    definirChips([]);
    definirTexto('');
    escolherPapelId('');
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
            {novo.erros.length > 0 ? <Erros erros={novo.erros} /> : null}
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
              {/* A API casa o papel pelo NOME do banco — o `roleId`, não o rótulo. */}
              <input type="hidden" name="papel" value={papel?.roleId ?? ''} />

              <div className="mb-convite-topo">
                {/* ponytail: o `/fonts/invite_envelope.svg` deles não está em
                    nenhuma captura; o lugar da ilustração fica vazio até o
                    arquivo chegar. */}
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
                          {/* O `bds-tooltip` deles viraria recorte aqui: a lista de
                              chips rola, e quem rola corta o que sobe da primeira
                              linha. O e-mail inteiro vai no `title`. */}
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
                  {/* O rótulo mora dentro da borda, como no `bds-select`; o
                      nome do botão é "Permissão" seguido do valor. */}
                  <button
                    ref={botaoDoPapel}
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
                      <span className={`mb-select-valor${papel ? '' : ' mb-select-vazio'}`}>
                        {papel?.rotulo ?? 'Selecione'}
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
                      aria-activedescendant={`${id}-opcao-${ativa}`}
                      onKeyDown={teclaNaLista}
                      onBlur={(e) => {
                        if (e.relatedTarget !== botaoDoPapel.current) abrirLista(false);
                      }}
                    >
                      {opcoes.map((p, i) => (
                        <li
                          key={p.id}
                          id={`${id}-opcao-${i}`}
                          role="option"
                          aria-selected={p.id === papelId}
                          className={`mb-opcao${i === ativa ? ' mb-opcao--ativa' : ''}`}
                          onMouseDown={(e) => e.preventDefault()}
                          onMouseEnter={() => definirAtiva(i)}
                          onClick={() => escolher(p)}
                        >
                          <IconePortal
                            nome={p.icone}
                            tamanho={20}
                            className={`mb-opcao-icone ${p.classe}`}
                          />
                          <span className="mb-opcao-texto">
                            <span className="mb-opcao-titulo">{p.rotulo}</span>
                            <span className="mb-opcao-descricao">{p.descricao}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>

              {jaMembro ? (
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
                    onClick={() => arquivo.current?.click()}
                  >
                    <IconePortal nome="planilha" tamanho={24} />
                    Importar vários
                  </button>
                  <input
                    ref={arquivo}
                    type="file"
                    accept=".csv"
                    hidden
                    onChange={(e) => importar(e.target.files?.[0])}
                  />
                </div>
                {/* O "formatacão" sem acento no lugar certo é deles. */}
                <a
                  className="mb-convite-modelo"
                  href={`data:text/csv;charset=utf-8,${encodeURIComponent(MODELO_CSV)}`}
                  download="modelo-convite.csv"
                >
                  Veja a formatacão da tabela aqui.
                </a>
              </div>

              {novo?.erros.length ? <Erros erros={novo.erros} /> : null}

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

function Erros({ erros }: { erros: string[] }) {
  return (
    <ul className="mb-erros" role="alert">
      {erros.map((e) => (
        <li key={e}>{e}</li>
      ))}
    </ul>
  );
}
