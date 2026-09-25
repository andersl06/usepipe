import { useParams } from 'react-router-dom';
import type { InvitationVisible } from '@pipe/contracts';
import { useRead } from '../../lib/consulta';
import { inboundWithGoogleUrl } from '../../lib/entrada';
import { FundoPipe } from '../fundo-pipe';

/**
 * O convite visto por quem ainda está do lado de fora.
 *
 * Rota pública, como a de entrada — e pelo mesmo motivo da API não exigir
 * sessão em `GET /v1/convites/:token`: pedir a conta que o convite existe para
 * criar seria um ciclo.
 *
 * Ela mostra o MÍNIMO que a API devolve: para quem é, com que papel, de que
 * empresa e até quando vale. Quem tem o link já sabe o e-mail; o resto da conta
 * não é assunto de quem ainda não entrou.
 *
 * O botão manda para `/v1/auth/google?convite=<token>`, que é o caminho de quem
 * não tem domínio verificado: é o convite que decide o tenant, e não o domínio.
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
    <main className="entrar">
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&display=swap"
      />
      <FundoPipe />

      <div className="entrar-palco">
        <section className="entrar-cartao" aria-labelledby="convite-titulo">
          <img className="entrar-lockup" src="/pipe/lockup.svg" alt="Pipe" />
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

              <a className="entrar-google" href={inboundWithGoogleUrl({ invitation: token })}>
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
              {/* Vencido, já usado e inexistente dão a MESMA tela: separar
                contaria a quem tem o link se aquele token um dia existiu. */}
              <p className="entrar-sub">
                Convite vale sete dias e uma vez só. Peça um novo a quem administra o Pipe na sua
                empresa.
              </p>
              <a className="entrar-google" href="/entrar">
                Ir para a tela de entrada
              </a>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
