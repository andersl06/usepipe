import { useEffect, useId, useState } from 'react';
import { DEFAULT_AGENT_KEY_SECRETS } from '@pipe/core';
import type { AgentProvider } from '@pipe/core';
import { Campo } from '@pipe/ui';
import { IconePortal } from '@pipe/ui/icones-portal';
import { ManagementIcon } from '../../components/icones-management';
import { useContact } from '../flow/contact';
import { Interruptor } from '../flow/integrations/interruptor';
import type { AcaoDoEditor, Block, Mapa } from './model';
import { CabecalhoInfo } from './cabecalho-info';
import { DestinationPicker } from './destination-picker';
import { outputErrors } from './conditions';
import { listFlowSecrets } from './secret-variables-gravar';
import {
  AGENT_MEMORY_DEFAULT,
  MODEL_SUGGESTIONS,
  PROVIDER_LABELS,
  addHandoff,
  agentHandoffs,
  agentInstructions,
  agentMemory,
  agentModelView,
  agentOutput,
  aiAgentErrors,
  errorOutputIndex,
  maxTemperature,
  otherAgentOutputs,
  otherPromptEntries,
  removeHandoff,
  renameHandoff,
  setAgentInstructions,
  setAgentKeySecret,
  setAgentMaxTokens,
  setAgentMemory,
  setAgentModel,
  setAgentOutput,
  setAgentProvider,
  setAgentTemperature,
  setErrorDestination,
  setHandoffDescription,
  setHandoffDestination,
  setHandoffParameters,
  temperatureAccepted,
  toolDescription,
  toolErrors,
  toolSchemaText,
  withToolDescription,
  withToolSchema,
} from './ai-agent-block';

/**
 * The AI agent block's sidebar (P14-UI, D-58). Blip's agent sidebar has the tabs "Instruções",
 * "Condições de saída" and "Ações" (tools); the model settings sit in its "CONFIGURAR AGENTE"
 * dialog (Modelo, Resposta). Here those settings are sections at the top of "Instruções", with
 * Pipe's own components and tokens (D-33). The provider key never appears: the block only names
 * the flow secret ("Variáveis sensíveis", P11) that holds it.
 */

/** Test-run behaviour without a key (02-53 `agentStub`), shown in the panel and the Test panel. */
export const AGENT_TEST_NOTE =
  'Sem a chave do provedor em Variáveis sensíveis, o teste do Builder responde em modo simulação ("[Simulação] …"), e a mensagem "/handoff <nome>" segue o direcionamento com esse nome. Com a chave configurada, o teste chama o provedor de verdade. Publicado sem chave, o agente segue a saída de exceção.';

function AgentErrors({ block }: { block: Block }) {
  const errors = aiAgentErrors(block);
  if (errors.length === 0) return null;
  return (
    <div className="bl-agent-erros" role="alert">
      <IconePortal nome="alerta" tamanho={16} />
      <ul>
        {errors.map((e) => (
          <li key={e}>{e}</li>
        ))}
      </ul>
    </div>
  );
}

/** Flow secret names, for the key field's suggestions and the "not found" warning. */
function useSecretNames(): string[] | null {
  const { contact } = useContact();
  const [names, setNames] = useState<string[] | null>(null);
  useEffect(() => {
    let vivo = true;
    void listFlowSecrets(contact.id).then((r) => {
      if (vivo) setNames(r.ok ? r.value.map((s) => s.name) : null);
    });
    return () => {
      vivo = false;
    };
  }, [contact.id]);
  return names;
}

