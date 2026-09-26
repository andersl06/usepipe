import { useId, useMemo, useState } from 'react';
import { Avatar } from '@pipe/ui';
import { useNavigate } from 'react-router-dom';
import type {
  MemberOfFlow,
  LevelInFlow,
  RoleInFlow,
  PermissionsInFlow,
  ResourceOfFlow,
} from '@pipe/contracts';
import { IconePortal } from '../../../components/icones-portal';
import { Pagination, usePage } from '../../../components/pagination';
import { atualizarLeituras } from '../../../lib/actions';
import { api } from '../../../lib/api';
import { BotaoBds, PageHeader } from '../settings/pecas';
import { acaoDeAdicionar, COLUNAS_DE_NIVEL, ROLES_OF_FLOW } from './permissions';
import '../settings/settings.css';
import './equipe.css';

interface ResultadoSimples {
  ok: boolean;
  error?: string;
  codigo?: string;
}

/**
 * Same format as `contrato/membros/convidar.tsx` — blip-ds's `emailValidation` is a format check, not a lookup.
 */
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
 * The row's three actions, now PER FLOW — `POST/PATCH/DELETE /v1/gestao/fluxos/:id/equipe` (`gestao-equipe.ts` controller). Before migration 0035 they acted on the ACCOUNT role (`/contrato/membros/papel` and `/excluir`), because Pipe had no per-flow RBAC: removing someone here removed them from the whole tenant. Now it removes them only from this contact, which is what the origin always did (`TeamController`, everything per bot).
 */
const caminho = (flowId: string, alvo?: string) =>
  `/v1/management/flows/${flowId}/equipe${alvo ? `/${alvo}` : ''}`;

/**
 * The origin's "Permissão" `rzslider` (`rz-slider-model="$ctrl.permissionsValue"`), with the same four stops. A real `<input type="range">` underneath gives dragging and keyboard support without reimplementing native behavior.
 */
