import { portalUseShell } from '../../../lib/shell';
import { useRead } from '../../../lib/query';
import { NaoEncontrado } from '../../nao-encontrado';
import { ModuloShell, useContact } from '../contact';
import type { DataOfServices } from '@pipe/contracts';
import { TelaDeServicos } from './tela';
import '../integrations/header-of-page.css';
import './servicos.css';

/** Serviços do roteador: equivalente à configuração `master.services`. */
export function ServicesPage() {
  const { contact } = useContact();
  const shell = portalUseShell();
  const read = useRead<DataOfServices>(`/v1/management/flows/${contact.id}/services`);
  if (contact.tipo !== 'roteador') return <NaoEncontrado />;
  if (read.error) return <NaoEncontrado />;
  if (!read.data) return null;
  const data = read.data;
  if (!data.router) return <NaoEncontrado />;

  return (
    <ModuloShell ativo="Serviços">
      <TelaDeServicos data={data} podeEditar={shell.canCreate} />
    </ModuloShell>
  );
}
