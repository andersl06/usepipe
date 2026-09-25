import Link from '../../../components/link';
import { IconePortal } from '../../../components/icones-portal';
import { useRead } from '../../../lib/query';
import type { ContactListed } from '@pipe/contracts';
import { contactBase, useContact } from '../contact';
import {
  formatPeriodLimit,
  formatarUltimaInteraction,
  periodDefault,
  countRotulo,
  channelRotulo,
} from './regras';

/* Estrutura do template `users-content-view` da origem (portal.js, módulo 2753):
   lateral `.static-sidebar` com cabeçalho escuro (Filtros + Aplicar) e corpo com o
   `user-dimension` (botão tracejado "+ Adicionar filtros"); à direita `page-header`
   (Contatos + recarregar), `#contacts-filter` (contagem + `blip-daterange-picker`)
   e a lista de `card.card--mini-card.user-card`. */
export function BotListaContacts() {
  const { contact: bot } = useContact();
  const id = bot.id;
  const base = contactBase(bot.tipo, id);
  const read = useRead<ContactListed[]>(`/v1/management/flows/${id}/contacts`);
  const contacts = read.data ?? [];
  const period = periodDefault(new Date());
  return (
    <div className="ct-listagem">
      <aside className="ct-filtros">
        <header className="ct-filtros-cabeca">
          <span className="ct-filtros-titulo">Filtros</span>
          {/* ponytail: filtros por dimensão não têm backend; o botão nasce desabilitado como na origem. */}
          <button className="ct-aplicar" type="button" disabled>
            Aplicar
          </button>
        </header>
        <div className="ct-filtros-corpo">
          <div className="ct-dimensao">
            <button className="ct-adicionar-filtro" type="button">
              + Adicionar filtros
            </button>
          </div>
        </div>
      </aside>
      <div className="ct-espaco-lateral" />
      <section className="ct-usuarios">
        <div className="ct-cabeca">
          <div className="ct-cabeca-secao">
            <div className="ct-cabeca-conteudo">
              <div className="ct-cabeca-titulo">
                <h1>Contatos</h1>
              </div>
              <div className="ct-cabeca-acoes">
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
          <div className="ct-filtro-contatos">
            <div className="ct-contagem">
              <span>{countRotulo(contacts.length)}</span>
            </div>
            {/* ponytail: o seletor de período é só visual; o filtro por data não tem backend. */}
            <div className="ct-periodo" aria-label="Período">
              <span className="ct-periodo-icone">
                <IconePortal nome="calendario" tamanho={21} />
              </span>
              <input
                className="ct-periodo-data"
                aria-label="Data inicial"
                readOnly
                value={formatPeriodLimit(period.inicio)}
              />
              <span>~</span>
              <input
                className="ct-periodo-data"
                aria-label="Data final"
                readOnly
                value={formatPeriodLimit(period.fim)}
              />
            </div>
          </div>
          {contacts.length === 0 ? (
            <div className="ct-sem-contatos">Nenhum contato encontrado</div>
          ) : (
            <div className="ct-cartoes">
              {contacts.map((contact) => (
                <Link
                  className="ct-usuario"
                  href={`${base}/contacts/${contact.id}`}
                  key={contact.id}
                >
                  <span className="ct-secao ct-secao-avatar">
                    <span className="ct-avatar">
                      {contact.avatarUrl ? (
                        <img src={contact.avatarUrl} alt="" />
                      ) : (
                        <IconePortal nome="avatar" tamanho={32} />
                      )}
                    </span>
                  </span>
                  <span className="ct-secao ct-secao-nome">
                    <span className="ct-nome">{contact.nome ?? '-'}</span>
                    <span className="ct-ultima-interacao">
                      <span>Última interação:</span>&nbsp;
                      <span>
                        {formatarUltimaInteraction(
                          contact.lastConversation ? new Date(contact.lastConversation) : null,
                        )}
                      </span>
                    </span>
                  </span>
                  <span className="ct-divisor" />
                  <span className="ct-secao ct-secao-canal">
                    <span className="ct-canal-rotulo">Canal</span>
                    <span className="ct-canal-valor">
                      {channelRotulo(contact.canalTipo, contact.canalNome)}
                    </span>
                  </span>
                  <span className="ct-secao ct-secao-teste" />
                  <span className="ct-secao ct-secao-abrir">
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