export function AiAgentInstructionsPanel({
  block,
  onMudar,
  onAbrirVariaveis,
}: {
  block: Block;
  onMudar: (block: Block) => void;
  /** Opens Configuração › Variáveis, where "Variáveis sensíveis" lives. */
  onAbrirVariaveis?: () => void;
}) {
  const uid = useId();
  const model = agentModelView(block);
  const memory = agentMemory(block);
  const output = agentOutput(block);
  const instructions = agentInstructions(block);
  const outras = otherPromptEntries(block);
  const secrets = useSecretNames();
  const temperaturaAceita = temperatureAccepted(model.provider, model.effectiveModel);
  const semChave = secrets !== null && !secrets.includes(model.effectiveApiKeySecret);

  return (
    <div className="bl-aba-corpo bl-agent">
      <AgentErrors block={block} />

      <section className="bl-section bl-agent-secao">
        <CabecalhoInfo titulo="Modelo da LLM" aberto>
          <p>
            Escolha o provedor e o modelo de linguagem que o agente usa para gerar respostas. Cada
            agente tem o seu.
          </p>
        </CabecalhoInfo>
        <label className="bl-campo">
          <span className="sub">Provedor</span>
          <select
            className="campo"
            value={model.provider}
            onChange={(e) => onMudar(setAgentProvider(block, e.target.value as AgentProvider))}
          >
            {(Object.keys(PROVIDER_LABELS) as AgentProvider[]).map((p) => (
              <option key={p} value={p}>
                {PROVIDER_LABELS[p]}
              </option>
            ))}
          </select>
        </label>
        <label className={`bl-campo${model.model ? '' : ' bl-campo--danger'}`}>
          <span className="sub">Modelo *</span>
          <Campo
            value={model.model}
            list={`${uid}-modelos`}
            placeholder="Selecionar modelo"
            onChange={(e) => onMudar(setAgentModel(block, e.target.value))}
          />
          <datalist id={`${uid}-modelos`}>
            {MODEL_SUGGESTIONS[model.provider].map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </label>
        <div className="bl-agent-linha">
          <label className="bl-campo">
            <span className="sub">Temperatura</span>
            <Campo
              type="number"
              min={0}
              max={maxTemperature(model.provider)}
              step={0.1}
              value={model.temperature ?? ''}
              disabled={!temperaturaAceita}
              onChange={(e) => onMudar(setAgentTemperature(block, e.target.value))}
            />
          </label>
          <label className="bl-campo">
            <span className="sub">Max tokens</span>
            <Campo
              type="number"
              min={1}
              max={8192}
              step={1}
              value={model.maxTokens ?? ''}
              placeholder="1024"
              onChange={(e) => onMudar(setAgentMaxTokens(block, e.target.value))}
            />
          </label>
        </div>
        <p className="bl-ajuda">
          {temperaturaAceita
            ? 'A temperatura controla a aleatoriedade das respostas: valores baixos deixam o agente mais previsível.'
            : `O modelo ${model.effectiveModel} não aceita temperatura; o valor guardado é ignorado.`}
        </p>
        <label className="bl-campo">
          <span className="sub">Chave do provedor (variável sensível)</span>
          <Campo
            value={model.apiKeySecret}
            list={`${uid}-segredos`}
            placeholder={DEFAULT_AGENT_KEY_SECRETS[model.provider]}
            onChange={(e) => onMudar(setAgentKeySecret(block, e.target.value))}
          />
          <datalist id={`${uid}-segredos`}>
            {(secrets ?? []).map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <span className="bl-ajuda">
            O agente usa a variável sensível <b>{model.effectiveApiKeySecret}</b> deste fluxo. A chave
            nunca fica no bloco.
          </span>
        </label>
        {semChave ? (
          <p className="bl-agent-aviso">
            Este fluxo ainda não tem a variável sensível <b>{model.effectiveApiKeySecret}</b>.
          </p>
        ) : null}
        {onAbrirVariaveis ? (
          <button type="button" className="bl-botao-contorno" onClick={onAbrirVariaveis}>
            <IconePortal nome="chaves" tamanho={16} />
            Abrir Variáveis sensíveis
          </button>
        ) : null}
      </section>

      <section className="bl-section bl-agent-secao">
        <CabecalhoInfo titulo="Histórico de mensagens" aberto>
          <p>Guarda as mensagens trocadas com o contato para o agente usar como contexto.</p>
        </CabecalhoInfo>
        <div className="bl-agent-interruptor">
          <Interruptor
            id={`${uid}-memoria`}
            curto
            ligado={memory.enabled}
            rotulo="Armazenar histórico de mensagens"
            aoMudar={(v) => onMudar(setAgentMemory(block, v))}
          />
          <span>Armazenar histórico de mensagens</span>
        </div>
        {memory.enabled ? (
          <label className="bl-campo">
            <span className="sub">Quantidade de mensagens</span>
            <Campo
              type="number"
              min={1}
              max={100}
              step={1}
              value={memory.length ?? ''}
              placeholder={String(AGENT_MEMORY_DEFAULT)}
              onChange={(e) => onMudar(setAgentMemory(block, true, e.target.value))}
            />
            <span className="bl-ajuda">
              Considera as {memory.length ?? AGENT_MEMORY_DEFAULT} últimas mensagens trocadas durante a
              conversa (1 a 100). O histórico é apagado quando o contato sai do bloco.
            </span>
          </label>
        ) : null}
      </section>

      <section className="bl-section bl-agent-secao">
        <CabecalhoInfo titulo="Resposta" aberto>
          <p>O que o fluxo faz com o texto que o agente gera.</p>
        </CabecalhoInfo>
        <div className="bl-agent-interruptor">
          <Interruptor
            id={`${uid}-enviar`}
            curto
            ligado={output.forward}
            rotulo="Enviar resposta ao contato"
            aoMudar={(v) => onMudar(setAgentOutput(block, { forward: v }))}
          />
          <span>Enviar resposta ao contato</span>
        </div>
        <div className="bl-agent-interruptor">
          <Interruptor
            id={`${uid}-variavel`}
            curto
            ligado={output.saveVariable}
            rotulo="Salvar resposta em variável"
            aoMudar={(v) => onMudar(setAgentOutput(block, { saveVariable: v }))}
          />
          <span>Salvar resposta em variável</span>
        </div>
        {output.saveVariable ? (
          <label className={`bl-campo${output.variable.trim() ? '' : ' bl-campo--danger'}`}>
            <span className="sub">Nome da variável *</span>
            <Campo
              value={output.variable}
              placeholder="respostaDoAgente"
              onChange={(e) => onMudar(setAgentOutput(block, { variable: e.target.value }))}
            />
          </label>
        ) : null}
      </section>

      <section className="bl-section bl-agent-secao">
        <CabecalhoInfo titulo="Instruções para o agente" aberto>
          <p>Define as instruções que orientam o modo de interação do agente durante a conversa.</p>
        </CabecalhoInfo>
        {instructions.map((texto, i) => (
          <div key={i} className={`bl-agent-instrucao${texto.trim() ? '' : ' bl-campo--danger'}`}>
            <header className="bl-saida-cabecalho">
              <b>Sistema {instructions.length > 1 ? i + 1 : ''}</b>
              {instructions.length > 1 ? (
                <button
                  type="button"
                  className="iconbtn"
                  aria-label={`Excluir instrução ${i + 1}`}
                  title="Excluir"
                  onClick={() => onMudar(setAgentInstructions(block, instructions.filter((_, j) => j !== i)))}
                >
                  <ManagementIcon nome="lixeira" tamanho={18} />
                </button>
              ) : null}
            </header>
            <textarea
              className="campo bl-agent-prompt"
              rows={8}
              aria-label={`Instrução ${i + 1}`}
              placeholder="Você é um assistente que responde perguntas sobre..."
              value={texto}
              onChange={(e) =>
                onMudar(setAgentInstructions(block, instructions.map((t, j) => (j === i ? e.target.value : t))))
              }
            />
          </div>
        ))}
        {instructions.length === 0 ? <p className="sub">Instrução vazia</p> : null}
        <button
          type="button"
          className="bl-mais"
          onClick={() => onMudar(setAgentInstructions(block, [...instructions, '']))}
        >
          + Adicionar instrução
        </button>
        {outras > 0 ? (
          <p className="bl-ajuda">
            {outras === 1 ? '1 instrução de outro tipo' : `${outras} instruções de outros tipos`} (exemplos,
            histórico) veio do arquivo importado e é mantida como está.
          </p>
        ) : null}
        <p className="bl-ajuda">
          Use {'{{variável}}'} para incluir dados do fluxo nas instruções.
        </p>
      </section>

      <p className="bl-agent-nota">
        <IconePortal nome="informacao" tamanho={16} />
        <span>{AGENT_TEST_NOTE}</span>
      </p>
    </div>
  );
}

const normalizeJson = (texto: string): string => {
  try {
    return JSON.stringify(JSON.parse(texto));
  } catch {
    return texto.trim();
  }
};
const sameJson = (a: string, b: string): boolean => normalizeJson(a) === normalizeJson(b);

/** A JSON field that only commits valid JSON; the typed text stays while it is invalid. */
function JsonField({
  rotulo,
  valor,
  onValido,
}: {
  rotulo: string;
  valor: string;
  /** Returns the error for the text, or null when it was accepted. */
  onValido: (texto: string) => string | null;
}) {
  const [texto, setTexto] = useState(valor);
  const [erro, setErro] = useState<string | null>(null);
  // Follow the stored value (undo, another block) only when it means something else than the
  // text being typed, so valid JSON is not reformatted under the cursor.
  useEffect(() => {
    // `texto` is left out of the dependencies on purpose: it changes on every keystroke.
    if (!erro && !sameJson(texto, valor)) setTexto(valor);
  }, [valor, erro]);
  return (
    <label className={`bl-campo${erro ? ' bl-campo--danger' : ''}`}>
      <span className="sub">{rotulo}</span>
      <textarea
        className="campo bl-campo-codigo"
        rows={5}
        spellCheck={false}
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          setErro(onValido(e.target.value));
        }}
      />
      {erro ? <span className="bl-campo--erro-texto">{erro}</span> : null}
    </label>
  );
}

