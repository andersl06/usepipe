import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import type { StateAgent, QueueOfDesk, MotivoDePausa } from '@pipe/contracts';
import { useRead } from '../lib/query';
import { useSession } from '../context/session';
import { executar } from '../lib/actions';
import { IconeDesk, type NomeDeIconeDesk } from './icones-desk';
import { Avatar } from './avatar';

/**
 * Reference vertical rail (`~/desk-clone/templates/navbar.html`, `navbar-menu-item.html`, `navbar-avatar.html`): brand at the top; five destinations; help, preferences, and presence avatar at the bottom. Order and icons follow the clone README (`message-talk`, `paperplane`, `monitoring`, `contact`, `ticket`; `question`, `settings-general`), and tooltips use its `$t(name)` labels. Clicking the avatar opens `profile-side-menu` beside the rail at 300px, pushing the columns as measured in `desk2/blip-menu-status.png`.
 */
const DESTINOS: { para: string; icone: NomeDeIconeDesk; rotulo: string }[] = [
  { para: '/', icone: 'atendimentos', rotulo: 'Atendimentos' },
  { para: '/activeMessage/send', icone: 'mensagens-ativas', rotulo: 'Mensagens ativas' },
  { para: '/analytics', icone: 'metricas', rotulo: 'Métricas de atendimento' },
  { para: '/contacts', icone: 'contatos', rotulo: 'Contatos' },
  { para: '/bulk-ticket', icone: 'acoes-em-massa', rotulo: 'Ações em massa' },
];


export const ROTULOS_DE_STATUS: Record<StateAgent, string> = {
  online: 'Online',
  pausa: 'Em pausa',
  invisivel: 'Invisível',
  offline: 'Offline',
};

export function Rail({
  aberto,
  aoAbrir,
}: {
  aberto: boolean;
  aoAbrir: (aberto: boolean) => void;
}) {
  const { eu } = useSession();
  const queue = useRead<QueueOfDesk>('/v1/desk/queue');
  const state: StateAgent = queue.data?.status.estado ?? 'offline';
  const { pathname } = useLocation();

  return (
    <>
      <nav className="dk-rail" aria-label="Menu principal">
        <NavLink to="/" className="dk-rail-brand" aria-label="Pipe Desk" />
        <ul className="dk-rail-items">
          {DESTINOS.map((d) => (
            <li key={d.para} className="dk-rail-item">
              <NavLink
                to={d.para}
                className="dk-rail-button"
                title={d.rotulo}
                aria-label={d.rotulo}
                aria-current={d.para === '/' ? (pathname === '/' ? 'page' : undefined) : undefined}
              >
                <IconeDesk nome={d.icone} />
              </NavLink>
            </li>
          ))}
        </ul>
        <ul className="dk-rail-items dk-rail-footer">
          <li className="dk-rail-item">
            {/* The reference help link opens Blip's help center; this one goes to Pipe support. */}
            <a
              className="dk-rail-button"
              href="mailto:suporte@usepipe.com.br"
              title="Ajuda"
              aria-label="Ajuda"
            >
              <IconeDesk nome="ajuda" />
            </a>
          </li>
          <li className="dk-rail-item">
            <NavLink
              to="/preferences"
              className="dk-rail-button"
              title="Preferências"
              aria-label="Preferências"
            >
              <IconeDesk nome="preferencias" />
            </NavLink>
          </li>
          <li className="dk-rail-item">
            <button
              type="button"
              className="dk-rail-avatar"
              title={`Seu status é: ${ROTULOS_DE_STATUS[state]}`}
              aria-label={`Opções de status. Seu status é: ${ROTULOS_DE_STATUS[state]}`}
              aria-expanded={aberto}
              onClick={() => aoAbrir(!aberto)}
            >
              <Avatar nome={eu?.user.nome} tamanho={32} />
              <span className="dk-presenca" data-status={state} />
            </button>
          </li>
        </ul>
      </nav>
      {aberto && queue.data ? (
        <StatusPanel
          state={state}
          motivos={queue.data.motivos}
          motivoAtual={queue.data.status.motivoPausa}
          aoFechar={() => aoAbrir(false)}
        />
      ) : null}
    </>
  );
}

