import Link from '../../../components/link';
import { useSearchParams } from 'react-router-dom';
import { useRead } from '../../../lib/query';
import type { AccountInList } from '../../../lib/shell';
import '../../welcome/boas-vindas.css';

/**
 * "Are you part of X?" — the address belongs to an account the person doesn't have access to.
 *
 * It's the source platform's way out for the same case, and the reason is that a flat denial sends away someone who just needed an invite.
 *
 * **The account might not even exist, and the screen is the SAME on purpose.** Saying "this account exists, but it's not yours" tells any curious visitor which companies use Pipe — the same symmetry that email discovery already keeps at sign-in.
 */
export function PageNoAccess() {
  const [search] = useSearchParams();
  const slug = (search.get('para') ?? '').trim().toLowerCase();
  const read = useRead<AccountInList[]>('/v1/accounts/my');
  const accounts = read.data ?? [];
  const emVigor = accounts.find((c) => c.inForce);

  return (
    <main className="entry-step">
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&display=swap"
      />
      <section className="entry-step-card">
        <img className="login-lockup" src="/pipe/lockup.svg" alt="Pipe" />

        <h1>Você faz parte de {slug || 'outra conta'}?</h1>
        <p className="entry-step-sub">
          Este endereço é de outra conta, e o seu acesso ainda não está nela. Peça a quem administra
          essa conta para convidar o seu e-mail — o convite entra direto, sem depender do domínio.
        </p>

        <div className="bv-acao">
          <Link href={emVigor ? '/portal' : '/welcome'}>
            {emVigor ? `Voltar para ${emVigor.name}` : 'Voltar'}
          </Link>
        </div>
      </section>
    </main>
  );
}
