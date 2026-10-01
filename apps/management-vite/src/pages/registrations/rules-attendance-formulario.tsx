import { useActionState, useEffect, useRef, useState } from 'react';
import { Botao, Campo, Etiqueta, Seletor } from '@pipe/ui';
import { saveRuleQueue, type Resultado } from '../../lib/actions';
import { useContact } from '../flow/contact';
import { editRuleQueue } from '../../lib/registrations-gravar';
import {
  CAMPOS_DE_REGRA,
  OPERADORES_DE_REGRA,
  PREFIX_ATTRIBUTE,
  ROTULO_CAMPO,
  ROTULO_OPERADOR,
  type OperadorDeRegra,
} from '../../lib/rule-queue';
import type { QueueForChoose, QueueRegisteredRule } from '../../lib/registrations';
import { envioQuePreserva } from '../../components/envio-de-formulario';

/**
 * Entry rule registration. Conditions are repeated rows of `campo` / `operador` / `value`: `FormData` returns fields with the same name as a list, and the action reads all three in parallel. A blank row is ignored — the form starts with one and the person adds as many as needed. Submission goes through `envioQuePreserva` because this is the most expensive form to retype in Gestão: a validation error with React 19's native `action` would wipe out the name, the queue, the combinator and every condition at once.
 */

/** Extra contact field: the key is free-form, and the prefix is what the engine understands. */
const EXTRA = '__extra__';

interface ConditionInitial {
  field: string;
  operator: OperadorDeRegra;
  value: string;
}

function ConditionRow({
  desabilitado,
  inicial,
}: {
  desabilitado: boolean;
  /** Fills the row when editing an existing rule — absent means "blank row" (creation). */
  inicial?: ConditionInitial;
}) {
  const campoInicialEhFixo = !inicial || (CAMPOS_DE_REGRA as readonly string[]).includes(inicial.field);
  const [campo, setCampo] = useState<string>(
    inicial ? (campoInicialEhFixo ? inicial.field : EXTRA) : CAMPOS_DE_REGRA[0],
  );
  const keyExtraInitial =
    inicial && !campoInicialEhFixo ? inicial.field.slice(PREFIX_ATTRIBUTE.length) : '';

  return (
    <div className="form-linha">
      <label className="form-campo" style={{ flexBasis: '220px' }}>
        <span className="sub">Campo</span>
        <Seletor value={campo} onChange={(e) => setCampo(e.target.value)} disabled={desabilitado}>
          {CAMPOS_DE_REGRA.map((c) => (
            <option key={c} value={c}>
              {ROTULO_CAMPO[c]}
            </option>
          ))}
          <option value={EXTRA}>Campo extra do contato…</option>
        </Seletor>
      </label>

      {campo === EXTRA ? (
        <label className="form-campo" style={{ flexBasis: '200px' }}>
          <span className="sub">Chave do campo extra</span>
          {/*
 * The `name` is the same `campo` as in the list: only how the value gets assembled changes. The action receives `contato.atributos.plano` either way.
 */}
          <Campo
            name="campo"
            defaultValue={keyExtraInitial}
            placeholder="plano"
            pattern="[A-Za-z0-9_]+"
            title="Letras, números e sublinhado."
            required
            disabled={desabilitado}
          />
        </label>
      ) : (
        <input type="hidden" name="campo" value={campo} />
      )}

      <label className="form-campo" style={{ flexBasis: '180px' }}>
        <span className="sub">Operador</span>
        <Seletor name="operador" defaultValue={inicial?.operator ?? 'contem'} disabled={desabilitado}>
          {OPERADORES_DE_REGRA.map((o) => (
            <option key={o} value={o}>
              {ROTULO_OPERADOR[o]}
            </option>
          ))}
        </Seletor>
      </label>

      <label className="form-campo" style={{ flexBasis: '240px' }}>
        <span className="sub">Valor</span>
        <Campo name="valor" defaultValue={inicial?.value ?? ''} placeholder="boleto" disabled={desabilitado} />
      </label>
    </div>
  );
}

/** `(prev, dados) => Resultado` no mesmo formato de `acaoRemota`, mas chamando o `PATCH` REST em vez de `acoes/:acao`. */
function editAction(flowId: string, id: string) {
  return async (_anterior: Resultado, data: FormData): Promise<Resultado> => {
    const campos = data.getAll('campo').map((v) => String(v));
    const operadores = data.getAll('operador').map((v) => String(v));
    const values = data.getAll('valor').map((v) => String(v));
    const conditions = campos
      .map((campo, i) => ({
        campo,
        operador: (operadores[i] ?? 'contem') as OperadorDeRegra,
        value: values[i] ?? '',
      }))
      // A blank row isn't included — same filter as `salvarRegraFila` (create action).
      .filter((c) => c.campo || c.value);

    const resultado = await editRuleQueue(flowId, id, {
      nome: String(data.get('nome') ?? '').trim(),
      queueDestinationId: String(data.get('filaDestinoId') ?? '').trim(),
      combinador: (String(data.get('combinador') ?? 'e') as 'e' | 'ou'),
      order: Number(data.get('ordem') ?? '0'),
      conditions,
    });
    return resultado.ok ? { ok: true } : { ok: false, error: resultado.error };
  };
}

