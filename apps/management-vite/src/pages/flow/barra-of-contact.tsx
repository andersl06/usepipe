import { Avatar } from '@pipe/ui';
import type { MyPermissionsInFlow } from '@pipe/contracts';
import { ManagementIcon } from '../../components/icones-management';
import { IconePortal } from '../../components/icones-portal';
import { Link } from '../../components/link';
import { useRead } from '../../lib/query';
import { ICONS_OF_CONTACT, LIMITE_VISIVEL, itensDoMenu, type ItemDoMenu } from './itens';

/**
 * The CONTACT bar — the source's `subheader-detail` (module 80688).
 *
 * Lives outside `page.tsx` because in the source it belongs to the parent state `auth.application.detail`: `home` and the Analysis (`/analise`) screens draw the SAME bar, and the latter only highlights its own item.
 */

/** The `id` comes from the URL, and a URL is untrusted external input: without this, Postgres rejects the uuid. */
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The contact and its channel — what `GET /v1/gestao/fluxos/:id` returns (`ContatoDoFluxo` in the `api`). The query moved sides; the shape stays the same.
 */
export interface Contact {
  id: string;
  nome: string;
  state: string;
  tipo: string;
  imageUrl: string | null;
  shortName: string | null;
  description: string | null;
  criadoEm: Date | null;
  channelId: string | null;
  channelName: string | null;
  channelType: string | null;
  channelActive: boolean | null;
  /** The number (WhatsApp), the `@username` (Instagram), or the Page id (Messenger). */
  channelNumber: string | null;
}

export function ContactBar({ contact, ativo }: { contact: Contact; ativo?: string }) {
  const tipo = contact.tipo === 'roteador' ? 'roteador' : 'fluxo';
  const base = `/${tipo === 'roteador' ? 'router' : 'flow'}/${contact.id}`;
  /*
   * Step 2 of the source (`getUpdatedMenus()`): the bar only shows what the person can see in THIS contact. While the response hasn't arrived, `undefined` hides the whole row — flashing the full bar and then shrinking it is worse than the brief delay window, and anyone without access still gets a 403 on the destination screen, which is where the permission actually applies.
   */
  const minhas = useRead<MyPermissionsInFlow>(`/v1/management/flows/${contact.id}/team/i`);
  const itens = itensDoMenu(tipo, contact.id, minhas.data);
  const visiveis = itens.slice(0, LIMITE_VISIVEL);
  const excedentes = itens.slice(LIMITE_VISIVEL);

  return (
    <>
      {/*
 * Their `subheader-detail`: the CONTACT bar, dark, right below the account bar. It's what says "you're inside a contact now" — in the portal, this step is the light bar with search.
 */}
      <div className="fx-subbarra">
        <div className="fx-contact">
          <span className="fx-av">
            {contact.imageUrl ? (
              <img src={contact.imageUrl} alt="" width={36} height={36} />
            ) : (
              <Avatar nome={contact.nome} />
            )}
            {/*
 * Their `u-status-on/off`, at the avatar's corner. There the signal is `application.status` (online/offline); here it's `estado`, the closest we have: published serves, draft doesn't yet.
 */}
            <i
              className={contact.state === 'publicado' ? 'g-ponto g-ponto-on' : 'g-ponto'}
              title={contact.state === 'publicado' ? 'Publicado' : 'Rascunho'}
            />
          </span>

          {/*
 * The name `<dropdown-item>`: name + `arrow-down`, and a 160px panel with "Home", "Configuração" and "Deixar projeto" (the latter in red, their `bp-c-delete`). Only the first has a destination — "Home" is the contact's screen, which is where its `ui-sref` points.
 */}
          <details className="g-menu fx-contact-menu">
            <summary>
              <span className="fx-contact-name">{contact.nome}</span>
              <IconePortal nome="baixo" tamanho={16} />
            </summary>
            <div className="g-panel">
              <Link href={base}>Home</Link>
              <span className="pt-obra">
                Configuração
                <span className="pt-obra-selo">em breve</span>
              </span>
              <span className="pt-obra fx-sair">
                Deixar projeto
                <span className="pt-obra-selo">em breve</span>
              </span>
            </div>
          </details>
        </div>

        <nav className="fx-menu" aria-label="Seções do contato">
          {visiveis.map((item) => (
            <ItemDaBarra key={item.rotulo} item={item} ativo={item.rotulo === ativo} />
          ))}

          {/*
 * The origin's "…" only exists when items OVERFLOW, and shows what overflowed. Same rule as the module row in `estrutura-gestao.tsx`.
 */}
          {excedentes.length > 0 ? (
            <details className="g-menu fx-mais">
              <summary className="g-iconbtn" title="Mais seções" aria-label="Mais seções">
                <ManagementIcon nome="reticencias" tamanho={24} />
              </summary>
              <div className="g-panel">
                {excedentes.map((item) =>
                  item.href ? (
                    <Link key={item.rotulo} href={item.href}>
                      {item.rotulo}
                    </Link>
                  ) : (
                    <span key={item.rotulo} className="pt-obra">
                      {item.rotulo}
                      <span className="pt-obra-selo">em breve</span>
                    </span>
                  ),
                )}
              </div>
            </details>
          ) : null}
        </nav>

        {/*
 * `subheader-icons`: Integrações, Configurações, and Equipe navigate to the contact's screens; only Testar still remains "coming soon".
 */}
        <div className="fx-icones">
          {ICONS_OF_CONTACT.map((item) =>
            item.href ? (
              <Link
                key={item.rotulo}
                className={item.rotulo === ativo ? 'fx-icone fx-icone--ativo' : 'fx-icone'}
                aria-current={item.rotulo === ativo ? 'page' : undefined}
                href={`${base}${item.href}`}
                title={item.rotulo}
                aria-label={item.rotulo}
              >
                <IconePortal nome={item.icone} tamanho={20} />
              </Link>
            ) : (
              <span key={item.rotulo} className="fx-icone pt-links-obra" title={item.rotulo}>
                <IconePortal nome={item.icone} tamanho={20} />
                <span className="pt-obra-selo">em breve</span>
              </span>
            ),
          )}
        </div>
      </div>
    </>
  );
}

/** A row item: a link when the screen exists, a grayed-out block when it doesn't. */
function ItemDaBarra({ item, ativo }: { item: ItemDoMenu; ativo: boolean }) {
  if (item.href) {
    return (
      <Link
        className={ativo ? 'fx-item fx-item--ativo' : 'fx-item'}
        href={item.href}
        aria-current={ativo ? 'page' : undefined}
      >
        {item.rotulo}
      </Link>
    );
  }
  return (
    <span className="fx-item pt-links-obra">
      {item.rotulo}
      <span className="pt-obra-selo">em breve</span>
    </span>
  );
}
