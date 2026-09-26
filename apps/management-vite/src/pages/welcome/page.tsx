import Link from '../../components/link';
import { Navigate } from 'react-router-dom';
import { useRead } from '../../lib/query';
import type { AccountInForce } from '../../lib/account';
import { FundoPipe } from '../fundo-pipe';
import './boas-vindas.css';

/**
 * Welcome screen announces that the account was just created at login. Reference `#welcome-screen` places brand upper-left, centered text in a 40% column, right-aligned arrow button, and artwork in the right 55%, hidden below 1286px. Like the reference, this is a one-time gate: completed onboarding cannot revisit it even by URL. Keep forms on the next step so first entry is not an eight-field form.
 */
export function PageWelcome() {
  const read = useRead<AccountInForce>('/v1/account');
  if (read.error) return <Navigate to="/login" replace />;
  if (!read.data) return null;
  const account = read.data;
  if (account.onboardingConcluidoEm) return <Navigate to="/portal" replace />;

  return (
    <main className="bv">
      {/*
 * Let the beam cover the whole window rather than one column: the reference right column is an illustration, while our artwork is the background; boxing it left half the screen blank.
 */}
      <div className="bv-fundo" aria-hidden>
        <FundoPipe />
      </div>

      <div className="bv-container">
        <div className="bv-texto">
          <img className="bv-marca" src="/pipe/lockup.svg" alt="Pipe" />

          <div className="bv-miolo">
            <h1>Conta ativada com sucesso!</h1>
            <p>
              Olá! Chegou a hora de começar sua jornada de criação, gestão e evolução de atendimento
              inteligente. Mas, primeiro, precisamos criar seu espaço de trabalho.
            </p>
            <p className="bv-endereco">
              O endereço da sua conta é <b>{account.slug}</b>.
            </p>

            <div className="bv-acao">
              <Link href="/my-account">
                Vamos lá
                <Seta />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

/** Use our stroke for the reference button arrow (`arrow="true"`). */
function Seta() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden focusable="false">
      <path
        d="M5 12h14M13 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
