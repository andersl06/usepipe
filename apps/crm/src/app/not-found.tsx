import Link from 'next/link';
import { Ilustracao } from '@pipe/ui';

/**
 * Registro que não existe, ou endereço que ninguém serve.
 *
 * Um caminho de volta, não dois: a lista de leads é de onde se chega a quase
 * tudo neste CRM, e oferecer cinco links aqui é transformar uma parede numa
 * segunda navegação.
 */
export default function NaoEncontrado() {
  return (
    <div className="tblwrap">
      <div className="vazio">
        <Ilustracao nome="busca" />
        <b>Não encontramos este registro.</b>
        <span>
          Ou ele foi excluído, ou o endereço veio errado. Registro excluído continua no banco e
          some da tela — é assim de propósito, para não perder histórico.
        </span>
        <span className="acoes-erro">
          <Link className="btn" href="/leads">
            Ir para os leads
          </Link>
        </span>
      </div>
    </div>
  );
}
