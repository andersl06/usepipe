import { useId, useMemo, useState } from 'react';
import { Avatar } from '@pipe/ui';
import { useNavigate } from 'react-router-dom';
import type {
  MemberOfFlow,
  LevelInFlow,
  RoleInFlow,
  PermissionsInFlow,
  RecursoOfFlow,
} from '@pipe/contracts';
import { IconePortal } from '../../../componentes/icones-portal';
import { Pagination, usePage } from '../../../componentes/paginacao';
import { atualizarLeituras } from '../../../lib/acoes';
import { api } from '../../../lib/api';
import { BotaoBds, PageHeader } from '../configuracoes/pecas';
import { acaoDeAdicionar, COLUNAS_DE_NIVEL, ROLES_OF_FLOW } from './permissoes';
import '../configuracoes/configuracoes.css';
import './equipe.css';

interface ResultadoSimples {
  ok: boolean;
  error?: string;
  codigo?: string;
}

/** O mesmo formato de `contrato/membros/convidar.tsx` — o `emailValidation`
    do blip-ds é um formato, não uma consulta. */
const FORMAT_OF_EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

/** O `{ erro: { codigo, mensagem } }` da `api` virado em `ResultadoSimples`. */
function recusa(error: unknown): ResultadoSimples {
  const corpo = (error as { corpo?: { error?: { codigo?: string; message?: string } } }).corpo;
  return {
    ok: false,
    error: corpo?.error?.message ?? (error as Error).message,
    ...(corpo?.error?.codigo ? { codigo: corpo.error.codigo } : {}),
  };
}

async function gravar(chamada: Promise<unknown>): Promise<ResultadoSimples> {
  try {
    await chamada;
    atualizarLeituras();
    return { ok: true };
  } catch (error) {
    return recusa(error);
  }
}

/**
 * As três ações da linha, agora POR FLUXO — `POST/PATCH/DELETE
 * /v1/gestao/fluxos/:id/equipe` (controlador `gestao-equipe.ts`). Antes da
 * migração 0035 elas mexiam no papel de CONTA (`/contrato/membros/papel` e
 * `/excluir`), porque o Pipe não tinha RBAC por fluxo: tirar alguém daqui
 * tirava do contrato inteiro. Agora tira só deste contato, que é o que a
 * origem sempre fez (`TeamController`, tudo por bot).
 */
const caminho = (flowId: string, alvo?: string) =>
  `/v1/management/flows/${flowId}/equipe${alvo ? `/${alvo}` : ''}`;

/**
 * O `rzslider` "Permissão" do modal de adição da origem
 * (`rz-slider-model="$ctrl.permissionsValue"`), com as mesmas quatro paradas.
 * Um `<input type="range">` de verdade por baixo dá arraste e teclado sem
 * reimplementar o comportamento nativo.
 */
