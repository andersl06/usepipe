import { IconeDesk } from './icones-desk';
import { iniciais } from '../lib/formato';

/**
 * O `bds-avatar` da referência: disco na cor "system" com as iniciais quando
 * há `name`, ou o ícone de pessoa quando não há (o cartão da lista passa só
 * a foto, então mostra o ícone; o cabeçalho e o trilho passam o nome).
 * Tamanhos: `extra-small` 32, `small` 40, `standard` 56.
 */
export function Avatar({
  nome,
  tamanho = 40,
  apagado = false,
  className,
}: {
  nome?: string | null;
  tamanho?: 32 | 40 | 56;
  apagado?: boolean;
  className?: string;
}) {
  const classes = [
    'dk-avatar',
    tamanho === 56 ? 'dk-avatar-56' : '',
    apagado ? 'dk-avatar-apagado' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  const texto = nome ? iniciais(nome) : '';
  return (
    <span
      className={classes}
      style={tamanho === 32 ? { width: 32, height: 32, fontSize: 14 } : undefined}
      aria-hidden="true"
    >
      {texto ? texto : <IconeDesk nome="usuario" />}
    </span>
  );
}
