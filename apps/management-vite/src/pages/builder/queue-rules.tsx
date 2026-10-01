import { useEffect, useState } from 'react';
import { Botao, Campo, Carregando, Etiqueta, Icone, Illustration } from '@pipe/ui';
import { useRead } from '../../lib/query';
import { withFlow } from '../../lib/flow-scope';
import { useContact } from '../flow/contact';
import type { QueueForChoose, QueueRegistered, QueueRegisteredRule } from '../../lib/registrations';
import { deleteRuleQueue, editQueue, editRuleQueue } from '../../lib/registrations-gravar';
import { saveRuleQueue, toggleRuleQueue } from '../../lib/actions';
import { rotuloDoCampo } from '../../lib/rule-queue';
import { ManagementIcon } from '../../components/icones-management';
import { ChipsInput } from '@pipe/ui/chips-input';
import { ConfirmModal } from '@pipe/ui/modal';
import { Select } from '@pipe/ui/select';
import { Interruptor } from '../flow/integrations/interruptor';
import {
  RULE_COMPARISONS,
  RULE_SOURCES,
  draftToApi,
  filterQueues,
  newRuleCondition,
  newRuleDraft,
  pageQueues,
  queueRenameError,
  queueRules,
  renameBlockReason,
  ruleDraftState,
  ruleToDraft,
  type RenameBlockReason,
  type RuleComparison,
  type RuleDraft,
  type RuleDraftCondition,
} from './queues-panel';
import type { QueuesAviso } from './panel-queues';

/**
 * The Builder's embedded queue-rules mode, laid out like reference `builder-attendance-rules`:
 * editable queue name with the same locks as the Desk, debounced search, and rule cards that open
 * in place to create or edit (one open at a time). The destination is always this queue, so the
 * card has no queue picker.
 */

interface QueueRulesRead {
  regras: QueueRegisteredRule[];
  queues: QueueForChoose[];
}

const TEXTO_BLOQUEIO: Record<RenameBlockReason, string> = {
  atendentes: 'Ops! Esta fila já tem atendentes vinculados, por isso não é possível fazer alterações.',
  regras: 'Ops! Esta fila já tem regras atribuídas, por isso não é possível fazer alterações.',
  permissao: 'Você não tem permissão para alterar esta fila.',
};

const CAMPO_OBRIGATORIO = 'Ops! Este campo precisa ser preenchido';
const NOVA = 'nova';
const DEBOUNCE_MS = 300;

