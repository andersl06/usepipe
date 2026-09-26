import type { Metadata } from 'next';
import type { RefusesOfInbound } from '@pipe/contracts';
import { Simbolo } from '@pipe/ui';
import { caminhoInterno, inboundWithGoogleUrl } from '../../lib/session';
import { continuar } from './actions';

/**
 * The sign-in screen — the first thing a customer sees, and the ONLY public route in
 * this app.
 *
 * Two rules shape it:
 *
 * 1. **No tenant here.** Whoever lands on this screen isn't logged in, so it doesn't
 *    know (and can't reveal) which company uses Pipe. That's why the account name
 *    doesn't appear, and why email discovery answers the same way for a known
 *    domain and an unknown one — the symmetry comes from the API, and the screen
 *    doesn't break it by showing what it "found".
 * 2. **Every refusal has an EXIT, not a "not authorized".** The seven
 *    `RECUSAS_DE_ENTRADA` codes arrive as `?erro=` and each one sends the person
 *    somewhere different: ask for an invite, talk to whoever bought the plan, sign
 *    in through the company's provider. Generic here means the person gives up.
 *
 * No session and no database: only a `fetch` to the API, and that's exactly why it
 * still opens with Postgres down — which is exactly when someone needs to sign in
 * to see what happened.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Entrar · Pipe CRM',
  description: 'Entrar no Pipe CRM.',
};

/**
 * The contract's seven codes, each with what happened and what to do about it.
 *
 * `Record<RecusaDeEntrada, …>` on purpose: if the API adds a code, `tsc` breaks HERE,
 * not in production with a blank error in the customer's face.
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

/**
 * What email discovery returns to the screen when it doesn't route anywhere.
 *
 * The key is the `metodo` that comes back from the API, and it's `google` — not
 * `senha`. With the wrong key, `AVISOS[...]` used to return `undefined`, and
 * "Continue" would reload the exact same screen without a word: a button that,
 * from the user's side, did nothing.
 */
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

function ehRecusa(codigo: string | undefined): codigo is RefusesOfInbound {
  return codigo !== undefined && codigo in RECUSAS;
}

interface Parametros {
  error?: string;
  destination?: string;
  metodo?: string;
  email?: string;
}

export default async function PageLogin({
  searchParams,
}: {
  searchParams: Promise<Parametros>;
}) {
  const parametros = await searchParams;
  const destination = caminhoInterno(parametros.destination);
  const recusa = ehRecusa(parametros.error) ? RECUSAS[parametros.error] : null;
  const aviso = recusa ? null : (AVISOS[parametros.metodo ?? ''] ?? null);
  const alerta = recusa ?? aviso;

  return (
    <main className="login">
      <section className="login-card" aria-labelledby="entrar-titulo">
        <div className="login-brand">
          <Simbolo tamanho={40} />
          <b>Pipe CRM</b>
        </div>

        <h1 id="entrar-titulo">Entrar</h1>
        <p className="login-sub">Leads, oportunidades e o funil, alimentados pelas conversas.</p>

        {/*
 * In reading order BEFORE the buttons, with its own heading: someone using a screen
 * reader needs the reason before the action, not after it.
 */}
        {alerta ? (
          <div className="login-alert" role="alert">
            <h2>{alerta.titulo}</h2>
            <p>{alerta.saida}</p>
          </div>
        ) : null}

        {/*
 * A link, not a button: signing in with Google is a top-level navigation to another
 * origin. A `fetch` here would run into CORS and wouldn't bring back the cookie.
 */}
        <a className="btn primario login-google" href={inboundWithGoogleUrl({ destination })}>
          Entrar com Google
        </a>

        <div className="login-or">
          <span>ou, se a sua empresa usa SSO</span>
        </div>

        <form action={continuar} className="login-form">
          <label htmlFor="entrar-email">E-mail corporativo</label>
          <input
            id="entrar-email"
            name="email"
            type="email"
            className="campo"
            required
            autoComplete="email"
            spellCheck={false}
            defaultValue={parametros.email ?? ''}
            aria-describedby="entrar-ajuda"
          />
          <p id="entrar-ajuda" className="login-help">
            Levamos você ao provedor de identidade da sua empresa, quando ela tiver um. Não
            guardamos nada nesta etapa.
          </p>
          <input type="hidden" name="destino" value={destination} />
          <button type="submit" className="btn">
            Continuar
          </button>
        </form>

        <p className="login-footer">
          Recebeu um convite? Abra o link que chegou por e-mail — ele entra e cria a sua conta
          no mesmo passo.
        </p>
      </section>
    </main>
  );
}