export function RuleQueueForm({
  queues,
  regraExistente,
  aoSalvar,
  destinoFixo,
}: {
  queues: readonly QueueForChoose[];
  /** Presente = editar esta regra (`PATCH`); ausente = criar (mesmo de sempre). */
  regraExistente?: QueueRegisteredRule;
  /**
   * Closes the modal once saving succeeds — without this the person is left staring at their own blank form, not knowing if it worked.
   */
  aoSalvar?: () => void;
  /**
   * The Builder's embedded queue-rules mode (02-34) already knows which queue the rule belongs
   * to, so the picker is replaced by a read-only field plus a hidden input carrying the id — a
   * `disabled` select would drop `filaDestinoId` from the submitted `FormData` entirely. Absent
   * (the Desk page's normal call), the picker below is unchanged.
   */
  destinoFixo?: { id: string; name: string };
}) {
  const { contact } = useContact();
  const editando = regraExistente !== undefined;
  const formRef = useRef<HTMLFormElement>(null);
  const [linhas, setLinhas] = useState(regraExistente?.conditions.length ?? 1);
  /*
   * The form's `reset()` doesn't undo the field-selector state, which is controlled. Changing the generation remounts the zeroed-out rows — same effect, with one line instead of a `useImperativeHandle` per row.
   */
  const [generation, setGeneration] = useState(0);
  const [resultado, enviar, enviando] = useActionState(
    regraExistente ? editAction(contact.id, regraExistente.id) : saveRuleQueue,
    { ok: true },
  );
  /*
   * `useActionState` starts with `{ ok: true }` — the initial value, not a submission confirmation. Without this guard, the effect below would think saving had just finished as soon as the form mounts (inside the modal, for instance) and would close everything immediately, before the person typed anything. Compares by identity, not a "just mounted" `ref`: StrictMode's `useEffect` runs invoke→cleanup→invoke one extra time in development, and a boolean `ref` turns true too early in that replay.
   */
  const stateInitial = useRef(resultado);

  useEffect(() => {
    if (resultado === stateInitial.current) return;
    if (resultado.ok) {
      formRef.current?.reset();
      setLinhas(regraExistente?.conditions.length ?? 1);
      setGeneration((g) => g + 1);
      aoSalvar?.();
    }
  }, [resultado]);

  return (
    <>
      <p className="sub">
        A regra manda a conversa para uma fila. A <b>ordem</b> decide quem é avaliada antes: a
        primeira que casar vence, e as de baixo não chegam a ser testadas.
      </p>

      <form
        ref={formRef}
        onSubmit={envioQuePreserva((data) => {
          // The extra field goes to the server with the prefix the engine reads.
          // Montar aqui evita um `name` diferente por tipo de linha, que faria
          // the three parallel lists ending up with different lengths.
          const campos = data.getAll('campo').map((v) => String(v));
          data.delete('campo');
          for (const c of campos) {
            const fixo = (CAMPOS_DE_REGRA as readonly string[]).includes(c);
            data.append('campo', fixo || c === '' ? c : `${PREFIX_ATTRIBUTE}${c}`);
          }
          data.set('fluxoId', contact.id);
          enviar(data);
        })}
        className="form-registration"
      >
        <div className="form-linha">
          <label className="form-campo" style={{ flexBasis: '240px' }}>
            <span className="sub">Nome da regra</span>
            <Campo
              name="nome"
              defaultValue={regraExistente?.name}
              placeholder="Cobrança por palavra-chave"
              required
              disabled={enviando}
            />
          </label>

          {destinoFixo ? (
            <label className="form-campo" style={{ flexBasis: '220px' }}>
              <span className="sub">Fila de destino</span>
              <Campo value={destinoFixo.name} readOnly disabled={enviando} />
              <input type="hidden" name="filaDestinoId" value={destinoFixo.id} />
            </label>
          ) : (
            <label className="form-campo" style={{ flexBasis: '220px' }}>
              <span className="sub">Fila de destino</span>
              <Seletor
                name="filaDestinoId"
                defaultValue={regraExistente?.queueDestinationId ?? ''}
                required
                disabled={enviando}
              >
                <option value="">Escolha a fila</option>
                {queues.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.ativa ? f.name : `${f.name} (desativada)`}
                  </option>
                ))}
              </Seletor>
            </label>
          )}

          <label className="form-campo">
            <span className="sub">Ordem</span>
            <Campo
              name="ordem"
              type="number"
              min={0}
              max={999}
              defaultValue={regraExistente?.order ?? 0}
              disabled={enviando}
            />
          </label>

          <label className="form-campo" style={{ flexBasis: '200px' }}>
            <span className="sub">Combinar condições com</span>
            <Seletor name="combinador" defaultValue={regraExistente?.combiner ?? 'e'} disabled={enviando}>
              <option value="e">E — todas precisam casar</option>
              <option value="ou">OU — basta uma casar</option>
            </Seletor>
          </label>
        </div>

        <p className="note">
          <b>Condições.</b> Comparação sem acento e sem caixa. “Contém” também procura dentro de
          lista de valores. Linha em branco é ignorada — uma regra sem nenhuma condição preenchida é
          recusada, porque regra sem condição nunca casa e some da operação em silêncio.
        </p>

        {Array.from({ length: linhas }, (_, i) => (
          <ConditionRow key={`${generation}-${i}`} desabilitado={enviando} inicial={regraExistente?.conditions[i]} />
        ))}

        <div className="cl-actions" style={{ justifyContent: 'flex-start' }}>
          <Botao type="button" onClick={() => setLinhas((n) => n + 1)} disabled={enviando}>
            Mais uma condição
          </Botao>
        </div>

        {resultado.error ? <Etiqueta tom="erro">{resultado.error}</Etiqueta> : null}

        <div className="cl-actions">
          <Botao type="submit" variante="primario" disabled={enviando}>
            {enviando ? 'Salvando…' : editando ? 'Salvar alterações' : 'Salvar regra'}
          </Botao>
        </div>
      </form>
    </>
  );
}
