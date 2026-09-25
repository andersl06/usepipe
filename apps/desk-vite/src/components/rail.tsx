import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import type { StateAgent, QueueOfDesk, MotivoDePausa } from '@pipe/contracts';
import { useRead } from '../lib/query';
import { useSession } from '../context/session';
import { executar } from '../lib/actions';
import { IconeDesk, type NomeDeIconeDesk } from './icones-desk';
import { Avatar } from './avatar';

/**
 * O trilho vertical da referência (`~/desk-clone/templates/navbar.html` +
 * `navbar-menu-item.html` + `navbar-avatar.html`): marca no topo, cinco
 * destinos, e no rodapé ajuda, preferências e o avatar com o selo de
 * presença. A ordem e os ícones são os do README da cópia (`message-talk`,
 * `paperplane`, `monitoring`, `contact`, `ticket`; `question`,
 * `settings-general`). Os textos dos tooltips são os `$t(name)` de lá.
 *
 * O clique no avatar abre o painel "Seu status" (`profile-side-menu`), que
 * entra ao lado do trilho com 300px e empurra as colunas — é como a cópia
 * faz, medido em `desk2/blip-menu-status.png`.
 */
const DESTINOS: { para: string; icone: NomeDeIconeDesk; rotulo: string }[] = [
  { para: '/', icone: 'atendimentos', rotulo: 'Atendimentos' },
  { para: '/activeMessage/send', icone: 'mensagens-ativas', rotulo: 'Mensagens ativas' },
  { para: '/analytics', icone: 'metricas', rotulo: 'Métricas de atendimento' },
  { para: '/contacts', icone: 'contatos', rotulo: 'Contatos' },
  { para: '/bulk-ticket', icone: 'acoes-em-massa', rotulo: 'Ações em massa' },
];

/** Os rótulos de status do menu do avatar (`{"online":"Online","pause":"Em pausa","invisible":"Invisível"}`). */
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
      <nav className="dk-trilho" aria-label="Menu principal">
        <NavLink to="/" className="dk-trilho-marca" aria-label="Pipe Desk" />
        <ul className="dk-trilho-itens">
          {DESTINOS.map((d) => (
            <li key={d.para} className="dk-trilho-item">
              <NavLink
                to={d.para}
                className="dk-trilho-botao"
                title={d.rotulo}
                aria-label={d.rotulo}
                aria-current={
                  d.para === '/'
                    ? pathname === '/' || pathname.startsWith('/chat')
                      ? 'page'
                      : undefined
                    : undefined
                }
              >
                <IconeDesk nome={d.icone} />
              </NavLink>
            </li>
          ))}
        </ul>
        <ul className="dk-trilho-itens dk-trilho-rodape">
          <li className="dk-trilho-item">
            {/* ponytail: a ajuda da referência abre a central deles; aqui aponta para o suporte do Pipe. */}
            <a
              className="dk-trilho-botao"
              href="mailto:suporte@usepipe.com.br"
              title="Ajuda"
              aria-label="Ajuda"
            >
              <IconeDesk nome="ajuda" />
            </a>
          </li>
          <li className="dk-trilho-item">
            <NavLink
              to="/preferences"
              className="dk-trilho-botao"
              title="Preferências"
              aria-label="Preferências"
            >
              <IconeDesk nome="preferencias" />
            </NavLink>
          </li>
          <li className="dk-trilho-item">
            <button
              type="button"
              className="dk-trilho-avatar"
              title={`Seu status é: ${ROTULOS_DE_STATUS[state]}`}
              aria-label={`Opções de status. Seu status é: ${ROTULOS_DE_STATUS[state]}`}
              aria-expanded={aberto}
              onClick={() => aoAbrir(!aberto)}
            >
              <Avatar nome={eu?.user.nome} tamanho={32} />
              <span className="dk-presenca" data-estado={state} />
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
 * O painel "Seu status" (`profile-side-menu`): cabeçalho com seta de voltar
 * (`.sidebar-header`, 40px, gap 10), `user-info` (avatar 56, nome 14/600,
 * e-mail 12), os três status (`.change-status-button`: 56px, recuo 16, raio 8,
 * o em vigor com fundo a 8% e o check), e "Desconectar" no rodapé.
 * "Em pausa" abre a lista de motivos (`personalized-breaks-select`).
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
    <aside className="dk-status-painel" aria-label="Seu status">
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
            <ul className="dk-status-opcoes" role="menu">
              {motivos.map((m) => (
                <li key={m.id} role="presentation">
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={state === 'pausa' && motivoAtual === m.nome}
                    className="dk-status-opcao"
                    onClick={() => void mudar('pausa', m.id)}
                  >
                    <span className="dk-status-ponto" data-estado="pausa" />
                    <span className="dk-status-rotulo">{m.nome}</span>
                    {state === 'pausa' && motivoAtual === m.nome ? (
                      <IconeDesk nome="check" />
                    ) : null}
                  </button>
                </li>
              ))}
              {motivos.length === 0 ? (
                <li className="dk-status-vazio">Nenhum motivo de pausa cadastrado.</li>
              ) : null}
            </ul>
          </div>
        ) : (
          <ul className="dk-status-opcoes" role="menu" aria-label="Opções de status">
            {options.map((o) => (
              <li key={o} role="presentation">
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={state === o}
                  className="dk-status-opcao"
                  onClick={() => (o === 'pausa' ? setEscolhendoPausa(true) : void mudar(o))}
                >
                  <span className="dk-status-ponto" data-estado={o} />
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
        {error ? <p className="dk-erro">{error}</p> : null}
      </div>
      <button type="button" className="dk-status-sair" onClick={() => void sair()}>
        <span>Desconectar</span>
        <IconeDesk nome="sair" />
      </button>
    </aside>
  );
}
