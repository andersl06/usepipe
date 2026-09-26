import Link from 'next/link';
import { Illustration } from '@pipe/ui';

/**
 * A record that doesn't exist, or an address nobody serves.
 *
 * One way back, not two: the leads list is where you reach almost everything in
 * this CRM, and offering five links here would turn a wall into a second
 * navigation.
 */
export default function NaoEncontrado() {
  return (
    <div className="tblwrap">
      <div className="empty">
        <Illustration nome="busca" />
        <b>Não encontramos este registro.</b>
        <span>
          Ou ele foi excluído, ou o endereço veio errado. Registro excluído continua no banco e
          some da tela — é assim de propósito, para não perder histórico.
        </span>
        <span className="actions-error">
          <Link className="btn" href="/leads">
            Ir para os leads
          </Link>
        </span>
      </div>
    </div>
  );
}
