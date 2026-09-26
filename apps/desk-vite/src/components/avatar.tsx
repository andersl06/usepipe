import { IconeDesk } from './icones-desk';
import { initials } from '../lib/format';

/**
 * Reference `bds-avatar`: a system-colored circle with initials when `name` is supplied, or a person icon otherwise (list cards provide only the photo; the header and rail provide the name). Sizes: `extra-small` 32, `small` 40, `standard` 56.
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
  const texto = nome ? initials(nome) : '';
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
