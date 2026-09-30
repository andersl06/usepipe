import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { RefusesOfInbound } from '@pipe/contracts';
import { caminhoInterno, discoverInbound, inboundWithGoogleUrl, urlNaApi } from '@pipe/ui/api';
import { APPLICATION } from '../lib/application-paths';
import { useSession } from '../context/session';
import { hostMode, loggedInDestination } from '../lib/tenant-links';
import { FundoPipe } from './fundo-pipe';

/**
 * The sign-in screen — the first thing a customer sees, and the ONLY public route
 * of this application. Same as `apps/gestao/src/app/entrar`, with discovery done
 * from the browser (Vite proxies it in development; in production this app's
 * origin is in `PIPE_ORIGENS`).
 *
 * Two rules shape it:
 *
 * 1. **No tenant here.** Whoever lands on this screen isn't signed in yet, so it
 *    doesn't know (and can't reveal) which company uses Pipe.
 * 2. **Every rejection has an EXIT, not a "not authorized".** The seven codes in
 *    `RECUSAS_DE_ENTRADA` arrive as `?erro=` and each one sends the person to a
 *    different place.
 */
const RECUSAS: Record<RefusesOfInbound, { titulo: string; saida: string }> = {
  domain_public: {
    titulo: 'Este e-mail é pessoal, e ele não diz de que empresa você é',
    saida:
      'Gmail, Outlook e afins não identificam uma conta do Pipe. Peça um convite a quem administra o Pipe na sua empresa: o link do convite entra direto, sem depender do domínio.',
  },
  domain_unknown: {
    titulo: 'Nenhuma conta do Pipe usa este domínio',
    saida:
      'Fale com quem contratou o Pipe na sua empresa. Se a conta existe e o domínio ainda não foi verificado, a entrada é por convite.',
  },
  without_invitation: {
    titulo: 'Você ainda não foi convidado — ou o convite não serve mais',
    saida:
      'Convite vence em sete dias e vale uma vez só. Peça um novo a quem administra o Pipe na sua empresa.',
  },
  user_inactive: {
    titulo: 'Seu acesso foi desativado',
    saida:
      'A conta existe, mas alguém a desativou. Fale com o administrador do Pipe na sua empresa para reativá-la.',
  },
  email_nao_verificado: {
    titulo: 'O Google não confirmou o seu e-mail',
    saida:
      'Verifique o endereço na sua conta do Google e tente entrar de novo. Sem essa confirmação, não temos como saber que o e-mail é seu.',
  },
  sso_obrigatorio: {
    titulo: 'Sua empresa exige entrada pelo provedor de identidade dela',
    saida:
      'Não é por aqui que você entra. Digite o seu e-mail corporativo no campo abaixo e clique em Continuar: nós levamos você ao provedor certo.',
  },
  falha_no_provedor: {
    titulo: 'Não conseguimos concluir a conversa com o provedor',
    saida:
      'Foi uma falha nossa ou dele, e não uma recusa: tente entrar de novo. Se insistir, avise quem administra o Pipe na sua empresa.',
  },
};

/** O que a descoberta por e-mail devolve para a tela quando não roteia. */
const AVISOS: Record<string, { titulo: string; saida: string }> = {
  google: {
    titulo: 'Esta empresa não entra por provedor de identidade',
    saida: 'Use o botão "Entrar com Google" aqui em cima, com o seu e-mail corporativo.',
  },
  invalido: {
    titulo: 'Informe um e-mail válido',
    saida: 'Faltou o "@" ou o domínio. Confira e tente de novo.',
  },
  falha: {
    titulo: 'Não conseguimos verificar este e-mail agora',
    saida: 'Tente de novo em instantes, ou entre direto com o Google.',
  },
};

function ehRecusa(codigo: string | null): codigo is RefusesOfInbound {
  return codigo !== null && codigo in RECUSAS;
}

