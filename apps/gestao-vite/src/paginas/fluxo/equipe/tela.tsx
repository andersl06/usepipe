import { useId, useMemo, useState } from 'react';
import { Avatar } from '@pipe/ui';
import { IconePortal } from '../../../componentes/icones-portal';
import { atualizarLeituras } from '../../../lib/acoes';
import { api } from '../../../lib/api';
import { BotaoBds, CabecalhoDaPagina } from '../configuracoes/pecas';
import { COLUNAS_DE_NIVEL, RECURSOS_DA_CONTA, nivelDoRecurso } from './permissoes';
import '../configuracoes/configuracoes.css';
import './equipe.css';

export interface MembroDaEquipe {
  id: string;
  tipo: 'usuario' | 'convite';
  nome: string;
  email: string;
  papelId: string | null;
  papel: string;
}

export interface OpcaoDePapelDaEquipe {
  id: string;
  roleId: string;
  rotulo: string;
}

interface ResultadoSimples {
  ok: boolean;
  erro?: string;
}

/** O mesmo formato de `contrato/membros/convidar.tsx` — o `emailValidation`
    do blip-ds é um formato, não uma consulta. */
const FORMATO_DE_EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

/**
 * As duas ações da linha — `POST .../papel` e `POST .../excluir`, as MESMAS
 * da tabela cheia (`contrato/membros/tabela.tsx`). Não reaproveita
 * `contrato/acoes.ts` na cara porque aquelas voltam pra `/contrato/membros`
 * no erro (`voltarComErro`) — aqui o erro fica na própria linha, sem navegar
 * pra fora de `/fluxo/:id/equipe`.
 */
async function mudarPapelDaLinha(alvo: string, papelId: string): Promise<ResultadoSimples> {
  const resultado = await api
    .post<ResultadoSimples>('/v1/gestao/contrato/membros/papel', { papelId, alvos: [alvo] })
    .catch((erro: Error) => ({ ok: false, erro: erro.message }) as ResultadoSimples);
  if (resultado.ok) atualizarLeituras();
  return resultado;
}

async function excluirLinha(alvo: string): Promise<ResultadoSimples> {
  const resultado = await api
    .post<ResultadoSimples>('/v1/gestao/contrato/membros/excluir', { alvos: [alvo] })
    .catch((erro: Error) => ({ ok: false, erro: erro.message }) as ResultadoSimples);
  if (resultado.ok) atualizarLeituras();
  return resultado;
}

interface ResultadoDoConvite extends ResultadoSimples {
  url?: string;
}

/**
 * `POST /v1/convites` — o mesmo endpoint de `contrato/membros/acoes.ts`
 * (`convidarMembros`), chamado direto por aqui pela mesma razão das outras
 * duas ações da linha: o erro fica no modal da Equipe, sem navegar para
 * `/contrato/membros`. `papel` é o NOME do papel (`roleId`, ex. `"guest"`),
 * não o `papelId` — a API de convite casa pelo nome do banco, como o campo
 * escondido `papel` de `convidar.tsx`.
 */
async function adicionarMembro(email: string, papel: string): Promise<ResultadoDoConvite> {
  const resultado = await api
    .post<{ email: string; url: string }>('/v1/convites', { email, papel })
    .then((corpo) => ({ ok: true, url: corpo.url }) as ResultadoDoConvite)
    .catch((erro: Error) => ({ ok: false, erro: erro.message }) as ResultadoDoConvite);
  if (resultado.ok) atualizarLeituras();
  return resultado;
}

function chaveDoAlvo(membro: MembroDaEquipe): string {
  return `${membro.tipo}:${membro.id}`;
}

