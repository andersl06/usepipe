import { useMemo, useState, type FormEvent } from 'react';
import { Botao, BotaoDeIcone, Etiqueta } from '@pipe/ui';
import { Select } from '@pipe/ui/select';
import { useContact } from '../flow/contact';
import type { QueueForChoose, QueueRegisteredRule } from '../../lib/registrations';
import {
  condicaoEmBranco,
  condicoesGravaveis,
  proximoNomeDeRegra,
  rascunhoDeCondicao,
  type CondicaoRascunho,
} from '../../lib/fila-cartoes';
import { createRuleQueue, editRuleQueue, falhaAoSalvar } from '../../lib/registrations-gravar';
import { ConditionsEditor, NomeEditavel } from './queue-edit-forms';

/**
 * Formulário de criar/editar regra de atendimento, no lugar da lista e na mesma URL. A regra encaminha para uma fila; o nome nasce como "Regra N" e as condições se combinam com um conector único (E/OU) por regra.
 */
export function RuleQueueForm({
  queues,
  regra,
  todasAsRegras,
  onFechar,
}: {
  queues: readonly QueueForChoose[];
  /** Presente = editar esta regra (`PATCH`); ausente = criar. */
  regra?: QueueRegisteredRule;
  /** Regras do fluxo: nome padrão e posição da nova regra na ordem de avaliação. */
  todasAsRegras: readonly QueueRegisteredRule[];
  onFechar: () => void;
}) {
  const { contact } = useContact();
  const filasOrdenadas = useMemo(
    () => [...queues].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    [queues],
  );
  const [nome, setNome] = useState(
    () => regra?.name ?? proximoNomeDeRegra(todasAsRegras.map((r) => r.name)),
  );
  const [condicoes, setCondicoes] = useState<CondicaoRascunho[]>(() =>
    regra && regra.conditions.length > 0
      ? regra.conditions.map((c) => rascunhoDeCondicao(c.field, c.operator, c.value))
      : [condicaoEmBranco()],
  );
  const [combinador, setCombinador] = useState<'e' | 'ou'>(regra?.combiner ?? 'ou');
  const [filaId, setFilaId] = useState(
    () =>
      regra?.queueDestinationId ??
      (filasOrdenadas.find((f) => f.name.toLowerCase() === 'default') ?? filasOrdenadas[0])?.id ??
      '',
  );
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const gravaveis = condicoesGravaveis(condicoes);
  const valido = nome.trim() !== '' && gravaveis !== null && filaId !== '';

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    if (!valido || !gravaveis) return;
    setEnviando(true);
    setError(null);
    const resultado = regra
      ? await editRuleQueue(contact.id, regra.id, {
          nome: nome.trim(),
          queueDestinationId: filaId,
          combinador,
          conditions: gravaveis.map((c) => ({ campo: c.campo, operador: c.operador, value: c.valor })),
        })
      : await createRuleQueue(contact.id, {
          nome: nome.trim(),
          // As regras são avaliadas por `order`; a nova entra por último.
          order: Math.min(999, Math.max(-1, ...todasAsRegras.map((r) => r.order)) + 1),
          combinador,
          queueDestinationId: filaId,
          conditions: gravaveis,
        });
    setEnviando(false);
    if (resultado.ok) onFechar();
    else setError(falhaAoSalvar(resultado.error));
  }

  return (
    <>
      <div className="board-head regras-form-cabecalho">
        <BotaoDeIcone nome="esquerda" rotulo="Voltar para a lista de regras" onClick={onFechar} />
        <h2>Regras de atendimento</h2>
      </div>
      <form className="fila-form regras-form" onSubmit={(e) => void salvar(e)}>
        <NomeEditavel valor={nome} onChange={setNome} rotulo="Nome da regra" desabilitado={enviando} />
        <ConditionsEditor
          condicoes={condicoes}
          onChange={setCondicoes}
          combinador={combinador}
          onCombinador={setCombinador}
          desabilitado={enviando}
        />
        <label className="form-campo">
          <span className="sub">Encaminhar atendimento para</span>
          <Select value={filaId} onChange={(e) => setFilaId(e.target.value)} disabled={enviando}>
            {filasOrdenadas.map((f) => (
              <option key={f.id} value={f.id}>
                {f.ativa ? f.name : `${f.name} (desativada)`}
              </option>
            ))}
          </Select>
        </label>
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
    </>
  );
}
