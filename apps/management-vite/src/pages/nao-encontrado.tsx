import { Link } from '../components/link';
import { APPLICATION } from '../lib/application-paths';

/** The app's 404: Next had its own by default; here it's our own short screen. */
export function NaoEncontrado() {
  return (
    <main className="pt-conteudo fx-miolo">
      <div className="fx-column">
        <h1>Página não encontrada</h1>
        <p>
          O endereço não existe ou não pertence a esta conta.{' '}
          <Link href={APPLICATION}>Voltar ao portal</Link>
        </p>
      </div>
    </main>
  );
}