export function QueueRulesView({
  fila,
  onVoltar,
  onAviso,
}: {
  fila: QueueRegistered;
  onVoltar: () => void;
  onAviso: (aviso: QueuesAviso) => void;
}) {
  const { contact } = useContact();
  const read = useRead<QueueRulesRead>(withFlow('/v1/management/rules/attendance', contact.id));
  const [aberta, setAberta] = useState<{ id: string; draft: RuleDraft } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [termoDigitado, setTermoDigitado] = useState('');
  const [termoAplicado, setTermoAplicado] = useState('');
  const [paginas, setPaginas] = useState(1);
  const [editandoNome, setEditandoNome] = useState(false);
  const [nomeEditado, setNomeEditado] = useState(fila.name);
  const [salvandoNome, setSalvandoNome] = useState(false);
  const [erroNome, setErroNome] = useState<string | null>(null);
  const [paraExcluir, setParaExcluir] = useState<QueueRegisteredRule | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [erroExclusao, setErroExclusao] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setTermoAplicado(termoDigitado.trim());
      setPaginas(1);
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [termoDigitado]);

  const carregando = !read.data;
  const todasRegras = read.data?.regras ?? [];
  const regrasDaFila = queueRules(todasRegras, fila.id);
  // Permission to write hasn't got a reusable helper on the Desk side (no such thing in
  // `pages/registrations/*`) — always allowed until one exists.
  const podeGravar = true;
  const motivoBloqueio = renameBlockReason(fila, regrasDaFila.length, podeGravar);

  const clicarLapis = () => {
    if (carregando || motivoBloqueio !== null) {
      const motivo = motivoBloqueio ?? 'atendentes';
      onAviso({ tom: 'alerta', texto: TEXTO_BLOQUEIO[motivo] });
      return;
    }
    setNomeEditado(fila.name);
    setErroNome(null);
    setEditandoNome(true);
  };

  const confirmarNome = async () => {
    if (!editandoNome) return;
    if (nomeEditado.trim() === fila.name.trim()) {
      setEditandoNome(false);
      return;
    }
    const outrasFilas = (read.data?.queues ?? [])
      .filter((q) => q.id !== fila.id)
      .map((q) => ({ name: q.name }));
    const erro = queueRenameError(nomeEditado, outrasFilas);
    if (erro) {
      setErroNome(erro);
      return;
    }
    setSalvandoNome(true);
    const resultado = await editQueue(contact.id, fila.id, { nome: nomeEditado.trim() });
    setSalvandoNome(false);
    if (!resultado.ok) {
      onAviso({ tom: 'erro', texto: resultado.error });
      return;
    }
    setEditandoNome(false);
  };

  const criarNova = () => setAberta({ id: NOVA, draft: newRuleDraft(regrasDaFila) });
  const editar = (regra: QueueRegisteredRule) => setAberta({ id: regra.id, draft: ruleToDraft(regra) });

  const confirmar = async () => {
    if (!aberta) return;
    const payload = draftToApi(aberta.draft);
    if (!payload) return;
    const nome = aberta.draft.name.trim();
    setSalvando(true);
    let erro: string | undefined;
    if (aberta.id === NOVA) {
      // Order is global across queues: a new rule goes after every existing one, like the Desk's default.
      const ordem = Math.min(999, todasRegras.reduce((max, r) => Math.max(max, r.order + 1), 0));
      const dados = new FormData();
      dados.set('fluxoId', contact.id);
      dados.set('nome', nome);
      dados.set('filaDestinoId', fila.id);
      dados.set('combinador', payload.combiner);
      dados.set('ordem', String(ordem));
      for (const c of payload.conditions) {
        dados.append('campo', c.campo);
        dados.append('operador', c.operador);
        dados.append('valor', c.value);
      }
      const resultado = await saveRuleQueue({ ok: true }, dados);
      if (!resultado.ok) erro = resultado.error ?? 'Não foi possível salvar.';
    } else {
      const resultado = await editRuleQueue(contact.id, aberta.id, {
        nome,
        combinador: payload.combiner,
        conditions: payload.conditions,
      });
      if (!resultado.ok) erro = resultado.error;
    }
    setSalvando(false);
    if (erro) {
      onAviso({ tom: 'erro', texto: erro });
      return;
    }
    setAberta(null);
  };

  const excluir = (regra: QueueRegisteredRule) => {
    setErroExclusao(null);
    setParaExcluir(regra);
  };

  const confirmarExclusao = async () => {
    if (!paraExcluir) return;
    setExcluindo(true);
    const resultado = await deleteRuleQueue(contact.id, paraExcluir.id);
    setExcluindo(false);
    if (!resultado.ok) {
      setErroExclusao(resultado.error);
      return;
    }
    if (aberta?.id === paraExcluir.id) setAberta(null);
    setParaExcluir(null);
  };

  const alternar = async (regra: QueueRegisteredRule) => {
    const dados = new FormData();
    dados.set('fluxoId', contact.id);
    dados.set('id', regra.id);
    const resultado = await toggleRuleQueue({ ok: true }, dados);
    if (!resultado.ok) onAviso({ tom: 'erro', texto: resultado.error ?? 'Não foi possível alterar a regra.' });
  };

  const cartaoAberto = (id: string) =>
    aberta?.id === id ? (
      <RuleCardOpen
        key={id}
        draft={aberta.draft}
        salvando={salvando}
        onMudar={(draft) => setAberta({ id, draft })}
        onCancelar={() => setAberta(null)}
        onConfirmar={() => void confirmar()}
      />
    ) : null;

  const filtradas = filterQueues(regrasDaFila, termoAplicado);
  const pagina = pageQueues(filtradas, paginas);

  return (
    <div className="bl-rules-view">
      <div className="bl-queues-form-header bl-rules-header">
        <button type="button" className="iconbtn" aria-label="Voltar" title="Voltar" onClick={onVoltar}>
          <Icone nome="esquerda" tamanho={20} />
        </button>
        {editandoNome ? (
          <Campo
            autoFocus
            value={nomeEditado}
            maxLength={60}
            className="bl-rules-nome-input"
            aria-label="Nome da fila"
            disabled={salvandoNome}
            onChange={(e) => {
              setNomeEditado(e.target.value);
              if (erroNome) setErroNome(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void confirmarNome();
              } else if (e.key === 'Escape') {
                setEditandoNome(false);
                setErroNome(null);
              }
            }}
            onBlur={() => void confirmarNome()}
          />
        ) : (
          <h3 className="bl-rules-nome">{fila.name}</h3>
        )}
        <button
          type="button"
          className="iconbtn"
          aria-label="Editar nome da fila"
          title="Editar nome da fila"
          onClick={clicarLapis}
          disabled={editandoNome}
        >
          <Icone nome="lapis" tamanho={18} />
        </button>
      </div>
      {erroNome ? (
        <Etiqueta tom="erro" className="bl-queues-form-erro">
          {erroNome}
        </Etiqueta>
      ) : null}
      <hr className="bl-panel-wire" />

      {carregando ? (
        <div className="bl-queues-loading">
          <Carregando rotulo="Carregando regras" />
        </div>
      ) : regrasDaFila.length === 0 && aberta?.id !== NOVA ? (
        <div className="bl-queues-empty">
          <p>
            Você ainda não possui regras de atendimento definidas. Escolha o comportamento padrão
            para tickets e as filas para os quais eles serão direcionados.
          </p>
          <Botao variante="primario" icone="mais" className="bl-queues-empty-botao" onClick={criarNova}>
            Criar nova regra
          </Botao>
        </div>
      ) : (
        <>
          {regrasDaFila.length > 0 ? (
            <div className="bl-queues-search">
              <div className="bl-queues-search-campo">
                <Icone nome="busca" tamanho={20} className="bl-queues-search-icone" />
                <Campo
                  value={termoDigitado}
                  placeholder="Pesquisar"
                  aria-label="Pesquisar regras"
                  onChange={(e) => setTermoDigitado(e.target.value)}
                />
              </div>
              <button
                type="button"
                className="bl-queues-search-botao"
                aria-label={termoAplicado ? 'Limpar busca' : 'Criar nova regra'}
                title={termoAplicado ? 'Limpar busca' : 'Criar nova regra'}
                onClick={termoAplicado ? () => setTermoDigitado('') : criarNova}
              >
                <Icone nome={termoAplicado ? 'x' : 'mais'} tamanho={20} />
              </button>
            </div>
          ) : null}

          {cartaoAberto(NOVA)}

          {regrasDaFila.length > 0 && filtradas.length === 0 ? (
            <div className="bl-queues-no-result">
              <Illustration nome="busca" tamanho={96} />
              <p className="bl-queues-no-result-titulo">Regra não encontrada :(</p>
              <p>Não há regras cadastradas com esse nome</p>
            </div>
          ) : regrasDaFila.length > 0 ? (
            <>
              <div className="bl-queues-list">
                {pagina.visiveis.map(
                  (regra) =>
                    cartaoAberto(regra.id) ?? (
                      <div key={regra.id} className="bl-queue-card bl-rule-card">
                        <div className="bl-queue-card-info">
                          <span className="bl-queue-card-label">Nome da regra</span>
                          <span className="bl-queue-card-name">{regra.name}</span>
                        </div>
                        <div className="bl-queue-card-right">
                          <div className="bl-rule-card-actions">
                            <button
                              type="button"
                              className="iconbtn"
                              aria-label="Editar regra"
                              title="Editar regra"
                              onClick={() => editar(regra)}
                            >
                              <Icone nome="lapis" tamanho={18} />
                            </button>
                            <button
                              type="button"
                              className="iconbtn"
                              aria-label="Excluir regra"
                              title="Excluir regra"
                              onClick={() => excluir(regra)}
                            >
                              <ManagementIcon nome="lixeira" tamanho={18} />
                            </button>
                          </div>
                          <Interruptor
                            id={`bl-regra-${regra.id}`}
                            ligado={regra.active}
                            rotulo={regra.active ? `Desativar a regra ${regra.name}` : `Ativar a regra ${regra.name}`}
                            aoMudar={() => void alternar(regra)}
                            className="bl-queue-switch"
                          />
                        </div>
                      </div>
                    ),
                )}
              </div>
              <div className="bl-rules-footer">
                <span>
                  Exibindo {pagina.visiveis.length} de {pagina.total}
                </span>
                {pagina.temMais ? (
                  <Botao className="bl-rules-ghost" onClick={() => setPaginas((p) => p + 1)}>
                    Carregar mais
                  </Botao>
                ) : null}
              </div>
            </>
          ) : null}
        </>
      )}
      <ConfirmModal
        aberto={paraExcluir !== null}
        titulo="Excluir regra"
        message={`Excluir a regra ${paraExcluir?.name ?? ''}?`}
        error={erroExclusao}
        confirmando={excluindo}
        onConfirmar={() => void confirmarExclusao()}
        onCancelar={() => setParaExcluir(null)}
      />
    </div>
  );
}

