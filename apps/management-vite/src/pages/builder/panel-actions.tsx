import { Suspense, lazy, useLayoutEffect, useRef, useState } from 'react';
import { Botao, Campo, Etiqueta, Icone } from '@pipe/ui';
import { ManagementIcon } from '../../components/icones-management';
import { IconePortal } from '@pipe/ui/icones-portal';
import { CabecalhoInfo, renderDescricao } from './cabecalho-info';
import type { DescricaoParte } from './cabecalho-info';
import type { AcaoDoEditor, Block } from './model';
import { ehAttendance } from './model';
import {
  actionsOfGroup,
  LABELS_OF_ACTIONS,
  EXTERNAL_DEPENDENCY_MESSAGE,
  acaoTemDependenciaExterna,
  acaoDoSistema,
  acaoSemSuporte,
  adicionarAcao,
  cabecalhosDoCampo,
  comCabecalhos,
  comCampo,
  comCampoJson,
  iconOfActionType,
  pasteActions,
  removeActions,
  withConditions,
  comTitulo,
  actionErrors,
  moverAcao,
  novaAcao,
  removerAcao,
  rotuloDaAcao,
  substituirAcao,
  tipoDeAcao,
  fieldValue,
  variablesOfField,
  withVariables,
} from './actions-of-block';
import type { ActionsList } from './actions-of-block';
import { ConditionsEditor } from './condition';
import { FlowFunctionInsertPicker, FlowFunctionSelect } from './flow-functions-panel';
import { insertLibraryCall } from './flow-functions';

/** Monaco stays in its own chunk, fetched only when a script action is opened. */
const CodeEditor = lazy(() => import('./code-editor'));

let actionsCopied: AcaoDoEditor[] = [];

/**
 * The editor's "Ações" tab: the two lists — "Ações de Entrada" ("Inclua ações que serão executadas antes do envio do primeiro conteúdo") and "Ações de Saída" ("…após o envio do último conteúdo ou resposta do usuário") — each with an "Adicionar ação de entrada/saída" button that opens the grouped "ADICIONAR FERRAMENTAS" menu (Executar, Manipular), and each action as a card that expands for editing: "Nome da ação", the type's fields, and the "Condição para executar a ação".
 *
 * On the attendance block the tab only shows the editor's warning: "o bot não deve interferir nas ações de entrada e saída" (the bot must not interfere with entry and exit actions).
 */

export function ActionsPanel({
  block,
  onMudar,
  onAviso,
  onAbrirFuncoes,
}: {
  block: Block;
  onMudar: (block: Block) => void;
  onAviso: (texto: string) => void;
  /** Opens the function library (D-22) already reachable from Configuration → Funções, in the requested mode. */
  onAbrirFuncoes?: (modo: 'gerenciar' | 'criar') => void;
}) {
  const [copiadas, setCopiadas] = useState(actionsCopied);
  function copiar(actions: AcaoDoEditor[]): void {
    actionsCopied = structuredClone(actions);
    setCopiadas(actionsCopied);
  }
  if (ehAttendance(block.id)) {
    return (
      <div className="bl-aba-corpo">
        <p className="sub">{LABELS_OF_ACTIONS.atendimento}</p>
      </div>
    );
  }
  return (
    <div className="bl-aba-corpo">
      {onAbrirFuncoes ? <FunctionLibrarySection onAbrirFuncoes={onAbrirFuncoes} /> : null}
      {block.root ? (
        <section className="bl-section">
          <CabecalhoInfo titulo={LABELS_OF_ACTIONS.entrada} aberto>
            <p>
              Este bloco é usado para marcar pontos especiais do fluxo a serem tratados pela
              plataforma, portanto{' '}
              <strong>não é possível criar ações de entrada específicas.</strong>
            </p>
            <a
              href="https://help.blip.ai/hc/en-us/articles/360057492594-Como-criar-blocos-no-Builder"
              target="_blank"
              rel="noreferrer"
            >
              Entenda como os blocos funcionam
            </a>
          </CabecalhoInfo>
        </section>
      ) : (
        <ListOfActionsOfBlock
          block={block}
          lista="$enteringCustomActions"
          titulo={LABELS_OF_ACTIONS.entrada}
          description={LABELS_OF_ACTIONS.entradaDescricao}
          rotuloAdicionar={LABELS_OF_ACTIONS.adicionarEntrada}
          onMudar={onMudar}
          onAviso={onAviso}
          copiadas={copiadas}
          onCopiar={copiar}
        />
      )}
      <ListOfActionsOfBlock
        block={block}
        lista="$leavingCustomActions"
        titulo={LABELS_OF_ACTIONS.saida}
        description={LABELS_OF_ACTIONS.saidaDescricao}
        rotuloAdicionar={LABELS_OF_ACTIONS.adicionarSaida}
        onMudar={onMudar}
        onAviso={onAviso}
        copiadas={copiadas}
        onCopiar={copiar}
      />
    </div>
  );
}

