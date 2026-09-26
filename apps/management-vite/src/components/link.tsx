import { Link as LinkDoRoteador, type LinkProps } from 'react-router-dom';
import type { ReactNode } from 'react';

/**
 * Screen `<Link>` with `href` preserves the former `next/link` signature so migrated Blip-measured screens change only their import. It delegates client navigation to React Router. External `href` values such as `http…` and `mailto:` use a plain `<a>`.
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