/**
 * As legendas do traço, por papel e por modal — porque na origem os DOIS modais
 * escrevem o mesmo nível com palavras diferentes:
 *
 *   adicionar  `team.addUserModal.slider.*`: Visualizar · Customizado ·
 *              Visualizar e editar · Admin (DOM capturado com o modal aberto);
 *   editar     `permissions.*`: Visualizar · Personalizado · Ver e editar ·
 *              Admin (`FICHA-equipe-editar.md`, §4).
 *
 * O selo do cartão continua com o rótulo da tabela de Membros
 * (`PAPEIS_DA_ORIGEM`: "Pode visualizar", "Pode editar", "Admin") — é o mesmo
 * papel; só o traço fala como o traço deles. `Customizado`/`Personalizado` não
 * entram: o RBAC de conta (0021) tem três papéis e nenhum deles é "por pessoa"
 * (ver `permissoes.ts`).
 */
const LEGENDA_DO_NIVEL: Readonly<Record<string, { adicionar: string; editar: string }>> = {
  guest: { adicionar: 'Visualizar', editar: 'Visualizar' },
  member: { adicionar: 'Visualizar e editar', editar: 'Ver e editar' },
  admin: { adicionar: 'Admin', editar: 'Admin' },
};

function legendaDoNivel(papel: OpcaoDePapelDaEquipe, modal: 'adicionar' | 'editar'): string {
  return LEGENDA_DO_NIVEL[papel.roleId]?.[modal] ?? papel.rotulo;
}

/**
 * O `rzslider` "Permissão" da origem — o mesmo componente Angular nos dois
 * modais (`rz-slider-model="$ctrl.permissionsValue"`), com quatro paradas lá e
 * `papeis.length` aqui. Um `<input type="range">` de verdade por baixo: dá
 * arraste e teclado de graça, sem reimplementar o que o navegador já faz. As
 * legendas mudam com o modal (`LEGENDA_DO_NIVEL`), o controle não.
 */
