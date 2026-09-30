import { useState, type ReactNode } from 'react';
import type { TestRunDebug, TestRunMessage } from '@pipe/contracts';
import { Botao, Campo, Etiqueta, Icone } from '@pipe/ui';
import { IconePortal } from '@pipe/ui/icones-portal';
import { runTest, resetTest } from '../builder-gravar';
import type { Mapa } from './model';
import { GLOBAL_ACTIONS_SECTION_ID, debugSections, inputExpirationHint, testVariablesToRecord } from './test-panel-logic';

/**
 * The Test panel (BUILDER-04, D-14): a local simulation of the current DRAFT with the real
 * engine, over an isolated test contact — the owner's decision after C-37 (`ref/CLASSIFICACAO-PORTAO.md`).
 * Reference divergence (intentional, documented in the plan's Summary): the captured Blip
 * behavior PUBLISHES the draft before opening its chat and hosts a production webchat iframe;
 * Pipe never publishes here and keeps the whole run local. Reference parity kept: panel title
 * ("Teste de fluxo em construção"), the message field's placeholder ("Digite sua mensagem aqui"),
 * Enter to send, and reset with no confirmation dialog. Debug (current block, variables,
 * executed actions, errors) is embedded directly in the panel — the reference only offers an
 * external tool, and only for an already-published bot; folding it in here is an improvement,
 * not a copy.
 */

type ChatMessage = { autor: 'usuario' | 'bot'; mensagem: TestRunMessage };

function bolhaConteudo(m: TestRunMessage, onOpcao: (texto: string) => void): ReactNode {
  const dados = m.dados as
    | { pergunta?: { texto: string; opcoes: string[] }; webLink?: { uri: string }; midia?: { url: string; titulo: string | null; nomeArquivo: string | null } }
    | null;
  if (m.tipo === 'imagem' && dados?.midia) {
    return <img src={dados.midia.url} alt={dados.midia.titulo ?? 'Imagem'} className="bl-test-midia" />;
  }
  if (m.tipo === 'video' && dados?.midia) {
    return <video src={dados.midia.url} controls className="bl-test-midia" />;
  }
  if (m.tipo === 'audio' && dados?.midia) {
    return <audio src={dados.midia.url} controls />;
  }
  if (m.tipo === 'documento' && dados?.midia) {
    return (
      <a href={dados.midia.url} target="_blank" rel="noopener noreferrer">
        {dados.midia.nomeArquivo ?? dados.midia.titulo ?? 'Documento'}
      </a>
    );
  }
  if (m.tipo === 'localizacao') {
    const local = (m.dados as { localizacao?: { latitude: number; longitude: number } } | null)?.localizacao;
    return <span>Localização: {local?.latitude}, {local?.longitude}</span>;
  }
  return (
    <>
      {m.texto ? <p>{m.texto}</p> : null}
      {dados?.pergunta ? (
        <div className="bl-test-opcoes">
          {dados.pergunta.opcoes.map((opcao, i) => (
            <button key={`${opcao}-${i}`} type="button" className="bl-test-opcao" onClick={() => onOpcao(opcao)}>
              {opcao}
            </button>
          ))}
        </div>
      ) : null}
      {dados?.webLink ? (
        <a href={dados.webLink.uri} target="_blank" rel="noopener noreferrer">
          {dados.webLink.uri}
        </a>
      ) : null}
    </>
  );
}

