import { useLayoutEffect, useRef, useState } from 'react';
import { Campo, Etiqueta, Icone } from '@pipe/ui';
import { IconeManagement } from '../../componentes/icones-gestao';
import { IconePortal } from '../../componentes/icones-portal';
import { Selection } from '../../componentes/selecao';
import type { Block, EditorInbound, ItemDeConteudo } from './modelo';
import { ehAttendance, newInbound } from './modelo';
import {
  LIMITE_DO_MENU,
  LIMITE_DO_QUICK_REPLY,
  RULES_OF_VALIDATION,
  ROTULOS_DO_CONTEUDO,
  adicionarConteudo,
  cardsOf,
  definirInbound,
  definirEspera,
  definirMenu,
  definirTexto,
  moverConteudo,
  novoMenu,
  novoQuickReply,
  novoTexto,
  removerConteudo,
  temInbound,
  validationWithRule,
} from './conteudo';
import type { Card, MenuOption } from './conteudo';

/**
 * A aba "Conteúdo" do editor: a conversa do bloco em cartões — as falas do
 * robô à esquerda (Texto, Menu, Quick reply), a "Entrada do usuário" à direita
 * — e o "+" que oferece os tipos. Cada cartão edita no lugar; a entrada abre
 * o painel dela: "Salvar resposta em variável" (com o campo "Variável"),
 * "Validar a entrada do usuário" ("Tipo de validação", "Expressão regular",
 * "Instrução de validação") e a escolha entre "Aguardar resposta" e "Não
 * aguardar".
 *
 * No bloco de atendimento a aba se chama "Atendimento" e só tem a entrada,
 * que espera o fim do atendimento — nada a editar além da variável.
 */