function PermissionControle({
  role,
  aoEscolher,
}: {
  role: RoleInFlow;
  aoEscolher: (role: RoleInFlow) => void;
}) {
  const indice = Math.max(
    0,
    ROLES_OF_FLOW.findIndex((p) => p.role === role),
  );
  return (
    <div className="cf-equipe-permissao">
      <span className="cf-equipe-permissao-rotulo">Permissão</span>
      <input
        type="range"
        className="cf-equipe-slider"
        min={0}
        max={ROLES_OF_FLOW.length - 1}
        step={1}
        value={indice}
        onChange={(evento) => {
          const escolhido = ROLES_OF_FLOW[Number(evento.target.value)];
          if (escolhido) aoEscolher(escolhido.role);
        }}
        aria-label="Permissão"
      />
      <div className="cf-equipe-slider-niveis">
        {ROLES_OF_FLOW.map((parada) => (
          <span
            key={parada.role}
            className={
              parada.role === role
                ? 'cf-equipe-slider-nivel cf-equipe-slider-nivel--ativa'
                : 'cf-equipe-slider-nivel'
            }
          >
            {parada.adicionar}
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
 * três rádios.
 *
 * A regra é a de lá, inteira: o nível de cima marca os rádios
 * (`selectAllPermissions()`) e só "Personalizado" solta cada linha para a mão
 * (`checkStatus()`). Os RECURSOS vêm do servidor, na ordem do template deles.
 */
export function PermissionsLista({
  recursos,
  permissions,
  editavel,
  toSwitch,
}: {
  recursos: readonly RecursoOfFlow[];
  permissions: PermissionsInFlow;
  editavel: boolean;
  toSwitch: (key: string, nivel: LevelInFlow) => void;
}) {
  const nomeDoGrupo = useId();
  return (
    <div className="cf-equipe-granular" role="group" aria-label="Permissões por recurso">
      <div className="cf-equipe-granular-cabecalho">
        <span className="cf-equipe-granular-recurso">Funcionalidades</span>
        <div className="cf-equipe-granular-colunas">
          {COLUNAS_DE_NIVEL.map((column) => (
            <span key={column.nivel} className="cf-equipe-granular-coluna">
              {column.rotulo}
              <span className="cf-equipe-granular-dica" title={column.dica}>
                <IconePortal nome="informacao-cheia" tamanho={16} />
              </span>
            </span>
          ))}
        </div>
      </div>
      <hr className="cf-equipe-granular-traco" />
      <ul className="cf-equipe-granular-lista">
        {recursos.map((recurso) => {
          const nivel = permissions[recurso.key] ?? 'nenhum';
          return (
            <li key={recurso.key} className="cf-equipe-granular-linha">
              <span className="cf-equipe-granular-recurso">{recurso.titulo}</span>
              <div className="cf-equipe-granular-colunas">
                {COLUNAS_DE_NIVEL.map((column) => (
                  <span key={column.nivel} className="cf-equipe-granular-coluna">
                    <input
                      type="radio"
                      className="cf-equipe-radio"
                      name={`${nomeDoGrupo}-${recurso.key}`}
                      checked={nivel === column.nivel}
                      onChange={() => toSwitch(recurso.key, column.nivel)}
                      /* Fora de "Personalizado" o traço manda, como na origem. */
                      disabled={!editavel}
                      aria-label={`${recurso.titulo}: ${column.rotulo}`}
                    />
                  </span>
                ))}
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
 * `referencias-blip/equipe/equipe-adicionar-modal__pagina.html`:
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
 * Em "Customizado", a origem chama `addCustomUser()`: o CTA vira "Continuar"
 * e só então navega para a página separada `/team/edit`, onde fica a matriz.
 *
 * O CONVITE é o que a origem confessa e nós repetimos de outro jeito: lá,
 * `confirmAddUser` convida para o tenant como `guest` quem ainda não está nele
 * e avisa "Essa pessoa não faz parte do contrato…". Aqui a `api` recusa com
 * essa mesma frase (`pessoa_fora_do_contrato`) e o modal oferece o convite —
 * `POST /v1/convites`, o mesmo de `/contrato/membros`, que devolve o link para
 * copiar porque o Pipe não manda e-mail.
 */
function ModalDeAdicionar({
  flowId,
  members,
  aoFechar,
}: {
  flowId: string;
  members: MemberOfFlow[];
  aoFechar: () => void;
}) {
  const navegar = useNavigate();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<RoleInFlow>('visualizar');
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState('');
  /** Aparece quando a `api` diz que a pessoa não está no contrato. */
  const [convidar, setConvidar] = useState(false);
  const [linkCriado, setLinkCriado] = useState<{ email: string; url: string } | null>(null);
  const [copiado, setCopiado] = useState(false);

  const emailLimpo = email.trim();
  const emailValido = FORMAT_OF_EMAIL.test(emailLimpo);
  const emailAlreadyMember = members.some((m) => m.email.toLowerCase() === emailLimpo.toLowerCase());

  async function salvar() {
    setEnviando(true);
    try {
      const member = await api.post<MemberOfFlow>(caminho(flowId), {
        email: emailLimpo,
        papelNoFluxo: role,
      });
      atualizarLeituras();
      if (role === 'personalizado') {
        navegar(`editar/${member.userId}`);
      } else {
        aoFechar();
      }
    } catch (error) {
      const resultado = recusa(error);
      setAviso(resultado.error ?? 'Não foi possível adicionar.');
      setConvidar(resultado.codigo === 'person_outside_of_contract');
    } finally {
      setEnviando(false);
    }
  }

  /** O `guest` de `confirmAddUser`: entrar no contrato é pré-requisito, não o gesto. */
  async function convidarForContract() {
    setEnviando(true);
    try {
      const corpo = await api.post<{ url: string }>('/v1/convites', {
        email: emailLimpo,
        papel: 'guest',
      });
      setLinkCriado({ email: emailLimpo, url: corpo.url });
    } catch (error) {
      setAviso(recusa(error).error ?? 'Não foi possível convidar.');
    }
    setEnviando(false);
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
                Copie o link e envie para {linkCriado.email}: ele não aparece de novo. Depois que a
                pessoa entrar, adicione-a a este fluxo.
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
                onChange={(evento) => {
                  setEmail(evento.target.value);
                  setAviso('');
                  setConvidar(false);
                }}
                maxLength={250}
                autoFocus
              />
            </label>
            {email && !emailValido ? (
              <p className="cf-aviso" role="alert">
                Formato de endereço e-mail inválido.
              </p>
            ) : null}
            {emailValido && emailAlreadyMember ? (
              <p className="cf-aviso" role="alert">
                Essa pessoa já faz parte da equipe.
              </p>
            ) : null}
            <PermissionControle role={role} aoEscolher={setRole} />
            {aviso ? (
              <p className="cf-aviso" role="alert">
                {aviso}
              </p>
            ) : null}
            <footer className="cf-equipe-modal-rodape">
              <BotaoBds variante="secondary" onClick={aoFechar}>
                Cancelar
              </BotaoBds>
              {convidar ? (
                <BotaoBds variante="bot" disabled={enviando} onClick={convidarForContract}>
                  Convidar para o contrato
                </BotaoBds>
              ) : (
                <BotaoBds
                  variante="bot"
                  disabled={enviando || !emailValido || emailAlreadyMember}
                  onClick={salvar}
                >
                  {acaoDeAdicionar(role)}
                </BotaoBds>
              )}
            </footer>
          </>
        )}
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
 * mesmo DOM renderizado em `referencias-blip/canais/roteador/roteador-team__pagina.html`):
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
 * A lista é a de `GET /v1/gestao/fluxos/:id/equipe` — a equipe DESTE contato,
 * como `TeamController._loadMembers()` cruza `getUsersAccounts` com
 * `getApplicationUsersPermissions`, tudo por bot. Antes da migração 0035 ela
 * era a lista de `/contrato/membros` inteira, porque não havia RBAC por fluxo.
 */
export function TelaDeEquipe({
  flowId,
  members,
  podeGerir,
}: {
  flowId: string;
  members: MemberOfFlow[];
  podeGerir: boolean;
}) {
  const navegar = useNavigate();
  const [search, setSearch] = useState('');
  const [adicionando, setAdicionando] = useState(false);
  const [excluindo, setExcluindo] = useState<MemberOfFlow | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState('');

  const filtrados = useMemo(() => {
    const termo = search.trim().toLowerCase();
    if (!termo) return members;
    return members.filter(
      (m) => m.nome.toLowerCase().includes(termo) || m.email.toLowerCase().includes(termo),
    );
  }, [members, search]);
  const page = usePage(filtrados, 5);

  return (
    <>
      <PageHeader
        titulo={<h1>Equipe</h1>}
        actions={
          <div className="cf-equipe-acoes">
            <label className="cf-equipe-busca">
              <IconePortal nome="avatar" tamanho={24} />
              <input
                type="text"
                value={search}
                onChange={(evento) => setSearch(evento.target.value)}
                placeholder="Pesquisar por nome ou e-mail"
                aria-label="Pesquisar por nome ou e-mail"
              />
            </label>
            {podeGerir ? (
              /* `addUser()` da origem — botão "Adicionar Membro" do cabeçalho. */
              <BotaoBds icone="mais" onClick={() => setAdicionando(true)}>
                Adicionar Membro
              </BotaoBds>
            ) : null}
          </div>
        }
        description={
          <p>Adicione pessoas para a sua equipe e dê permissões para alterarem o Chatbot.</p>
        }
      />
      <div className="cf-container cf-equipe">
        {page.visiveis.map((member) => (
          <div
            key={member.userId}
            className={podeGerir ? 'cf-equipe-link cf-equipe-link--clicavel' : 'cf-equipe-link'}
            role={podeGerir ? 'link' : undefined}
            tabIndex={podeGerir ? 0 : undefined}
            /* `editUser(user)` da origem: o cartão inteiro (`<a class="no-decoration">`)
               e o ícone de lápis abrem a MESMA edição. */
            onClick={podeGerir ? () => navegar(`editar/${member.userId}`) : undefined}
            onKeyDown={
              podeGerir
                ? (evento) => {
                    if (evento.target === evento.currentTarget && evento.key === 'Enter') {
                      navegar(`editar/${member.userId}`);
                    }
                  }
                : undefined
            }
          >
            <div className="cf-equipe-cartao">
              <div className="cf-equipe-linha">
                <div className="cf-equipe-secao cf-equipe-w5 cf-equipe-avatar-secao">
                  <Avatar nome={member.nome} className="cf-equipe-avatar" />
                </div>
                <div className="cf-equipe-secao cf-equipe-secao--corta cf-equipe-w25">
                  <span className="cf-equipe-rotulo">Membro</span>
                  <span className="cf-equipe-valor">{member.nome}</span>
                </div>
                <div className="cf-equipe-divisor" />
                <div
                  className={`cf-equipe-secao cf-equipe-secao--corta ${
                    member.roleInFlow === 'admin' ? 'cf-equipe-w20' : 'cf-equipe-w40'
                  }`}
                >
                  <span className="cf-equipe-rotulo">E-mail</span>
                  <span className="cf-equipe-valor" title={member.email}>
                    {member.email}
                  </span>
                </div>
                {member.roleInFlow === 'admin' ? (
                  <>
                    <div className="cf-equipe-divisor" />
                    <div className="cf-equipe-secao cf-equipe-secao--selo">
                      <span className="cf-equipe-selo">Admin</span>
                    </div>
                  </>
                ) : null}
                {podeGerir ? (
                  <>
                    <div className="cf-equipe-divisor cf-equipe-oculto" />
                    <div className="cf-equipe-icones cf-equipe-oculto cf-equipe-w5">
                      <button
                        type="button"
                        className="cf-equipe-icone"
                        aria-label={`Editar ${member.nome}`}
                        onClick={(evento) => {
                          evento.stopPropagation();
                          navegar(`editar/${member.userId}`);
                        }}
                      >
                        <IconePortal nome="editar" tamanho={20} />
                      </button>
                      <button
                        type="button"
                        className="cf-equipe-icone"
                        aria-label={`Remover ${member.nome}`}
                        onClick={(evento) => {
                          evento.stopPropagation();
                          setExcluindo(member);
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

        {filtrados.length === 0 ? (
          <span className="cf-equipe-vazio">Nenhum membro encontrado =(</span>
        ) : (
          <Pagination state={page} />
        )}
      </div>

      {adicionando ? (
        <ModalDeAdicionar
          flowId={flowId}
          members={members}
          aoFechar={() => setAdicionando(false)}
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
                  const resultado = await gravar(api.delete(caminho(flowId, excluindo.userId)));
                  setEnviando(false);
                  if (!resultado.ok) {
                    setAviso(resultado.error ?? 'Não foi possível remover.');
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
