import type { ItemOfConversation, PassagemDoBot } from '@pipe/contracts';
import { Modal } from '@pipe/ui/modal';
import { useRead } from '../../lib/query';
import { dataAbreviada } from '../../lib/format';
import { caminhoDaPassagem, resumoDaPassagem } from '../../lib/historico-contato';
import { Thread } from './thread';

/** Linha do histórico para uma passagem do contato pelo bot que nunca virou ticket. */
export function LinhaPassagemDoBot({
  passagem,
  aoAbrir,
}: {
  passagem: PassagemDoBot;
  aoAbrir: () => void;
}) {
  return (
    <button type="button" onClick={aoAbrir} className="dk-history-item dk-history-button">
      <b>Conversa com o bot</b>
      <span>{resumoDaPassagem(passagem)}</span>
      <small>{dataAbreviada(new Date(passagem.iniciadaEm))}</small>
    </button>
  );
}

/** Mensagens de uma passagem pelo bot, somente leitura. */
export function ModalPassagemDoBot({
  contactId,
  passagem,
  aoFechar,
}: {
  contactId: string;
  passagem: PassagemDoBot;
  aoFechar: () => void;
}) {
  const leitura = useRead<{ itens: ItemOfConversation[] }>(caminhoDaPassagem(contactId, passagem));

  return (
    <Modal skin={{ fundo: 'dk-veu', caixa: 'dk-modal dk-modal-passagem' }} rotuloId="passagem-titulo" onFechar={aoFechar}>
      <h2 id="passagem-titulo">Conversa com o bot · {dataAbreviada(new Date(passagem.iniciadaEm))}</h2>
      {leitura.isPending ? <div className="dk-girando dk-girando-pequeno" /> : null}
      {leitura.isError ? (
        <p className="dk-error" role="alert">
          Não foi possível carregar as mensagens: {leitura.error.message}
        </p>
      ) : null}
      {leitura.data && leitura.data.itens.length === 0 ? (
        <div className="dk-comments-empty" style={{ minHeight: 120 }}>
          Não há mensagens nesta conversa.
        </div>
      ) : null}
      {leitura.data && leitura.data.itens.length > 0 ? (
        <div className="dk-passagem-corpo">
          <Thread
            conversationId={passagem.id}
            titulo="Conversa com o bot"
            itens={leitura.data.itens}
            agora={new Date()}
            onlyRead
          />
        </div>
      ) : null}
      <div className="dk-modal-actions">
        <button type="button" className="dk-botao" onClick={aoFechar}>
          Fechar
        </button>
      </div>
    </Modal>
  );
}
