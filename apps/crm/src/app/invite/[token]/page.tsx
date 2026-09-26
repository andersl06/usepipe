import type { Metadata } from 'next';
import { Simbolo } from '@pipe/ui';
import { inboundWithGoogleUrl, verInvitation } from '../../../lib/session';

/**
 * The invite as seen by someone still on the outside.
 *
 * Public route, like the sign-in one — and for the same reason the API doesn't
 * require a session on `GET /v1/convites/:token`: requiring the account the invite
 * exists in to create it would be circular.
 *
 * It shows the MINIMUM the API returns: who it's for, with what role, from which
 * company, and until when it's valid. Whoever has the link already knows the email;
 * the rest of the account isn't the business of someone who hasn't joined yet.
 *
 * The button sends them to `/v1/auth/google?convite=<token>`, which is the path for
 * someone without a verified domain: it's the invite that decides the tenant, not
 * the domain.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Convite · Pipe CRM',
  description: 'Aceitar um convite para o Pipe CRM.',
};

const DATA = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' });

export default async function PageInvitation({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invitation = await verInvitation(token);

  return (
    <main className="entrar">
      <section className="entrar-cartao" aria-labelledby="convite-titulo">
        <div className="entrar-marca">
          <Simbolo tamanho={40} />
          <b>Pipe CRM</b>
        </div>

        {invitation ? (
          <>
            <h1 id="convite-titulo">Você foi convidado</h1>
            <p className="entrar-sub">
              {invitation.tenant.nome} convidou você para o Pipe. Entrar com o Google já cria a sua
              conta.
            </p>

            <dl className="entrar-dados">
              <dt>Para</dt>
              <dd>{invitation.email}</dd>
              <dt>Papel</dt>
              <dd>{invitation.role}</dd>
              <dt>Vale até</dt>
              <dd>{DATA.format(new Date(invitation.expiraEm))}</dd>
            </dl>

            <a
              className="btn primario entrar-google"
              href={inboundWithGoogleUrl({ invitation: token })}
            >
              Entrar com Google e aceitar
            </a>

            <p className="entrar-rodape">
              Entre com a conta do Google deste mesmo e-mail. Com outra conta, o convite não é
              aceito — ele vale para um endereço só.
            </p>
          </>
        ) : (
          <>
            <h1 id="convite-titulo">Este convite não serve mais</h1>
            {/*
 * Expired, already used, and nonexistent all give the SAME screen: distinguishing
 * between them would tell whoever has the link whether that token ever existed.
 */}
            <p className="entrar-sub">
              Convite vale sete dias e uma vez só. Peça um novo a quem administra o Pipe na sua
              empresa.
            </p>
            <a className="btn entrar-google" href="/login">
              Ir para a tela de entrada
            </a>
          </>
        )}
      </section>
    </main>
  );
}
