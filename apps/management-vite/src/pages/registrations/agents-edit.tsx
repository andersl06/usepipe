import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Avatar, Botao, Campo, Etiqueta } from '@pipe/ui';
import { useRead } from '../../lib/query';
import type { AgentRegistered, QueueRegistered } from '../../lib/registrations';
import { aplicarInSelection } from '../../lib/agents-gravar';
import { editTitulo } from '../../lib/agents';
import { Selection } from '../../components/selection';
import { useContact } from '../flow/contact';
import { attendanceBase } from '../operation/shell';

/**
 * `/team/create` e `/team/edit` da origem — as DUAS páginas próprias que
 * `modal.addAgent`/`modal.editAgent` nomeiam (`FICHA-atendentes-filas-
 * pausas.md` §a.1/§a.4). Sem `:id` na URL: a seleção viaja em `?atendentes=`,
 * porque a edição é EM LOTE — as três variantes de `editDropdown.title`
 * ("Editar 1 atendente" / "Editar N atendentes") só existem para isso.
 *
 * **"Adicionar atendente" não tem formulário aqui, e isso é dito, não
 * escondido.** No Pipe não existe criação solta de conta: quem entra recebe
 * convite (`/convite/:token`). Inventar um formulário que não grava nada
 * seria pior do que admitir a lacuna.
 *
 * **Os campos do lote são os que o Pipe tem.** A origem pede "Equipe" e
 * "Fila" como dois conceitos separados (`team`/`queue` no `i18n.js`); no
 * Pipe só existe FILA — o teto de conversas simultâneas nasce da
 * participação nela (`aplicarNaSelecao`, `lib/atendentes-gravar.ts`), não de
 * um cadastro de atendente à parte. "Equipe"/`teamsPlaceholder` ficou fora.
 */
export function AgentPageEdit({ modo }: { modo: 'editar' | 'adicionar' }) {
  const [params] = useSearchParams();
  const navegar = useNavigate();
  const { contact } = useContact();
  const base = attendanceBase(contact.tipo, contact.id);
  const ids = (params.get('atendentes') ?? '').split(',').filter(Boolean);

  if (modo === 'adicionar') {
    return (
      <>
        <div className="board-head">
          <h2>Adicionar atendente</h2>
        </div>
        <div className="vazio">
          <b>Ainda não dá para criar conta por aqui</b>
          <p>
            No Pipe, quem entra na equipe recebe um convite — não há cadastro solto de conta nesta tela. Para
            colocar alguém já cadastrado numa fila, volte e use o ícone <b>Editar</b> na lista.
          </p>
          <button type="button" className="btn" onClick={() => navegar(`${base}/atendentes/gestao`)}>
            Voltar para Gestão de atendentes
          </button>
        </div>
      </>
    );
  }

  return <EditInLote ids={ids} base={base} />;
}

function EditInLote({ ids, base }: { ids: readonly string[]; base: string }) {
  const navegar = useNavigate();
  const readAgents = useRead<AgentRegistered[]>('/v1/management/agents/management');
  const readQueues = useRead<{ queues: QueueRegistered[] }>('/v1/management/agents/queues');

  const [queueId, setQueueId] = useState('');
  const [capacity, setCapacity] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!readAgents.data || !readQueues.data) return null;
  const selecionados = readAgents.data.filter((a) => ids.includes(a.id));

  if (selecionados.length === 0) {
    return (
      <div className="vazio">
        <b>Nenhum atendente selecionado</b>
        <p>
          <button type="button" className="btn" onClick={() => navegar(`${base}/atendentes/gestao`)}>
            Voltar para Gestão de atendentes
          </button>
        </p>
      </div>
    );
  }

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    if (!queueId) return;
    setEnviando(true);
    setError(null);
    const resultado = await aplicarInSelection(ids, queueId, capacity.trim() ? Number(capacity) : null);
    setEnviando(false);
    if (resultado.ok) navegar(`${base}/atendentes/gestao`);
    else setError(resultado.error);
  }

  return (
    <>
      <div className="board-head">
        <h2>{editTitulo(selecionados.length)}</h2>
      </div>

      <p className="sub">
        Para editar o(s) atendente(s) selecionado(s), preencha pelo menos um dos campos abaixo.
      </p>

      <div className="lista-selecionados">
        {selecionados.map((a) => (
          <span key={a.id} className="selecionado-chip">
            <Avatar nome={a.nome} /> {a.nome}
          </span>
        ))}
      </div>

      <form className="form-cadastro" onSubmit={(e) => void salvar(e)}>
        <div className="form-linha">
          <label className="form-campo" style={{ flexBasis: '260px' }}>
            <span className="sub">Fila</span>
            <Selection value={queueId} onChange={(e) => setQueueId(e.target.value)} aria-label="Fila" required>
              <option value="">Escolha uma fila</option>
              {readQueues.data.queues.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </Selection>
          </label>

          <label className="form-campo" style={{ flexBasis: '220px' }}>
            <span className="sub">Nº de tickets simultâneos</span>
            <Campo
              type="number"
              min={1}
              max={200}
              placeholder="Padrão da fila"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              disabled={enviando}
            />
          </label>
        </div>

        {error ? <Etiqueta tom="erro">{error}</Etiqueta> : null}

        <div className="cl-acoes">
          <Botao type="button" onClick={() => navegar(`${base}/atendentes/gestao`)} disabled={enviando}>
            Cancelar
          </Botao>
          <Botao type="submit" variante="primario" disabled={enviando || !queueId}>
            {enviando ? 'Salvando…' : 'Salvar'}
          </Botao>
        </div>
      </form>
    </>
  );
}