/**
 * "Condições de saída" of the agent block: Blip's "Direcionar para bloco" list (one card per
 * handoff: name, description for the agent, parameters schema, destination), "Adicionar
 * direcionamento", and the "Saída de exceção". The default output always returns to the block
 * itself, so the conversation continues there.
 */
export function AiAgentOutputsPanel({
  block,
  mapa,
  onMudar,
  onAviso,
}: {
  block: Block;
  mapa: Mapa;
  onMudar: (block: Block) => void;
  onAviso: (texto: string) => void;
}) {
  const handoffs = agentHandoffs(block);
  const destinos = Object.values(mapa);
  const existe = (id: string): boolean => id in mapa;
  const saidas = block.$conditionOutputs ?? [];
  const erro = errorOutputIndex(block);
  const outras = otherAgentOutputs(block);
  const [aberto, setAberto] = useState<number | null>(null);

  function adicionar(): void {
    const r = addHandoff(block);
    if (!r.ok) {
      onAviso(r.error);
      return;
    }
    onMudar(r.block);
    setAberto(handoffs.length);
  }

  return (
    <div className="bl-aba-corpo bl-agent">
      <CabecalhoInfo titulo="Direcionar para bloco" contador={`${saidas.length}/25`} aberto={handoffs.length === 0}>
        <p>Defina instruções, parâmetros e o bloco para o qual o usuário será direcionado.</p>
        <p>
          Cada direcionamento vira uma ferramenta do agente: quando o agente a chama, o contato segue
          para o bloco escolhido.
        </p>
      </CabecalhoInfo>

      <div className="bl-lista-de-saidas">
        {handoffs.map((h, i) => {
          const saida = h.output >= 0 ? saidas[h.output] : undefined;
          const errosDaSaida = saida ? outputErrors(saida, existe) : ['Definição de saída não preenchida'];
          const nomeValido = h.name.trim().length >= 3 && /^[a-z0-9_]+$/.test(h.name.trim());
          const invalido = errosDaSaida.length > 0 || !nomeValido || !h.description.trim();
          return (
            <section key={i} className={`bl-saida${invalido ? ' bl-output--error' : ''}`}>
              <header className="bl-saida-cabecalho">
                <button
                  type="button"
                  className="bl-agent-handoff-titulo"
                  aria-expanded={aberto === i}
                  onClick={() => setAberto(aberto === i ? null : i)}
                >
                  {h.name || 'Nome da saída'}
                </button>
                <button
                  type="button"
                  className="iconbtn"
                  title="Excluir"
                  aria-label={`Excluir direcionamento ${h.name}`}
                  onClick={() => {
                    setAberto(null);
                    onMudar(removeHandoff(block, i));
                  }}
                >
                  <ManagementIcon nome="lixeira" tamanho={18} />
                </button>
              </header>
              {aberto === i ? (
                <>
                  <label className={`bl-campo${nomeValido ? '' : ' bl-campo--danger'}`}>
                    <span className="sub">Nome *</span>
                    <Campo value={h.name} onChange={(e) => onMudar(renameHandoff(block, i, e.target.value))} />
                    <span className="bl-ajuda">
                      Letras minúsculas, números e "_", com 3 caracteres ou mais. No teste, "/handoff{' '}
                      {h.name || '<nome>'}" segue por aqui.
                    </span>
                  </label>
                  <label className={`bl-campo${h.description.trim() ? '' : ' bl-campo--danger'}`}>
                    <span className="sub">Instruções para o agente *</span>
                    <textarea
                      className="campo"
                      rows={3}
                      placeholder="Ex.: Direcione o usuário para esse bloco sempre que for mencionado o assunto Y."
                      value={h.description}
                      onChange={(e) => onMudar(setHandoffDescription(block, i, e.target.value))}
                    />
                  </label>
                  <JsonField
                    rotulo="Schema dos parâmetros (JSON)"
                    valor={Object.keys(h.parameters).length ? JSON.stringify(h.parameters, null, 2) : ''}
                    onValido={(texto) => {
                      const r = setHandoffParameters(block, i, texto);
                      if (!r.ok) return r.error;
                      onMudar(r.block);
                      return null;
                    }}
                  />
                  <p className="bl-ajuda">
                    Um JSON Schema do tipo object, ou um mapa nome → descrição. O agente preenche esses
                    parâmetros ao direcionar; o fluxo lê em {'{{aiagent.parameters}}'}.
                  </p>
                </>
              ) : (
                <p className="sub bl-agent-resumo">{h.description || 'Sem instruções para o agente'}</p>
              )}
              <DestinationPicker
                valor={saida?.stateId ?? ''}
                blocos={destinos}
                rotulo="Direcionar usuário para"
                onEscolher={(id) => onMudar(setHandoffDestination(block, i, id))}
              />
            </section>
          );
        })}
      </div>

      <button type="button" className="bl-mais" onClick={adicionar}>
        + Adicionar direcionamento
      </button>

      {outras.length > 0 ? (
        <section className="bl-section bl-agent-secao">
          <CabecalhoInfo titulo="Outras saídas importadas" aberto>
            <p>
              Saídas que o bloco trouxe da Blip (encaminhamento de áudio, PDF, tempo esgotado…). O
              Pipe não gera esses casos; elas ficam no bloco como vieram.
            </p>
          </CabecalhoInfo>
          {outras.map((i) => {
            const saida = saidas[i]!;
            const valor = saida.conditions?.at(-1)?.values?.[0] ?? `saída ${i + 1}`;
            return (
              <div key={i} className="bl-saida">
                <b className="sub">{valor}</b>
                <DestinationPicker
                  valor={saida.stateId ?? ''}
                  blocos={destinos}
                  rotulo="Direcionar usuário para"
                  onEscolher={(id) =>
                    onMudar({
                      ...block,
                      $conditionOutputs: saidas.map((s, j) => (j === i ? { ...s, stateId: id } : s)),
                    })
                  }
                />
              </div>
            );
          })}
        </section>
      ) : null}

      <section className="bl-saida bl-saida--padrao">
        <CabecalhoInfo titulo="Saída de exceção" aberto>
          <p>
            Selecione o bloco para o qual o usuário será redirecionado se o agente falhar (provedor
            indisponível, chave ausente, recusa ou excesso de chamadas de ferramentas). O motivo fica em{' '}
            {'{{aiagent.errorCode}}'}.
          </p>
        </CabecalhoInfo>
        <DestinationPicker
          valor={erro >= 0 ? (saidas[erro]!.stateId ?? '') : ''}
          blocos={destinos}
          rotulo="Redirecionar para"
          onEscolher={(id) => onMudar(setErrorDestination(block, id))}
        />
        <p className="bl-ajuda">
          Enquanto o agente conversa, a próxima mensagem do contato volta para este mesmo bloco.
        </p>
      </section>
    </div>
  );
}

