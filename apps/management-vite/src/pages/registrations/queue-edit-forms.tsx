import { useId, useMemo, useState, type FormEvent } from 'react';
import { Botao, BotaoDeIcone, Campo, Etiqueta, Illustration } from '@pipe/ui';
import { Select } from '@pipe/ui/select';
import { ChipsInput } from '@pipe/ui/chips-input';
import { Modal } from '@pipe/ui/modal';
import { useRead } from '../../lib/query';
import { useContact } from '../flow/contact';
import type {
  AgentRegistered,
  QueueRegistered,
  QueueRegisteredRule,
} from '../../lib/registrations';
import { rotuloDoCampo } from '../../lib/rule-queue';
import {
  CAMPO_EXTRA,
  CAMPOS_DO_FORMULARIO,
  OPERADORES_DO_FORMULARIO,
  condicaoDePriorizacao,
  condicaoEmBranco,
  condicoesGravaveis,
  lerCondicaoDePriorizacao,
  lerEmails,
  proximoNomeDeRegra,
  rascunhoDeCondicao,
  resolverEmails,
  type CondicaoRascunho,
} from '../../lib/fila-cartoes';
import {
  createRuleQueue,
  editRuleQueue,
  falhaAoSalvar,
  linkAgentInQueue,
} from '../../lib/registrations-gravar';
import { priorityCreateRule, priorityEditRule } from '../../lib/agents-gravar';
import { rotuloDoNivel, type PriorityRule } from '../../lib/rules-priority';

/**
 * Formulários e modal da edição de fila. Tudo acontece na própria página (a URL não muda): o modal de atribuição e os formulários de regra substituem a lista dentro do cartão.
 */

/* ----------------------------------------------------------- nome editável */

/** Título do formulário com lápis para renomear no lugar. */
export function NomeEditavel({
  valor,
  onChange,
  rotulo,
  desabilitado,
}: {
  valor: string;
  onChange: (valor: string) => void;
  rotulo: string;
  desabilitado: boolean;
}) {
  const [editando, setEditando] = useState(false);
  if (editando) {
    return (
      <Campo
        className="fila-form-nome"
        value={valor}
        autoFocus
        aria-label={rotulo}
        disabled={desabilitado}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => valor.trim() && setEditando(false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (valor.trim()) setEditando(false);
          }
        }}
      />
    );
  }
  return (
    <div className="fila-form-titulo">
      <h3>{valor}</h3>
      <BotaoDeIcone nome="lapis" rotulo={`Renomear: ${rotulo}`} onClick={() => setEditando(true)} />
    </div>
  );
}

/* ---------------------------------------------------- editor de condições */

