import { Link as LinkDoRoteador, type LinkProps } from 'react-router-dom';
import type { ReactNode } from 'react';

/**
 * O `<Link>` das telas, com `href` — a MESMA assinatura que o `next/link` tinha.
 *
 * Existe para a migração ser "trocar o import", e não reescrever cada `<Link
 * href>` das telas medidas da Blip. É só o nome do atributo: por baixo é o
 * `Link` do React Router, com navegação de cliente e sem recarregar a página.
 *
 * `href` externo (`http…`, `mailto:`) vira `<a>` comum: o roteador não tem o
 * que fazer com ele.
 */
export function Link({
  href,
  children,
  ...resto
}: Omit<LinkProps, 'to'> & { href: string; children?: ReactNode }) {
  if (/^(https?:|mailto:|tel:)/.test(href)) {
    return (
      <a href={href} {...resto}>
        {children}
      </a>
    );
  }
  return (
    <LinkDoRoteador to={href} {...resto}>
      {children}
    </LinkDoRoteador>
  );
}

export default Link;
