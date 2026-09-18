import { LogoPortal } from '../../../componentes/icones-portal';
import { CascaDoModulo, useContato } from '../contato';
import '../integracoes/cabecalho-de-pagina.css';
import './canais.css';

/**
 * Canais do contato — `auth.application.detail.channels` da captura 8.
 *
 * A fonte é o template do módulo 80819 de `portal.js` e as regras
 * `.channels-list` de `portal.css`. A origem mantém Pipe Chat e E-mail sempre
 * conectados; os demais usam o canal vinculado ao fluxo para escolher entre
 * “Conectar” e “Conectado”. As telas de OAuth não existem no Pipe, então os
 * botões preservam o estado visual sem fingir uma integração externa.
 */
type Logo =
  'pipe' | 'whatsapp' | 'messenger' | 'instagram' | 'google' | 'telegram' | 'apple' | 'email';
type CanalDaTela = { chave: string; nome: string; logo: Logo; sempre?: boolean; novo?: boolean };

const CANAIS: readonly CanalDaTela[] = [
  { chave: 'pipe-chat', nome: 'Pipe Chat', logo: 'pipe', sempre: true },
  { chave: 'whatsapp_cloud', nome: 'WhatsApp', logo: 'whatsapp' },
  { chave: 'messenger', nome: 'Messenger', logo: 'messenger' },
  { chave: 'instagram', nome: 'Instagram', logo: 'instagram' },
  { chave: 'google-rcs', nome: 'RCS for Business', logo: 'google', novo: true },
  { chave: 'telegram', nome: 'Telegram', logo: 'telegram' },
  { chave: 'apple-business', nome: 'Apple Messages for Business', logo: 'apple' },
  { chave: 'email', nome: 'E-mail', logo: 'email', sempre: true },
] as const;

export function PaginaDeCanais() {
  const { contato } = useContato();

  const ativo = contato.canalAtivo ? contato.canalTipo : null;

  return (
    <CascaDoModulo ativo="Canais">
      <header className="ph-cabecalho">
        <div className="ph-conteudo">
          <div className="ph-titulo-caixa">
            <h1 className="ph-titulo">Canais de conversa</h1>
          </div>
        </div>
      </header>

      <div className="cn-lista">
        {CANAIS.map((canal) => {
          const conectado = canal.sempre || canal.chave === ativo;
          return (
            <div className="cn-item" key={canal.chave}>
              {canal.novo ? <span className="cn-novo">Novo!</span> : null}
              <article className="cn-cartao">
                <div className="cn-cartao-conteudo">
                  <LogoDeCanal nome={canal.logo} />
                  <h2>{canal.nome}</h2>
                </div>
                <span
                  className={conectado ? 'cn-botao cn-botao--conectado' : 'cn-botao'}
                  aria-disabled="true"
                >
                  {conectado ? 'Conectado' : 'Conectar'}
                </span>
              </article>
            </div>
          );
        })}
      </div>
    </CascaDoModulo>
  );
}

function LogoDeCanal({ nome }: { nome: Logo }) {
  if (nome === 'pipe') {
    return <img className="cn-logo" src="/pipe/simbolo.svg" alt="" width={64} height={64} />;
  }
  if (nome === 'whatsapp' || nome === 'instagram' || nome === 'email') {
    return <LogoPortal className="cn-logo" nome={nome} tamanho={64} />;
  }

  return (
    <svg className={`cn-logo cn-logo--${nome}`} viewBox="0 0 80 80" aria-hidden="true">
      {nome === 'messenger' ? (
        <>
          <circle cx="40" cy="39" r="32" fill="url(#messenger-cor)" />
          <path
            d="m21 49 10-16c1.5-2.4 4.7-3 7-1.3l7.5 5.7c.7.5 1.6.5 2.3 0L58 29.7c1.4-1 3.1.6 2.2 2L50 47c-1.5 2.4-4.7 3-7 1.3l-7.5-5.7c-.7-.5-1.6-.5-2.3 0L23 50.3c-1.4 1-3.1-.6-2.2-2Z"
            fill="#fff"
          />
          <defs>
            <radialGradient
              id="messenger-cor"
              cx="0"
              cy="0"
              r="1"
              gradientTransform="translate(20 72) scale(70)"
            >
              <stop stopColor="#0099ff" />
              <stop offset=".61" stopColor="#a033ff" />
              <stop offset=".94" stopColor="#ff5280" />
              <stop offset="1" stopColor="#ff7061" />
            </radialGradient>
          </defs>
        </>
      ) : nome === 'telegram' ? (
        <>
          <circle cx="40" cy="40" r="32" fill="#30a3e6" />
          <path
            d="M49 29c2-.8 5-1.3 4.8 1.8l-3.1 20.8c-.3 2.3-.4 5.2-2.5 5.9-1.8.7-3.5-.5-5-1.5l-8.8-6.3c-1.4-1 .7-2.1 1.6-3l9.7-9.6c.8-.8 0-1.4-.9-.8l-15 9.6c-2 1.3-3.6.7-5.4.1l-2.7-.9c-2.2-.8-2.8-2.2.1-3.4L49 29Z"
            fill="#fff"
          />
        </>
      ) : nome === 'apple' ? (
        <path d="M57.4 42c.1 9.7 8.4 12.9 8.5 13-1 3.1-4.6 11.2-10.3 15.2-3.4 2.4-6.1 1.8-9.2.8-2.1-.7-4.3-1.6-6.9-1.6-2.7 0-5 1-7.2 1.7-3 1-5.7 1.6-8.8-.9-7.1-5.8-12-22.5-7-32.4 2.9-5.7 8.1-9.4 13.6-9.5 2.4 0 4.8.9 6.9 1.7 1.5.6 2.8 1.1 3.7 1.1.8 0 2.2-.6 3.8-1.2 2.5-1 5.6-2.2 8.7-1.9 2.1.1 7.9.8 11.6 6.3-.3.2-7.5 4.4-7.4 13.7ZM50.1 17.2c2.3-2.8 3.8-6.7 3.4-10.2-3.3.1-7.2 2.2-9.6 5-2.1 2.4-4 6.4-3.5 10 3.7.3 7.4-1.9 9.7-4.8Z" />
      ) : (
        <>
          <circle cx="40" cy="40" r="32" fill="#3c64cb" />
          <path
            d="M51 26H29a7 7 0 0 0-7 7v15a8 8 0 0 0 8 8h20a10 10 0 0 0 10-10V35a9 9 0 0 0-9-9Z"
            fill="#f3f3f3"
          />
          <path
            d="M31 34h21M31 41h21M31 48h12"
            stroke="#c7c7c7"
            strokeWidth="4"
            strokeLinecap="round"
          />
        </>
      )}
    </svg>
  );
}
