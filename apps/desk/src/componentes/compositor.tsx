'use client';

import { useActionState, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { enviarMensagem } from '../app/acoes';
import type { Resultado } from '../app/acoes';
import { abrirDialogoEncerrar } from './dialogo-encerrar';
import type { RespostaProntaDoDesk, TemplateAprovado } from '../servidor/consultas';

/**
 * Compositor com os três gatilhos da spec (§5):
 *
 *   `#` insere **conteúdo** — respostas prontas da empresa e as pessoais, na mesma lista
 *       e com a origem marcada. Fora da janela de 24h, as de texto livre aparecem
 *       desabilitadas e os templates aprovados vêm em primeiro plano, com a categoria.
 *   `/` executa uma **ação** na conversa.
 *   `@` menciona colega, e ao mencionar o compositor vira nota interna.
 *
 * A separação é deliberada: misturar os dois na mesma lista é o que faz o atendente
 * encerrar um atendimento querendo mandar uma saudação.
 *
 * Inserir e enviar são dois gestos: nada é enviado automaticamente ao escolher da lista.
 */

export type VariaveisDoContato = {
  'contato.nome': string;
  'contato.email': string;
  'contato.telefone': string;
  'atendente.nome': string;
  'atendente.primeiro_nome': string;
  'atendente.email': string;
};

interface Gatilho {
  tipo: '#' | '/' | '@';
  termo: string;
  /** Posição do caractere do gatilho no texto. */
  inicio: number;
}

/**
 * Comando do paletão da barra. Repare que não existe `disponivel`: o paletão
 * é menu de trabalho, e menu de trabalho não mostra caminho morto. Transferir,
 * Etiquetar e Acionar automação moravam aqui apagados — três de seis linhas —
 * e voltam quando executarem alguma coisa.
 */
interface Comando {
  chave: string;
  titulo: string;
  descricao: string;
}

function aplicarVariaveis(corpo: string, variaveis: VariaveisDoContato): string {
  return corpo.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (inteiro, chave: string) => {
    const valor = (variaveis as Record<string, string | undefined>)[chave];
    return valor && valor.length > 0 ? valor : inteiro;
  });
}

