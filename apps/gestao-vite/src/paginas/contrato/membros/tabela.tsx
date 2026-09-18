import { useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { IconePortal, IconeBusca } from '../../../componentes/icones-portal';
import type { NomeDeIconePortal } from '../../../componentes/icones-portal';
import { excluirMembros, trocarPapel } from '../acoes';

/**
 * A tabela de Membros do contrato, na mecânica da origem.
 *
 * O componente `TenantMembers` deles (`main.e8593b01.chunk.js`, o minificado
 * `$t`) é uma tabela de SELEÇÃO: nada acontece linha a linha. Marca-se um ou
 * vários, e aí aparecem no canto do cabeçalho os dois menus que agem sobre o
 * bloco inteiro — trocar o papel e excluir. Cada medida está comentada em
 * `contrato.css`; aqui ficam só as regras.
 *
 * As quatro que mudam o comportamento, todas copiadas:
 *
 * 1. **Você não aparece na sua própria lista** (`e.userIdentity !== o.identity`
 *    no filtro deles). Quem quiser sair usa "Deixar contrato", não esta tela.
 * 2. **A coluna de marcar só existe para quem pode escrever** (`canSelect:
 *    canEdit`), e com ela somem os dois menus — quem só lê vê a lista e nada mais.
 * 3. **Os menus só aparecem com alguém marcado** (`selectedItems.length > 0`).
 * 4. **"Aplicar" fica travado até um papel ser escolhido** (`disabled: undefined
 *    === selectedRole`).
 *
 * Isto é cliente porque a origem é: marcar, ordenar e buscar são estado de tela,
 * e sem JavaScript não haveria como mostrar "3 selecionado(s)". As ESCRITAS
 * continuam sendo Server Actions que conferem a permissão de novo no servidor
 * (`../acoes.ts`) — a tela esconder o menu é desenho, não é controle de acesso.
 */

export interface LinhaDeMembro {
  id: string;
  tipo: 'usuario' | 'convite';
  nome: string;
  email: string;
  /** O rótulo do papel de conta — "Admin", "Pode editar", "Pode visualizar". */
  papel: string;
}

/** Um dos três papéis de conta, já com o que a tela mostra dele. */
export interface OpcaoDePapel {
  id: string;
  /** `admin`, `member` ou `guest` — o nome no banco, que é o que a API casa. */
  roleId: string;
  rotulo: string;
  descricao: string;
  icone: NomeDeIconePortal;
  classe: string;
}

/** Os textos da tela, em pt-BR, como no dicionário `Wt.pt` da origem. */
const TEXTO = {
  nome: 'Nome',
  email: 'Email',
  papel: 'Papel',
  editar: 'Editar',
  membros: 'membro(s)',
  cancelar: 'Cancelar',
  aplicar: 'Aplicar',
  escolhaOPapel: 'Escolha o papel',
  excluir: 'Excluir',
  mensagemDeExclusao: 'Tem certeza que deseja excluir esse(s) membro(s)?',
  pendente: 'Pendente',
  /* `j.pt.emptyMessage` da tabela genérica e `aa.pt.emptyMessage` da aba de
     pendentes; as abas são o `ca.pt`. */
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

function valor(linha: LinhaDeMembro, campo: Campo): string {
  if (campo === 'nome') {
    /* `"".concat(fullName, " (", pendingInvitation, ")")` — o convidado que
       ainda não entrou carrega o estado no próprio nome, e por isso ele também
       entra na busca e na ordenação. */
    return linha.tipo === 'convite' ? `${linha.nome} (${TEXTO.pendente})` : linha.nome;
  }
  if (campo === 'email') return linha.email;
  /* `roleId: content[roleId]` — a célula mostra o RÓTULO do papel ("Admin",
     "Pode editar", "Pode visualizar"), nunca o `roleId` cru. */
  return linha.papel;
}

export function TabelaDeMembros({
  membros,
  papeis,
  podeEscrever,
}: {
  membros: LinhaDeMembro[];
  papeis: OpcaoDePapel[];
  podeEscrever: boolean;
}) {
  const [busca, definirBusca] = useState('');
  const [buscaAberta, abrirBusca] = useState(false);
  const [ordem, definirOrdem] = useState<{ campo: Campo; sentido: 'asc' | 'desc' } | null>(null);
  const [marcados, definirMarcados] = useState<readonly string[]>([]);
  const [menu, abrirMenu] = useState<'papel' | 'excluir' | null>(null);
  const [papelEscolhido, escolherPapel] = useState<OpcaoDePapel | null>(null);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const achados = termo
      ? membros.filter(
          (m) => m.nome.toLowerCase().includes(termo) || m.email.toLowerCase().includes(termo),
        )
      : membros;
    if (!ordem) return achados;
    const sinal = ordem.sentido === 'asc' ? 1 : -1;
    return [...achados].sort(
      (a, b) => sinal * valor(a, ordem.campo).localeCompare(valor(b, ordem.campo), 'pt-BR'),
    );
  }, [membros, busca, ordem]);

  const marcadosVisiveis = visiveis.filter((m) => marcados.includes(chave(m)));
  const todosMarcados = visiveis.length > 0 && marcadosVisiveis.length === visiveis.length;

  function alternar(linha: LinhaDeMembro) {
    const id = chave(linha);
    definirMarcados((antes) =>
      antes.includes(id) ? antes.filter((x) => x !== id) : [...antes, id],
    );
  }

  function limpar() {
    definirMarcados([]);
    escolherPapel(null);
    abrirMenu(null);
  }

  return (
    <div className="mb-membros">
      {/* `BlipSearch`: a lupa é um botão, e o campo nasce com largura zero e
          cresce para 200px ao ganhar o foco. Fecha ao perder. */}
      <div className={`mb-busca${buscaAberta || busca ? ' mb-busca--aberta' : ''}`}>
        <button type="button" onClick={() => abrirBusca(true)} aria-label="Buscar membro">
          <IconeBusca tamanho={20} />
        </button>
        <input
          type="text"
          value={busca}
          onChange={(e) => definirBusca(e.target.value)}
          onFocus={() => abrirBusca(true)}
          onBlur={() => abrirBusca(false)}
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
                    definirMarcados(todosMarcados ? [] : visiveis.map((m) => chave(m)))
                  }
                  rotulo="Marcar todos"
                />
              </th>
            ) : null}

            {COLUNAS.map((coluna) => (
              <th key={coluna.campo}>
                <button
                  type="button"
                  className="mb-ordenar"
                  onClick={() =>
                    definirOrdem({
                      campo: coluna.campo,
                      sentido:
                        ordem?.campo === coluna.campo && ordem.sentido === 'asc' ? 'desc' : 'asc',
                    })
                  }
                >
                  {coluna.rotulo}
                  {/* Falta na nossa folha o `arrow-up` da origem. Este é o
                      `arrow-down` DELA virado — mesmo traço, outro sentido —,
                      e não um desenho novo. */}
                  <IconePortal
                    nome="baixo"
                    tamanho={16}
                    className={`mb-seta${ordem?.campo === coluna.campo ? ' mb-seta--firme' : ''}${
                      ordem?.campo === coluna.campo && ordem.sentido === 'asc'
                        ? ' mb-seta--sobe'
                        : ''
                    }`}
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
                    acao={trocarPapel}
                    aoEnviar={limpar}
                    alvos={marcadosVisiveis.map(chave)}
                    rodape={
                      <>
                        <button
                          type="submit"
                          className="mb-btn mb-btn--texto mb-btn--marca"
                          disabled={!papelEscolhido}
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
                      {TEXTO.membros}
                    </p>
                    <EscolhaDePapel
                      papeis={papeis}
                      escolhido={papelEscolhido}
                      escolher={escolherPapel}
                    />
                    {/* A descrição do papel escolhido, como na origem: ela vive
                        AQUI, embaixo do seletor, e não numa legenda no pé. */}
                    <p className="mb-descricao">{papelEscolhido?.descricao ?? ''}</p>
                  </Menu>

                  <Menu
                    aberto={menu === 'excluir'}
                    alternar={() => abrirMenu(menu === 'excluir' ? null : 'excluir')}
                    rotulo={TEXTO.excluir}
                    icone="lixeira"
                    acao={excluirMembros}
                    aoEnviar={limpar}
                    alvos={marcadosVisiveis.map(chave)}
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
                      {TEXTO.membros}
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
            const marcado = marcados.includes(chave(linha));
            return (
              <tr key={chave(linha)} className={marcado ? 'mb-marcada' : ''}>
                {podeEscrever ? (
                  <td className="mb-col-marca">
                    <Marca
                      marcado={marcado}
                      alternar={() => alternar(linha)}
                      rotulo={`Marcar ${linha.nome}`}
                    />
                  </td>
                ) : null}
                {COLUNAS.map((coluna) => (
                  /* `title={n[a.key]}`: a célula não quebra e corta com
                     reticências, então o valor inteiro fica no atributo. */
                  <td key={coluna.campo} title={valor(linha, coluna.campo)}>
                    <span>{valor(linha, coluna.campo)}</span>
                  </td>
                ))}
                {podeEscrever ? <td className="mb-col-acoes" /> : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * O `Checkbox` da tabela deles: o `input` fica escondido e quem aparece é a
 * caixinha com o "✓". Aqui o `input` continua no foco e no leitor de tela.
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
 * O `BlipSelect` do menu Editar: rótulo "Papel" dentro da borda, vazio "Escolha
 * o papel", e a lista abaixo do campo com o nome de cada papel. É parente da
 * lista de Permissão do convite (mesmo teclado: ↑↓, Enter, Esc), mas o desenho
 * é outro — lá é o `bds-select` novo, com ícone e descrição por opção —, por
 * isso são dois componentes. O valor vai no `papelId` escondido.
 */
function EscolhaDePapel({
  papeis,
  escolhido,
  escolher,
}: {
  papeis: OpcaoDePapel[];
  escolhido: OpcaoDePapel | null;
  escolher: (papel: OpcaoDePapel) => void;
}) {
  const [aberta, abrirLista] = useState(false);
  const [ativa, definirAtiva] = useState(0);
  const botao = useRef<HTMLButtonElement>(null);
  const lista = useRef<HTMLUListElement>(null);
  const id = useId();

  function abrir() {
    definirAtiva(
      Math.max(
        0,
        papeis.findIndex((p) => p.id === escolhido?.id),
      ),
    );
    abrirLista(true);
    requestAnimationFrame(() => lista.current?.focus());
  }

  function pegar(p: OpcaoDePapel) {
    escolher(p);
    abrirLista(false);
    botao.current?.focus();
  }

  function tecla(e: KeyboardEvent<HTMLUListElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const passo = e.key === 'ArrowDown' ? 1 : -1;
      definirAtiva((a) => (a + passo + papeis.length) % papeis.length);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (papeis[ativa]) pegar(papeis[ativa]);
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
            aria-activedescendant={`${id}-opcao-${ativa}`}
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
                className={`mb-escolha-opcao${i === ativa ? ' mb-escolha-opcao--ativa' : ''}`}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => definirAtiva(i)}
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

/** A chave da linha: o `userIdentity` deles, que aqui precisa dizer de qual tabela veio. */
function chave(linha: { tipo: string; id: string }): string {
  return `${linha.tipo}:${linha.id}`;
}

/**
 * O `BlipDropdownButton`: um botão, uma capa que fecha ao clique e um cartão
 * com o conteúdo em cima, uma régua, e o rodapé em `flex-row-reverse` — por
 * isso o "Cancelar" é escrito depois do "Aplicar" e aparece à esquerda dele.
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
  /** Na origem o gatilho é só o ícone (`edit`/`trash`, cor `desk`); a palavra vira o nome acessível. */
  icone: NomeDeIconePortal;
  acao: (dados: FormData) => void;
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
 * O `#tab-nav` deles: "Membros do contrato" e "Pendentes", as duas para quem
 * lê membros. Pendentes é de quem PEDIU para entrar (`PendingTenant`) — porta
 * que o Pipe não tem —, então abre sempre no vazio da origem, sem o badge de
 * contagem, que lá só aparece com alguém na fila.
 */
export function AbasDeMembros({
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
        {/* `TenantPendingMembers`: a mesma tabela, sem busca, com Nome e Email;
            sem linha, nem a marcação do cabeçalho aparece. */}
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