export function PageLogin() {
  const [parametros, setParametros] = useSearchParams();
  const destination = caminhoInterno(parametros.get('destino'), APPLICATION);
  const central = hostMode(window.location) === 'login';
  const returnTo = parametros.get('returnTo');
  const loginDestination = central ? (returnTo ?? APPLICATION) : destination;
  const { eu, sair } = useSession();
  const ownAccount = central && eu ? loggedInDestination(window.location, eu.tenant.slug, null, import.meta.env.DEV) : null;
  useEffect(() => {
    if (!central || !eu || !returnTo) return;
    const target = loggedInDestination(window.location, eu.tenant.slug, returnTo, import.meta.env.DEV);
    if (target) window.location.replace(target);
  }, [central, eu, returnTo]);
  const [email, setEmail] = useState(parametros.get('email') ?? '');
  const [enviando, setEnviando] = useState(false);

  const error = parametros.get('erro');
  const recusa = ehRecusa(error) ? RECUSAS[error] : null;
  const aviso = recusa ? null : (AVISOS[parametros.get('metodo') ?? ''] ?? null);
  const alerta = recusa ?? aviso;

  /** O e-mail decide o caminho: IdP da empresa, ou o Google. */
  async function continuar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setEnviando(true);
    const inbound = await discoverInbound(email.trim());
    if (inbound.metodo === 'sso' && inbound.irPara) {
      window.location.assign(urlNaApi(inbound.irPara, loginDestination));
      return;
    }
    // Sem SSO, a pessoa fica na mesma tela com o motivo e o e-mail já digitado.
    const volta = new URLSearchParams({ method: inbound.metodo, email: email.trim() });
    if (destination !== APPLICATION) volta.set('destino', destination);
    if (central && returnTo) volta.set('returnTo', returnTo);
    setParametros(volta, { replace: true });
    setEnviando(false);
  }

  if (central && eu) return (
    <main className="login">
      <div className="login-stage">
        <section className="login-card">
          <h1>Sua conta Pipe</h1>
          {returnTo ? <p>Levando você para a sua conta…</p> : (
            <>
              <a href={ownAccount ?? '/application'}>Continuar na sua conta</a>
              <button type="button" onClick={() => void sair()}>Entrar com outra conta</button>
            </>
          )}
        </section>
      </div>
    </main>
  );

  return (
    <main className="login">
      {/* A entrada tem letra própria — é a única tela do produto que não usa a do aplicativo. */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&display=swap"
      />
      <FundoPipe />

      <div className="login-stage">
        <section className="login-card" aria-labelledby="entrar-titulo">
          <img className="login-lockup" src="/pipe/lockup.svg" alt="Pipe" />
          <h1 id="entrar-titulo" className="login-title-hidden">
            Entrar no Pipe Gestão
          </h1>

          {alerta ? (
            <div className="login-alert" role="alert">
              <h2>{alerta.titulo}</h2>
              <p>{alerta.saida}</p>
            </div>
          ) : null}

          {/* Link, e não botão: entrar com o Google é navegação de topo para a `api`. */}
          <a className="login-google" href={inboundWithGoogleUrl({ destination: loginDestination })}>
            <LogoGoogle />
            <span>Entrar com Google</span>
          </a>

          <div className="login-or">
            <span />
            <span className="login-or-text">ou</span>
            <span />
          </div>

          <form onSubmit={continuar}>
            <label htmlFor="entrar-email">E-mail</label>
            <input
              id="entrar-email"
              name="email"
              type="email"
              required
              autoComplete="email"
              spellCheck={false}
              placeholder="voce@empresa.com.br"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-describedby="entrar-ajuda"
            />

            {/* O campo de senha do desenho. Sem `name`: o Pipe ainda não tem entrada
                por senha, e a senha digitada não sai desta página.
                ponytail: ganha `name` no dia em que a API aceitar senha. */}
            <label htmlFor="entrar-senha">Senha</label>
            <input
              id="entrar-senha"
              type="password"
              placeholder="••••••••"
              autoComplete="current-password"
              aria-describedby="entrar-ajuda"
            />

            <div className="login-forgot">
              <span>Peça ajuda ao administrador da sua conta</span>
            </div>

            <p id="entrar-ajuda" className="login-help">
              Levamos você ao provedor de identidade da sua empresa, quando ela tiver um.
            </p>
            <button type="submit" disabled={enviando}>
              Entrar
            </button>
          </form>

          <div className="login-foot">
            <span>Primeiro acesso?</span>
            <span>Fale com o administrador da sua conta</span>
          </div>
        </section>
      </div>
    </main>
  );
}

/** O "G" oficial, inline: a tela de entrada não depende de rede de terceiro. */
function LogoGoogle() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden focusable="false">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}
