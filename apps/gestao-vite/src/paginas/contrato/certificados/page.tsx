import Link from '../../../componentes/link';
import { BarraDoPortal } from '../../../componentes/barra-do-portal';
import { IconePortal } from '../../../componentes/icones-portal';
import { Navigate } from 'react-router-dom';
import { useEu } from '../../../contexto/sessao';
import { useCascaDoPortal } from '../../../lib/casca';
import { useLeitura } from '../../../lib/consulta';
import type { CertificadoMtls } from '../../../lib/certificados';
import type { ResumoDoContrato } from '../../../lib/contrato';
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
export function PaginaDeCertificados() {
  const eu = useEu();
  const casca = useCascaDoPortal();
  const podeLer = eu.permissoes.includes('conta.membros.ler');
  const leitura = useLeitura<ResumoDoContrato>(podeLer ? '/v1/gestao/contrato/resumo' : null);
  const lista = useLeitura<CertificadoMtls[]>(
    podeLer ? '/v1/gestao/contrato/certificados' : null,
  );
  if (!podeLer) return <Navigate to="/contrato" replace />;
  if (!leitura.data || !lista.data) return null;
  const contrato = leitura.data;
  const podeEscrever = eu.permissoes.includes('conta.membros.escrever');

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

        <TelaDeCertificados certificados={lista.data} podeEscrever={podeEscrever} />
      </main>
    </div>
  );
}
