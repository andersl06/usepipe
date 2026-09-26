import { portalUseShell } from '../../../lib/shell';
import { useRead } from '../../../lib/query';
import { NaoEncontrado } from '../../nao-encontrado';
import { ShellModule, useContact } from '../contact';
import type { DataOfServices } from '@pipe/contracts';
import { TelaDeServicos } from './tela';
import '../integrations/header-of-page.css';
import './servicos.css';

/** Roteador services: equivalent to the `master.services` setting. */
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
    <ShellModule ativo="Serviços">
      <TelaDeServicos data={data} podeEditar={shell.canCreate} />
    </ShellModule>
  );
}