function detectarGatilho(valor: string, caret: number): Gatilho | null {
  const antes = valor.slice(0, caret);
  const achado = /(?:^|\s)([#/@])(\S*)$/.exec(antes);
  if (!achado) return null;
  const tipo = achado[1] as '#' | '/' | '@';
  const termo = achado[2] ?? '';
  return { tipo, termo, inicio: caret - termo.length - 1 };
}

function combina(termo: string, ...campos: (string | null | undefined)[]): boolean {
  if (!termo) return true;
  const alvo = termo.toLowerCase();
  return campos.some((campo) => (campo ?? '').toLowerCase().includes(alvo));
}

export function Compositor({
  conversaId,
  respostas,
  colegas,
  templates,
  variaveis,
  temJanela,
  janelaAberta,
  emEspera,
}: {
  conversaId: string;
  respostas: RespostaProntaDoDesk[];
  colegas: { id: string; nome: string }[];
  templates: TemplateAprovado[];
  variaveis: VariaveisDoContato;
  temJanela: boolean;
  janelaAberta: boolean;
  emEspera: boolean;
}) {
  const [texto, setTexto] = useState('');
  const [modo, setModo] = useState<'resposta' | 'nota'>('resposta');
  const [respostaProntaId, setRespostaProntaId] = useState<string>('');
  const [gatilho, setGatilho] = useState<Gatilho | null>(null);
  const [ativo, setAtivo] = useState(0);
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '');
  const area = useRef<HTMLTextAreaElement>(null);
  const formulario = useRef<HTMLFormElement>(null);

  async function acaoEnviar(anterior: Resultado, dados: FormData): Promise<Resultado> {
    const resposta = await enviarMensagem(anterior, dados);
    if (resposta.ok) {
      setTexto('');
      setRespostaProntaId('');
      setModo('resposta');
      setGatilho(null);
    }
    return resposta;
  }
  const [resultado, enviar, enviando] = useActionState(acaoEnviar, { ok: true });

  // Fora da janela o campo livre não existe: o que sobra é template aprovado.
  const somenteTemplate = temJanela && !janelaAberta;

  const comandos: Comando[] = [
    {
      chave: 'encerrar',
      titulo: 'Encerrar atendimento',
      descricao: 'Pede a etiqueta de encerramento antes de fechar',
    },
    {
      chave: 'espera',
      titulo: emEspera ? 'Retomar atendimento' : 'Colocar em espera',
      descricao: 'Pausa o SLA e a inatividade do cliente',
    },
    {
      chave: 'nota',
      titulo: 'Escrever nota interna',
      descricao: 'Some para o cliente; use @ para mencionar colega',
    },
  ];

  const respostasFiltradas = gatilho
    ? respostas.filter((r) => combina(gatilho.termo, r.atalho, r.titulo, r.categoria))
    : [];
  const templatesFiltrados = gatilho
    ? templates.filter((t) => combina(gatilho.termo, t.nome, t.categoria))
    : [];
  const comandosFiltrados = gatilho
    ? comandos.filter((c) => combina(gatilho.termo, c.chave, c.titulo))
    : [];
  const colegasFiltrados = gatilho
    ? colegas.filter((c) => combina(gatilho.termo, c.nome))
    : [];

  /** Itens na ordem em que a lista mostra — é o que a seta do teclado percorre. */
  const itens: { chave: string; executar: () => void; ativavel: boolean }[] = !gatilho
    ? []
    : gatilho.tipo === '#'
      ? [
          ...(somenteTemplate
            ? templatesFiltrados.map((t) => ({
                chave: `t-${t.id}`,
                ativavel: true,
                executar: () => {
                  setTemplateId(t.id);
                  fecharGatilho();
                },
              }))
            : []),
          ...respostasFiltradas.map((r) => ({
            chave: `r-${r.id}`,
            ativavel: !somenteTemplate,
            executar: () => inserirResposta(r),
          })),
        ]
      : gatilho.tipo === '/'
        ? comandosFiltrados.map((c) => ({
            chave: c.chave,
            ativavel: true,
            executar: () => executarComando(c),
          }))
        : colegasFiltrados.map((c) => ({
            chave: c.id,
            ativavel: true,
            executar: () => mencionar(c.nome),
          }));

  function fecharGatilho() {
    setGatilho(null);
    setAtivo(0);
  }

  function trocarTexto(valor: string, caret: number) {
    setTexto(valor);
    setGatilho(detectarGatilho(valor, caret));
    setAtivo(0);
  }

  /** Substitui o gatilho digitado pelo conteúdo, e deixa o cursor no fim. */
  function substituirGatilho(conteudo: string) {
    const inicio = gatilho?.inicio ?? texto.length;
    const fim = inicio + 1 + (gatilho?.termo.length ?? 0);
    const novo = texto.slice(0, inicio) + conteudo + texto.slice(fim);
    setTexto(novo);
    fecharGatilho();
    queueMicrotask(() => {
      const elemento = area.current;
      if (!elemento) return;
      elemento.focus();
      const posicao = inicio + conteudo.length;
      elemento.setSelectionRange(posicao, posicao);
    });
  }

  function inserirResposta(resposta: RespostaProntaDoDesk) {
    substituirGatilho(aplicarVariaveis(resposta.corpo, variaveis));
    setRespostaProntaId(resposta.id);
  }

  function mencionar(nome: string) {
    // Menção é gesto de nota interna: mencionar colega numa mensagem que sai para o
    // cliente é o erro que a separação de gatilhos existe para evitar.
    setModo('nota');
    substituirGatilho(`@${nome} `);
  }

  function executarComando(comando: Comando) {
    substituirGatilho('');
    if (comando.chave === 'encerrar') {
      abrirDialogoEncerrar();
      return;
    }
    if (comando.chave === 'espera') {
      const formularioEspera = document.getElementById('formulario-espera');
      if (formularioEspera instanceof HTMLFormElement) formularioEspera.requestSubmit();
      return;
    }
    if (comando.chave === 'nota') {
      setModo('nota');
      area.current?.focus();
    }
  }

  function aoTeclar(evento: KeyboardEvent<HTMLTextAreaElement>) {
    if (gatilho && itens.length > 0) {
      if (evento.key === 'ArrowDown') {
        evento.preventDefault();
        setAtivo((i) => (i + 1) % itens.length);
        return;
      }
      if (evento.key === 'ArrowUp') {
        evento.preventDefault();
        setAtivo((i) => (i - 1 + itens.length) % itens.length);
        return;
      }
      if (evento.key === 'Enter' || evento.key === 'Tab') {
        const item = itens[ativo];
        if (item?.ativavel) {
          evento.preventDefault();
          item.executar();
          return;
        }
      }
      if (evento.key === 'Escape') {
        evento.preventDefault();
        fecharGatilho();
        return;
      }
    }
    if (evento.key === 'Enter' && !evento.shiftKey && !gatilho) {
      evento.preventDefault();
      formulario.current?.requestSubmit();
    }
  }

  const templateEscolhido = templates.find((t) => t.id === templateId) ?? null;

  return (
    <div className={`composer${modo === 'nota' ? ' modo-nota' : ''}`}>
      {gatilho ? (
        <div className="gatilho" role="listbox" aria-label={`Gatilho ${gatilho.tipo}`}>
          <div className="titulo">
            <span className="lbl">
              {gatilho.tipo === '#'
                ? 'Respostas prontas'
                : gatilho.tipo === '/'
                  ? 'Comandos da conversa'
                  : 'Mencionar colega'}
            </span>
            {gatilho.tipo === '#' && somenteTemplate ? (
              <span className="etiqueta erro">Janela fechada · só template</span>
            ) : null}
          </div>
          <ul>
            {gatilho.tipo === '#' ? (
              <>
                {somenteTemplate
                  ? templatesFiltrados.map((template) => (
                      <li key={template.id}>
                        <button
                          type="button"
                          data-ativo={itens[ativo]?.chave === `t-${template.id}`}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setTemplateId(template.id);
                            fecharGatilho();
                          }}
                        >
                          <span className="linha1">
                            {/* Nome de template é nome, não identificador. */}
                            <span>{template.nome}</span>
                            <span className="etiqueta">Template · {template.categoria}</span>
                          </span>
                          <span className="corpo">{template.corpo}</span>
                        </button>
                      </li>
                    ))
                  : null}
                {respostasFiltradas.map((resposta) => (
                  <li key={resposta.id}>
                    <button
                      type="button"
                      disabled={somenteTemplate}
                      title={
                        somenteTemplate
                          ? 'Texto livre indisponível: a janela de 24 horas fechou'
                          : undefined
                      }
                      data-ativo={itens[ativo]?.chave === `r-${resposta.id}`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        inserirResposta(resposta);
                      }}
                    >
                      <span className="linha1">
                        <span className="mono">#{resposta.atalho}</span>
                        {/*
                          Escopo da resposta pronta em etiqueta neutra e caixa
                          normal. Era azul contra cinza e em caixa alta, para
                          dizer de quem é o texto — categoria, não estado.
                        */}
                        <span className="etiqueta">
                          {resposta.escopo === 'pessoal' ? 'Minha' : 'Empresa'}
                        </span>
                        <span className="corpo">{resposta.titulo}</span>
                      </span>
                      <span className="corpo">{aplicarVariaveis(resposta.corpo, variaveis)}</span>
                    </button>
                  </li>
                ))}
              </>
            ) : null}

            {gatilho.tipo === '/'
              ? comandosFiltrados.map((comando) => (
                  <li key={comando.chave}>
                    <button
                      type="button"
                      data-ativo={itens[ativo]?.chave === comando.chave}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        executarComando(comando);
                      }}
                    >
                      <span className="linha1">
                        <span className="mono">/{comando.chave}</span>
                        <span>{comando.titulo}</span>
                      </span>
                      <span className="corpo">{comando.descricao}</span>
                    </button>
                  </li>
                ))
              : null}

            {gatilho.tipo === '@'
              ? colegasFiltrados.map((colega) => (
                  <li key={colega.id}>
                    <button
                      type="button"
                      data-ativo={itens[ativo]?.chave === colega.id}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        mencionar(colega.nome);
                      }}
                    >
                      <span className="linha1">
                        <span>@{colega.nome}</span>
                      </span>
                      <span className="corpo">A menção vira nota interna</span>
                    </button>
                  </li>
                ))
              : null}
          </ul>
        </div>
      ) : null}

      <form action={enviar} ref={formulario}>
        <input type="hidden" name="conversaId" value={conversaId} />
        <input type="hidden" name="modo" value={modo} />
        <input type="hidden" name="respostaProntaId" value={respostaProntaId} />

        {somenteTemplate && modo === 'resposta' ? (
          <div className="bloqueio">
            <p>
              <b>A janela de 24 horas fechou.</b> O campo de texto livre fica indisponível: fora da
              janela, a Meta só entrega template aprovado. Quando o cliente responder, a janela
              reabre e o texto livre volta sozinho.
            </p>
            <label className="lbl" htmlFor="seletor-template">
              Template aprovado
            </label>
            <select
              id="seletor-template"
              name="templateId"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
            >
              {templates.length === 0 ? <option value="">Nenhum template aprovado</option> : null}
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.nome} · {template.categoria}
                </option>
              ))}
            </select>
            {templateEscolhido ? (
              <>
                <div className="previa">{aplicarVariaveis(templateEscolhido.corpo, variaveis)}</div>
                <div className="rodape">
                  <span className="etiqueta">Categoria · {templateEscolhido.categoria}</span>
                  {/* Frase inteira em caixa alta era grito. `.lbl` é rótulo de
                      seção; isto é uma nota. */}
                  <span className="sub">
                    Custo pela tabela da Meta. A tabela de preço por categoria ainda não está
                    configurada neste ambiente
                  </span>
                  <button
                    type="submit"
                    className="btn primary"
                    style={{ marginLeft: 'auto' }}
                    disabled={enviando}
                  >
                    {enviando ? 'Enviando…' : 'Enviar template'}
                  </button>
                </div>
              </>
            ) : null}
          </div>
        ) : (
          // Duas faixas, como no compositor deles: o campo em cima e a barra de
          // ações de 56px embaixo. Os controles ficam ABAIXO do campo, não ao
          // lado dele, e o envio encosta à direita.
          <div className="box">
            <textarea
              ref={area}
              name="texto"
              rows={1}
              value={texto}
              placeholder={
                modo === 'nota'
                  ? 'Nota interna. O cliente não vê. Use @ para mencionar colega'
                  : '# resposta pronta · / comando · @ mencionar colega'
              }
              onChange={(e) => trocarTexto(e.target.value, e.target.selectionStart)}
              onKeyDown={aoTeclar}
            />
            <div className="acoes">
              <button
                type="button"
                className="etiqueta"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setGatilho({ tipo: '#', termo: '', inicio: texto.length });
                  setAtivo(0);
                }}
              >
                # respostas prontas
              </button>
              {/*
                Interruptor de nota interna: etiqueta clicável com `aria-pressed`,
                que é o único lugar onde a marca toca uma etiqueta, porque ali ela
                virou ação. Anexo e áudio entram nesta mesma faixa quando
                existirem; enquanto não enviam arquivo nenhum, não ocupam lugar.
              */}
              <button
                type="button"
                className="etiqueta"
                aria-pressed={modo === 'nota'}
                onClick={() => setModo(modo === 'nota' ? 'resposta' : 'nota')}
              >
                Nota interna
              </button>
              <button type="submit" className="btn primary" disabled={enviando || !texto.trim()}>
                {enviando ? 'Enviando…' : modo === 'nota' ? 'Salvar nota' : 'Enviar'}
              </button>
            </div>
          </div>
        )}

        {resultado.erro ? <p className="erro">{resultado.erro}</p> : null}
      </form>
    </div>
  );
}
