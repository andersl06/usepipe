import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { ManagementIcon } from '../../../components/icones-management';
import { IconePortal } from '../../../components/icones-portal';
import Link from '../../../components/link';
import { channelRoute, type TypeOfChannelOfBot } from '../../../lib/channel-of-flow';
import { ShellModule, contactBase, useContact } from '../contact';
import '../integrations/header-of-page.css';
import '../integrations/integrations.css';
import './channel-of-bot.css';

/**
 * The frame for ONE channel page inside the bot — templates 79961 (WhatsApp) and 230473 (Instagram) of `portal.js`, which share the same layout (`FICHA-conectar-canal-no-bot.md` §1.2–1.4):
 *
 *   <page-header back-button="…channels" page-title="{canal}">
 *   <bds-paper> <bds-grid direction="column" padding="2">
 *     <bds-grid direction="row"> <bds-tabs …/> <"Documentação" + external-file/> </bds-grid>
 *     <bds-tab-panel class="mt4 w-100"> … </bds-tab-panel>
 *
 * The back arrow returns to the bot's channel list. Tabs are links (each has a URL, the way the source's `bds-tab group` has state); `emBreve` draws the tab without a link, with the badge, for the one Pipe doesn't have internally yet.
 *
 * "Documentação" in the source opens Blip's help center (`whatsapp.documentationLink`). Pipe has no such address; the text and icon stay, without a destination (`aria-disabled`) — inventing a URL isn't reproducing the screen.
 */

export interface ChannelTab {
  rotulo: string;
  /** Empty is the index tab (the page's own URL). */
  segment: string;
  /** Only appears with the channel connected — the source tabs' `ng-show`. */
  exigeConectado?: boolean;
  emBreve?: boolean;
}

export function ChannelShell({
  tipo,
  titulo,
  abas,
  conectado,
  children,
}: {
  tipo: TypeOfChannelOfBot;
  titulo: string;
  abas: readonly ChannelTab[];
  conectado: boolean;
  children: ReactNode;
}) {
  const { contact } = useContact();
  const base = contactBase(contact.tipo, contact.id);
  const caminho = useLocation().pathname.replace(/\/$/, '');
  /** This page's URL; whatever comes after it is the tab. */
  const raiz = channelRoute(base, tipo);

  return (
    <ShellModule ativo="Canais">
      <header className="ph-cabecalho">
        <div className="ph-conteudo">
          <div className="ph-voltar-caixa">
            <Link className="ph-voltar" href={`${base}/channels`} aria-label="Voltar">
              <IconePortal nome="voltar" tamanho={22} />
            </Link>
          </div>
          <div className="ph-titulo-caixa">
            <h1 className="ph-titulo">{titulo}</h1>
          </div>
        </div>
      </header>

      <div className="ig-grade">
        <section className="ig-paper">
          <div className="ig-paper-core">
            <div className="cb-abas-linha">
              <nav className="ig-abas" role="tablist" aria-label={`Abas do canal ${titulo}`}>
                {abas
                  .filter((aba) => conectado || !aba.exigeConectado)
                  .map((aba) => {
                    if (aba.emBreve) {
                      return (
                        <span key={aba.rotulo} className="ig-aba cb-aba-obra" aria-disabled="true">
                          {aba.rotulo}
                          <span className="pt-obra-selo">em breve</span>
                        </span>
                      );
                    }
                    const href = aba.segment ? `${raiz}/${aba.segment}` : raiz;
                    const active = aba.segment ? caminho === href || caminho.startsWith(`${href}/`) : caminho === raiz;
                    return (
                      <Link
                        key={aba.rotulo}
                        href={href}
                        role="tab"
                        className="ig-aba cb-aba"
                        aria-selected={active}
                        aria-current={active ? 'page' : undefined}
                      >
                        {aba.rotulo}
                      </Link>
                    );
                  })}
              </nav>
              <span className="cb-doc" aria-disabled="true" title="Documentação: em breve">
                Documentação
                <ManagementIcon nome="externo" tamanho={16} />
              </span>
            </div>

            <div className="cb-panel">{children}</div>
          </div>
        </section>
      </div>
    </ShellModule>
  );
}
