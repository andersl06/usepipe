import { useParams } from 'react-router-dom';
import type { InvitationVisible } from '@pipe/contracts';
import { useRead } from '../../lib/query';
import { inboundWithGoogleUrl } from '@pipe/ui/api';
import { APPLICATION } from '../../lib/application-paths';
import { FundoPipe } from '../fundo-pipe';

/**
 * The invite as seen by someone still on the outside. A public route, like the sign-in one — and for the same reason the API doesn't require a session on `GET /v1/convites/:token`: requiring the account the invite belongs to already exist in order to create it would be circular. It shows the MINIMUM the API returns: who it's for, with what role, from which company, and until when it's valid. Whoever has the link already knows the email; the rest of the account isn't any business of someone who hasn't joined yet. The button goes to `/v1/auth/google?convite=<token>`, the path for anyone without a verified domain: it's the invite that decides the tenant, not the domain.
 */
const DATA = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' });

export function PageInvitation() {
  const { token = '' } = useParams();
  const read = useRead<InvitationVisible>(`/v1/convites/${encodeURIComponent(token)}`, {
    retry: false,
  });
  if (read.isPending) return null;
  const invitation = read.data ?? null;

  return (
    <main className="login">
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&display=swap"
      />
      <FundoPipe />

      <div className="login-stage">
        <section className="login-card" aria-labelledby="convite-titulo">
          <img className="login-lockup" src="/pipe/lockup.svg" alt="Pipe" />
          {invitation ? (
            <>
              <h1 id="convite-titulo">Você foi convidado</h1>
              <p className="login-sub">
                {invitation.tenant.name} convidou você para o Pipe. Entrar com o Google já cria a sua
                conta.
              </p>

              <dl className="login-data">
                <dt>Para</dt>
                <dd>{invitation.email}</dd>
                <dt>Papel</dt>
                <dd>{invitation.role}</dd>
                <dt>Vale até</dt>
                <dd>{DATA.format(new Date(invitation.expiresAt))}</dd>
              </dl>

              <a className="login-google" href={inboundWithGoogleUrl({ invitation: token, destination: APPLICATION })}>
                Entrar com Google e aceitar
              </a>

              <p className="login-footer">
                Entre com a conta do Google deste mesmo e-mail. Com outra conta, o convite não é
                aceito — ele vale para um endereço só.
              </p>
            </>
          ) : (
            <>
              <h1 id="convite-titulo">Este convite não serve mais</h1>
              {/*
 * Expired, already used, and nonexistent all show the SAME screen: telling them apart would reveal to whoever has the link whether that token ever existed.
 */}
              <p className="login-sub">
                Convite vale sete dias e uma vez só. Peça um novo a quem administra o Pipe na sua
                empresa.
              </p>
              <a className="login-google" href="/login">
                Ir para a tela de entrada
              </a>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
