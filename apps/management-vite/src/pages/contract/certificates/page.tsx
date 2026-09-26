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
 * Authentication certificates — the "Gerencie seus certificados mTLS" card on the panel, which at the source opens the fragment's `/mtls` route (component `zt`). The route is called `certificados`, not `mtls`, for the same reason `members` isn't called `panel`: the address is ours, in Portuguese; what gets copied is the screen. The guard is the source's — `Z.d(members)`, a `tenant-members` read —, which here is `conta.membros.ler`, the same one the card already requires. Anyone arriving without it goes back to the panel. The data contract, the copy and the modals are in `referencias-blip/pesquisa/blip-certificados-mtls.md`.
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
        {/*
 * `setHeaderContent({ redirect: "/", text: "Certificados MTLS de {0}" })`: at the source, the portal bar is what draws the back arrow and the phrase.
 */}
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
