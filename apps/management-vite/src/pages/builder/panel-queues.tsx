import { useReducer, useState, type FormEvent } from 'react';
import { Botao, Campo, Carregando, Etiqueta, Icone, Illustration } from '@pipe/ui';
import { useRead } from '../../lib/query';
import type { QueueRegistered } from '../../lib/registrations';
import { toggleQueue } from '../../lib/registrations-gravar';
import { saveQueue } from '../../lib/actions';
import { Interruptor } from '../flow/integrations/interruptor';
import { FloatingSidebar } from './floating-sidebar';
import { filterQueues, pageQueues, queueNameError, queuesPanelReducer } from './queues-panel';

/**
 * The Builder's embedded queue manager (D-56 item 4, reverting D-15): list, search (Enter-only),
 * card switch, and create form, all writing to the same queues the Desk registry reads
 * (`/v1/management/agents/queues`, `toggleQueue`/`saveQueue` from `registrations-gravar.ts`/
 * `actions.ts`). Rules live in `queues-panel.ts`; this component only wires them to the read and
 * the two writes. The "regras" mode is a placeholder — its list of attendance rules per queue is
 * built in the next plan of this round (02-34).
 */

export type QueuesAviso = { tom: 'sucesso' | 'erro' | 'alerta'; texto: string; duracaoMs?: number };

export function QueuesPanel({
  onFechar,
  onAviso,
}: {
  onFechar: () => void;
  onAviso: (aviso: QueuesAviso) => void;
}) {
  const read = useRead<{ queues: QueueRegistered[] }>('/v1/management/agents/queues');
  const [modo, despacharModo] = useReducer(queuesPanelReducer, { modo: 'lista' });
  const [termoDigitado, setTermoDigitado] = useState('');
  const [termoAplicado, setTermoAplicado] = useState('');
  const [paginas, setPaginas] = useState(1);

  const queues = read.data?.queues ?? [];

  const aplicarBusca = () => {
    setTermoAplicado(termoDigitado.trim());
    setPaginas(1);
  };
  const limparBusca = () => {
    setTermoDigitado('');
    setTermoAplicado('');
    setPaginas(1);
  };

  const alternar = async (queue: QueueRegistered) => {
    const resultado = await toggleQueue(queue.id, queue.ativa);
    if (!resultado.ok) onAviso({ tom: 'erro', texto: resultado.error });
  };

  const finalizarCriacao = async (nomeCriado: string) => {
    const relido = await read.refetch();
    const encontrada = (relido.data?.queues ?? []).find(
      (q) => q.name.trim().toLowerCase() === nomeCriado.toLowerCase(),
    );
    if (encontrada) despacharModo({ tipo: 'criada', id: encontrada.id });
    else despacharModo({ tipo: 'voltar' });
  };

  return (
    <FloatingSidebar
      lado="direita"
      titulo="Gerenciamento de filas"
      ariaLabel="Gerenciamento de filas"
      onFechar={onFechar}
    >
      <div className="bl-panel-body bl-queues-panel-body">
        {!read.data ? (
          <div className="bl-queues-loading">
            <Carregando rotulo="Carregando filas" />
          </div>
        ) : modo.modo === 'criar' ? (
          <QueueCreateForm
            queues={queues}
            onCancelar={() => despacharModo({ tipo: 'voltar' })}
            onAviso={onAviso}
            onSalvo={(nome) => void finalizarCriacao(nome)}
          />
        ) : modo.modo === 'regras' ? (
          <div className="bl-queues-rules-placeholder">
            <div className="bl-queues-form-header">
              <button
                type="button"
                className="iconbtn"
                aria-label="Voltar"
                title="Voltar"
                onClick={() => despacharModo({ tipo: 'voltar' })}
              >
                <Icone nome="esquerda" tamanho={20} />
              </button>
              <h3>{queues.find((q) => q.id === modo.id)?.name ?? ''}</h3>
            </div>
            <hr className="bl-panel-wire" />
            <p className="sub">Regras desta fila — em construção no próximo plano.</p>
          </div>
        ) : queues.length === 0 ? (
          <div className="bl-queues-empty">
            <p>
              Você ainda não possui filas de atendimento definidas. Escolha o comportamento padrão
              para tickets e as filas para os quais eles serão direcionados.
            </p>
            <Botao
              variante="primario"
              icone="mais"
              className="bl-queues-empty-botao"
              onClick={() => despacharModo({ tipo: 'abrirCriar' })}
            >
              Criar nova fila
            </Botao>
          </div>
        ) : (
          <QueuesList
            queues={queues}
            termoDigitado={termoDigitado}
            termoAplicado={termoAplicado}
            paginas={paginas}
            onTermoDigitadoChange={setTermoDigitado}
            onBuscar={aplicarBusca}
            onLimparBusca={limparBusca}
            onCriarNova={() => despacharModo({ tipo: 'abrirCriar' })}
            onCarregarMais={() => setPaginas((p) => p + 1)}
            onEditar={(id) => despacharModo({ tipo: 'editar', id })}
            onAlternar={(queue) => void alternar(queue)}
          />
        )}
      </div>
    </FloatingSidebar>
  );
}