/** "BIBLIOTECA DE FUNÇÕES", first section of the Ações tab (F-1, CAPTURAS): opens the existing library (D-22). */
function FunctionLibrarySection({
  onAbrirFuncoes,
}: {
  onAbrirFuncoes: (modo: 'gerenciar' | 'criar') => void;
}) {
  return (
    <section className="bl-section">
      <CabecalhoInfo
        titulo="Biblioteca de funções"
        etiqueta={<Etiqueta tom="sucesso">Novo</Etiqueta>}
        aberto
      >
        <p>
          Crie e gerencie funções globais para serem chamadas sempre que necessário nos chatbots
          do seu contrato
        </p>
        <div className="bl-function-library-botoes">
          <button
            type="button"
            className="bl-botao-contorno"
            onClick={() => onAbrirFuncoes('gerenciar')}
          >
            <ManagementIcon nome="biblioteca" tamanho={16} />
            Gerenciar funções
          </button>
          <Botao variante="primario" icone="mais" onClick={() => onAbrirFuncoes('criar')}>
            Criar função
          </Botao>
        </div>
      </CabecalhoInfo>
    </section>
  );
}

function ListOfActionsOfBlock({
  block,
  lista,
  titulo,
  description,
  rotuloAdicionar,
  onMudar,
  onAviso,
  copiadas,
  onCopiar,
}: {
  block: Block;
  lista: ActionsList;
  titulo: string;
  description: DescricaoParte[];
  rotuloAdicionar: string;
  onMudar: (block: Block) => void;
  onAviso: (texto: string) => void;
  copiadas: AcaoDoEditor[];
  onCopiar: (actions: AcaoDoEditor[]) => void;
}) {
  const actions = block[lista] ?? [];
  const [menuAberto, setMenuAberto] = useState(false);
  const [positionMenu, setPositionMenu] = useState({ top: 16, right: 484 });
  const [aberta, setAberta] = useState<number | null>(null);
  const [selecionadas, setSelecionadas] = useState<number[]>([]);
  const arrastada = useRef<number | null>(null);

  function colar(): void {
    const resultado = pasteActions(block, lista, copiadas);
    if (resultado.ok) onMudar(resultado.block);
    else onAviso(resultado.error);
  }

  function adicionar(tipo: string): void {
    const r = adicionarAcao(block, lista, novaAcao(tipo));
    setMenuAberto(false);
    if (!r.ok) {
      onAviso(r.error);
      return;
    }
    onMudar(r.block);
    setAberta(actions.length);
  }

  const groups = ['Executar', 'Manipular'] as const;

  return (
    <section className="bl-section bl-lista-de-acoes">
      <CabecalhoInfo titulo={titulo} contador={`${actions.length}/15`} aberto={actions.length === 0}>
        <p>{renderDescricao(description)}</p>
      </CabecalhoInfo>
      <div className="bl-actions-selection">
        <label>
          <input
            type="checkbox"
            disabled={!actions.length}
            checked={actions.length > 0 && selecionadas.length === actions.length}
            onChange={(e) => setSelecionadas(e.target.checked ? actions.map((_, i) => i) : [])}
          />
          {LABELS_OF_ACTIONS.selecionarTodos}
        </label>
        {selecionadas.length ? (
          <div className="bl-actions-selected-buttons">
            <button
              type="button"
              className="iconbtn"
              title={LABELS_OF_ACTIONS.copiarSelecionados}
              aria-label={LABELS_OF_ACTIONS.copiarSelecionados}
              onClick={() => onCopiar(actions.filter((_, i) => selecionadas.includes(i)))}
            >
              <IconePortal nome="copiar" tamanho={18} />
            </button>
            <button
              type="button"
              className="iconbtn"
              title={LABELS_OF_ACTIONS.deletarSelecionados}
              aria-label={LABELS_OF_ACTIONS.deletarSelecionados}
              onClick={() => {
                onMudar({ ...block, [lista]: removeActions(actions, selecionadas) });
                setSelecionadas([]);
                setAberta(null);
              }}
            >
              <ManagementIcon nome="lixeira" tamanho={18} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="bl-botao-contorno"
            disabled={!copiadas.length}
            onClick={colar}
          >
            {LABELS_OF_ACTIONS.colarAcao}
          </button>
        )}
      </div>

      {actions.map((acao, i) => (
        <ActionCard
          key={acao.$id ?? i}
          acao={acao}
          onArrastar={() => {
            arrastada.current = i;
          }}
          onSoltar={() => {
            if (arrastada.current !== null) {
              onMudar(moverAcao(block, lista, arrastada.current, i));
              setSelecionadas([]);
              setAberta(null);
            }
            arrastada.current = null;
          }}
          onTerminarArrasto={() => {
            arrastada.current = null;
          }}
          selecionada={selecionadas.includes(i)}
          onSelecionar={() =>
            setSelecionadas(
              selecionadas.includes(i) ? selecionadas.filter((s) => s !== i) : [...selecionadas, i],
            )
          }
          onCopiar={() => onCopiar([acao])}
          aberta={aberta === i}
          first={i === 0}
          ultima={i === actions.length - 1}
          onAbrir={() => setAberta(aberta === i ? null : i)}
          onMudar={(nova) => onMudar(substituirAcao(block, lista, i, nova))}
          onStart={() => onMudar(moverAcao(block, lista, i, i - 1))}
          onLower={() => onMudar(moverAcao(block, lista, i, i + 1))}
          onRemover={() => {
            setAberta(null);
            setSelecionadas([]);
            onMudar(removerAcao(block, lista, i));
          }}
        />
      ))}

      <div className="bl-adicionar-acao">
        <button
          type="button"
          className="bl-mais"
          onClick={(e) => {
            const rect = e.currentTarget.closest('aside')!.getBoundingClientRect();
            setPositionMenu({ top: rect.top, right: window.innerWidth - rect.left + 8 });
            setMenuAberto((v) => !v);
          }}
        >
          {rotuloAdicionar}
        </button>
        {menuAberto ? (
          <div className="bl-menu-actions bl-ferramentas" role="menu" style={positionMenu}>
            <header>
              <b>{rotuloAdicionar.toUpperCase()}</b>
              <button
                type="button"
                className="iconbtn"
                aria-label="Fechar"
                onClick={() => setMenuAberto(false)}
              >
                <Icone nome="x" tamanho={16} />
              </button>
            </header>
            {groups.map((grupo) => (
              <div key={grupo} className="bl-menu-actions-group">
                <span className="sub">{grupo}</span>
                {actionsOfGroup(grupo).map((t) => (
                  <button
                    key={t.tipo}
                    type="button"
                    role="menuitem"
                    onClick={() => adicionar(t.tipo)}
                  >
                    {t.rotulo}
                  </button>
                ))}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** Exported: the Global Actions panel (`painel-configuracao.tsx`) reuses the same card. */
export function ActionCard({
  acao,
  aberta,
  first,
  ultima,
  onAbrir,
  onMudar,
  onStart,
  onLower,
  onRemover,
  onCopiar,
  selecionada,
  onSelecionar,
  onArrastar,
  onSoltar,
  onTerminarArrasto,
}: {
  acao: AcaoDoEditor;
  aberta: boolean;
  first: boolean;
  ultima: boolean;
  onAbrir: () => void;
  onMudar: (acao: AcaoDoEditor) => void;
  onStart: () => void;
  onLower: () => void;
  onRemover: () => void;
  onCopiar?: () => void;
  selecionada?: boolean;
  onSelecionar?: () => void;
  onArrastar?: () => void;
  onSoltar?: () => void;
  onTerminarArrasto?: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const detalhe = useRef<HTMLDivElement>(null);
  const flutuante = !!onCopiar;
  useLayoutEffect(() => {
    if (aberta && flutuante) detalhe.current?.closest('.bl-panel-body')?.scrollTo(0, 0);
  }, [aberta, flutuante]);
  const tipo = tipoDeAcao(acao.type);
  const semSuporte = acaoSemSuporte(acao);
  const dependenciaExterna = acaoTemDependenciaExterna(acao);
  const doSistema = acaoDoSistema(acao);
  const errors = actionErrors(acao);
  const editavel = !!tipo && !doSistema && !dependenciaExterna;
  return (
    <article
      className={`bl-acao${errors.length > 0 ? ' bl-action--error' : ''}${aberta ? ' bl-acao--aberta' : ''}`}
      onDragOver={onSoltar ? (e) => e.preventDefault() : undefined}
      onDrop={
        onSoltar
          ? (e) => {
              e.preventDefault();
              onSoltar();
            }
          : undefined
      }
    >
      <header className="bl-acao-cabecalho">
        {onArrastar ? (
          <button
            type="button"
            className="bl-acao-arrastar"
            draggable
            aria-label="Reordenar ação. Use as setas para cima ou para baixo."
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', acao.$id ?? 'acao');
              onArrastar();
            }}
            onDragEnd={onTerminarArrasto}
            onKeyDown={(e) => {
              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
                if (e.key === 'ArrowUp' && !first) onStart();
                if (e.key === 'ArrowDown' && !ultima) onLower();
              }
            }}
          >
            <svg width="16" height="24" viewBox="0 0 16 24" fill="currentColor" aria-hidden="true">
              <circle cx="5" cy="7" r="1.5" />
              <circle cx="11" cy="7" r="1.5" />
              <circle cx="5" cy="12" r="1.5" />
              <circle cx="11" cy="12" r="1.5" />
              <circle cx="5" cy="17" r="1.5" />
              <circle cx="11" cy="17" r="1.5" />
            </svg>
          </button>
        ) : null}
        {onSelecionar ? (
          <input
            type="checkbox"
            aria-label={`Selecionar ${acao.$title || rotuloDaAcao(acao.type)}`}
            checked={selecionada}
            onChange={onSelecionar}
          />
        ) : null}
        <button type="button" className="bl-acao-abrir" onClick={onAbrir} aria-expanded={aberta}>
          <span className="bl-acao-icone">
            <Icone nome={iconOfActionType(acao.type)} tamanho={24} />
          </span>
          <span className="bl-acao-tipo">{acao.$title || rotuloDaAcao(acao.type)}</span>
        </button>
        {semSuporte || dependenciaExterna ? <Etiqueta tom="alerta">{LABELS_OF_ACTIONS.naoExecutada}</Etiqueta> : null}
        {doSistema ? <Etiqueta>{LABELS_OF_ACTIONS.doSistema}</Etiqueta> : null}
        {errors.length > 0 ? <Etiqueta tom="erro">{LABELS_OF_ACTIONS.erro}</Etiqueta> : null}
        <span className="bl-output-order">
          <button
            type="button"
            className="iconbtn"
            title="Subir"
            aria-label="Subir"
            disabled={first}
            onClick={onStart}
          >
            <Icone nome="cima" tamanho={16} />
          </button>
          <button
            type="button"
            className="iconbtn"
            title="Descer"
            aria-label="Descer"
            disabled={ultima}
            onClick={onLower}
          >
            <Icone nome="baixo" tamanho={16} />
          </button>
          {!doSistema ? (
            <button
              type="button"
              className="iconbtn"
              title={LABELS_OF_ACTIONS.excluir}
              aria-label={LABELS_OF_ACTIONS.excluir}
              onClick={onRemover}
            >
              <ManagementIcon nome="lixeira" tamanho={18} />
            </button>
          ) : null}
        </span>
        {onCopiar ? (
          <div className="bl-acao-menu">
            <button
              type="button"
              className="iconbtn"
              aria-label="Opções da ação"
              aria-expanded={menu}
              onClick={() => setMenu(!menu)}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <circle cx="12" cy="5" r="1.5" />
                <circle cx="12" cy="12" r="1.5" />
                <circle cx="12" cy="19" r="1.5" />
              </svg>
            </button>
            {menu ? (
              <div className="bl-menu-actions">
                <button
                  type="button"
                  onClick={() => {
                    setMenu(false);
                    onAbrir();
                  }}
                >
                  Detalhes da ação
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenu(false);
                    onCopiar();
                  }}
                >
                  Copiar ação
                </button>
                <button type="button" onClick={onRemover}>
                  Excluir ação
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </header>

      {aberta ? (
        <div ref={detalhe} className={`bl-acao-corpo${onCopiar ? ' bl-detalhe' : ''}`}>
          {onCopiar ? (
            <header className="bl-detalhe-cabecalho">
              <button
                type="button"
                className="iconbtn"
                aria-label="Voltar para ações"
                onClick={onAbrir}
              >
                <IconePortal nome="voltar" tamanho={24} />
              </button>
              <input
                aria-label={LABELS_OF_ACTIONS.nome}
                value={acao.$title || ''}
                placeholder={tipo?.titulo ?? acao.type}
                onChange={(e) => onMudar(comTitulo(acao, e.target.value))}
              />
              <button
                type="button"
                className="iconbtn"
                aria-label="Editar nome da ação"
                onClick={(e) => e.currentTarget.parentElement?.querySelector('input')?.focus()}
              >
                <IconePortal nome="editar" tamanho={24} />
              </button>
            </header>
          ) : null}
          {dependenciaExterna ? <p className="sub">{EXTERNAL_DEPENDENCY_MESSAGE}</p> : null}
          {!dependenciaExterna && tipo?.info ? <p className="sub">{tipo.info}</p> : null}
          {editavel ? (
            <>
              {!onCopiar ? (
                <label className="bl-campo">
                  <span className="sub">{LABELS_OF_ACTIONS.nome}</span>
                  <Campo
                    value={acao.$title ?? ''}
                    onChange={(e) => onMudar(comTitulo(acao, e.target.value))}
                  />
                </label>
              ) : null}
              {tipo!.campos.map((campo) => {
                const vazio = !!campo.obrigatorio && !fieldValue(acao, campo.key).trim();
                return (
                <label
                  key={campo.key}
                  className={`bl-campo${onCopiar ? ' bl-campo--interno' : ''}${vazio ? ' bl-campo--danger' : ''}`}
                  title={vazio ? `${campo.rotulo}: campo obrigatório.` : undefined}
                >
                  <span className="sub">
                    {campo.rotulo}
                    {campo.obrigatorio ? ' *' : ''}
                  </span>
                  {campo.tipo === 'cabecalhos' ? (
                    <EditorDeCabecalhos
                      cabecalhos={cabecalhosDoCampo(acao, campo.key)}
                      onMudar={(cabecalhos) => onMudar(comCabecalhos(acao, campo.key, cabecalhos))}
                    />
                  ) : campo.tipo === 'variableList' ? (
                    <EditorDeVariaveis
                      rotulo={campo.rotulo}
                      variaveis={variablesOfField(acao, campo.key)}
                      onMudar={(names) => onMudar(withVariables(acao, campo.key, names))}
                    />
                  ) : campo.tipo === 'code' ? (
                    <>
                      {tipo?.tipo === 'ExecuteScript' || tipo?.tipo === 'ExecuteScriptV2' ? (
                        <FlowFunctionInsertPicker
                          onInsert={(fn) => {
                            const entrada = fieldValue(acao, 'function').trim() || 'run';
                            onMudar(
                              comCampo(acao, campo.key, insertLibraryCall(fieldValue(acao, campo.key), fn, entrada)),
                            );
                          }}
                        />
                      ) : null}
                      <Suspense
                        fallback={
                          <textarea
                            className="campo bl-campo-codigo"
                            rows={10}
                            spellCheck={false}
                            aria-label={campo.rotulo}
                            value={fieldValue(acao, campo.key)}
                            onChange={(e) => onMudar(comCampo(acao, campo.key, e.target.value))}
                          />
                        }
                      >
                        <CodeEditor
                          ariaLabel={campo.rotulo}
                          value={fieldValue(acao, campo.key)}
                          onChange={(v) => onMudar(comCampo(acao, campo.key, v))}
                        />
                      </Suspense>
                    </>
                  ) : campo.tipo === 'functionId' ? (
                    <FlowFunctionSelect
                      value={fieldValue(acao, campo.key)}
                      onChange={(functionId) => onMudar(comCampo(acao, campo.key, functionId))}
                    />
                  ) : campo.options ? (
                    <select
                      className="campo"
                      value={fieldValue(acao, campo.key)}
                      onChange={(e) => onMudar(comCampo(acao, campo.key, e.target.value))}
                    >
                      {campo.options.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  ) : campo.tipo === 'longo' || campo.tipo === 'json' ? (
                    <textarea
                      className="campo bl-campo-longo"
                      rows={3}
                      value={fieldValue(acao, campo.key)}
                      onChange={(e) =>
                        onMudar(
                          campo.tipo === 'json'
                            ? comCampoJson(acao, campo.key, e.target.value)
                            : comCampo(acao, campo.key, e.target.value),
                        )
                      }
                    />
                  ) : (
                    <Campo
                      value={fieldValue(acao, campo.key)}
                      onChange={(e) => onMudar(comCampo(acao, campo.key, e.target.value))}
                    />
                  )}
                  {campo.ajuda ? <span className="bl-ajuda">{campo.ajuda}</span> : null}
                </label>
                );
              })}
              <h5 className="bl-section-subtitle">{LABELS_OF_ACTIONS.condicao}</h5>
              <ConditionsEditor
                conditions={acao.conditions ?? []}
                onMudar={(conditions) => onMudar(withConditions(acao, conditions))}
                rotuloAdicionar={LABELS_OF_ACTIONS.adicionarCondicao}
              />
            </>
          ) : (
            <pre className="bl-acao-bruta">{JSON.stringify(acao.settings ?? {}, null, 2)}</pre>
          )}
        </div>
      ) : null}
    </article>
  );
}

function EditorDeVariaveis({
  rotulo,
  variaveis,
  onMudar,
}: {
  rotulo: string;
  variaveis: string[];
  onMudar: (variaveis: string[]) => void;
}) {
  return (
    <div className="bl-cabecalhos">
      {variaveis.map((nome, indice) => (
        <div className="bl-header-row" key={indice}>
          <Campo
            value={nome}
            placeholder="Adicione as variáveis"
            aria-label={`${rotulo} ${indice + 1}`}
            onChange={(e) => onMudar(variaveis.map((v, i) => (i === indice ? e.target.value : v)))}
          />
          <button
            type="button"
            className="iconbtn"
            aria-label="Remover variável"
            onClick={() => onMudar(variaveis.filter((_, i) => i !== indice))}
          >
            <ManagementIcon nome="lixeira" tamanho={18} />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="bl-adicionar-cabecalho"
        onClick={() => onMudar([...variaveis, ''])}
      >
        + Criar variável
      </button>
    </div>
  );
}

function EditorDeCabecalhos({
  cabecalhos,
  onMudar,
}: {
  cabecalhos: { key: string; value: string }[];
  onMudar: (cabecalhos: { key: string; value: string }[]) => void;
}) {
  return (
    <div className="bl-cabecalhos">
      {cabecalhos.map((cabecalho, indice) => (
        <div className="bl-header-row" key={`${cabecalho.key}-${indice}`}>
          <Campo
            value={cabecalho.key}
            placeholder="Chave"
            aria-label={`Chave do cabeçalho ${indice + 1}`}
            onChange={(e) =>
              onMudar(cabecalhos.map((c, i) => (i === indice ? { ...c, key: e.target.value } : c)))
            }
          />
          <Campo
            value={cabecalho.value}
            placeholder="Valor"
            aria-label={`Valor do cabeçalho ${indice + 1}`}
            onChange={(e) =>
              onMudar(cabecalhos.map((c, i) => (i === indice ? { ...c, value: e.target.value } : c)))
            }
          />
          <button
            type="button"
            className="iconbtn"
            aria-label="Remover cabeçalho"
            onClick={() => onMudar(cabecalhos.filter((_, i) => i !== indice))}
          >
            <ManagementIcon nome="lixeira" tamanho={18} />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="bl-adicionar-cabecalho"
        onClick={() => onMudar([...cabecalhos, { key: '', value: '' }])}
      >
        + Adicionar cabeçalho
      </button>
    </div>
  );
}
