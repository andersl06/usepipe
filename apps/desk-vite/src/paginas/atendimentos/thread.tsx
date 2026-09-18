import { useEffect, useRef, useState } from 'react';
import type { ItemDaConversa } from '@pipe/contracts';
import { IconeDesk } from '../../componentes/icones-desk';
import { horarioDoBalao } from '../../lib/formato';
import { agrupar, sinalDeEntrega, type Mensagem } from '../../lib/grupos';
import { numeroDoTicket } from '../../lib/canal';

/**
 * A thread — o `message-list--panechat` da referência
 * (`~/desk-clone/capturas/parciais/thread.html`): `.card-group-container`
 * com `.blip-message-group > .blip-card-group.left|right`, cada balão num
 * `.blip-card` e o horário do grupo (`.group-notification`) embaixo, do lado
 * de quem fala — na saída, com o sinal de entrega antes da hora. A linha de
 * abertura do ticket (`.ticket .fancy` + `h3`) vem antes das mensagens.
 *
 * O botão "voltar ao fim" aparece quando a rolagem está a mais de 150px do
 * fim (`MINIMUM_SCROLL_DISTANCE` do settings.json de lá).
 */
export function Thread({
  conversaId,
  itens,
  agora,
  aoReenviar,
  somenteLeitura = false,
}: {
  conversaId: string;
  itens: ItemDaConversa[];
  agora: Date;
  aoReenviar?: (mensagemId: string) => void;
  somenteLeitura?: boolean;
}) {
  const rolador = useRef<HTMLDivElement>(null);
  const [longeDoFim, setLongeDoFim] = useState(false);
  const grupos = agrupar(itens);

  /* Começa no fim (`startBottom`) e volta ao fim a cada mensagem nova. */
  useEffect(() => {
    const el = rolador.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [conversaId, itens.length]);

  function aoRolar() {
    const el = rolador.current;
    if (!el) return;
    setLongeDoFim(el.scrollHeight - el.scrollTop - el.clientHeight > 150);
  }

  return (
    <div className="dk-conversa-corpo">
      <div className="dk-thread" ref={rolador} onScroll={aoRolar} tabIndex={-1}>
        <div className="dk-thread-miolo">
          <div className="dk-ticket-linha">
            <p>
              <span>Ticket {numeroDoTicket(conversaId)}</span>
            </p>
          </div>
          {grupos.map((g, i) =>
            g.genero === 'nota' ? (
              <div key={g.nota.id} className="dk-nota">
                <b>{g.nota.autor ?? 'Nota interna'}</b>
                {g.nota.corpo}
              </div>
            ) : (
              <GrupoDeBaloes
                key={g.mensagens[0]?.id ?? i}
                direcao={g.direcao}
                mensagens={g.mensagens}
                agora={agora}
                aoReenviar={somenteLeitura ? undefined : aoReenviar}
              />
            ),
          )}
        </div>
      </div>
      {longeDoFim ? (
        <button
          type="button"
          className="dk-voltar-fim"
          aria-label="Ir para o fim da conversa"
          onClick={() => {
            const el = rolador.current;
            if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
          }}
        >
          <IconeDesk nome="seta-baixo" />
        </button>
      ) : null}
    </div>
  );
}

function GrupoDeBaloes({
  direcao,
  mensagens,
  agora,
  aoReenviar,
}: {
  direcao: 'entrada' | 'saida';
  mensagens: Mensagem[];
  agora: Date;
  aoReenviar?: (mensagemId: string) => void;
}) {
  const ultima = mensagens[mensagens.length - 1];
  const sinal = direcao === 'saida' ? sinalDeEntrega(mensagens) : null;
  return (
    <div className={`dk-grupo ${direcao === 'saida' ? 'dk-grupo-saida' : 'dk-grupo-entrada'}`}>
      {mensagens.map((m) => (
        <div
          key={m.id}
          className="dk-balao-caixa"
          data-falhou={m.estadoEntrega === 'falhou' ? 'true' : 'false'}
        >
          <div
            className="dk-balao"
            tabIndex={0}
            aria-label={`${horarioDoBalao(new Date(m.criadaEm), agora)} ${direcao === 'entrada' ? 'Cliente diz:' : 'Agente diz:'} ${m.conteudo ?? ''}`}
          >
            <Conteudo mensagem={m} />
          </div>
          {m.estadoEntrega === 'falhou' && aoReenviar ? (
            <button
              type="button"
              className="dk-balao-falha"
              title={m.erroTexto ?? 'Falha ao enviar a mensagem.'}
              aria-label="Falha ao enviar a mensagem. Reenviar"
              onClick={() => aoReenviar(m.id)}
            >
              <IconeDesk nome="erro" />
            </button>
          ) : null}
        </div>
      ))}
      <div className="dk-grupo-hora" data-entrega={sinal ?? undefined} aria-hidden="true">
        {sinal === 'relogio' ? <IconeDesk nome="relogio" /> : null}
        {sinal === 'check' ? <IconeDesk nome="check" /> : null}
        {sinal === 'duplo-check' || sinal === 'lida' ? <IconeDesk nome="duplo-check" /> : null}
        {sinal === 'erro' ? <IconeDesk nome="erro" /> : null}
        {ultima ? horarioDoBalao(new Date(ultima.criadaEm), agora) : ''}
      </div>
    </div>
  );
}

/** O miolo do balão: texto (`plain-text`), ou o tipo por extenso quando é mídia. */
function Conteudo({ mensagem }: { mensagem: Mensagem }) {
  if (mensagem.tipo === 'texto' || mensagem.tipo === 'template' || !mensagem.tipo) {
    return <div>{mensagem.conteudo ?? ''}</div>;
  }
  if (mensagem.tipo === 'imagem' && mensagem.conteudo?.startsWith('http')) {
    return (
      <img
        src={mensagem.conteudo}
        alt="Imagem enviada"
        style={{ maxWidth: '100%', borderRadius: 8 }}
      />
    );
  }
  const rotulos: Record<string, string> = {
    imagem: 'Imagem',
    audio: 'Mensagem de áudio',
    video: 'Vídeo',
    documento: 'Arquivo',
  };
  return (
    <div>
      {rotulos[mensagem.tipo] ?? 'Conteúdo não suportado'}
      {mensagem.conteudo?.startsWith('http') ? (
        <>
          {' '}
          <a href={mensagem.conteudo} target="_blank" rel="noreferrer">
            abrir
          </a>
        </>
      ) : null}
    </div>
  );
}
