import { Link as LinkDoRoteador, type LinkProps } from 'react-router-dom';
import type { ReactNode } from 'react';

/**
 * Screen `<Link href>` keeps the former `next/link` `href` signature so migrated Blip-measured screens only change their import. It delegates client-side navigation to React Router. External `href` values (`http…`, `mailto:`) use a plain `<a>` because the router cannot handle them.
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