/** List, search line, cards and footer — everything the "lista" mode shows once there is at least one queue. */
function QueuesList({
  queues,
  termoDigitado,
  termoAplicado,
  paginas,
  onTermoDigitadoChange,
  onBuscar,
  onLimparBusca,
  onCriarNova,
  onCarregarMais,
  onEditar,
  onAlternar,
}: {
  queues: QueueRegistered[];
  termoDigitado: string;
  termoAplicado: string;
  paginas: number;
  onTermoDigitadoChange: (value: string) => void;
  onBuscar: () => void;
  onLimparBusca: () => void;
  onCriarNova: () => void;
  onCarregarMais: () => void;
  onEditar: (id: string) => void;
  onAlternar: (queue: QueueRegistered) => void;
}) {
  const filtradas = filterQueues(queues, termoAplicado);
  const pagina = pageQueues(filtradas, paginas);

  return (
    <>
      <div className="bl-queues-search">
        <div className="bl-queues-search-campo">
          <Icone nome="busca" tamanho={20} className="bl-queues-search-icone" />
          <Campo
            value={termoDigitado}
            placeholder="Pesquisar"
            aria-label="Pesquisar filas"
            onChange={(e) => onTermoDigitadoChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              onBuscar();
            }}
          />
        </div>
        <button
          type="button"
          className="bl-queues-search-botao"
          aria-label={termoAplicado ? 'Limpar busca' : 'Criar nova fila'}
          title={termoAplicado ? 'Limpar busca' : 'Criar nova fila'}
          onClick={termoAplicado ? onLimparBusca : onCriarNova}
        >
          <Icone nome={termoAplicado ? 'x' : 'mais'} tamanho={20} />
        </button>
      </div>

      {filtradas.length === 0 ? (
        <div className="bl-queues-no-result">
          <Illustration nome="busca" tamanho={96} />
          <p className="bl-queues-no-result-titulo">Fila não encontrada  :(</p>
          <p>Não há filas cadastradas com este nome</p>
        </div>
      ) : (
        <>
          <div className="bl-queues-list">
            {pagina.visiveis.map((queue) => (
              <div key={queue.id} className="bl-queue-card">
                <div className="bl-queue-card-info">
                  <span className="bl-queue-card-label">Fila de Atendimento</span>
                  <span className="bl-queue-card-name">{queue.name}</span>
                </div>
                <div className="bl-queue-card-right">
                  <div className="bl-queue-card-actions">
                    <button
                      type="button"
                      className="iconbtn"
                      aria-label="Editar fila"
                      title="Editar fila"
                      onClick={() => onEditar(queue.id)}
                    >
                      <Icone nome="lapis" tamanho={18} />
                    </button>
                    <span className="bl-queue-card-divisor" aria-hidden="true" />
                  </div>
                  <Interruptor
                    id={`bl-fila-${queue.id}`}
                    ligado={queue.ativa}
                    rotulo={queue.ativa ? `Desativar a fila ${queue.name}` : `Ativar a fila ${queue.name}`}
                    aoMudar={() => onAlternar(queue)}
                    className="bl-queue-switch"
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="bl-queues-footer">
            <span>
              Exibindo {pagina.visiveis.length} de {pagina.total}
            </span>
            {pagina.temMais ? (
              <Botao className="bl-queues-carregar-mais" onClick={onCarregarMais}>
                Carregar mais
              </Botao>
            ) : null}
          </div>
        </>
      )}
    </>
  );
}

/** The "criar" mode form — voltar, name field, Cancelar/Confirmar, all the messages from the reference table. */
function QueueCreateForm({
  queues,
  onCancelar,
  onSalvo,
  onAviso,
}: {
  queues: QueueRegistered[];
  onCancelar: () => void;
  onSalvo: (nome: string) => void;
  onAviso: (aviso: QueuesAviso) => void;
}) {
  const [nome, setNome] = useState('');
  const [erroCampo, setErroCampo] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const validar = (): boolean => {
    const erro = queueNameError(nome, queues);
    if (erro === null) {
      setErroCampo(null);
      return true;
    }
    if (erro === 'reservado') {
      onAviso({ tom: 'alerta', texto: 'Ops! Não é possível criar fila com este nome.' });
      return false;
    }
    setErroCampo(erro);
    return false;
  };

  const enviar = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    if (!validar()) return;
    setEnviando(true);
    const dados = new FormData();
    dados.set('nome', nome.trim());
    dados.set('capacidadePadrao', '5');
    dados.set('ordem', '0');
    dados.set('ativa', 'on');
    const resultado = await saveQueue({ ok: true }, dados);
    setEnviando(false);
    if (!resultado.ok) {
      if (resultado.error && /existe/i.test(resultado.error)) {
        setErroCampo('Já existe uma fila com este nome.');
      } else {
        onAviso({ tom: 'erro', texto: 'Erro ao salvar/atualizar fila' });
      }
      return;
    }
    onAviso({ tom: 'sucesso', texto: 'Fila adicionada com sucesso!' });
    onSalvo(nome.trim());
  };

  return (
    <form className="bl-queues-form" onSubmit={(e) => void enviar(e)}>
      <div className="bl-queues-form-header">
        <button
          type="button"
          className="iconbtn"
          aria-label="Voltar"
          title="Voltar"
          onClick={onCancelar}
          disabled={enviando}
        >
          <Icone nome="esquerda" tamanho={20} />
        </button>
        <h3>CRIAR NOVA FILA</h3>
      </div>
      <hr className="bl-panel-wire" />
      <p className="bl-queues-form-texto">Dê um nome para essa fila de atendimento</p>
      <Campo
        autoFocus
        value={nome}
        maxLength={60}
        placeholder="Nome da fila"
        aria-label="Nome da fila"
        className="bl-queues-form-input"
        disabled={enviando}
        onChange={(e) => {
          setNome(e.target.value);
          if (erroCampo) setErroCampo(null);
        }}
        onBlur={() => {
          if (nome.trim() !== '') validar();
        }}
      />
      {erroCampo ? (
        <Etiqueta tom="erro" className="bl-queues-form-erro">
          {erroCampo}
        </Etiqueta>
      ) : null}
      <div className="bl-queues-form-botoes">
        <Botao type="button" onClick={onCancelar} disabled={enviando}>
          Cancelar
        </Botao>
        <Botao type="submit" variante="primario" disabled={enviando || nome.trim() === ''}>
          {enviando ? 'Salvando…' : 'Confirmar'}
        </Botao>
      </div>
    </form>
  );
}