export function ConditionsEditor({
  condicoes,
  onChange,
  combinador,
  onCombinador,
  desabilitado,
}: {
  condicoes: readonly CondicaoRascunho[];
  onChange: (lista: CondicaoRascunho[]) => void;
  combinador: 'e' | 'ou';
  onCombinador: (valor: 'e' | 'ou') => void;
  desabilitado: boolean;
}) {
  const base = useId();
  const mudar = (i: number, parcial: Partial<CondicaoRascunho>) =>
    onChange(condicoes.map((c, j) => (j === i ? { ...c, ...parcial } : c)));

  return (
    <div className="fila-condicoes">
      {condicoes.map((c, i) => {
        const conhecido = CAMPOS_DO_FORMULARIO.some((f) => f.valor === c.campo);
        return (
          <div key={i} className={i > 0 ? 'fila-condicao fila-condicao-recuada' : 'fila-condicao'}>
            {i === 1 ? (
              <div className="fila-conector">
                <Select
                  value={combinador}
                  onChange={(e) => onCombinador(e.target.value as 'e' | 'ou')}
                  disabled={desabilitado}
                  aria-label="Conector entre as condições"
                >
                  <option value="e">E</option>
                  <option value="ou">OU</option>
                </Select>
                <span className="sub">
                  {combinador === 'ou'
                    ? 'qualquer uma das condições abaixo'
                    : 'todas as condições abaixo'}
                </span>
              </div>
            ) : null}
            <div className="fila-condicao-linha">
              <label className="form-campo" htmlFor={`${base}-campo-${i}`}>
                <span className="sub">Se</span>
                <Select
                  id={`${base}-campo-${i}`}
                  value={c.campo}
                  onChange={(e) => mudar(i, { campo: e.target.value })}
                  disabled={desabilitado}
                >
                  {conhecido ? null : <option value={c.campo}>{rotuloDoCampo(c.campo)}</option>}
                  {CAMPOS_DO_FORMULARIO.map((f) => (
                    <option key={f.valor} value={f.valor}>
                      {f.rotulo}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="form-campo" htmlFor={`${base}-op-${i}`}>
                <span className="sub">Condição</span>
                <Select
                  id={`${base}-op-${i}`}
                  value={c.operador}
                  onChange={(e) =>
                    mudar(i, { operador: e.target.value as CondicaoRascunho['operador'] })
                  }
                  disabled={desabilitado}
                >
                  {OPERADORES_DO_FORMULARIO.map((o) => (
                    <option key={o.valor} value={o.valor}>
                      {o.rotulo}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="form-campo" htmlFor={`${base}-valor-${i}`}>
                <span className="sub">Valor</span>
                <Campo
                  id={`${base}-valor-${i}`}
                  value={c.valor}
                  onChange={(e) => mudar(i, { valor: e.target.value })}
                  disabled={desabilitado}
                />
              </label>
              {i > 0 ? (
                <BotaoDeIcone
                  nome="x"
                  rotulo={`Remover a condição ${i + 1}`}
                  onClick={() => onChange(condicoes.filter((_, j) => j !== i))}
                  disabled={desabilitado}
                />
              ) : null}
            </div>
            {c.campo === CAMPO_EXTRA ? (
              <label className="form-campo fila-condicao-extra" htmlFor={`${base}-chave-${i}`}>
                <span className="sub">Chave do campo extra</span>
                <Campo
                  id={`${base}-chave-${i}`}
                  value={c.chave}
                  placeholder="plano"
                  pattern="[A-Za-z0-9_]+"
                  title="Letras, números e sublinhado."
                  onChange={(e) => mudar(i, { chave: e.target.value })}
                  disabled={desabilitado}
                />
              </label>
            ) : null}
          </div>
        );
      })}
      <div className="fila-condicoes-adicionar">
        <Botao
          type="button"
          icone="mais"
          onClick={() => onChange([...condicoes, condicaoEmBranco()])}
          disabled={desabilitado}
        >
          Adicionar condição
        </Botao>
      </div>
    </div>
  );
}

/* ----------------------------------------------- regra de atendimento */

/** Formulário inline de "Criar regra" / "Editar regra" do cartão Regras de Atendimento. */
export function RuleAttendanceForm({
  queue,
  regra,
  todasAsRegras,
  onFechar,
}: {
  queue: QueueRegistered;
  regra?: QueueRegisteredRule;
  /** Regras do fluxo, para o nome padrão e a ordem da nova. */
  todasAsRegras: readonly QueueRegisteredRule[];
  onFechar: () => void;
}) {
  const { contact } = useContact();
  const [nome, setNome] = useState(
    () =>
      regra?.name ??
      proximoNomeDeRegra(
        todasAsRegras.filter((r) => r.queueDestinationId === queue.id).map((r) => r.name),
      ),
  );
  const [condicoes, setCondicoes] = useState<CondicaoRascunho[]>(() =>
    regra && regra.conditions.length > 0
      ? regra.conditions.map((c) => rascunhoDeCondicao(c.field, c.operator, c.value))
      : [condicaoEmBranco()],
  );
  const [combinador, setCombinador] = useState<'e' | 'ou'>(regra?.combiner ?? 'ou');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const gravaveis = condicoesGravaveis(condicoes);
  const valido = nome.trim() !== '' && gravaveis !== null;

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    if (!valido || !gravaveis) return;
    setEnviando(true);
    setError(null);
    const resultado = regra
      ? await editRuleQueue(contact.id, regra.id, {
          nome: nome.trim(),
          combinador,
          conditions: gravaveis.map((c) => ({
            campo: c.campo,
            operador: c.operador,
            value: c.valor,
          })),
        })
      : await createRuleQueue(contact.id, {
          nome: nome.trim(),
          // As regras são avaliadas por `ordem`; a nova entra por último.
          order: Math.min(999, Math.max(-1, ...todasAsRegras.map((r) => r.order)) + 1),
          combinador,
          queueDestinationId: queue.id,
          conditions: gravaveis,
        });
    setEnviando(false);
    if (resultado.ok) onFechar();
    else setError(falhaAoSalvar(resultado.error));
  }

  return (
    <form className="fila-form" onSubmit={(e) => void salvar(e)}>
      <NomeEditavel
        valor={nome}
        onChange={setNome}
        rotulo="Nome da regra"
        desabilitado={enviando}
      />
      <ConditionsEditor
        condicoes={condicoes}
        onChange={setCondicoes}
        combinador={combinador}
        onCombinador={setCombinador}
        desabilitado={enviando}
      />
      {error ? <Etiqueta tom="erro">{error}</Etiqueta> : null}
      <div className="cl-actions">
        <Botao type="button" onClick={onFechar} disabled={enviando}>
          Cancelar
        </Botao>
        <Botao type="submit" variante="primario" disabled={enviando || !valido}>
          {enviando ? 'Salvando…' : 'Salvar'}
        </Botao>
      </div>
    </form>
  );
}

/* ---------------------------------------------- regra de priorização */

const NIVEIS_DO_FORMULARIO = ['baixa', 'media', 'alta'] as const;

/** Formulário inline de "Criar regra de priorização" / edição. */
export function RulePriorityForm({
  queueId,
  regra,
  nomesExistentes,
  onFechar,
}: {
  queueId: string;
  regra?: PriorityRule;
  nomesExistentes: readonly string[];
  onFechar: () => void;
}) {
  const { contact } = useContact();
  const lida = regra ? lerCondicaoDePriorizacao(regra.condition) : null;
  const [nome, setNome] = useState(
    () => regra?.name ?? proximoNomeDeRegra(nomesExistentes, 'Regra de priorização'),
  );
  const [nivel, setNivel] = useState(regra?.level ?? 'baixa');
  const [aplicar, setAplicar] = useState(lida !== null);
  const [condicoes, setCondicoes] = useState<CondicaoRascunho[]>(
    lida?.condicoes ?? [condicaoEmBranco()],
  );
  const [combinador, setCombinador] = useState<'e' | 'ou'>(lida?.combinador ?? 'ou');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const gravaveis = condicoesGravaveis(condicoes);
  const valido = nome.trim() !== '' && (!aplicar || gravaveis !== null);
  const niveis: readonly string[] = NIVEIS_DO_FORMULARIO.includes(nivel as 'baixa')
    ? NIVEIS_DO_FORMULARIO
    : [...NIVEIS_DO_FORMULARIO, nivel];

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    if (!valido) return;
    setEnviando(true);
    setError(null);
    const condition = condicaoDePriorizacao(aplicar, combinador, gravaveis ?? []);
    const resultado = regra
      ? await priorityEditRule(contact.id, regra.id, { nome: nome.trim(), nivel, condition })
      : await priorityCreateRule(contact.id, {
          nome: nome.trim(),
          nivel,
          scopeType: 'fila',
          scopeId: queueId,
          condition,
        });
    setEnviando(false);
    if (resultado.ok) onFechar();
    else setError(falhaAoSalvar(resultado.error));
  }

  return (
    <form className="fila-form" onSubmit={(e) => void salvar(e)}>
      <NomeEditavel
        valor={nome}
        onChange={setNome}
        rotulo="Nome da regra de priorização"
        desabilitado={enviando}
      />
      <label className="form-campo fila-urgencia">
        <span className="sub">Grau de urgência</span>
        <Select value={nivel} onChange={(e) => setNivel(e.target.value)} disabled={enviando}>
          {niveis.map((n) => (
            <option key={n} value={n}>
              {n === 'baixa' || n === 'media' || n === 'alta'
                ? `${rotuloDoNivel(n)} prioridade`
                : rotuloDoNivel(n)}
            </option>
          ))}
        </Select>
      </label>
      <label className="form-caixa">
        <input
          type="checkbox"
          checked={aplicar}
          onChange={(e) => setAplicar(e.target.checked)}
          disabled={enviando}
        />
        <span>Aplicar condições a esta regra de priorização</span>
      </label>
      {aplicar ? (
        <ConditionsEditor
          condicoes={condicoes}
          onChange={setCondicoes}
          combinador={combinador}
          onCombinador={setCombinador}
          desabilitado={enviando}
        />
      ) : null}
      {error ? <Etiqueta tom="erro">{error}</Etiqueta> : null}
      <div className="cl-actions">
        <Botao type="button" onClick={onFechar} disabled={enviando}>
          Cancelar
        </Botao>
        <Botao type="submit" variante="primario" disabled={enviando || !valido}>
          {enviando ? 'Salvando…' : 'Salvar'}
        </Botao>
      </div>
    </form>
  );
}

/* ---------------------------------------------- modal de atendentes */

/** Atribui à fila usuários que já existem no ambiente, por e-mail. Quem não tem conta é recusado com mensagem própria; nada é criado aqui. */
export function AddAttendantsModal({
  queue,
  onFechar,
}: {
  queue: QueueRegistered;
  onFechar: () => void;
}) {
  const { contact } = useContact();
  const tituloId = useId();
  const usuarios = useRead<AgentRegistered[]>('/v1/management/agents/management');
  const [emMassa, setEmMassa] = useState(false);
  const [emails, setEmails] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [mensagens, setMensagens] = useState<{ email: string; motivo: string }[]>([]);
  const [atribuidos, setAtribuidos] = useState(0);

  const jaNaFila = useMemo(() => new Set(queue.agents.map((a) => a.id)), [queue.agents]);
  const opcoes = useMemo(
    () =>
      (usuarios.data ?? [])
        .filter((u) => u.active && !jaNaFila.has(u.id))
        .map((u) => u.email.toLowerCase())
        .sort((a, b) => a.localeCompare(b, 'pt-BR'))
        .map((e) => ({ id: e, nome: e })),
    [usuarios.data, jaNaFila],
  );

  async function atribuir() {
    if (!usuarios.data) return;
    setEnviando(true);
    setMensagens([]);
    setAtribuidos(0);
    const { achados, recusados } = resolverEmails(
      lerEmails(emails.join(',')),
      usuarios.data,
      jaNaFila,
    );
    const falhas = [...recusados];
    const feitos: string[] = [];
    for (const a of achados) {
      const r = await linkAgentInQueue(contact.id, queue.id, a.userId);
      if (r.ok) feitos.push(a.email);
      else falhas.push({ email: a.email, motivo: r.error });
    }
    setEnviando(false);
    if (falhas.length === 0) {
      onFechar();
      return;
    }
    // Quem foi atribuído sai do campo; ficam só os e-mails com problema, para corrigir e tentar de novo.
    setEmails((atual) => atual.filter((e) => !feitos.includes(e.trim().toLowerCase())));
    setAtribuidos(feitos.length);
    setMensagens(falhas);
  }

  return (
    <Modal
      rotuloId={tituloId}
      onFechar={enviando ? undefined : onFechar}
      skin={{ fundo: 'modal-fundo', caixa: 'fila-modal-atribuir' }}
    >
      <BotaoDeIcone
        nome="x"
        rotulo="Fechar"
        className="fila-modal-fechar"
        onClick={onFechar}
        disabled={enviando}
      />
      <div className="fila-modal-arte" aria-hidden="true">
        <Illustration nome="busca" tamanho={160} />
      </div>
      <div className="fila-modal-conteudo">
        <div className="fila-modal-cabecalho">
          <div>
            <h3 id={tituloId}>Adicionar atendentes</h3>
            <p className="sub">Procure por seus atendentes para atribuí-los à fila</p>
          </div>
          <label className="fila-modal-massa">
            <span className="sub">Inserção em massa</span>
            <button
              type="button"
              className="interruptor"
              role="switch"
              aria-checked={emMassa}
              aria-label="Inserção em massa"
              onClick={() => setEmMassa((v) => !v)}
              disabled={enviando}
            >
              <span className="interruptor-bolinha" />
            </button>
          </label>
        </div>

        <ChipsInput
          key={emMassa ? 'massa' : 'lista'}
          rotulo="E-mails dos atendentes"
          label="E-mails dos atendentes"
          placeholder="Insira um ou mais e-mails dos atendentes"
          options={emMassa ? undefined : opcoes}
          values={emails}
          onChange={setEmails}
        />
        {emMassa ? <p className="note">Insira os valores separados por vírgula.</p> : null}
        {usuarios.isError ? (
          <Etiqueta tom="erro">Não foi possível carregar os atendentes do ambiente.</Etiqueta>
        ) : null}

        {atribuidos > 0 ? (
          <p className="note" role="status">
            {atribuidos === 1
              ? '1 atendente atribuído à fila.'
              : `${atribuidos} atendentes atribuídos à fila.`}
          </p>
        ) : null}
        {mensagens.length > 0 ? (
          <ul className="fila-modal-erros" role="alert">
            {mensagens.map((m) => (
              <li key={m.email}>
                <b>{m.email}</b>: {m.motivo}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="cl-actions">
          <Botao type="button" onClick={onFechar} disabled={enviando}>
            Cancelar
          </Botao>
          <Botao
            type="button"
            variante="primario"
            onClick={() => void atribuir()}
            disabled={enviando || emails.length === 0 || !usuarios.data}
          >
            {enviando ? 'Atribuindo…' : 'Atribuir'}
          </Botao>
        </div>
      </div>
    </Modal>
  );
}