/**
 * The tool part of an action card on the agent's "Ferramentas" list: Blip's "ORIENTAÇÕES PARA O
 * AGENTE" (when to run it) and the arguments' JSON Schema. The tool name is the action's title.
 */
export function ToolFields({
  acao,
  all,
  onMudar,
}: {
  acao: AcaoDoEditor;
  all: readonly AcaoDoEditor[];
  onMudar: (acao: AcaoDoEditor) => void;
}) {
  const errors = toolErrors(acao, all);
  return (
    <div className="bl-agent-ferramenta">
      <h5 className="bl-section-subtitle">ORIENTAÇÕES PARA O AGENTE</h5>
      {errors.length > 0 ? (
        <ul className="bl-agent-ferramenta-erros">
          {errors.map((e) => (
            <li key={e} className="bl-campo--erro-texto">
              {e}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="bl-ajuda">
        O nome da ação é o nome da ferramenta: letras minúsculas, números, "-" e "_" (ex.: minha_acao_1).
      </p>
      <label className={`bl-campo${toolDescription(acao).trim() ? '' : ' bl-campo--danger'}`}>
        <span className="sub">Descrição *</span>
        <textarea
          className="campo"
          rows={3}
          placeholder="Ex.: Execute esta ferramenta sempre que o usuário mencionar dúvidas sobre entrega"
          value={toolDescription(acao)}
          onChange={(e) => onMudar(withToolDescription(acao, e.target.value))}
        />
        <span className="bl-ajuda">Especifique em quais situações esta ferramenta deve ser executada durante o atendimento.</span>
      </label>
      <JsonField
        rotulo="Editar variável (JSON Schema)"
        valor={toolSchemaText(acao)}
        onValido={(texto) => {
          const r = withToolSchema(acao, texto);
          if (!r.ok) return r.error;
          onMudar(r.acao);
          return null;
        }}
      />
      <p className="bl-ajuda">
        Os argumentos que o agente envia ficam em {'{{aiagent.parameters@campo}}'} para as configurações
        abaixo.
      </p>
    </div>
  );
}
