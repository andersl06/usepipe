import { useLeitura } from '../../../lib/consulta';
import type { ModeloListado } from '@pipe/contracts';
import { CascaDoModulo, useContato } from '../contato';
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
export function PaginaConteudos() {
  const { contato } = useContato();
  const leitura = useLeitura<{ canalId: string | null; modelos: ModeloListado[] }>(
    `/v1/gestao/fluxos/${contato.id}/conteudos`,
  );
  return (
    <CascaDoModulo ativo="Conteúdos">
      {leitura.data ? (
        <TelaDeConteudos
          modelos={leitura.data.modelos}
          temWhatsapp={leitura.data.canalId !== null}
          canalId={leitura.data.canalId}
        />
      ) : null}
    </CascaDoModulo>
  );
}
