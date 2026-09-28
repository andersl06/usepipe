import Link from '../../../components/link';
import { IconePortal } from '../../../components/icones-portal';
import { useRead } from '../../../lib/query';
import type { ContactListed } from '@pipe/contracts';
import { contactPath, useContact } from '../contact';
import {
  formatPeriodLimit,
  formatLastInteraction,
  periodDefault,
  countLabel,
  channelLabel,
} from './regras';

/*
 * Structure of the origin's `users-content-view` template (portal.js, module 2753): sidebar `.static-sidebar` with a dark header (Filters + Apply) and a body with the `user-dimension` (dashed "+ Adicionar filtros" button); on the right, `page-header` (Contatos + reload), `#contacts-filter` (count + `blip-daterange-picker`), and the list of `card.card--mini-card.user-card`.
 */
export function BotListContacts() {
  const { contact: bot } = useContact();
  const id = bot.id;
  const base = contactPath(bot);
  const read = useRead<ContactListed[]>(`/v1/management/flows/${id}/contacts`);
  const contacts = read.data ?? [];
  const period = periodDefault(new Date());
  return (
    <div className="ct-listing">
      <aside className="ct-filters">
        <header className="ct-filters-header">
          <span className="ct-filters-title">Filtros</span>
          {/* ponytail: dimension filters have no backend; the button starts disabled, as in the origin. */}
          <button className="ct-aplicar" type="button" disabled>
            Aplicar
          </button>
        </header>
        <div className="ct-filters-body">
          <div className="ct-dimensao">
            <button className="ct-add-filter" type="button">
              + Adicionar filtros
            </button>
          </div>
        </div>
      </aside>
      <div className="ct-espaco-lateral" />
      <section className="ct-users">
        <div className="ct-cabeca">
          <div className="ct-header-section">
            <div className="ct-cabeca-conteudo">
              <div className="ct-cabeca-titulo">
                <h1>Contatos</h1>
              </div>
              <div className="ct-header-actions">
                <form className="ct-dica" method="get">
                  <button
                    className="ct-botao-icone"
                    type="submit"
                    title="Atualizar"
                    aria-label="Atualizar"
                  >
                    <IconePortal nome="atualizar" tamanho={24} />
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
        <div className="ct-container">
          <div className="ct-filter-contacts">
            <div className="ct-count">
              <span>{countLabel(contacts.length)}</span>
            </div>
            {/* ponytail: the period picker is visual only; date filtering has no backend. */}
            <div className="ct-period" aria-label="Período">
              <span className="ct-period-icon">
                <IconePortal nome="calendario" tamanho={21} />
              </span>
              <input
                className="ct-period-data"
                aria-label="Data inicial"
                readOnly
                value={formatPeriodLimit(period.inicio)}
              />
              <span>~</span>
              <input
                className="ct-period-data"
                aria-label="Data final"
                readOnly
                value={formatPeriodLimit(period.fim)}
              />
            </div>
          </div>
          {contacts.length === 0 ? (
            <div className="ct-no-contacts">Nenhum contato encontrado</div>
          ) : (
            <div className="ct-cards">
              {contacts.map((contact) => (
                <Link
                  className="ct-user"
                  href={`${base}/users/${contact.id}`}
                  key={contact.id}
                >
                  <span className="ct-section ct-section-avatar">
                    <span className="ct-avatar">
                      {contact.avatarUrl ? (
                        <img src={contact.avatarUrl} alt="" />
                      ) : (
                        <IconePortal nome="avatar" tamanho={32} />
                      )}
                    </span>
                  </span>
                  <span className="ct-section ct-section-name">
                    <span className="ct-nome">{contact.nome ?? '-'}</span>
                    <span className="ct-last-interaction">
                      <span>Última interação:</span>&nbsp;
                      <span>
                        {formatLastInteraction(
                          contact.lastConversation ? new Date(contact.lastConversation) : null,
                        )}
                      </span>
                    </span>
                  </span>
                  <span className="ct-divisor" />
                  <span className="ct-section ct-section-channel">
                    <span className="ct-channel-label">Canal</span>
                    <span className="ct-channel-value">
                      {channelLabel(contact.canalTipo, contact.canalNome)}
                    </span>
                  </span>
                  <span className="ct-section ct-section-test" />
                  <span className="ct-section ct-section-open">
                    <span className="ct-dica">
                      <span className="ct-nova-aba" title="Abrir em nova aba">
                        <IconePortal nome="abrir-arquivo" tamanho={24} />
                      </span>
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
