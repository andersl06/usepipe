import Link from '../../../components/link';
import { BarraDoPortal } from '../../../components/barra-do-portal';
import { IconePortal } from '../../../components/icones-portal';
import { Navigate } from 'react-router-dom';
import { useEu } from '../../../context/session';
import { portalUseShell } from '../../../lib/shell';
import { useRead } from '../../../lib/query';
import type { CertificadoMtls } from '../../../lib/certificados';
import type { ContractSummary } from '../../../lib/contract';
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
 * `referencias-blip/pesquisa/blip-certificados-mtls.md`.
 */
export function CertificatesPage() {
  const eu = useEu();
  const shell = portalUseShell();
  const podeLer = eu.permissions.includes('conta.membros.ler');
  const read = useRead<ContractSummary>(podeLer ? '/v1/management/contract/summary' : null);
  const lista = useRead<CertificadoMtls[]>(
    podeLer ? '/v1/management/contract/certificates' : null,
  );
  if (!podeLer) return <Navigate to="/contract" replace />;
  if (!read.data || !lista.data) return null;
  const contract = read.data;
  const podeEscrever = eu.permissions.includes('conta.membros.escrever');

  return (
    <div className="pt-app">
      <BarraDoPortal data={shell} />

      <main className="pt-conteudo">
        {/* `setHeaderContent({ redirect: "/", text: "Certificados MTLS de {0}" })`:
            na origem quem desenha a seta e a frase é a barra do portal. */}
        <div className="cm-cabecalho">
          <Link className="cm-voltar" href="/contract" aria-label="Voltar ao painel do contrato">
            <IconePortal nome="esquerda" tamanho={24} />
          </Link>
          <h1>Certificados MTLS de {contract.nome}</h1>
        </div>

        <TelaDeCertificados certificados={lista.data} podeEscrever={podeEscrever} />
      </main>
    </div>
  );
}