/**
 * `profile-side-menu` follows the reference: back-arrow header (`.sidebar-header`, 40px, gap 10), `user-info` (56px avatar, name 14/600, email 12), and three statuses (`.change-status-button`: 56px, 16px inset, 8px radius, with 8% background and a check on the active one). Place `Desconectar` in the footer. `Em pausa` opens `personalized-breaks-select`.
 */
function StatusPanel({
  state,
  motivos,
  motivoAtual,
  aoFechar,
}: {
  state: StateAgent;
  motivos: MotivoDePausa[];
  motivoAtual: string | null;
  aoFechar: () => void;
}) {
  const { eu, sair } = useSession();
  const [escolhendoPausa, setEscolhendoPausa] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const first = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    first.current?.focus();
  }, []);

  async function mudar(novo: StateAgent, motivoId?: string) {
    setError(null);
    const r = await executar('definirStatus', { state: novo, ...(motivoId ? { motivoId } : {}) });
    if (!r.ok) setError(r.error ?? 'Não foi possível mudar o status.');
    else aoFechar();
  }

  const options: StateAgent[] = ['online', 'pausa', 'invisivel'];

  return (
    <aside className="dk-status-panel" aria-label="Seu status">
      <div className="dk-status-cabecalho">
        <button
          ref={first}
          type="button"
          className="dk-botao-icone"
          onClick={aoFechar}
          aria-label="Voltar"
        >
          <IconeDesk nome="seta-esquerda" />
        </button>
        <span>Seu status</span>
      </div>
      <div className="dk-status-conteudo">
        <section className="dk-status-eu">
          <Avatar nome={eu?.user.nome} tamanho={56} />
          <b>{eu?.user.nome}</b>
          <small>{eu?.user.email}</small>
        </section>
        {escolhendoPausa ? (
          <div className="dk-status-pausas">
            <div className="dk-status-pausas-titulo">
              <button
                type="button"
                className="dk-botao-icone"
                onClick={() => setEscolhendoPausa(false)}
                aria-label="Voltar"
              >
                <IconeDesk nome="seta-esquerda" />
              </button>
              <span>Em pausa</span>
            </div>
            <ul className="dk-status-options" role="menu">
              {motivos.map((m) => (
                <li key={m.id} role="presentation">
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={state === 'pausa' && motivoAtual === m.nome}
                    className="dk-status-option"
                    onClick={() => void mudar('pausa', m.id)}
                  >
                    <span className="dk-status-ponto" data-status="paused" />
                    <span className="dk-status-rotulo">{m.nome}</span>
                    {state === 'pausa' && motivoAtual === m.nome ? (
                      <IconeDesk nome="check" />
                    ) : null}
                  </button>
                </li>
              ))}
              {motivos.length === 0 ? (
                <li className="dk-status-empty">Nenhum motivo de pausa cadastrado.</li>
              ) : null}
            </ul>
          </div>
        ) : (
          <ul className="dk-status-options" role="menu" aria-label="Opções de status">
            {options.map((o) => (
              <li key={o} role="presentation">
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={state === o}
                  className="dk-status-option"
                  onClick={() => (o === 'pausa' ? setEscolhendoPausa(true) : void mudar(o))}
                >
                  <span className="dk-status-ponto" data-status={o} />
                  <span className="dk-status-rotulo">
                    {ROTULOS_DE_STATUS[o]}
                    {o === 'pausa' && state === 'pausa' && motivoAtual ? ` · ${motivoAtual}` : ''}
                  </span>
                  {state === o ? <IconeDesk nome="check" /> : null}
                </button>
              </li>
            ))}
          </ul>
        )}
        {error ? <p className="dk-error">{error}</p> : null}
      </div>
      <button type="button" className="dk-status-sair" onClick={() => void sair()}>
        <span>Desconectar</span>
        <IconeDesk nome="sair" />
      </button>
    </aside>
  );
}