export function ContentPanel({
  block,
  onMudar,
  onAviso,
}: {
  block: Block;
  onMudar: (block: Block) => void;
  onAviso: (texto: string) => void;
}) {
  const cards = cardsOf(block);
  const [menuAberto, setMenuAberto] = useState(false);
  const [selecionado, setSelecionado] = useState<number | null>(null);
  const conteudo = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (selecionado !== null) conteudo.current?.closest('.bl-painel-corpo')?.scrollTo(0, 0);
  }, [selecionado]);
  const [alterarEspera, setAlterarEspera] = useState(false);
  const attendance = ehAttendance(block.id);
  const raiz = !!block.root;

  function adicionar(item: ItemDeConteudo): void {
    setMenuAberto(false);
    const r = adicionarConteudo(block, item);
    if (r.ok) {
      onMudar(r.block);
      setSelecionado(r.block.$contentActions?.indexOf(item) ?? null);
    } else onAviso(r.error);
  }

  return (
    <div ref={conteudo} className="bl-aba-corpo bl-conteudo-bloco">
      <span className="bl-conteudo-contador">
        {cards.filter((c) => c.tipo !== 'entrada' && c.tipo !== 'digitando').length}/25
      </span>
      {raiz ? (
        <div className="bl-conteudo-introducao">
          <h4>Início</h4>
          <p>
            A conversa do seu chatbot sempre inicia através da <em>Entrada do usuário</em>. Crie
            novos blocos para adicionar conteúdos e desenvolva uma conversa com seu cliente.
          </p>
        </div>
      ) : null}
      {attendance ? (
        <div className="bl-conteudo-introducao">
          <h4>Atendimento humano</h4>
          <p>Este bloco encaminhará a conversa para a sua fila de atendimento.</p>
          <p>
            Para utilizar este recurso, você precisará ativar a integração com o{' '}
            <strong>Blip Desk</strong>.
          </p>
          <small>v.{block.deskStateVersion ?? '3.0.0'}</small>
        </div>
      ) : null}
      <div className="bl-conversa-conteudo bl-lista-de-cartoes">
        {!attendance
          ? cards.map((c) => (
              <div
                key={c.indice}
                className={`bl-previa-linha${c.tipo === 'entrada' ? ' bl-previa-linha--entrada' : ''}`}
              >
                <button
                  type="button"
                  className="bl-previa-conteudo"
                  onClick={() => setSelecionado(c.indice)}
                >
                  {c.tipo === 'entrada'
                    ? raiz
                      ? ROTULOS_DO_CONTEUDO.inbound
                      : c.inbound.bypass
                        ? ROTULOS_DO_CONTEUDO.direto
                        : ROTULOS_DO_CONTEUDO.aguardando
                    : c.tipo === 'outro'
                      ? c.mime
                      : c.tipo === 'digitando'
                        ? ROTULOS_DO_CONTEUDO.digitando
                        : c.texto || ROTULOS_DO_CONTEUDO[c.tipo]}
                  {c.tipo === 'menu' || c.tipo === 'quickReply' ? (
                    <span className="bl-previa-opcoes">
                      {c.options.map((o, i) => (
                        <span key={i}>{o.text}</span>
                      ))}
                    </span>
                  ) : null}
                </button>
                {c.tipo === 'entrada' && !raiz ? (
                  <div className="bl-espera-controle">
                    <span>
                      {c.inbound.bypass
                        ? ROTULOS_DO_CONTEUDO.naoAguardar
                        : ROTULOS_DO_CONTEUDO.aguardar}
                    </span>
                    <button
                      type="button"
                      className="bl-alterar"
                      aria-expanded={alterarEspera}
                      onClick={() => setAlterarEspera(!alterarEspera)}
                    >
                      (Alterar)
                    </button>
                    {alterarEspera ? (
                      <div className="bl-menu-acoes">
                        {[true, false].map((aguardar) => (
                          <button
                            type="button"
                            key={String(aguardar)}
                            onClick={() => {
                              onMudar(definirEspera(block, aguardar));
                              setAlterarEspera(false);
                            }}
                          >
                            {aguardar
                              ? ROTULOS_DO_CONTEUDO.aguardar
                              : ROTULOS_DO_CONTEUDO.naoAguardar}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))
          : null}
      </div>

      {!raiz && !attendance ? (
        <div className="bl-adicionar-acao bl-adicionar-conteudo">
          <button type="button" className="bl-mais" onClick={() => setMenuAberto((v) => !v)}>
            + {ROTULOS_DO_CONTEUDO.adicionar}
          </button>
          {menuAberto ? (
            <div className="bl-menu-acoes" role="menu">
              <button type="button" role="menuitem" onClick={() => adicionar(novoTexto())}>
                {ROTULOS_DO_CONTEUDO.texto}
              </button>
              <button type="button" role="menuitem" onClick={() => adicionar(novoMenu())}>
                {ROTULOS_DO_CONTEUDO.menu}
              </button>
              <button type="button" role="menuitem" onClick={() => adicionar(novoQuickReply())}>
                {ROTULOS_DO_CONTEUDO.quickReply}
              </button>
              {!temInbound(block) ? (
                <button type="button" role="menuitem" onClick={() => adicionar(newInbound())}>
                  {ROTULOS_DO_CONTEUDO.inbound}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      <a
        className="bl-conteudo-ajuda"
        href="https://help.blip.ai/hc/pt-br/articles/4474418203287-Criando-mensagens-interativas-no-WhatsApp"
        target="_blank"
        rel="noreferrer"
      >
        Entenda como funcionam os tipos de conteúdo
      </a>
      {selecionado !== null && cards.some((c) => c.indice === selecionado) ? (
        <section className="bl-detalhe" aria-label="Detalhes do conteúdo">
          <header className="bl-detalhe-cabecalho">
            <button
              type="button"
              className="iconbtn"
              aria-label="Voltar para conteúdo"
              onClick={() => setSelecionado(null)}
            >
              <IconePortal nome="voltar" tamanho={24} />
            </button>
            <h4>
              {(() => {
                const c = cards.find((c) => c.indice === selecionado)!;
                return c.tipo === 'outro' ? c.mime : ROTULOS_DO_CONTEUDO[c.tipo];
              })()}
            </h4>
          </header>
          <ContentCard
            card={cards.find((c) => c.indice === selecionado)!}
            block={block}
            fixo={raiz || attendance}
            first={selecionado === 0}
            ultimo={selecionado === cards.length - 1}
            onMudar={onMudar}
          />
        </section>
      ) : null}
    </div>
  );
}

function ContentCard({
  card,
  block,
  fixo,
  first,
  ultimo,
  onMudar,
}: {
  card: Card;
  block: Block;
  /** Início e atendimento: a entrada não sai nem se troca por "Não aguardar". */
  fixo: boolean;
  first: boolean;
  ultimo: boolean;
  onMudar: (block: Block) => void;
}) {
  const i = card.indice;
  const inbound = card.tipo === 'entrada';
  const order =
    inbound || fixo ? null : (
      <span className="bl-saida-ordem">
        <button
          type="button"
          className="iconbtn"
          title="Subir"
          aria-label="Subir"
          disabled={first}
          onClick={() => onMudar(moverConteudo(block, i, i - 1))}
        >
          <Icone nome="cima" tamanho={16} />
        </button>
        <button
          type="button"
          className="iconbtn"
          title="Descer"
          aria-label="Descer"
          disabled={ultimo || block.$contentActions?.[i + 1]?.input !== undefined}
          onClick={() => onMudar(moverConteudo(block, i, i + 1))}
        >
          <Icone nome="baixo" tamanho={16} />
        </button>
      </span>
    );
  const excluir =
    fixo && inbound ? null : (
      <button
        type="button"
        className="iconbtn"
        title="Excluir"
        aria-label="Excluir"
        onClick={() => onMudar(removerConteudo(block, i))}
      >
        <IconeManagement nome="lixeira" tamanho={18} />
      </button>
    );

  switch (card.tipo) {
    case 'texto':
      return (
        <article className="bl-cartao bl-cartao--robo">
          <header>
            <b>{ROTULOS_DO_CONTEUDO.texto}</b>
            {order}
            {excluir}
          </header>
          <textarea
            className="campo bl-campo-longo"
            rows={3}
            value={card.texto}
            placeholder="Digite a mensagem"
            onChange={(e) => onMudar(definirTexto(block, i, e.target.value))}
          />
        </article>
      );
    case 'menu':
    case 'quickReply': {
      const menu = card.tipo === 'menu';
      const limite = menu ? LIMITE_DO_MENU : LIMITE_DO_QUICK_REPLY;
      const switchOptions = (options: MenuOption[]): void =>
        onMudar(definirMenu(block, i, card.texto, options));
      return (
        <article className="bl-cartao bl-cartao--robo">
          <header>
            <b>{menu ? ROTULOS_DO_CONTEUDO.menu : ROTULOS_DO_CONTEUDO.quickReply}</b>
            {order}
            {excluir}
          </header>
          <textarea
            className="campo bl-campo-longo"
            rows={2}
            value={card.texto}
            placeholder="Texto do menu"
            onChange={(e) => onMudar(definirMenu(block, i, e.target.value, card.options))}
          />
          <ol className="bl-opcoes">
            {card.options.map((o, j) => (
              <li key={j}>
                <Campo
                  value={o.text}
                  maxLength={limite.caracteres}
                  placeholder={`Opção ${j + 1}`}
                  onChange={(e) =>
                    switchOptions(
                      card.options.map((x, k) => (k === j ? { ...x, text: e.target.value } : x)),
                    )
                  }
                />
                <button
                  type="button"
                  className="iconbtn"
                  title="Remover opção"
                  aria-label="Remover opção"
                  onClick={() => switchOptions(card.options.filter((_, k) => k !== j))}
                >
                  <Icone nome="x" tamanho={14} />
                </button>
              </li>
            ))}
          </ol>
          <button
            type="button"
            className="bl-mais"
            disabled={card.options.length >= limite.opcoes}
            onClick={() => switchOptions([...card.options, { text: '' }])}
          >
            + Adicionar opção
          </button>
          <p className="bl-ajuda">
            {menu ? ROTULOS_DO_CONTEUDO.limiteDoMenu : ROTULOS_DO_CONTEUDO.limiteDoQuickReply}
          </p>
        </article>
      );
    }
    case 'entrada':
      return (
        <InboundCard inbound={card.inbound} block={block} fixo={fixo} onMudar={onMudar} />
      );
    case 'digitando':
      return (
        <article className="bl-cartao bl-cartao--robo bl-cartao--apagado">
          <header>
            <b>{ROTULOS_DO_CONTEUDO.digitando}</b>
            {order}
            {excluir}
          </header>
          <p className="sub">Roda sem efeito no Pipe.</p>
        </article>
      );
    case 'outro':
      return (
        <article className="bl-cartao bl-cartao--robo bl-cartao--apagado">
          <header>
            <b>{card.mime}</b>
            {order}
            {excluir}
          </header>
          {!card.suportado ? (
            <Etiqueta tom="alert">{ROTULOS_DO_CONTEUDO.naoSuportado}</Etiqueta>
          ) : null}
        </article>
      );
  }
}

function InboundCard({
  inbound,
  block,
  fixo,
  onMudar,
}: {
  inbound: EditorInbound;
  block: Block;
  fixo: boolean;
  onMudar: (block: Block) => void;
}) {
  const validando = !!inbound.validation;
  const aguardando = !inbound.bypass;
  const switch = (nova: EditorInbound): void => onMudar(definirInbound(block, nova));

  return (
    <article className="bl-cartao bl-cartao--cliente">
      <header>
        <b>{ROTULOS_DO_CONTEUDO.inbound}</b>
        <span className="sub">
          {aguardando ? ROTULOS_DO_CONTEUDO.aguardando : ROTULOS_DO_CONTEUDO.direto}
        </span>
      </header>
      {
        <div className="bl-entrada">
          {!fixo ? (
            <div className="bl-escolha" role="radiogroup" aria-label="Espera">
              <label>
                <input
                  type="radio"
                  checked={aguardando}
                  onChange={() => onMudar(definirEspera(block, true))}
                />{' '}
                {ROTULOS_DO_CONTEUDO.aguardar}
              </label>
              <label>
                <input
                  type="radio"
                  checked={!aguardando}
                  onChange={() => onMudar(definirEspera(block, false))}
                />{' '}
                {ROTULOS_DO_CONTEUDO.naoAguardar}
              </label>
            </div>
          ) : null}

          <section className="bl-secao">
            <h5 className="bl-secao-subtitulo">{ROTULOS_DO_CONTEUDO.salvarEmVariavel}</h5>
            <p className="bl-ajuda">{ROTULOS_DO_CONTEUDO.salvarEmVariavelInfo}</p>
            <label className="bl-campo">
              <span className="sub">{ROTULOS_DO_CONTEUDO.variavel}</span>
              <Campo
                value={inbound.variable ?? ''}
                placeholder="nomeDaVariavel"
                onChange={(e) => switch({ ...inbound, variable: e.target.value || null })}
              />
            </label>
          </section>

          {aguardando && !ehAttendance(block.id) ? (
            <section className="bl-secao">
              <label className="form-caixa">
                <input
                  type="checkbox"
                  checked={validando}
                  onChange={(e) =>
                    switch({
                      ...inbound,
                      validation: e.target.checked
                        ? validationWithRule(inbound.validation, 'text')
                        : null,
                    })
                  }
                />
                <span className="bl-secao-subtitulo">{ROTULOS_DO_CONTEUDO.validar}</span>
              </label>
              {inbound.validation ? (
                <>
                  <label className="bl-campo">
                    <span className="sub">{ROTULOS_DO_CONTEUDO.tipoDeValidacao}</span>
                    <Selection
                      value={inbound.validation.rule}
                      onChange={(e) =>
                        switch({
                          ...inbound,
                          validation: validationWithRule(inbound.validation, e.target.value),
                        })
                      }
                    >
                      {RULES_OF_VALIDATION.map((r) => (
                        <option key={r.valor} value={r.valor}>
                          {r.rotulo}
                        </option>
                      ))}
                    </Selection>
                  </label>
                  {inbound.validation.rule === 'regex' ? (
                    <label className="bl-campo">
                      <span className="sub">{ROTULOS_DO_CONTEUDO.regex}</span>
                      <Campo
                        value={inbound.validation.regex ?? ''}
                        onChange={(e) =>
                          switch({
                            ...inbound,
                            validation: { ...inbound.validation!, regex: e.target.value },
                          })
                        }
                      />
                    </label>
                  ) : null}
                  {inbound.validation.rule === 'type' ? (
                    <label className="bl-campo">
                      <span className="sub">{ROTULOS_DO_CONTEUDO.tipoDeMidia}</span>
                      <Campo
                        value={inbound.validation.type ?? ''}
                        placeholder="image/jpeg"
                        onChange={(e) =>
                          switch({
                            ...inbound,
                            validation: { ...inbound.validation!, type: e.target.value },
                          })
                        }
                      />
                    </label>
                  ) : null}
                  <label className="bl-campo">
                    <span className="sub">{ROTULOS_DO_CONTEUDO.instrucao}</span>
                    <Campo
                      value={inbound.validation.error ?? ''}
                      onChange={(e) =>
                        switch({
                          ...inbound,
                          validation: { ...inbound.validation!, error: e.target.value },
                        })
                      }
                    />
                  </label>
                </>
              ) : null}
            </section>
          ) : null}
        </div>
      }
    </article>
  );
}
