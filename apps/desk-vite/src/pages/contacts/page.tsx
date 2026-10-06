import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ticketNumber, type ConversationOfHistory, type TicketDoDesk } from '@pipe/contracts';
import { useRead } from '../../lib/query';
import { useDeskSelection } from '../../context/desk-selection';
import { IconeDesk } from '../../components/icones-desk';
import { Avatar } from '../../components/avatar';
import { channelOf } from '../../lib/channel';
import { dataAbreviada } from '../../lib/format';
import { displayName } from '../../lib/order';
import { situationLabel } from '../../lib/situation';
import { groupContacts, type ListContact, type ContactsOrder } from '../../lib/contacts';
import { Thread } from '../attendances/thread';

/**
 * Contacts tab follows reference MFE `desk-contact-history`, measured on the mock in `~/desk-clone/clone/mfe-teste.html` (`desk2/blip-contacts-1200.png`, `blip-contatos-aberto.png`): 300/600/300 columns. Left has 110px heading/search/sort and grouped 62px contact cards. Center shows an empty prompt, then new-conversation card, or ticket transcript. Right has `Histórico` and `Contato` tabs. Read only through `GET /v1/desk/contatos?busca=`, `/contatos/:id`, and `/tickets/:id`, as in the reference.
 */
export function PageContacts() {
  const { contact: selectedContact, openContact } = useDeskSelection();
  const navegar = useNavigate();
  const [search, setSearch] = useState('');
  const [order, setOrder] = useState<ContactsOrder>('alfabetica');
  const [menuOrder, setMenuOrder] = useState(false);
  const [aba, setAba] = useState<'historico' | 'contato'>('historico');
  const id = selectedContact?.contactId ?? null;
  const ticketId = selectedContact?.ticketId ?? null;

  const lista = useRead<{ contacts: ListContact[] }>(
    `/v1/desk/contacts${search.trim().length >= 2 ? `?search=${encodeURIComponent(search.trim())}` : ''}`,
  );
  const contact = useRead<{ contact: ContactRecord; history: ConversationOfHistory[] }>(
    id ? `/v1/desk/contacts/${id}` : null,
  );
  const ticket = useRead<TicketDoDesk>(ticketId ? `/v1/desk/tickets/${ticketId}` : null);
  const groups = useMemo(
    () => groupContacts(lista.data?.contacts ?? [], order),
    [lista.data, order],
  );

  return (
    <div className="dk-contacts">
      <div className="dk-contacts-list">
        <div className="dk-contacts-top">
          <div className="dk-contacts-title">
            <h1>Contatos</h1>
          </div>
          <div className="dk-contacts-search">
            <label className="dk-campo">
              <span className="dk-campo-icone">
                <IconeDesk nome="usuario" />
              </span>
              <input
                type="search"
                placeholder="Pesquisar contato"
                aria-label="Pesquisar contato"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <div className="dk-ficha-menu">
              <button
                type="button"
                className="dk-botao-icone"
                title="Ordenar contatos"
                aria-label="Ordenar contatos"
                aria-expanded={menuOrder}
                onClick={() => setMenuOrder((v) => !v)}
              >
                <IconeDesk nome="ordenar" />
              </button>
              {menuOrder ? (
                <div
                  className="dk-menu dk-contacts-order"
                  role="menu"
                  onMouseLeave={() => setMenuOrder(false)}
                >
                  <div className="dk-contacts-order-title">Ordenar contatos</div>
                  {(
                    [
                      ['alfabetica', 'Ordem alfabética', 'lista'],
                      ['ultima-interacao', 'Última interação', 'relogio'],
                    ] as const
                  ).map(([value, rotulo, icone]) => (
                    <button
                      key={value}
                      type="button"
                      role="menuitemradio"
                      aria-checked={order === value}
                      className="dk-contacts-order-item"
                      onClick={() => {
                        setOrder(value);
                        setMenuOrder(false);
                      }}
                    >
                      <IconeDesk nome={icone} />
                      <span>{rotulo}</span>
                      {order === value ? <IconeDesk nome="check" /> : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
        <div className="dk-contacts-scroll">
          {lista.isPending ? <div className="dk-girando dk-girando-pequeno" /> : null}
          {groups.map((g) => (
            <div key={g.rotulo}>
              <div className="dk-contacts-group">{g.rotulo}</div>
              <ul className="dk-contacts-items">
                {g.contacts.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      className="dk-contact"
                      aria-current={c.id === id ? 'true' : undefined}
                      onClick={() => openContact(c.id, null)}
                    >
                      <span className="dk-contact-face">
                        <Avatar />
                      </span>
                      <span className="dk-contact-text">
                        <b>
                          {displayName({
                            contactName: c.name,
                            contactPhone: c.phone,
                            contactEmail: c.email,
                            contactId: c.id,
                          })}
                        </b>
                        <small>
                          Última interação :{' '}
                          {c.lastInteractionAt ? dataCurta(new Date(c.lastInteractionAt)) : '—'}
                        </small>
                      </span>
                      <IconeDesk nome="seta-direita" tamanho={20} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {lista.data && groups.length === 0 ? (
            <div className="dk-lista-vazia">Nenhum contato encontrado</div>
          ) : null}
        </div>
      </div>

      <div className="dk-contacts-middle">
        {ticketId && ticket.data ? (
          <Thread
            conversationId={ticket.data.ticket.id}
            numero={ticketNumber(ticket.data.ticket.sequentialId)}
            itens={ticket.data.itens}
            agora={new Date()}
            onlyRead
          />
        ) : (
          <div className="dk-contacts-empty">
            <div className="dk-contacts-illustration" aria-hidden="true">
              <IconeDesk nome="atendimentos" />
            </div>
            <div className="dk-contacts-empty-text">
              <h2>Explore conversas anteriores</h2>
              <p>
                Selecione um contato na lista ao lado e escolha um ticket para acessar abrir seu
                histórico
              </p>
            </div>
          </div>
        )}
        {id && contact.data ? (
          <div className="dk-contacts-footer">
            <div className="dk-contacts-footer-paper">
              <p>Inicie uma nova conversa com este contato enviando uma mensagem ativa.</p>
              <button
                type="button"
                className="dk-botao"
                onClick={() => navegar(`/activeMessage/send?contact=${id}`)}
              >
                Conversar novamente
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="dk-contacts-right">
        {id ? (
          <div className="dk-abas">
            <div className="dk-contacts-tabs" role="tablist">
              {(
                [
                  ['historico', 'Histórico'],
                  ['contato', 'Contato'],
                ] as const
              ).map(([value, rotulo]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  className="dk-aba"
                  aria-selected={aba === value}
                  onClick={() => setAba(value)}
                >
                  {rotulo}
                </button>
              ))}
            </div>
            <div className="dk-panel-body" role="tabpanel">
              {!contact.data ? (
                <div className="dk-girando dk-girando-pequeno" />
              ) : aba === 'historico' ? (
                <section className="dk-paper" style={{ flexBasis: '100%' }}>
                  {contact.data.history.length === 0 ? (
                    <div className="dk-comments-empty" style={{ minHeight: 120 }}>
                      Não há mensagens nos últimos 90 dias.
                    </div>
                  ) : (
                    contact.data.history.map((h) => (
                      <button
                        key={h.id}
                        type="button"
                        className="dk-history-item dk-history-button"
                        aria-current={h.id === ticketId ? 'true' : undefined}
                        onClick={() => id && openContact(id, h.id)}
                      >
                        <b>Ticket {ticketNumber(h.sequentialId)}</b>
                        <span>{h.filaNome ?? 'Transferência direta'}</span>
                        <small>
                          {situationLabel(h)}
                          {h.encerradaEm ? ` · ${dataAbreviada(new Date(h.encerradaEm))}` : ''}
                        </small>
                      </button>
                    ))
                  )}
                </section>
              ) : (
                <section className="dk-paper" style={{ flexBasis: '100%' }}>
                  <h3 className="dk-paper-title">Contato</h3>
                  <ContactField
                    rotulo="Nome"
                    value={contact.data.contact.nome}
                    empty="Nenhum nome cadastrado"
                  />
                  <ContactField
                    rotulo="Telefone"
                    value={contact.data.contact.telefone}
                    empty="Nenhum telefone cadastrado"
                  />
                  <ContactField
                    rotulo="E-mail"
                    value={contact.data.contact.email}
                    empty="Nenhum e-mail cadastrado"
                  />
                  <ContactField rotulo="ID do usuário" value={contact.data.contact.id} empty="" />
                  <ContactField
                    rotulo="Documento"
                    value={contact.data.contact.document}
                    empty="Nenhum documento cadastrado"
                  />
                  {ticket.data ? (
                    <ContactField
                      rotulo="Canal"
                      value={channelOf(ticket.data.ticket.canalTipo).nome}
                      empty=""
                    />
                  ) : null}
                  {Object.keys(contact.data.contact.atributos).length > 0 ? (
                    <>
                      <h3 className="dk-paper-title">Dados Extras</h3>
                      {Object.entries(contact.data.contact.atributos).map(([k, v]) => (
                        <ContactField
                          key={k}
                          rotulo={k}
                          value={v === null || v === undefined ? '' : String(v)}
                          empty=""
                        />
                      ))}
                    </>
                  ) : null}
                </section>
              )}
            </div>
          </div>
        ) : (
          <div className="dk-panel-skeleton" aria-hidden="true">
            <div
              style={{ display: 'flex', gap: 36, justifyContent: 'center', margin: '16px 0 24px' }}
            >
              <div className="dk-esqueleto-barra" style={{ width: 65, margin: 0 }} />
              <div className="dk-esqueleto-barra" style={{ width: 65, margin: 0 }} />
            </div>
            <div className="dk-skeleton-paper" style={{ minHeight: 46, padding: 12 }}>
              <div className="dk-esqueleto-barra" style={{ width: '55%', margin: 0 }} />
            </div>
            <div className="dk-skeleton-paper">
              <div className="dk-esqueleto-barra" style={{ width: '50%' }} />
              <div className="dk-esqueleto-barra" style={{ width: '40%' }} />
              <div className="dk-esqueleto-barra" style={{ width: '25%' }} />
            </div>
            <div className="dk-skeleton-paper">
              <div className="dk-esqueleto-barra" style={{ width: '50%' }} />
              <div className="dk-esqueleto-barra" style={{ width: '40%' }} />
              <div className="dk-esqueleto-barra" style={{ width: '25%' }} />
            </div>
            <div className="dk-skeleton-paper" style={{ minHeight: 46, padding: 12 }}>
              <div className="dk-esqueleto-barra" style={{ width: '55%', margin: 0 }} />
            </div>
            <div className="dk-skeleton-paper" style={{ minHeight: 46, padding: 12 }}>
              <div className="dk-esqueleto-barra" style={{ width: '55%', margin: 0 }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface ContactRecord {
  id: string;
  nome: string | null;
  telefone: string | null;
  email: string | null;
  document: string | null;
  atributos: Record<string, unknown>;
}


function ContactField({
  rotulo,
  value,
  empty,
}: {
  rotulo: string;
  value: string | null;
  empty: string;
}) {
  return (
    <p className="dk-campo-perfil">
      <b>{rotulo}:</b>
      <span>{value || empty}</span>
    </p>
  );
}

/** Use `dd/mm/aaaa, HH:mm` for MFE `Última interação`. */
function dataCurta(d: Date): string {
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}


