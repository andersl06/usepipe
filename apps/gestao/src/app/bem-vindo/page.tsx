import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { contaEmVigor } from '../../lib/conta';
import { FundoPipe } from '../entrar/fundo-pipe';
import './boas-vindas.css';

/**
 * A tela de boas-vindas: a conta acabou de nascer no login, e esta tela é o
 * aviso disso.
 *
 * A disposição é a da plataforma de origem, lida no template dela
 * (`#welcome-screen`): marca no alto à esquerda, texto centrado na altura numa
 * coluna de 40%, botão alinhado à direita com seta, e a arte ocupando os 55% da
 * direita — que some abaixo de 1286px.
 *
 * É portão de uma vez só, como lá: quem já concluiu o onboarding não volta para
 * cá nem digitando o endereço. Sem isso a tela vira um anúncio permanente de uma
 * coisa que já aconteceu.
 *
 * Nada para preencher aqui, também como lá. O formulário é o passo seguinte, e
 * juntar os dois faria a primeira tela de quem acabou de entrar ser um
 * formulário de oito campos.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Bem-vindo · Pipe',
  description: 'Sua conta do Pipe foi criada.',
};

export default async function PaginaBemVindo() {
  const conta = await contaEmVigor();
  if (!conta) redirect('/entrar');
  if (conta.onboardingConcluidoEm) redirect('/portal');

  return (
    <main className="bv">
      {/* O feixe cobre a JANELA INTEIRA, e não uma coluna: na origem a coluna da
          direita é uma ilustração, e a nossa arte é o fundo. Recortá-lo numa
          caixa deixava metade da tela em branco. */}
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
              O endereço da sua conta é <b>{conta.slug}</b>.
            </p>

            <div className="bv-acao">
              <Link href="/minha-conta">
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

/** A seta do botão deles (`arrow="true"`), no nosso traço. */
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
