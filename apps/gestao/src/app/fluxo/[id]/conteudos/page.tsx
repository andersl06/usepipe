import { notFound } from 'next/navigation';
import { UUID } from '../barra-do-contato';
import { carregarCanalDoFluxo, carregarModelos } from '../../../../lib/comunicacao';
import { TelaDeConteudos } from './tela';
import { CascaDoModulo } from '../casca-do-modulo';
import './conteudos.css';

export const dynamic = 'force-dynamic';

/**
 * `/contents/messagetemplate` — estado `auth.application.detail.contents.messageTemplate`.
 * A casca de `contents` põe a `<aside class="detail-aside fl">` (397px, com os
 * dois cartões de navegação) ao lado do `#main-content-area`, como em
 * Configurações. A lista lê `template_mensagem` do canal do fluxo
 * (`lib/comunicacao.ts`); sem canal WhatsApp a origem mostra o
 * `unavailable-warning` (`isWhatsAppActive()`), e aqui é o mesmo critério.
 */
export default async function PaginaConteudos({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const canalId = await carregarCanalDoFluxo(id);
  const modelos = canalId ? await carregarModelos(canalId) : [];
  return (
    <CascaDoModulo id={id} ativo="Conteúdos">
      <TelaDeConteudos modelos={modelos} temWhatsapp={canalId !== null} />
    </CascaDoModulo>
  );
}
