import type { ReactNode } from 'react';
import { CascaDoModulo } from '../casca-do-modulo';
import './cabecalho-de-pagina.css';
import './integracoes.css';

export default async function LayoutIntegracoes({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <CascaDoModulo id={id} ativo="Integrações">
      {children}
    </CascaDoModulo>
  );
}