function PermissionControl({
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
    <div className="cf-team-permission">
      <span className="cf-team-permission-label">Permissão</span>
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
                ? 'cf-equipe-slider-nivel cf-team-slider-level--active'
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
 * The EDIT page's granular permissions list — the origin's `PermissionsList.html`: header "Funcionalidades | Sem permissão | Visualizar | Ver e editar" (each column with its `info` and tooltip), and one row per resource with three radios.
 *
 * The rule is theirs entirely: the top-level radio marks the row radios (`selectAllPermissions()`) and only "Personalizado" frees each row for manual control (`checkStatus()`). The RESOURCES come from the server, in their template's order.
 */
export function PermissionsList({
  recursos,
  permissions,
  editavel,
  toSwitch,
}: {
  recursos: readonly ResourceOfFlow[];
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
            <span key={column.nivel} className="cf-team-granular-column">
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
                  <span key={column.nivel} className="cf-team-granular-column">
                    <input
                      type="radio"
                      className="cf-equipe-radio"
                      name={`${nomeDoGrupo}-${recurso.key}`}
                      checked={nivel === column.nivel}
                      onChange={() => toSwitch(recurso.key, column.nivel)}
                      /* Outside "Personalizado" the slider is in charge, as in the origin. */
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
 * The origin's `add-user-modal` — DOM captured with it OPEN in `referencias-blip/equipe/equipe-adicionar-modal__pagina.html`:
 *
 *   toolbar    only the `icon-close` in the corner;
 *   header     CENTERED block (`.row.mh6.tc.mt3`): h1 "Adicionar pessoa" and the subtitle "Adicione e defina as permissões de uma nova pessoa para sua equipe";
 *   email      EDITABLE `material-input`: small label on top, underline below, no box;
 *   permission "Permissão" label on the left and the `rzslider` with the same stops as add;
 *   footer     CENTERED `.modal-footer`: `Cancelar` (text) and `Salvar` (`bp-btn--bot`), which starts disabled (`ng-disabled="$ctrl.userForm.$invalid"`) until the email is valid.
 *
 * On "Customizado", the origin calls `addCustomUser()`: the CTA becomes "Continuar" and only then navigates to the separate `/team/edit` page, where the matrix lives.
 *
 * THE INVITE is what the origin admits and we repeat a different way: there, `confirmAddUser` invites whoever isn't in the tenant yet as a `guest` and warns "Essa pessoa não faz parte do contrato…". Here the `api` rejects with that same phrase (`pessoa_fora_do_contrato`) and the modal offers the invite — `POST /v1/convites`, the same one from `/contrato/membros`, which returns the link to copy because Pipe doesn't send email.
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
  /** Shows up when the `api` says the person isn't in the tenant. */
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

  /** The `guest` from `confirmAddUser`: joining the tenant is a prerequisite, not the action itself. */
  async function inviteForContract() {
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
      className="cf-overlay"
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
            <PermissionControl role={role} aoEscolher={setRole} />
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
                <BotaoBds variante="bot" disabled={enviando} onClick={inviteForContract}>
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
 * `/team` for the contact — the same screen at `/fluxo/:id/equipe` and `/roteador/:id/equipe`, because in the origin it's a state of `auth.application.detail` and applies equally to chatbot and router.
 *
 * The structure follows the origin's template (`portal.js`, the `<page-header class="team-header">` followed by `.container.mb-5 > .row.team-cards`, the same DOM captured in `referencias-blip/canais/roteador/roteador-team__pagina.html`):
 *
 *   header    h1 "Equipe" on the left; on the right, the search ("Pesquisar por nome ou e-mail", `avatar-user` icon, 260px) and THEN the "Adicionar Membro" button — in that order;
 *   subtitle  "Adicione pessoas para a sua equipe e dê permissões para alterarem o Chatbot." (`additional-info`), below the divider;
 *   list      one `card--mini-card` per member: avatar (5%) · "Membro" + name (25%) · divider · "E-mail" + email (20%) · divider · role badge (10%) · divider · edit/delete (5%);
 *   empty     "Nenhum membro encontrado =(" (`.no-content-found`).
 *
 * The list is `GET /v1/gestao/fluxos/:id/equipe`'s — THIS contact's team, the way `TeamController._loadMembers()` joins `getUsersAccounts` with `getApplicationUsersPermissions`, all per bot. Before migration 0035 it was the entire `/contrato/membros` list, because there was no per-flow RBAC.
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
          <div className="cf-team-actions">
            <label className="cf-team-search">
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
              /* The origin's `addUser()` — the header's "Adicionar Membro" button. */
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
            /*
             * The origin's `editUser(user)`: the whole card (`<a class="no-decoration">`) and the pencil icon open the SAME edit view.
             */
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
            <div className="cf-team-card">
              <div className="cf-equipe-linha">
                <div className="cf-team-section cf-equipe-w5 cf-team-avatar-section">
                  <Avatar nome={member.nome} className="cf-equipe-avatar" />
                </div>
                <div className="cf-team-section cf-team-section--clip cf-equipe-w25">
                  <span className="cf-equipe-rotulo">Membro</span>
                  <span className="cf-team-value">{member.nome}</span>
                </div>
                <div className="cf-equipe-divisor" />
                <div
                  className={`cf-team-section cf-team-section--clip ${member.roleInFlow === 'admin' ? 'cf-equipe-w20' : 'cf-equipe-w40'}`}
                >
                  <span className="cf-equipe-rotulo">E-mail</span>
                  <span className="cf-team-value" title={member.email}>
                    {member.email}
                  </span>
                </div>
                {member.roleInFlow === 'admin' ? (
                  <>
                    <div className="cf-equipe-divisor" />
                    <div className="cf-team-section cf-team-section--badge">
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
          <span className="cf-team-empty">Nenhum membro encontrado =(</span>
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
          className="cf-overlay"
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
            <footer className="cf-modal-actions">
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
