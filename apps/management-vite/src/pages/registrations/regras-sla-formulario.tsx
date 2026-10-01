import { useState, type FormEvent } from 'react';
import { Botao, BotaoDeIcone, Campo, Etiqueta } from '@pipe/ui';
import { Select } from '@pipe/ui/select';
import { ChipsInput } from '@pipe/ui/chips-input';
import type { QueueConfigured } from '../../lib/settings';
import { salvarPoliticaSla } from '../../lib/settings-gravar';
import {
  METAS_DA_POLITICA,
  UNIDADES_DE_TEMPO,
  erroDaMeta,
  melhorUnidade,
  pedidoDePolitica,
  type MetaDaPolitica,
  type MetaEmRascunho,
  type PoliticaSla,
  type UnidadeDeTempo,
} from '../../lib/politica-sla';

/**
 * Formulário "Nova regra de SLA" / "Editar regra de SLA", no lugar da lista e na mesma URL. Cada meta tem seu interruptor e fica desabilitada até ser ligada; a regra vale para as filas escolhidas e, se marcada como padrão, para toda a operação. O servidor guarda uma linha por meta e por escopo.
 */

function rascunhosIniciais(politica?: PoliticaSla): Record<MetaDaPolitica, MetaEmRascunho> {
  const meta = (alvo: MetaDaPolitica): MetaEmRascunho => {
    const gravada = politica?.metas.find((m) => m.alvo === alvo);
    if (!gravada) return { ligada: false, valor: '', unidade: 'segundos' };
    const { valor, unidade } = melhorUnidade(gravada.prazoSeg);
    return { ligada: true, valor: String(valor), unidade };
  };
  return {
    espera_fila: meta('espera_fila'),
    primeira_resposta: meta('primeira_resposta'),
    resolucao: meta('resolucao'),
  };
}

function Interruptor({
  ligado,
  rotulo,
  onChange,
  desabilitado,
}: {
  ligado: boolean;
  rotulo: string;
  onChange: (ligado: boolean) => void;
  desabilitado: boolean;
}) {
  return (
    <button
      type="button"
      className="interruptor"
      role="switch"
      aria-checked={ligado}
      aria-label={rotulo}
      disabled={desabilitado}
      onClick={() => onChange(!ligado)}
    >
      <span className="interruptor-bolinha" />
    </button>
  );
}

export function FormularioRegraSla({
  queues,
  politica,
  onFechar,
}: {
  queues: readonly QueueConfigured[];
  /** Presente = editar esta política; ausente = criar. */
  politica?: PoliticaSla;
  onFechar: () => void;
}) {
  const [nome, setNome] = useState(politica?.name ?? '');
  const [nomeTocado, setNomeTocado] = useState(false);
  const [padrao, setPadrao] = useState(politica?.padrao ?? false);
  const [filas, setFilas] = useState<string[]>(() => politica?.filas.map((f) => f.id) ?? []);
  const [metas, setMetas] = useState(() => rascunhosIniciais(politica));
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pedido = pedidoDePolitica(nome, padrao, filas, metas);
  const opcoes = [...queues]
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    .map((q) => ({ id: q.id, nome: q.name }));
  const mudar = (alvo: MetaDaPolitica, parcial: Partial<MetaEmRascunho>) =>
    setMetas((atual) => ({ ...atual, [alvo]: { ...atual[alvo], ...parcial } }));

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    if (!pedido) return;
    setEnviando(true);
    setError(null);
    const resultado = await salvarPoliticaSla(pedido, politica?.id);
    setEnviando(false);
    if (resultado.ok) onFechar();
    else setError(resultado.error);
  }

  return (
    <>
      <div className="board-head regras-form-cabecalho">
        <BotaoDeIcone nome="esquerda" rotulo="Voltar para a lista de regras de SLA" onClick={onFechar} />
        <h2>{politica ? 'Editar regra de SLA' : 'Nova regra de SLA'}</h2>
      </div>

      <form className="fila-form regras-form" onSubmit={(e) => void salvar(e)}>
        <div className="sla-form-linha">
          <div>
            <h3>Nome da regra</h3>
            <p className="sub">Escolha um nome para identificar a regra de SLA</p>
          </div>
          <label className="form-campo">
            <span className="sub">Nome da regra</span>
            <Campo
              value={nome}
              placeholder="SLA Padrão"
              maxLength={100}
              aria-invalid={nomeTocado && nome.trim() === '' ? true : undefined}
              disabled={enviando}
              onChange={(e) => setNome(e.target.value)}
              onBlur={() => setNomeTocado(true)}
            />
            {nomeTocado && nome.trim() === '' ? (
              <span className="at-sc-erro">Informe um nome para a regra</span>
            ) : null}
          </label>
        </div>

        <div className="sla-form-linha">
          <div>
            <h3>Filas aplicáveis à regra</h3>
            <p className="sub">Defina em quais filas a regra será aplicada</p>
          </div>
          <div className="sla-form-controles">
            <label className="sla-form-padrao">
              <span className="sub">Utilizar regra como padrão</span>
              <Interruptor
                ligado={padrao}
                rotulo="Utilizar regra como padrão"
                onChange={setPadrao}
                desabilitado={enviando}
              />
            </label>
            <ChipsInput
              rotulo="Filas aplicáveis à regra"
              label="Filas aplicáveis à regra"
              placeholder="Selecione as filas"
              options={opcoes}
              values={filas}
              onChange={setFilas}
            />
          </div>
        </div>

        <h3>Metas de SLA</h3>
        <p className="sla-form-aviso" role="note">
          Configure pelo menos uma meta de SLA para acompanhamento
        </p>

        {METAS_DA_POLITICA.map((m) => {
          const rascunho = metas[m.alvo];
          const erro = rascunho.ligada && rascunho.valor !== '' ? erroDaMeta(rascunho) : null;
          return (
            <div key={m.alvo} className="sla-form-linha">
              <div>
                <h3>
                  {m.titulo}{' '}
                  <Interruptor
                    ligado={rascunho.ligada}
                    rotulo={m.titulo}
                    onChange={(ligada) => mudar(m.alvo, { ligada })}
                    desabilitado={enviando}
                  />
                </h3>
                <p className="sub">{m.ajuda}</p>
              </div>
              <div className="sla-form-meta">
                <label className="form-campo">
                  <span className="sub">{m.campo}</span>
                  <Campo
                    type="number"
                    min={0}
                    value={rascunho.valor}
                    aria-invalid={erro ? true : undefined}
                    disabled={enviando || !rascunho.ligada}
                    onChange={(e) => mudar(m.alvo, { valor: e.target.value })}
                  />
                  {erro ? <span className="at-sc-erro">{erro}</span> : null}
                </label>
                <label className="form-campo">
                  <span className="sub">Unidade</span>
                  <Select
                    value={rascunho.unidade}
                    onChange={(e) => mudar(m.alvo, { unidade: e.target.value as UnidadeDeTempo })}
                    disabled={enviando || !rascunho.ligada}
                  >
                    {UNIDADES_DE_TEMPO.map((u) => (
                      <option key={u.valor} value={u.valor}>
                        {u.rotulo}
                      </option>
                    ))}
                  </Select>
                </label>
              </div>
            </div>
          );
        })}

        {error ? <Etiqueta tom="erro">{error}</Etiqueta> : null}
        <div className="cl-actions">
          <Botao type="button" onClick={onFechar} disabled={enviando}>
            Cancelar
          </Botao>
          <Botao type="submit" variante="primario" disabled={enviando || !pedido}>
            {enviando ? 'Salvando…' : 'Salvar'}
          </Botao>
        </div>
      </form>
    </>
  );
}