function ControleDePermissao({
  papeis,
  papelId,
  modal,
  aoEscolher,
}: {
  papeis: OpcaoDePapelDaEquipe[];
  papelId: string;
  modal: 'adicionar' | 'editar';
  aoEscolher: (id: string) => void;
}) {
  const indice = Math.max(
    0,
    papeis.findIndex((p) => p.id === papelId),
  );
  return (
    <div className="cf-equipe-permissao">
      <span className="cf-equipe-permissao-rotulo">Permissão</span>
      <input
        type="range"
        className="cf-equipe-slider"
        min={0}
        max={Math.max(0, papeis.length - 1)}
        step={1}
        value={indice}
        onChange={(evento) => aoEscolher(papeis[Number(evento.target.value)]?.id ?? '')}
        aria-label="Permissão"
      />
      <div className="cf-equipe-slider-niveis">
        {papeis.map((papel) => (
          <span
            key={papel.id}
            className={
              papel.id === papelId
                ? 'cf-equipe-slider-nivel cf-equipe-slider-nivel--ativa'
                : 'cf-equipe-slider-nivel'
            }
          >
            {legendaDoNivel(papel, modal)}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * A lista de permissões granulares do EDITAR — o `PermissionsList.html` da
 * origem: cabeçalho "Funcionalidades | Sem permissão | Visualizar | Ver e
 * editar" (cada coluna com o `info` e o tooltip), e uma linha por recurso com
 * três rádios. Lá o nível escolhido acima marca os rádios e "Personalizado"
 * solta cada linha; aqui os rádios acompanham o traço (o nível troca, a lista
 * troca junto) mas não se soltam — não temos papel por pessoa. O porquê está
 * em `permissoes.ts`.
 */
function ListaDePermissoes({ roleId }: { roleId: string }) {
  const nomeDoGrupo = useId();
  return (
    <div className="cf-equipe-granular" role="group" aria-label="Permissões por recurso">
      <div className="cf-equipe-granular-cabecalho">
        <span className="cf-equipe-granular-recurso">Funcionalidades</span>
        <div className="cf-equipe-granular-colunas">
          {COLUNAS_DE_NIVEL.map((coluna) => (
            <span key={coluna.nivel} className="cf-equipe-granular-coluna">
              {coluna.rotulo}
              <span className="cf-equipe-granular-dica" title={coluna.dica}>
                <IconePortal nome="informacao-cheia" tamanho={16} />
              </span>
            </span>
          ))}
        </div>
      </div>
      <hr className="cf-equipe-granular-traco" />
      <ul className="cf-equipe-granular-lista">
        {RECURSOS_DA_CONTA.map((recurso) => {
          const nivel = nivelDoRecurso(roleId, recurso);
          return (
            <li key={recurso.chave} className="cf-equipe-granular-linha">
              <span className="cf-equipe-granular-recurso">{recurso.titulo}</span>
              <div className="cf-equipe-granular-colunas">
                {COLUNAS_DE_NIVEL.map((coluna) => {
                  const existe = coluna.nivel !== 'escrever' || recurso.temEscrita;
                  return (
                    <span key={coluna.nivel} className="cf-equipe-granular-coluna">
                      {existe ? (
                        <input
                          type="radio"
                          className="cf-equipe-radio"
                          name={`${nomeDoGrupo}-${recurso.chave}`}
                          checked={nivel === coluna.nivel}
                          /* Espelho do nível: vem do papel, não da mão. */
                          disabled
                          aria-label={`${recurso.titulo}: ${coluna.rotulo}`}
                        />
                      ) : (
                        <span className="cf-equipe-radio-ausente" aria-hidden="true">
                          —
                        </span>
                      )}
                    </span>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * O `add-user-modal` da origem — DOM capturado com ele ABERTO em
 * `docs/capturas/blip/equipe/equipe-adicionar-modal__pagina.html`:
 *
 *   toolbar    só o `icon-close` no canto;
 *   cabeça     bloco CENTRADO (`.row.mh6.tc.mt3`): h1 "Adicionar pessoa" e o
 *              subtítulo "Adicione e defina as permissões de uma nova pessoa
 *              para sua equipe";
 *   e-mail     `material-input` EDITÁVEL: rótulo pequeno em cima, traço
 *              embaixo, sem caixa;
 *   permissão  rótulo "Permissão" à esquerda e o `rzslider` com as legendas do
 *              adicionar;
 *   rodapé     `.modal-footer` CENTRADO: `Cancelar` (texto) e `Salvar`
 *              (`bp-btn--bot`), que nasce desabilitado
 *              (`ng-disabled="$ctrl.userForm.$invalid"`) até o e-mail valer.
 *
 * Na origem, com o traço em "Customizado" o `Salvar` vira `Continuar` (com
 * seta) e abre o formulário por recurso (`$ctrl.isCustom`). Não existe aqui:
 * sem papel por pessoa, não há segundo passo — o traço vai de um papel de
 * conta a outro e o botão é sempre `Salvar`.
 *
 * O que é NOSSO: a origem manda e-mail e fecha o modal (`$ctrl.addUser()`); o
 * Pipe não manda e-mail (`contrato/membros/convidar.tsx`), então `Salvar`
 * troca o formulário pelo link do convite, pra quem adicionou copiar e mandar
 * à mão.
 */
function ModalDeAdicionar({
  membros,
  papeis,
  aoFechar,
}: {
  membros: MembroDaEquipe[];
  papeis: OpcaoDePapelDaEquipe[];
  aoFechar: () => void;
}) {
  const [email, setEmail] = useState('');
  const [papelEscolhido, setPapelEscolhido] = useState(papeis[0]?.id ?? '');
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState('');
  /* Sobrevive ao "Salvar": troca o formulário pelo link, como `convidar.tsx`
     faz com `visto`/`resultado`. */
  const [linkCriado, setLinkCriado] = useState<{ email: string; url: string } | null>(null);
  const [copiado, setCopiado] = useState(false);

  const emailLimpo = email.trim();
  const emailValido = FORMATO_DE_EMAIL.test(emailLimpo);
  const emailJaMembro = membros.some((m) => m.email.toLowerCase() === emailLimpo.toLowerCase());
  const papelNovo = papeis.find((p) => p.id === papelEscolhido) ?? null;

  async function salvar() {
    if (!papelNovo) return;
    setEnviando(true);
    const resultado = await adicionarMembro(emailLimpo, papelNovo.roleId);
    setEnviando(false);
    if (!resultado.ok || !resultado.url) {
      setAviso(resultado.erro ?? 'Não foi possível adicionar.');
      return;
    }
    setLinkCriado({ email: emailLimpo, url: resultado.url });
  }

  return (
    <div
      className="cf-sobreposicao"
      role="presentation"
      onMouseDown={(evento) => evento.target === evento.currentTarget && aoFechar()}
    >
      <section
        className="cf-modal cf-equipe-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cf-adicionar-membro-titulo"
      >
        <button type="button" className="cf-equipe-fechar" aria-label="Fechar" onClick={aoFechar}>
          <IconePortal nome="fechar" tamanho={20} />
        </button>

        {linkCriado ? (
          <>
            <div className="cf-equipe-modal-cabeca">
              <h2 id="cf-adicionar-membro-titulo">Convite criado</h2>
              <p className="cf-equipe-subtitulo">
                Copie o link e envie para {linkCriado.email}: ele não aparece de novo.
              </p>
            </div>
            <div className="cf-equipe-link-criado">
              <span title={linkCriado.url}>{linkCriado.url}</span>
              <BotaoBds
                variante="secondary"
                onClick={async () => {
                  await navigator.clipboard.writeText(linkCriado.url);
                  setCopiado(true);
                }}
              >
                {copiado ? 'Copiado' : 'Copiar link'}
              </BotaoBds>
            </div>
            <footer className="cf-equipe-modal-rodape">
              <BotaoBds variante="bot" onClick={aoFechar}>
                OK :)
              </BotaoBds>
            </footer>
          </>
        ) : (
          <>
            <div className="cf-equipe-modal-cabeca">
              <h2 id="cf-adicionar-membro-titulo">Adicionar pessoa</h2>
              <p className="cf-equipe-subtitulo">
                Adicione e defina as permissões de uma nova pessoa para sua equipe
              </p>
            </div>
            <label className="cf-equipe-campo-email">
              <span>E-mail</span>
              <input
                type="email"
                value={email}
                onChange={(evento) => setEmail(evento.target.value)}
                maxLength={250}
                autoFocus
              />
            </label>
            {email && !emailValido ? (
              <p className="cf-aviso" role="alert">
                Formato de endereço e-mail inválido.
              </p>
            ) : null}
            {emailValido && emailJaMembro ? (
              <p className="cf-aviso" role="alert">
                Essa pessoa já faz parte da equipe.
              </p>
            ) : null}
            <ControleDePermissao
              papeis={papeis}
              papelId={papelEscolhido}
              modal="adicionar"
              aoEscolher={setPapelEscolhido}
            />
            {aviso ? (
              <p className="cf-aviso" role="alert">
                {aviso}
              </p>
            ) : null}
            <footer className="cf-equipe-modal-rodape">
              <BotaoBds variante="secondary" onClick={aoFechar}>
                Cancelar
              </BotaoBds>
              <BotaoBds
                variante="bot"
                disabled={enviando || !emailValido || emailJaMembro || !papelNovo}
                onClick={salvar}
              >
                Salvar
              </BotaoBds>
            </footer>
          </>
        )}
      </section>
    </div>
  );
}

/**
 * O "Editar membro" da origem — `FICHA-equipe-editar.md` (título e ordem dos
 * blocos) e o template da rota `/team/team/edit` no bundle (a lista por
 * recurso). NÃO é o modal de adicionar com outro título:
 *
 *   cabeça     "Editar membro", à esquerda e SEM subtítulo;
 *   dados      o e-mail SOMENTE LEITURA — o `material-input[readonly]` deles
 *              tira o traço de baixo (`border-bottom: none`), fica só o rótulo
 *              pequeno e o valor;
 *   permissão  o mesmo traço, com as legendas do editar (Visualizar · Ver e
 *              editar · Admin);
 *   granular   `ListaDePermissoes`: uma linha por recurso, três rádios, que
 *              acompanham o nível escolhido;
 *   rodapé     `Cancelar` e `Salvar alterações` (FICHA §5) — desabilitado
 *              enquanto nada mudou, como o `$pristine` da página deles.
 *
 * Grava pelo MESMO `POST .../membros/papel` da tabela de Membros.
 */
function ModalDeEditar({
  membro,
  papeis,
  aoFechar,
}: {
  membro: MembroDaEquipe;
  papeis: OpcaoDePapelDaEquipe[];
  aoFechar: () => void;
}) {
  const [papelEscolhido, setPapelEscolhido] = useState(membro.papelId ?? papeis[0]?.id ?? '');
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState('');
  const papel = papeis.find((p) => p.id === papelEscolhido) ?? null;
  const mudou = papelEscolhido !== '' && papelEscolhido !== membro.papelId;

  async function salvar() {
    setEnviando(true);
    const resultado = await mudarPapelDaLinha(chaveDoAlvo(membro), papelEscolhido);
    setEnviando(false);
    if (!resultado.ok) {
      setAviso(resultado.erro ?? 'Não foi possível alterar o papel.');
      return;
    }
    aoFechar();
  }

  return (
    <div
      className="cf-sobreposicao"
      role="presentation"
      onMouseDown={(evento) => evento.target === evento.currentTarget && aoFechar()}
    >
      <section
        className="cf-modal cf-equipe-modal cf-equipe-modal--editar"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cf-editar-membro-titulo"
      >
        <button type="button" className="cf-equipe-fechar" aria-label="Fechar" onClick={aoFechar}>
          <IconePortal nome="fechar" tamanho={20} />
        </button>
        <h2 id="cf-editar-membro-titulo">Editar membro</h2>
        <div className="cf-equipe-campo-email cf-equipe-campo-email--leitura">
          <span>E-mail</span>
          <input type="email" value={membro.email} readOnly aria-label="E-mail" />
        </div>
        <ControleDePermissao
          papeis={papeis}
          papelId={papelEscolhido}
          modal="editar"
          aoEscolher={setPapelEscolhido}
        />
        {papel ? <ListaDePermissoes roleId={papel.roleId} /> : null}
        {aviso ? (
          <p className="cf-aviso" role="alert">
            {aviso}
          </p>
        ) : null}
        <footer className="cf-equipe-modal-rodape">
          <BotaoBds variante="secondary" onClick={aoFechar}>
            Cancelar
          </BotaoBds>
          <BotaoBds variante="bot" disabled={enviando || !mudou} onClick={salvar}>
            Salvar alterações
          </BotaoBds>
        </footer>
      </section>
    </div>
  );
}

/**
 * `/team` do contato — a mesma tela em `/fluxo/:id/equipe` e
 * `/roteador/:id/equipe`, porque na origem ela é um estado de
 * `auth.application.detail` e vale para chatbot e roteador igual.
 *
 * A estrutura é a do template da origem (`portal.js`, o `<page-header
 * class="team-header">` seguido de `.container.mb-5 > .row.team-cards`, e o
 * mesmo DOM renderizado em `docs/capturas/blip/roteador/roteador-team__pagina.html`):
 *
 *   cabeçalho  h1 "Equipe" à esquerda; à direita a busca
 *              ("Pesquisar por nome ou e-mail", ícone `avatar-user`, 260px) e
 *              DEPOIS o botão "Adicionar Membro" — nessa ordem;
 *   subtítulo  "Adicione pessoas para a sua equipe e dê permissões para
 *              alterarem o Chatbot." (`additional-info`), abaixo do traço;
 *   lista      um `card--mini-card` por membro: avatar (5%) · "Membro" + nome
 *              (25%) · divisória · "E-mail" + e-mail (20%) · divisória ·
 *              selo do papel (10%) · divisória · editar/excluir (5%);
 *   vazio      "Nenhum membro encontrado =(" (`.no-content-found`).
 *
 * O `page-help` ("Ver documentação") existe no template mas nasce escondido
 * (`class="animated fadeOut ng-hide"` no DOM capturado, com `ng-show` de
 * título/corpo que a tela nunca preenche): não é bloco desta tela e aqui
 * também não aparece.
 *
 * Duas coisas que a origem decide por dado e nós decidimos por dado também: o
 * selo só existe quando há papel a mostrar (lá, `user.owner || user.isAdmin`;
 * aqui todo membro tem um dos três papéis da conta, então ele está sempre
 * lá, e o e-mail fica no ramo de 20%), e as ações da linha somem para o
 * próprio usuário logado (lá `ng-if="!user.owner"`; aqui ele nem entra na
 * lista — filtro do `equipe.tsx`).
 *
 * De onde vem a lista, na origem: `TeamController._loadMembers()` chama
 * `getUsersAccounts` (`GET /applications/{shortName}@msging.net/users/accounts`)
 * e `_loadUsers()` cruza com `getApplicationUsersPermissions`
 * (`GET /applications/{shortName}@msging.net/permissions`) — tudo POR
 * CONTATO, nunca herdado do contrato. O contrato é pré-requisito, não fonte:
 * `confirmAddUser` convida a pessoa para o tenant como `guest` se ela ainda
 * não estiver nele, e o próprio aviso da origem diz "Essa pessoa não faz
 * parte do contrato. O administrador deve incluir a pessoa no contrato antes
 * de adicioná-la ao chatbot.".
 *
 * O Pipe ainda não tem RBAC por fluxo — o de hoje é da conta inteira
 * (`itens.ts`, "Não recebe permissão... até existir RBAC por fluxo"). Por
 * isso a lista aqui é a mesma de `/contrato/membros` (dado real, sem
 * invenção): todo mundo com acesso à conta tem acesso a todos os fluxos dela,
 * ou seja, o subconjunto por contato é hoje o conjunto inteiro.
 *
 * Os três modais são os da origem, cada um com o que é seu: `ModalDeAdicionar`
 * (o `add-user-modal`), `ModalDeEditar` (o "Editar membro" da FICHA, com a
 * lista por recurso) e a confirmação de exclusão com os botões `utils.misc.no`
 * / `yes`. Editar e excluir chamam os MESMOS endpoints que `/contrato/membros`
 * já usa; adicionar chama `POST /v1/convites`.
 */
export function TelaDeEquipe({
  membros,
  papeis,
  podeEscrever,
}: {
  membros: MembroDaEquipe[];
  papeis: OpcaoDePapelDaEquipe[];
  podeEscrever: boolean;
}) {
  const [busca, setBusca] = useState('');
  const [adicionando, setAdicionando] = useState(false);
  const [editando, setEditando] = useState<MembroDaEquipe | null>(null);
  const [excluindo, setExcluindo] = useState<MembroDaEquipe | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState('');

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return membros;
    return membros.filter(
      (m) => m.nome.toLowerCase().includes(termo) || m.email.toLowerCase().includes(termo),
    );
  }, [membros, busca]);

  return (
    <>
      <CabecalhoDaPagina
        titulo={<h1>Equipe</h1>}
        acoes={
          <div className="cf-equipe-acoes">
            <label className="cf-equipe-busca">
              <IconePortal nome="avatar" tamanho={24} />
              <input
                type="text"
                value={busca}
                onChange={(evento) => setBusca(evento.target.value)}
                placeholder="Pesquisar por nome ou e-mail"
                aria-label="Pesquisar por nome ou e-mail"
              />
            </label>
            {podeEscrever ? (
              /* `addUser()` da origem — botão "Adicionar Membro" do cabeçalho. */
              <BotaoBds icone="mais" onClick={() => setAdicionando(true)}>
                Adicionar Membro
              </BotaoBds>
            ) : null}
          </div>
        }
        descricao={
          <p>Adicione pessoas para a sua equipe e dê permissões para alterarem o Chatbot.</p>
        }
      />
      <div className="cf-container cf-equipe">
        {visiveis.map((membro) => (
          <div
            key={membro.id}
            className={podeEscrever ? 'cf-equipe-link cf-equipe-link--clicavel' : 'cf-equipe-link'}
            /* `editUser(user)` da origem: o cartão inteiro (`<a class="no-decoration">`)
               e o ícone de lápis abrem a MESMA edição. */
            onClick={podeEscrever ? () => setEditando(membro) : undefined}
          >
            <div className="cf-equipe-cartao">
              <div className="cf-equipe-linha">
                <div className="cf-equipe-secao cf-equipe-w5 cf-equipe-avatar-secao">
                  <Avatar nome={membro.nome} className="cf-equipe-avatar" />
                </div>
                <div className="cf-equipe-secao cf-equipe-secao--corta cf-equipe-w25">
                  <span className="cf-equipe-rotulo">Membro</span>
                  <span className="cf-equipe-valor">{membro.nome}</span>
                </div>
                <div className="cf-equipe-divisor" />
                <div className="cf-equipe-secao cf-equipe-secao--corta cf-equipe-w20">
                  <span className="cf-equipe-rotulo">E-mail</span>
                  <span className="cf-equipe-valor" title={membro.email}>
                    {membro.email}
                  </span>
                </div>
                <div className="cf-equipe-divisor" />
                <div className="cf-equipe-secao cf-equipe-secao--selo">
                  <span className="cf-equipe-selo">{membro.papel}</span>
                </div>
                {podeEscrever ? (
                  <>
                    <div className="cf-equipe-divisor cf-equipe-oculto" />
                    <div className="cf-equipe-icones cf-equipe-oculto cf-equipe-w5">
                      <button
                        type="button"
                        className="cf-equipe-icone"
                        aria-label={`Editar ${membro.nome}`}
                        onClick={(evento) => {
                          evento.stopPropagation();
                          setEditando(membro);
                        }}
                      >
                        <IconePortal nome="editar" tamanho={20} />
                      </button>
                      <button
                        type="button"
                        className="cf-equipe-icone"
                        aria-label={`Remover ${membro.nome}`}
                        onClick={(evento) => {
                          evento.stopPropagation();
                          setExcluindo(membro);
                          setAviso('');
                        }}
                      >
                        <IconePortal nome="lixeira" tamanho={20} />
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        ))}

        {visiveis.length === 0 ? (
          <span className="cf-equipe-vazio">Nenhum membro encontrado =(</span>
        ) : null}
      </div>

      {adicionando ? (
        <ModalDeAdicionar
          membros={membros}
          papeis={papeis}
          aoFechar={() => setAdicionando(false)}
        />
      ) : null}

      {editando ? (
        /* `key` pelo membro: abrir outro cartão zera o traço e o aviso. */
        <ModalDeEditar
          key={chaveDoAlvo(editando)}
          membro={editando}
          papeis={papeis}
          aoFechar={() => setEditando(null)}
        />
      ) : null}

      {excluindo ? (
        <div
          className="cf-sobreposicao"
          role="presentation"
          onMouseDown={(evento) => evento.target === evento.currentTarget && setExcluindo(null)}
        >
          <section
            className="cf-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cf-excluir-membro-titulo"
          >
            <h2 id="cf-excluir-membro-titulo">Confirmar exclusão</h2>
            <p>Deseja realmente remover {excluindo.email} do seu chatbot?</p>
            {aviso ? (
              <p className="cf-aviso" role="alert">
                {aviso}
              </p>
            ) : null}
            <footer className="cf-modal-acoes">
              <BotaoBds variante="secondary" onClick={() => setExcluindo(null)}>
                Não
              </BotaoBds>
              <BotaoBds
                variante="perigo"
                disabled={enviando}
                onClick={async () => {
                  setEnviando(true);
                  const resultado = await excluirLinha(chaveDoAlvo(excluindo));
                  setEnviando(false);
                  if (!resultado.ok) {
                    setAviso(resultado.erro ?? 'Não foi possível remover.');
                    return;
                  }
                  setExcluindo(null);
                }}
              >
                Sim
              </BotaoBds>
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}
