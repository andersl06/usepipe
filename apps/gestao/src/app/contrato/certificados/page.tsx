import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BarraDoPortal } from '../../../componentes/barra-do-portal';
import { IconePortal } from '../../../componentes/icones-portal';
import { exigirEu } from '../../../lib/banco';
import { carregarCertificados } from '../../../lib/certificados';
import { carregarResumoDoContrato } from '../../../lib/contrato';
import { carregarCascaDoPortal } from '../../../lib/portal';
import './certificados.css';
import { TelaDeCertificados } from './tela';

/**
 * Certificados de autenticação — o cartão "Gerencie seus certificados mTLS" do
 * painel, que na origem abre a rota `/mtls` do fragmento (componente `zt`).
 *
 * A rota chama `certificados`, e não `mtls`, pelo mesmo motivo de `membros`
 * não chamar `panel`: o endereço é nosso e em português; o que se copia é a
 * tela.
 *
 * A guarda é a da origem — `Z.d(members)`, leitura de `tenant-members` —, que
 * aqui é `conta.membros.ler`, a mesma que o cartão já exige. Quem chega sem ela
 * volta para o painel.
 *
 * O contrato de dados, os textos e os modais estão em
 * `docs/pesquisa/blip-certificados-mtls.md`.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Certificados de autenticação · Pipe',
  description: 'Os certificados mTLS deste contrato.',
};

export default async function PaginaDeCertificados() {
  const eu = await exigirEu();
  if (!eu.permissoes.includes('conta.membros.ler')) redirect('/contrato');

  const [casca, contrato, certificados] = await Promise.all([
    carregarCascaDoPortal(),
    carregarResumoDoContrato(),
    carregarCertificados(),
  ]);

  return (
    <div className="pt-app">
      <BarraDoPortal dados={casca} />

      <main className="pt-conteudo">
        {/* `setHeaderContent({ redirect: "/", text: "Certificados MTLS de {0}" })`:
            na origem quem desenha a seta e a frase é a barra do portal. */}
        <div className="cm-cabecalho">
          <Link className="cm-voltar" href="/contrato" aria-label="Voltar ao painel do contrato">
            <IconePortal nome="esquerda" tamanho={24} />
          </Link>
          <h1>Certificados MTLS de {contrato.nome}</h1>
        </div>

        <TelaDeCertificados certificados={certificados} />
      </main>
    </div>
  );
}
