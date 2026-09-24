import { useLayoutEffect, useRef, useState } from 'react';
import { Campo, Etiqueta, Icone } from '@pipe/ui';
import { IconeGestao } from '../../componentes/icones-gestao';
import { IconePortal } from '../../componentes/icones-portal';
import { Selecao } from '../../componentes/selecao';
import type { Bloco, EntradaDoEditor, ItemDeConteudo } from './modelo';
import { ehAtendimento, novaEntrada } from './modelo';
import {
  LIMITE_DO_MENU,
  LIMITE_DO_QUICK_REPLY,
  REGRAS_DE_VALIDACAO,
  ROTULOS_DO_CONTEUDO,
  adicionarConteudo,
  cartoesDe,
  definirEntrada,
  definirEspera,
  definirMenu,
  definirTexto,
  moverConteudo,
  novoMenu,
  novoQuickReply,
  novoTexto,
  removerConteudo,
  temEntrada,
  validacaoComRegra,
} from './conteudo';
import type { Cartao, OpcaoDoMenu } from './conteudo';

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

export function PainelDeConteudo({
  bloco,
  onMudar,
  onAviso,
}: {
  bloco: Bloco;
  onMudar: (bloco: Bloco) => void;
  onAviso: (texto: string) => void;
}) {
  const cartoes = cartoesDe(bloco);
  const [menuAberto, setMenuAberto] = useState(false);
  const [selecionado, setSelecionado] = useState<number | null>(null);
  const conteudo = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (selecionado !== null) conteudo.current?.closest('.bl-painel-corpo')?.scrollTo(0, 0);
  }, [selecionado]);
  const [alterarEspera, setAlterarEspera] = useState(false);
  const atendimento = ehAtendimento(bloco.id);
  const raiz = !!bloco.root;

  function adicionar(item: ItemDeConteudo): void {
    setMenuAberto(false);
    const r = adicionarConteudo(bloco, item);
    if (r.ok) {
      onMudar(r.bloco);
      setSelecionado(r.bloco.$contentActions?.indexOf(item) ?? null);
    } else onAviso(r.erro);
  }

  return (
    <div ref={conteudo} className="bl-aba-corpo bl-conteudo-bloco">
      <span className="bl-conteudo-contador">
        {cartoes.filter((c) => c.tipo !== 'entrada' && c.tipo !== 'digitando').length}/25
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
      {atendimento ? (
        <div className="bl-conteudo-introducao">
          <h4>Atendimento humano</h4>
          <p>Este bloco encaminhará a conversa para a sua fila de atendimento.</p>
          <p>
            Para utilizar este recurso, você precisará ativar a integração com o{' '}
            <strong>Blip Desk</strong>.
          </p>
          <small>v.{bloco.deskStateVersion ?? '3.0.0'}</small>
        </div>
      ) : null}
      <div className="bl-conversa-conteudo bl-lista-de-cartoes">
        {!atendimento
          ? cartoes.map((c) => (
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
                      ? ROTULOS_DO_CONTEUDO.entrada
                      : c.entrada.bypass
                        ? ROTULOS_DO_CONTEUDO.direto
                        : ROTULOS_DO_CONTEUDO.aguardando
                    : c.tipo === 'outro'
                      ? c.mime
                      : c.tipo === 'digitando'
                        ? ROTULOS_DO_CONTEUDO.digitando
                        : c.texto || ROTULOS_DO_CONTEUDO[c.tipo]}
                  {c.tipo === 'menu' || c.tipo === 'quickReply' ? (
                    <span className="bl-previa-opcoes">
                      {c.opcoes.map((o, i) => (
                        <span key={i}>{o.text}</span>
                      ))}
                    </span>
                  ) : null}
                </button>
                {c.tipo === 'entrada' && !raiz ? (
                  <div className="bl-espera-controle">
                    <span>
                      {c.entrada.bypass
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
                              onMudar(definirEspera(bloco, aguardar));
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

      {!raiz && !atendimento ? (
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
              {!temEntrada(bloco) ? (
                <button type="button" role="menuitem" onClick={() => adicionar(novaEntrada())}>
                  {ROTULOS_DO_CONTEUDO.entrada}
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
      {selecionado !== null && cartoes.some((c) => c.indice === selecionado) ? (
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
                const c = cartoes.find((c) => c.indice === selecionado)!;
                return c.tipo === 'outro' ? c.mime : ROTULOS_DO_CONTEUDO[c.tipo];
              })()}
            </h4>
          </header>
          <CartaoDeConteudo
            cartao={cartoes.find((c) => c.indice === selecionado)!}
            bloco={bloco}
            fixo={raiz || atendimento}
            primeiro={selecionado === 0}
            ultimo={selecionado === cartoes.length - 1}
            onMudar={onMudar}
          />
        </section>
      ) : null}
    </div>
  );
}

function CartaoDeConteudo({
  cartao,
  bloco,
  fixo,
  primeiro,
  ultimo,
  onMudar,
}: {
  cartao: Cartao;
  bloco: Bloco;
  /** Início e atendimento: a entrada não sai nem se troca por "Não aguardar". */
  fixo: boolean;
  primeiro: boolean;
  ultimo: boolean;
  onMudar: (bloco: Bloco) => void;
}) {
  const i = cartao.indice;
  const entrada = cartao.tipo === 'entrada';
  const ordem =
    entrada || fixo ? null : (
      <span className="bl-saida-ordem">
        <button
          type="button"
          className="iconbtn"
          title="Subir"
          aria-label="Subir"
          disabled={primeiro}
          onClick={() => onMudar(moverConteudo(bloco, i, i - 1))}
        >
          <Icone nome="cima" tamanho={16} />
        </button>
        <button
          type="button"
          className="iconbtn"
          title="Descer"
          aria-label="Descer"
          disabled={ultimo || bloco.$contentActions?.[i + 1]?.input !== undefined}
          onClick={() => onMudar(moverConteudo(bloco, i, i + 1))}
        >
          <Icone nome="baixo" tamanho={16} />
        </button>
      </span>
    );
  const excluir =
    fixo && entrada ? null : (
      <button
        type="button"
        className="iconbtn"
        title="Excluir"
        aria-label="Excluir"
        onClick={() => onMudar(removerConteudo(bloco, i))}
      >
        <IconeGestao nome="lixeira" tamanho={18} />
      </button>
    );

  switch (cartao.tipo) {
    case 'texto':
      return (
        <article className="bl-cartao bl-cartao--robo">
          <header>
            <b>{ROTULOS_DO_CONTEUDO.texto}</b>
            {ordem}
            {excluir}
          </header>
          <textarea
            className="campo bl-campo-longo"
            rows={3}
            value={cartao.texto}
            placeholder="Digite a mensagem"
            onChange={(e) => onMudar(definirTexto(bloco, i, e.target.value))}
          />
        </article>
      );
    case 'menu':
    case 'quickReply': {
      const menu = cartao.tipo === 'menu';
      const limite = menu ? LIMITE_DO_MENU : LIMITE_DO_QUICK_REPLY;
      const trocarOpcoes = (opcoes: OpcaoDoMenu[]): void =>
        onMudar(definirMenu(bloco, i, cartao.texto, opcoes));
      return (
        <article className="bl-cartao bl-cartao--robo">
          <header>
            <b>{menu ? ROTULOS_DO_CONTEUDO.menu : ROTULOS_DO_CONTEUDO.quickReply}</b>
            {ordem}
            {excluir}
          </header>
          <textarea
            className="campo bl-campo-longo"
            rows={2}
            value={cartao.texto}
            placeholder="Texto do menu"
            onChange={(e) => onMudar(definirMenu(bloco, i, e.target.value, cartao.opcoes))}
          />
          <ol className="bl-opcoes">
            {cartao.opcoes.map((o, j) => (
              <li key={j}>
                <Campo
                  value={o.text}
                  maxLength={limite.caracteres}
                  placeholder={`Opção ${j + 1}`}
                  onChange={(e) =>
                    trocarOpcoes(
                      cartao.opcoes.map((x, k) => (k === j ? { ...x, text: e.target.value } : x)),
                    )
                  }
                />
                <button
                  type="button"
                  className="iconbtn"
                  title="Remover opção"
                  aria-label="Remover opção"
                  onClick={() => trocarOpcoes(cartao.opcoes.filter((_, k) => k !== j))}
                >
                  <Icone nome="x" tamanho={14} />
                </button>
              </li>
            ))}
          </ol>
          <button
            type="button"
            className="bl-mais"
            disabled={cartao.opcoes.length >= limite.opcoes}
            onClick={() => trocarOpcoes([...cartao.opcoes, { text: '' }])}
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
        <CartaoDeEntrada entrada={cartao.entrada} bloco={bloco} fixo={fixo} onMudar={onMudar} />
      );
    case 'digitando':
      return (
        <article className="bl-cartao bl-cartao--robo bl-cartao--apagado">
          <header>
            <b>{ROTULOS_DO_CONTEUDO.digitando}</b>
            {ordem}
            {excluir}
          </header>
          <p className="sub">Roda sem efeito no Pipe.</p>
        </article>
      );
    case 'outro':
      return (
        <article className="bl-cartao bl-cartao--robo bl-cartao--apagado">
          <header>
            <b>{cartao.mime}</b>
            {ordem}
            {excluir}
          </header>
          {!cartao.suportado ? (
            <Etiqueta tom="alerta">{ROTULOS_DO_CONTEUDO.naoSuportado}</Etiqueta>
          ) : null}
        </article>
      );
  }
}

function CartaoDeEntrada({
  entrada,
  bloco,
  fixo,
  onMudar,
}: {
  entrada: EntradaDoEditor;
  bloco: Bloco;
  fixo: boolean;
  onMudar: (bloco: Bloco) => void;
}) {
  const validando = !!entrada.validation;
  const aguardando = !entrada.bypass;
  const trocar = (nova: EntradaDoEditor): void => onMudar(definirEntrada(bloco, nova));

  return (
    <article className="bl-cartao bl-cartao--cliente">
      <header>
        <b>{ROTULOS_DO_CONTEUDO.entrada}</b>
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
                  onChange={() => onMudar(definirEspera(bloco, true))}
                />{' '}
                {ROTULOS_DO_CONTEUDO.aguardar}
              </label>
              <label>
                <input
                  type="radio"
                  checked={!aguardando}
                  onChange={() => onMudar(definirEspera(bloco, false))}
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
                value={entrada.variable ?? ''}
                placeholder="nomeDaVariavel"
                onChange={(e) => trocar({ ...entrada, variable: e.target.value || null })}
              />
            </label>
          </section>

          {aguardando && !ehAtendimento(bloco.id) ? (
            <section className="bl-secao">
              <label className="form-caixa">
                <input
                  type="checkbox"
                  checked={validando}
                  onChange={(e) =>
                    trocar({
                      ...entrada,
                      validation: e.target.checked
                        ? validacaoComRegra(entrada.validation, 'text')
                        : null,
                    })
                  }
                />
                <span className="bl-secao-subtitulo">{ROTULOS_DO_CONTEUDO.validar}</span>
              </label>
              {entrada.validation ? (
                <>
                  <label className="bl-campo">
                    <span className="sub">{ROTULOS_DO_CONTEUDO.tipoDeValidacao}</span>
                    <Selecao
                      value={entrada.validation.rule}
                      onChange={(e) =>
                        trocar({
                          ...entrada,
                          validation: validacaoComRegra(entrada.validation, e.target.value),
                        })
                      }
                    >
                      {REGRAS_DE_VALIDACAO.map((r) => (
                        <option key={r.valor} value={r.valor}>
                          {r.rotulo}
                        </option>
                      ))}
                    </Selecao>
                  </label>
                  {entrada.validation.rule === 'regex' ? (
                    <label className="bl-campo">
                      <span className="sub">{ROTULOS_DO_CONTEUDO.regex}</span>
                      <Campo
                        value={entrada.validation.regex ?? ''}
                        onChange={(e) =>
                          trocar({
                            ...entrada,
                            validation: { ...entrada.validation!, regex: e.target.value },
                          })
                        }
                      />
                    </label>
                  ) : null}
                  {entrada.validation.rule === 'type' ? (
                    <label className="bl-campo">
                      <span className="sub">{ROTULOS_DO_CONTEUDO.tipoDeMidia}</span>
                      <Campo
                        value={entrada.validation.type ?? ''}
                        placeholder="image/jpeg"
                        onChange={(e) =>
                          trocar({
                            ...entrada,
                            validation: { ...entrada.validation!, type: e.target.value },
                          })
                        }
                      />
                    </label>
                  ) : null}
                  <label className="bl-campo">
                    <span className="sub">{ROTULOS_DO_CONTEUDO.instrucao}</span>
                    <Campo
                      value={entrada.validation.error ?? ''}
                      onChange={(e) =>
                        trocar({
                          ...entrada,
                          validation: { ...entrada.validation!, error: e.target.value },
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
