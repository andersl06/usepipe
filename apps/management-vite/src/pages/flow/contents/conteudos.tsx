import { useRead } from '../../../lib/query';
import type { TemplateListed } from '@pipe/contracts';
import { ModuloShell, useContact } from '../contact';
import { TelaDeConteudos } from './tela';
import './conteudos.css';

/**
 * `/contents/messagetemplate` — state `auth.application.detail.contents.messageTemplate`. The `contents` shell places the `<aside class="detail-aside fl">` (397px, with the two navigation cards) next to `#main-content-area`, as in Configurações. The list reads `template_mensagem` from the flow's channel (`lib/comunicacao.ts`); without a WhatsApp channel the origin shows the `unavailable-warning` (`isWhatsAppActive()`), and here the same criterion applies.
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
