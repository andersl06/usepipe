import { useActionState, useEffect, useRef, useState } from 'react';
import { Botao, Campo, Etiqueta, Seletor } from '@pipe/ui';
import type { Resultado } from '../../lib/actions';
import { createRuleSla, editarRegraSla, type PedidoDeRegraSla } from '../../lib/settings-gravar';
import { ROTULO_ALVO, type QueueConfigured, type RegraSlaConfigurada } from '../../lib/settings';
import { envioQuePreserva } from '../../components/envio-de-formulario';

/**
 * SLA rule registration — item 2 of the Attendance registration task. Wires up the buttons on the `regras-sla.tsx` screen (its `TODO(escrita)`) to the API without changing the visuals: the same `form-cadastro`/`Modal` as every registration screen. **Pipe decision — scope is only chosen on CREATE.** Reading (`carregarRegras`, `apps/api/.../configuracoes.ts`) returns `escopoNome` for display, not `escopoId` — there's no way to preselect the queue in the edit form without it. Changing scope after creation is rare (a rule is born tied to one queue or to the whole operation); anyone who needs a scope change deletes and recreates, and editing stays limited to name/target/deadline/alert — which covers the task's request without widening the read.
 */

function pedidoDoFormulario(data: FormData): PedidoDeRegraSla {
  const alertaBruto = String(data.get('alertaSeg') ?? '').trim();
  const scopeType = String(data.get('escopoTipo') ?? 'tenant');
  return {
    nome: String(data.get('nome') ?? '').trim(),
    alvo: String(data.get('alvo') ?? '').trim(),
    prazoSeg: Number(data.get('prazoSeg') ?? 0),
    alertaSeg: alertaBruto ? Number(alertaBruto) : null,
    scopeType,
    scopeId: scopeType === 'fila' ? String(data.get('escopoId') ?? '').trim() : null,
  };
}

function creationAction(_anterior: Resultado, data: FormData): Promise<Resultado> {
  return createRuleSla(pedidoDoFormulario(data)).then((r) =>
    r.ok ? { ok: true } : { ok: false, erro: r.error },
  );
}

function editAction(id: string) {
  // Editing doesn't send scope — see "Decisão Pipe" at the top of the file.
  return async (_anterior: Resultado, data: FormData): Promise<Resultado> => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- descarta escopo de propósito
    const { scopeType, scopeId, ...pedido } = pedidoDoFormulario(data);
    const resultado = await editarRegraSla(id, pedido);
    return resultado.ok ? { ok: true } : { ok: false, error: resultado.error };
  };
}

export function FormularioRegraSla({
  queues,
  regraExistente,
  aoSalvar,
}: {
  queues: readonly QueueConfigured[];
  regraExistente?: RegraSlaConfigurada;
  aoSalvar?: () => void;
}) {
  const editando = regraExistente !== undefined;
  const formRef = useRef<HTMLFormElement>(null);
  const [scope, setScope] = useState(regraExistente?.scopeType ?? 'tenant');
  const [resultado, enviar, enviando] = useActionState(
    regraExistente ? editAction(regraExistente.id) : creationAction,
    { ok: true },
  );
  const stateInitial = useRef(resultado);

  useEffect(() => {
    if (resultado === stateInitial.current) return;
    if (resultado.ok) {
      formRef.current?.reset();
      aoSalvar?.();
    }
  }, [resultado]);

  return (
    <form
      ref={formRef}
      onSubmit={envioQuePreserva((data) => enviar(data))}
      className="form-registration"
    >
      <div className="form-linha">
        <label className="form-campo" style={{ flexBasis: '240px' }}>
          <span className="sub">Nome</span>
          <Campo
            name="nome"
            defaultValue={regraExistente?.nome}
            placeholder="Primeira resposta padrão"
            required
            disabled={enviando}
          />
        </label>

        <label className="form-campo" style={{ flexBasis: '200px' }}>
          <span className="sub">Alvo</span>
          <Seletor name="alvo" defaultValue={regraExistente?.alvo ?? 'primeira_resposta'} disabled={enviando}>
            {Object.entries(ROTULO_ALVO).map(([value, rotulo]) => (
              <option key={value} value={value}>
                {rotulo}
              </option>
            ))}
          </Seletor>
        </label>

        <label className="form-campo">
          <span className="sub">Prazo (segundos)</span>
          <Campo
            name="prazoSeg"
            type="number"
            min={1}
            max={604_800}
            defaultValue={regraExistente?.prazoSeg ?? 3600}
            required
            disabled={enviando}
          />
        </label>

        <label className="form-campo">
          <span className="sub">Alerta (segundos, opcional)</span>
          <Campo
            name="alertaSeg"
            type="number"
            min={1}
            defaultValue={regraExistente?.alertaSeg ?? undefined}
            disabled={enviando}
          />
        </label>
      </div>

      {editando ? null : (
        <div className="form-linha">
          <label className="form-campo" style={{ flexBasis: '200px' }}>
            <span className="sub">Escopo</span>
            <Seletor
              name="escopoTipo"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              disabled={enviando}
            >
              <option value="tenant">Toda a operação</option>
              <option value="fila">Uma fila</option>
            </Seletor>
          </label>

          {scope === 'fila' ? (
            <label className="form-campo" style={{ flexBasis: '220px' }}>
              <span className="sub">Fila</span>
              <Seletor name="escopoId" defaultValue="" required disabled={enviando}>
                <option value="">Escolha a fila</option>
                {queues.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                  </option>
                ))}
              </Seletor>
            </label>
          ) : null}
        </div>
      )}

      {resultado.error ? <Etiqueta tom="erro">{resultado.error}</Etiqueta> : null}

      <div className="cl-actions">
        <Botao type="submit" variante="primario" disabled={enviando}>
          {enviando ? 'Salvando…' : editando ? 'Salvar alterações' : 'Salvar regra'}
        </Botao>
      </div>
    </form>
  );
}
