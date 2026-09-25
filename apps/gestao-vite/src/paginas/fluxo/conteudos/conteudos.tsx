import { useRead } from '../../../lib/consulta';
import type { TemplateListed } from '@pipe/contracts';
import { ModuloShell, useContact } from '../contato';
import { TelaDeConteudos } from './tela';
import './conteudos.css';

/**
 * `/contents/messagetemplate` — estado `auth.application.detail.contents.messageTemplate`.
 * A casca de `contents` põe a `<aside class="detail-aside fl">` (397px, com os
 * dois cartões de navegação) ao lado do `#main-content-area`, como em
 * Configurações. A lista lê `template_mensagem` do canal do fluxo
 * (`lib/comunicacao.ts`); sem canal WhatsApp a origem mostra o
 * `unavailable-warning` (`isWhatsAppActive()`), e aqui é o mesmo critério.
 */
export function PageContents() {
  const { contact } = useContact();
  const read = useRead<{ channelId: string | null; modelos: TemplateListed[] }>(
    `/v1/management/flows/${contact.id}/content-items`,
  );
  return (
    <ModuloShell ativo="Conteúdos">
      {read.data ? (
        <TelaDeConteudos
          modelos={read.data.modelos}
          temWhatsapp={read.data.channelId !== null}
          channelId={read.data.channelId}
        />
      ) : null}
    </ModuloShell>
  );
}