function Debug({
  debug,
  mapa,
  onDestacar,
}: {
  debug: TestRunDebug;
  mapa: Mapa;
  onDestacar: (id: string) => void;
}) {
  const tituloDe = (id: string): string => mapa[id]?.$title ?? id;
  return (
    <div className="bl-test-debug">
      <div className="bl-test-debug-linha">
        <span className="bl-section-subtitle">Bloco atual</span>
        {debug.currentStateId ? (
          <button type="button" className="bl-test-bloco-link" onClick={() => onDestacar(debug.currentStateId!)}>
            {tituloDe(debug.currentStateId)}
          </button>
        ) : (
          <span className="sub">nenhum (fluxo encerrado)</span>
        )}
      </div>
      {debug.error ? <Etiqueta tom="erro">{debug.error}</Etiqueta> : null}
      <span className="bl-section-subtitle">Variáveis</span>
      {Object.keys(debug.variables).length === 0 ? (
        <p className="sub">Nenhuma variável definida ainda.</p>
      ) : (
        <ul className="bl-test-variaveis">
          {Object.entries(debug.variables).map(([chave, valor]) => (
            <li key={chave}>
              <b>{chave}</b>: {valor}
            </li>
          ))}
        </ul>
      )}
      <span className="bl-section-subtitle">Ações executadas</span>
      <ul className="bl-test-estados">
        {debugSections(debug).map((estado, i) => (
          <li key={`${estado.stateId}-${i}`}>
            {estado.stateId === GLOBAL_ACTIONS_SECTION_ID ? (
              <b>Ações globais</b>
            ) : (
              <button type="button" className="bl-test-bloco-link" onClick={() => onDestacar(estado.stateId)}>
                {tituloDe(estado.stateId)}
              </button>
            )}
            {estado.actions.length === 0 ? (
              <span className="sub"> — nenhuma ação</span>
            ) : (
              <ul>
                {estado.actions.map((acao, j) => (
                  <li key={`${acao.tipo}-${j}`}>
                    {acao.tipo}
                    {acao.error ? <Etiqueta tom="erro">{acao.error}</Etiqueta> : null}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TestPanel({
  flowId,
  mapa,
  onFechar,
  onDestacarBloco,
}: {
  flowId: string;
  mapa: Mapa;
  onFechar: () => void;
  onDestacarBloco: (id: string) => void;
}) {
  const [mensagens, setMensagens] = useState<ChatMessage[]>([]);
  const [entrada, setEntrada] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [debug, setDebug] = useState<TestRunDebug | null>(null);
  const [variaveis, setVariaveis] = useState<{ chave: string; valor: string }[]>([]);

  async function enviar(texto: string): Promise<void> {
    const mensagem = texto.trim();
    if (!mensagem || enviando) return;
    setEnviando(true);
    setErro(null);
    setEntrada('');
    setMensagens((atual) => [...atual, { autor: 'usuario', mensagem: { tipo: 'texto', texto: mensagem, dados: null } }]);
    const r = await runTest(flowId, { input: mensagem, testVariables: testVariablesToRecord(variaveis) });
    setEnviando(false);
    if (!r.ok) {
      setErro(r.error);
      return;
    }
    setDebug(r.value.debug);
    setMensagens((atual) => [
      ...atual,
      ...r.value.messages.map((mensagemDoBot): ChatMessage => ({ autor: 'bot', mensagem: mensagemDoBot })),
    ]);
  }

  /** P8: fire the waiting block's inactivity time now; production waits for the real delayed job. */
  async function expirar(): Promise<void> {
    if (enviando) return;
    setEnviando(true);
    setErro(null);
    const r = await runTest(flowId, { input: '', expireInput: true, testVariables: testVariablesToRecord(variaveis) });
    setEnviando(false);
    if (!r.ok) {
      setErro(r.error);
      return;
    }
    setDebug(r.value.debug);
    setMensagens((atual) => [
      ...atual,
      ...r.value.messages.map((mensagemDoBot): ChatMessage => ({ autor: 'bot', mensagem: mensagemDoBot })),
    ]);
  }

  async function reiniciar(): Promise<void> {
    // The reference resets with no confirmation dialog (C-37): reset trades the whole test
    // session for a fresh one, immediately.
    await resetTest(flowId);
    setMensagens([]);
    setDebug(null);
    setErro(null);
    setVariaveis([]);
  }

  return (
    <aside className="bl-panel bl-panel--test" aria-label="Teste de fluxo em construção">
      <div className="bl-panel-header">
        <span className="bl-panel-title">Teste de fluxo em construção</span>
        <button type="button" className="iconbtn" aria-label="Reiniciar teste" title="Reiniciar" onClick={() => void reiniciar()}>
          <IconePortal nome="atualizar" tamanho={20} />
        </button>
        <button type="button" className="iconbtn" aria-label="Fechar" title="Fechar" onClick={onFechar}>
          <IconePortal nome="fechar" tamanho={20} />
        </button>
      </div>
      <hr className="bl-panel-wire" />
      <div className="bl-test-variaveis-form">
        <span className="bl-section-subtitle">Variáveis de teste</span>
        {variaveis.map((v, i) => (
          <div className="bl-test-variavel-linha" key={i}>
            <Campo
              value={v.chave}
              placeholder="nome"
              aria-label="Nome da variável de teste"
              onChange={(e) => setVariaveis((atual) => atual.map((x, j) => (j === i ? { ...x, chave: e.target.value } : x)))}
            />
            <Campo
              value={v.valor}
              placeholder="valor"
              aria-label="Valor da variável de teste"
              onChange={(e) => setVariaveis((atual) => atual.map((x, j) => (j === i ? { ...x, valor: e.target.value } : x)))}
            />
            <button
              type="button"
              className="iconbtn"
              aria-label="Remover variável de teste"
              onClick={() => setVariaveis((atual) => atual.filter((_, j) => j !== i))}
            >
              <IconePortal nome="lixeira" tamanho={16} />
            </button>
          </div>
        ))}
        <button type="button" className="bl-mais" onClick={() => setVariaveis((atual) => [...atual, { chave: '', valor: '' }])}>
          + Adicionar variável de teste
        </button>
      </div>
      <div className="bl-panel-body bl-test-conversa">
        {mensagens.length === 0 ? (
          <div className="bl-test-vazio">
            <Icone nome="testEnvironment" tamanho={32} />
            <p>Nenhuma execução ainda</p>
            <p className="sub">Envie uma mensagem de teste para simular o fluxo a partir do bloco inicial.</p>
          </div>
        ) : (
          <ul className="bl-test-mensagens">
            {mensagens.map((m, i) => (
              <li key={i} className={m.autor === 'usuario' ? 'bl-test-msg bl-test-msg--usuario' : 'bl-test-msg bl-test-msg--bot'}>
                {bolhaConteudo(m.mensagem, (texto) => void enviar(texto))}
              </li>
            ))}
          </ul>
        )}
        {erro ? <Etiqueta tom="erro">{erro}</Etiqueta> : null}
        {debug?.inputExpiration ? (
          <div className="bl-test-expiracao">
            <span className="sub">{inputExpirationHint(debug.inputExpiration.seconds)}</span>
            <Botao type="button" variante="padrao" disabled={enviando} onClick={() => void expirar()}>
              Expirar entrada
            </Botao>
          </div>
        ) : null}
        {debug ? <Debug debug={debug} mapa={mapa} onDestacar={onDestacarBloco} /> : null}
      </div>
      <div className="bl-test-campo">
        <Campo
          value={entrada}
          placeholder="Digite sua mensagem aqui"
          aria-label="Mensagem de teste"
          disabled={enviando}
          onChange={(e) => setEntrada(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void enviar(entrada);
          }}
        />
        <Botao type="button" variante="primario" disabled={enviando || !entrada.trim()} onClick={() => void enviar(entrada)}>
          Enviar
        </Botao>
      </div>
    </aside>
  );
}
