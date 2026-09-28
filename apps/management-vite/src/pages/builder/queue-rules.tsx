import { useState } from 'react';
import { Botao, Campo, Carregando, Etiqueta, Icone, Illustration } from '@pipe/ui';
import { useRead } from '../../lib/query';
import type { QueueForChoose, QueueRegistered, QueueRegisteredRule } from '../../lib/registrations';
import { editQueue } from '../../lib/registrations-gravar';
import { toggleRuleQueue } from '../../lib/actions';
import { Interruptor } from '../flow/integrations/interruptor';
import { RuleQueueForm } from '../registrations/rules-attendance-formulario';
import { filterQueues, pageQueues, queueRenameError, queueRules, renameBlockReason, type RenameBlockReason } from './queues-panel';
import type { QueuesAviso } from './panel-queues';

/**
 * The Builder's embedded queue-rules mode (D-56 item 4, completing 02-33's placeholder):
 * editable queue name with the same locks as the Desk, search, rule cards with a toggle, and
 * "Criar nova regra" opening the Desk's own `RuleQueueForm` inside the panel, with this queue
 * already fixed as the destination. No delete button anywhere — the live capture confirmed the
 * source template never shows one here either (`ref/CAPTURAS-F1-F6.md` §F-5).
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

export function QueueRulesView({
  fila,
  onVoltar,
  onAviso,
}: {
  fila: QueueRegistered;
  onVoltar: () => void;
  onAviso: (aviso: QueuesAviso) => void;
}) {
  const read = useRead<QueueRulesRead>('/v1/management/rules/attendance');
  const [criando, setCriando] = useState(false);
  const [termoDigitado, setTermoDigitado] = useState('');
  const [termoAplicado, setTermoAplicado] = useState('');
  const [paginas, setPaginas] = useState(1);
  const [editandoNome, setEditandoNome] = useState(false);
  const [nomeEditado, setNomeEditado] = useState(fila.name);
  const [salvandoNome, setSalvandoNome] = useState(false);
  const [erroNome, setErroNome] = useState<string | null>(null);

  const carregando = !read.data;
  const regrasDaFila = read.data ? queueRules(read.data.regras, fila.id) : [];
  // Permission to write hasn't got a reusable helper on the Desk side (no such thing in
  // `pages/registrations/*`) — always allowed until one exists, per the plan's own fallback.
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
    const resultado = await editQueue(fila.id, { nome: nomeEditado.trim() });
    setSalvandoNome(false);
    if (!resultado.ok) {
      onAviso({ tom: 'erro', texto: resultado.error });
      return;
    }
    setEditandoNome(false);
  };

  const aplicarBusca = () => {
    setTermoAplicado(termoDigitado.trim());
    setPaginas(1);
  };
  const limparBusca = () => {
    setTermoDigitado('');
    setTermoAplicado('');
    setPaginas(1);
  };

  const alternar = async (regra: QueueRegisteredRule) => {
    const dados = new FormData();
    dados.set('id', regra.id);
    const resultado = await toggleRuleQueue({ ok: true }, dados);
    if (!resultado.ok) onAviso({ tom: 'erro', texto: resultado.error ?? 'Não foi possível alterar a regra.' });
  };

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
      ) : criando ? (
        <RuleQueueForm
          queues={read.data!.queues}
          destinoFixo={{ id: fila.id, name: fila.name }}
          aoSalvar={() => setCriando(false)}
        />
      ) : regrasDaFila.length === 0 ? (
        <div className="bl-queues-empty">
          <p>Você ainda não possui regras de atendimento definidas.</p>
          <Botao
            variante="primario"
            icone="mais"
            className="bl-queues-empty-botao"
            onClick={() => setCriando(true)}
          >
            Criar nova regra
          </Botao>
        </div>
      ) : (
        <QueueRulesList
          regras={regrasDaFila}
          termoDigitado={termoDigitado}
          termoAplicado={termoAplicado}
          paginas={paginas}
          onTermoDigitadoChange={setTermoDigitado}
          onBuscar={aplicarBusca}
          onLimparBusca={limparBusca}
          onCriarNova={() => setCriando(true)}
          onCarregarMais={() => setPaginas((p) => p + 1)}
          onAlternar={(regra) => void alternar(regra)}
        />
      )}
    </div>
  );
}

/** Search line, rule cards and centered footer — everything the rule list shows once there is at least one rule for this queue. */
function QueueRulesList({
  regras,
  termoDigitado,
  termoAplicado,
  paginas,
  onTermoDigitadoChange,
  onBuscar,
  onLimparBusca,
  onCriarNova,
  onCarregarMais,
  onAlternar,
}: {
  regras: QueueRegisteredRule[];
  termoDigitado: string;
  termoAplicado: string;
  paginas: number;
  onTermoDigitadoChange: (value: string) => void;
  onBuscar: () => void;
  onLimparBusca: () => void;
  onCriarNova: () => void;
  onCarregarMais: () => void;
  onAlternar: (regra: QueueRegisteredRule) => void;
}) {
  const filtradas = filterQueues(regras, termoAplicado);
  const pagina = pageQueues(filtradas, paginas);

  return (
    <>
      <div className="bl-queues-search">
        <div className="bl-queues-search-campo">
          <Icone nome="busca" tamanho={20} className="bl-queues-search-icone" />
          <Campo
            value={termoDigitado}
            placeholder="Pesquisar"
            aria-label="Pesquisar regras"
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
          aria-label={termoAplicado ? 'Limpar busca' : 'Criar nova regra'}
          title={termoAplicado ? 'Limpar busca' : 'Criar nova regra'}
          onClick={termoAplicado ? onLimparBusca : onCriarNova}
        >
          <Icone nome={termoAplicado ? 'x' : 'mais'} tamanho={20} />
        </button>
      </div>

      {filtradas.length === 0 ? (
        <div className="bl-queues-no-result">
          <Illustration nome="busca" tamanho={96} />
          <p className="bl-queues-no-result-titulo">Regra não encontrada  :(</p>
          <p>Não há regras cadastradas com este nome</p>
        </div>
      ) : (
        <>
          <div className="bl-queues-list">
            {pagina.visiveis.map((regra) => (
              <div key={regra.id} className="bl-queue-card">
                <div className="bl-queue-card-info">
                  <span className="bl-queue-card-label">Nome da regra</span>
                  <span className="bl-queue-card-name">{regra.name}</span>
                </div>
                <Interruptor
                  id={`bl-regra-${regra.id}`}
                  ligado={regra.active}
                  rotulo={regra.active ? `Desativar a regra ${regra.name}` : `Ativar a regra ${regra.name}`}
                  aoMudar={() => onAlternar(regra)}
                  className="bl-queue-switch"
                />
              </div>
            ))}
          </div>
          <div className="bl-rules-footer">
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
