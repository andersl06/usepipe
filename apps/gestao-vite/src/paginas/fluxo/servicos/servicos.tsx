import { useCascaDoPortal } from '../../../lib/casca';
import { useLeitura } from '../../../lib/consulta';
import { NaoEncontrado } from '../../nao-encontrado';
import { BarrasDoContato, useContato } from '../contato';
import type { DadosDeServicos } from '@pipe/contracts';
import { TelaDeServicos } from './tela';
import './servicos.css';

/** Serviços do roteador: equivalente à configuração `master.services`. */
export function PaginaDeServicos() {
  const { contato } = useContato();
  const casca = useCascaDoPortal();
  const leitura = useLeitura<DadosDeServicos>(`/v1/gestao/fluxos/${contato.id}/servicos`);
  if (contato.tipo !== 'roteador') return <NaoEncontrado />;
  if (!leitura.data) return null;
  const dados = leitura.data;
  if (!dados.principal) return <NaoEncontrado />;

  return (
    <div className="pt-app">
      <BarrasDoContato ativo="Serviços" />
      <main className="sv-miolo">
        <TelaDeServicos dados={dados} podeEditar={casca.podeCriar} />
      </main>
    </div>
  );
}