/** Open rule card (reference `.rule-item-opened`): editable title, conditions, Cancelar/Confirmar. */
function RuleCardOpen({
  draft,
  salvando,
  onMudar,
  onCancelar,
  onConfirmar,
}: {
  draft: RuleDraft;
  salvando: boolean;
  onMudar: (draft: RuleDraft) => void;
  onCancelar: () => void;
  onConfirmar: () => void;
}) {
  const [editandoTitulo, setEditandoTitulo] = useState(false);
  const [titulo, setTitulo] = useState(draft.name);
  const estado = ruleDraftState(draft);
  const tituloVazio = titulo.trim() === '';

  const confirmarTitulo = () => {
    if (tituloVazio) return;
    onMudar({ ...draft, name: titulo.trim() });
    setEditandoTitulo(false);
  };
  const mudarCondicao = (i: number, c: RuleDraftCondition) =>
    onMudar({ ...draft, conditions: draft.conditions.map((x, j) => (j === i ? c : x)) });

  return (
    <div className="bl-queue-card bl-rule-card bl-rule-card--aberta">
      <div className="bl-rule-card-titulo">
        {editandoTitulo ? (
          <>
            <Campo
              autoFocus
              value={titulo}
              aria-label="Nome da regra"
              aria-invalid={tituloVazio || undefined}
              onChange={(e) => setTitulo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  confirmarTitulo();
                } else if (e.key === 'Escape') {
                  setTitulo(draft.name);
                  setEditandoTitulo(false);
                }
              }}
            />
            <button
              type="button"
              className="iconbtn"
              aria-label="Cancelar edição"
              title="Cancelar edição"
              onClick={() => {
                setTitulo(draft.name);
                setEditandoTitulo(false);
              }}
            >
              <Icone nome="x" tamanho={18} />
            </button>
            <button
              type="button"
              className="iconbtn"
              aria-label="Confirmar edição"
              title="Confirmar edição"
              disabled={tituloVazio}
              onClick={confirmarTitulo}
            >
              <Icone nome="cheque" tamanho={18} />
            </button>
          </>
        ) : (
          <>
            <h4>{draft.name}</h4>
            <button
              type="button"
              className="iconbtn"
              aria-label="Editar nome da regra"
              title="Editar nome da regra"
              onClick={() => {
                setTitulo(draft.name);
                setEditandoTitulo(true);
              }}
            >
              <Icone nome="lapis" tamanho={18} />
            </button>
          </>
        )}
      </div>
      {editandoTitulo && tituloVazio ? <span className="at-sc-erro">{CAMPO_OBRIGATORIO}</span> : null}

      <div className="bl-rule-outline">
        {draft.conditions.map((c, i) => (
          <div key={i} className="bl-rule-condition">
            <div className="bl-rule-condition-campos">
              <Select
                aria-label="Se"
                rotulo="Se"
                value={c.source}
                onChange={(e) => mudarCondicao(i, { ...c, source: e.target.value })}
              >
                {RULE_SOURCES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.rotulo}
                  </option>
                ))}
                {RULE_SOURCES.some((s) => s.value === c.source) ? null : (
                  <option value={c.source}>{rotuloDoCampo(c.source)}</option>
                )}
              </Select>
              <Select
                aria-label="Condição"
                rotulo="Condição"
                value={c.comparison}
                onChange={(e) => mudarCondicao(i, { ...c, comparison: e.target.value as RuleComparison })}
              >
                {RULE_COMPARISONS.map((x) => (
                  <option key={x.value} value={x.value}>
                    {x.rotulo}
                  </option>
                ))}
              </Select>
              <button
                type="button"
                className="iconbtn bl-rule-condition-remover"
                aria-label="Remover condição"
                title="Remover condição"
                onClick={() => onMudar({ ...draft, conditions: draft.conditions.filter((_, j) => j !== i) })}
              >
                <ManagementIcon nome="lixeira" tamanho={18} />
              </button>
            </div>
            {c.source === 'Contact.Extras' ? (
              <div className="bl-rule-condition-extra">
                <Campo
                  aria-label="Propriedade extra do contato"
                  placeholder="Propriedade"
                  value={c.extraKey}
                  aria-invalid={estado.extraKeyMissing[i] || undefined}
                  onChange={(e) => mudarCondicao(i, { ...c, extraKey: e.target.value })}
                />
              </div>
            ) : null}
            <ChipsInput
              label="Valor"
              rotulo="Valor"
              placeholder="Valores"
              values={c.values}
              onChange={(values) => mudarCondicao(i, { ...c, values })}
              erro={estado.valuesMissing[i] ? CAMPO_OBRIGATORIO : undefined}
            />
          </div>
        ))}
      </div>

      <div className="bl-rule-adicionar">
        <Botao
          icone="mais"
          className="bl-rules-ghost"
          onClick={() => onMudar({ ...draft, conditions: [...draft.conditions, newRuleCondition()] })}
        >
          Adicionar condição
        </Botao>
      </div>

      <div className="bl-queues-form-botoes">
        <Botao onClick={onCancelar} disabled={salvando}>
          Cancelar
        </Botao>
        <Botao
          variante="primario"
          onClick={onConfirmar}
          disabled={salvando || estado.confirmDisabled}
          title={
            !estado.valuesMissing.some(Boolean) && draftToApi(draft) === null
              ? 'Com mais de uma condição, várias opções no mesmo campo precisam seguir a combinação da regra.'
              : undefined
          }
        >
          Confirmar
        </Botao>
      </div>
    </div>
  );
}
