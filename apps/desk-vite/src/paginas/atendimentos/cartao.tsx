import type { ConversaDaLista } from '@pipe/contracts';
import { LogoPortal } from '../../componentes/icones-portal';
import { IconeDesk } from '../../componentes/icones-desk';
import { Avatar } from '../../componentes/avatar';
import { canalDe, numeroDoTicket } from '../../lib/canal';
import { cronometro, horarioRelativo } from '../../lib/formato';
import { naoLida, nomeDeExibicao } from '../../lib/ordem';

/**
 * O cartão da lista — o `<article class="chat-list-item">` da referência
 * (`~/desk-clone/capturas/parciais/card-lista.html` e
 * `templates/chat-list-item.html`), na mesma ordem:
 *
 * seção de cima (`.ticket-content`): coluna do rosto (avatar `small` com o
 * selo do canal por cima) e coluna do texto em três linhas — nome + horário
 * relativo (+ ícone de situação), prévia da última mensagem + a linha de
 * alertas (ficha "Novo", cronômetro do modo de espera, não lidas);
 * seção de baixo (`.ticket-info`): ícone de info, "#N", "Fila: x" e o menu ⋮.
 *
 * Nome e prévia engrossam quando há não lida (`bold="bold"`).
 */
export function Cartao({
  conversa,
  selecionada,
  agora,
  aoAbrir,
}: {
  conversa: ConversaDaLista;
  selecionada: boolean;
  agora: Date;
  aoAbrir: (id: string) => void;
}) {
  const canal = canalDe(conversa.canalTipo);
  const nome = nomeDeExibicao(conversa);
  const naoLidaAgora = naoLida(conversa);
  const nova = conversa.primeiraRespostaEm === null;
  const emEspera = conversa.estado === 'em_espera';
  const segundosEmEspera =
    emEspera && conversa.emEsperaDesde
      ? (agora.getTime() - new Date(conversa.emEsperaDesde).getTime()) / 1000
      : 0;
  const ultima = conversa.ultimaMensagemEm ? new Date(conversa.ultimaMensagemEm) : null;

  return (
    <article
      className="dk-cartao"
      role="listitem"
      tabIndex={0}
      aria-label={`Ticket ${numeroDoTicket(conversa.id)} - ${nome}`}
      aria-current={selecionada ? 'true' : undefined}
      data-nao-lida={naoLidaAgora ? 'true' : 'false'}
      onClick={() => aoAbrir(conversa.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') aoAbrir(conversa.id);
      }}
    >
      <section className="dk-cartao-conteudo" tabIndex={-1}>
        <div className="dk-cartao-rosto">
          <Avatar />
          <span className="dk-canal" title={canal.nome}>
            <LogoPortal nome={canal.logo} tamanho={20} />
          </span>
        </div>
        <div className="dk-cartao-texto">
          <div className="dk-cartao-linha">
            <h1 className="dk-cartao-nome" aria-hidden="true">
              {nome}
            </h1>
            <span className="dk-cartao-hora">
              {ultima ? horarioRelativo(ultima, agora) : ''}
              {conversa.estado === 'encerrada' ? (
                <span className="dk-cartao-situacao" title="Cliente encerrou o atendimento">
                  <IconeDesk nome="encerrado-pelo-cliente" />
                </span>
              ) : null}
            </span>
          </div>
          <div className="dk-cartao-linha">
            <p className="dk-cartao-previa" aria-hidden="true">
              {previa(conversa)}
            </p>
            <div className="dk-cartao-alertas">
              {nova ? <span className="dk-chip dk-chip-info">Novo</span> : null}
              {emEspera ? (
                <span className="dk-chip dk-chip-alerta" title="Em espera">
                  <IconeDesk nome="pausa" />
                  {cronometro(segundosEmEspera).slice(3)}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </section>
      <section className="dk-cartao-info">
        <button
          type="button"
          className="dk-cartao-info-botao"
          tabIndex={-1}
          aria-label="Informações do ticket"
          onClick={(e) => e.stopPropagation()}
        >
          <IconeDesk nome="info" />
        </button>
        <span className="dk-cartao-numero" aria-hidden="true">
          {numeroDoTicket(conversa.id)}
        </span>
        <span className="dk-cartao-fila">
          <b>Fila:</b>
          <span>{conversa.filaNome ?? 'Transferência direta'}</span>
        </span>
        <button
          type="button"
          className="dk-cartao-menu"
          aria-label="Mais opções"
          onClick={(e) => e.stopPropagation()}
        >
          <IconeDesk nome="mais-opcoes" />
        </button>
      </section>
    </article>
  );
}

/** A prévia (`message-preview`): o texto, ou o tipo por extenso quando é mídia. */
function previa(c: ConversaDaLista): string {
  if (c.ultimaMensagemTipo && c.ultimaMensagemTipo !== 'texto') {
    const tipos: Record<string, string> = {
      imagem: 'Imagem',
      audio: 'Áudio',
      video: 'Vídeo',
      documento: 'Arquivo',
      template: c.ultimaMensagem ?? 'Modelo de mensagem',
    };
    return tipos[c.ultimaMensagemTipo] ?? c.ultimaMensagem ?? '';
  }
  return c.ultimaMensagem ?? '';
}
