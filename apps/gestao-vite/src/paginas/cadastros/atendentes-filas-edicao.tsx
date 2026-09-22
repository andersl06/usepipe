import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Botao, BotaoDeIcone, Campo, Cartao, Etiqueta } from '@pipe/ui';
import { useLeitura } from '../../lib/consulta';
import type { FilaCadastrada, Horarios } from '../../lib/cadastros';
import { desvincularAtendenteDaFila, editarFila } from '../../lib/cadastros-gravar';
import { criarRegraDePrioridade, excluirRegraDePrioridade } from '../../lib/atendentes-gravar';
import {
  NIVEIS_ATRIBUIVEIS,
  regrasDaFila,
  rotuloDoNivel,
  type RegraDePrioridade,
} from '../../lib/regras-prioridade';
import { Selecao } from '../../componentes/selecao';
import { useContato } from '../fluxo/contato';
import { baseDoAtendimento } from '../operacao/casca';
import { ModalConfirmacao } from './_modal';

/**
 * Edição de fila — PÁGINA PRÓPRIA, não modal.
 *
 * `attendance.desk.queueManagement.edit` da origem é `url:"/edit/:id"`
 * (`FICHA-atendentes-filas-pausas.md` §a.1) — é o que o dono cobrou. A
 * anatomia é a do §a.3: três seções na ordem **Atendentes → Regras de
 * Priorização → Tags**, com os textos literais do `i18n.js`.
 *
 * **Tags ficou de fora.** A origem tem "Gerenciar tags da fila", mas no Pipe
 * `etiqueta` é por TENANT, sem vínculo com fila (§e.7 da ficha) — fazer esse
 * vínculo é migração + domínio + rota + consumo no Desk, e está registrado
 * como pendência, não inventado aqui.
 *
 * **"Adicionar atendente" NAVEGA, não abre formulário aqui.** A origem prova
 * isso com o próprio texto do vazio (`noAttendantsBody`: "ao clicar em
 * Adicionar atendente, um direcionamento será feito para a página Equipe de
 * atendimento"). No Pipe, vincular quem entra na fila é a MESMA gravação de
 * "Editar atendente" em lote (`POST .../filas/:id/atendentes`) — por isso o
 * botão manda para `atendentes/gestao`, e não para um seletor nesta página.
 *
 * **"Dados da fila" é seção só nossa**, sem sub-rota na origem: cor, ordem,
 * capacidade padrão, horário e o interruptor "Ativa" migraram do modal de
 * criação para cá (`atendentes-filas-formulario.tsx` já documentava isso).
 */
export function PaginaEdicaoDeFila() {
  const { filaId } = useParams<{ filaId: string }>();
  const navegar = useNavigate();
  const { contato } = useContato();
  const base = baseDoAtendimento(contato.tipo, contato.id);

  const leituraFilas = useLeitura<{ filas: FilaCadastrada[] }>('/v1/gestao/atendentes/filas');
  const leituraHorarios = useLeitura<Horarios & { fuso: string }>('/v1/gestao/regras/horarios');
  const leituraRegras = useLeitura<RegraDePrioridade[]>(
    '/v1/gestao/regras/prioridade',
  );

  if (!leituraFilas.data || !leituraHorarios.data || !leituraRegras.data) return null;

  const fila = leituraFilas.data.filas.find((f) => f.id === filaId);
  if (!fila) {
    return (
      <div className="vazio">
        <b>Fila não encontrada</b>
        <p>
          <button type="button" className="btn" onClick={() => navegar(`${base}/atendentes/filas`)}>
            Voltar para Filas de atendimento
          </button>
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="board-head">
        <h2>{fila.nome}</h2>
      </div>

      <DadosDaFila fila={fila} horarios={leituraHorarios.data.horarios} />
      <SecaoAtendentes fila={fila} base={base} />
      <SecaoRegrasDePrioridade fila={fila} regras={leituraRegras.data} />
    </>
  );
}

/* -------------------------------------------------------- dados da fila */

function DadosDaFila({
  fila,
  horarios,
}: {
  fila: FilaCadastrada;
  horarios: readonly { id: string; nome: string }[];
}) {
  const [nome, setNome] = useState(fila.nome);
  const [cor, setCor] = useState(fila.cor ?? '#5b5fed');
  const [capacidade, setCapacidade] = useState(String(fila.capacidadePadrao));
  const [ordem, setOrdem] = useState(String(fila.ordem));
  const [horarioId, setHorarioId] = useState(fila.horarioId ?? '');
  const [ativa, setAtiva] = useState(fila.ativa);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const mudou =
    nome.trim() !== fila.nome ||
    cor !== (fila.cor ?? '#5b5fed') ||
    capacidade !== String(fila.capacidadePadrao) ||
    ordem !== String(fila.ordem) ||
    horarioId !== (fila.horarioId ?? '') ||
    ativa !== fila.ativa;

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    if (!mudou || !nome.trim()) return;
    setSalvando(true);
    setErro(null);
    const resultado = await editarFila(fila.id, {
      nome: nome.trim(),
      cor,
      capacidadePadrao: Number(capacidade),
      ordem: Number(ordem),
      horarioId: horarioId || null,
      ativa,
    });
    setSalvando(false);
    if (!resultado.ok) setErro(resultado.erro);
  }

  return (
    <Cartao titulo="Dados da fila">
      <form className="form-cadastro" onSubmit={(e) => void salvar(e)}>
        <div className="form-linha">
          <label className="form-campo" style={{ flexBasis: '280px' }}>
            <span className="sub">Nome</span>
            <Campo value={nome} onChange={(e) => setNome(e.target.value)} required disabled={salvando} />
          </label>
          <label className="form-campo" style={{ flexBasis: '80px', flexGrow: 0 }}>
            <span className="sub">Cor</span>
            <input
              type="color"
              value={cor}
              onChange={(e) => setCor(e.target.value)}
              disabled={salvando}
              className="campo-cor"
            />
          </label>
          <label className="form-campo" style={{ flexBasis: '160px', flexGrow: 0 }}>
            <span className="sub">Capacidade padrão</span>
            <Campo
              type="number"
              min={1}
              max={200}
              value={capacidade}
              onChange={(e) => setCapacidade(e.target.value)}
              disabled={salvando}
            />
          </label>
          <label className="form-campo" style={{ flexBasis: '120px', flexGrow: 0 }}>
            <span className="sub">Ordem</span>
            <Campo
              type="number"
              min={0}
              value={ordem}
              onChange={(e) => setOrdem(e.target.value)}
              disabled={salvando}
            />
          </label>
        </div>

        <div className="form-linha">
          <label className="form-campo" style={{ flexBasis: '260px' }}>
            <span className="sub">Horário</span>
            <Selecao
              value={horarioId}
              onChange={(e) => setHorarioId(e.target.value)}
              disabled={salvando}
              aria-label="Horário"
            >
              <option value="">Sem horário — atende 24×7</option>
              {horarios.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.nome}
                </option>
              ))}
            </Selecao>
          </label>

          <label className="form-caixa" style={{ alignSelf: 'flex-end' }}>
            <input type="checkbox" checked={ativa} onChange={(e) => setAtiva(e.target.checked)} disabled={salvando} />
            <span className="sub">Ativa</span>
          </label>
        </div>

        {erro ? <Etiqueta tom="erro">{erro}</Etiqueta> : null}

        <div className="cl-acoes">
          <Botao type="submit" variante="primario" disabled={salvando || !mudou || !nome.trim()}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </Botao>
        </div>
      </form>
    </Cartao>
  );
}

/* ----------------------------------------------------------- atendentes */

const PASSO_ATENDENTES = 10;

function SecaoAtendentes({ fila, base }: { fila: FilaCadastrada; base: string }) {
  const navegar = useNavigate();
  const [busca, setBusca] = useState('');
  const [visiveis, setVisiveis] = useState(PASSO_ATENDENTES);
  const [paraRemover, setParaRemover] = useState<{ id: string; nome: string } | null>(null);
  const [removendo, setRemovendo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const alvo = busca.trim().toLowerCase();
  const filtrados = alvo ? fila.atendentes.filter((a) => a.nome.toLowerCase().includes(alvo)) : fila.atendentes;
  const mostrados = filtrados.slice(0, visiveis);

  async function remover() {
    if (!paraRemover) return;
    setRemovendo(true);
    setErro(null);
    const resultado = await desvincularAtendenteDaFila(fila.id, paraRemover.id);
    setRemovendo(false);
    if (resultado.ok) setParaRemover(null);
    else setErro(resultado.erro);
  }

  return (
    <Cartao
      titulo="Atendentes"
      acoes={
        <Botao variante="primario" onClick={() => navegar(`${base}/atendentes/gestao`)}>
          Adicionar atendente
        </Botao>
      }
    >
      {fila.atendentes.length === 0 ? (
        <div className="vazio">
          <b>Ops! Essa fila não possui nenhum atendente.</b>
          <p>
            Ops! Não há agentes nessa fila. Ao clicar em <b>Adicionar atendente</b>, um direcionamento será feito
            para a página <b>Equipe de atendimento</b>.
          </p>
        </div>
      ) : (
        <>
          <div className="busca-topo">
            <input
              type="search"
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                setVisiveis(PASSO_ATENDENTES);
              }}
              placeholder="Pesquisar atendente"
              aria-label="Pesquisar atendente"
            />
          </div>

          {filtrados.length === 0 ? (
            <div className="vazio">
              <b>Atendente não encontrado :(</b>
              <p>Não há atendente cadastrados com esse nome.</p>
            </div>
          ) : (
            <>
              {mostrados.map((a) => (
                <div key={a.id} className="form-linha linha-lista">
                  <span className="sub">
                    {a.nome} · {a.capacidade}
                    {a.temOverride ? ' próprio' : ''}
                  </span>
                  <BotaoDeIcone
                    nome="x"
                    rotulo={`Remover ${a.nome} da fila`}
                    onClick={() => setParaRemover({ id: a.id, nome: a.nome })}
                  />
                </div>
              ))}
              <p className="sub secao-rodape">
                Exibindo {mostrados.length} de {filtrados.length}
                {mostrados.length < filtrados.length ? (
                  <button
                    type="button"
                    className="link-carregar-mais"
                    onClick={() => setVisiveis((v) => v + PASSO_ATENDENTES)}
                  >
                    Carregar mais
                  </button>
                ) : null}
              </p>
            </>
          )}
        </>
      )}

      {erro ? <Etiqueta tom="erro">{erro}</Etiqueta> : null}

      <ModalConfirmacao
        aberto={paraRemover !== null}
        titulo="Você deseja remover este atendente da fila?"
        mensagem={<>{paraRemover?.nome}</>}
        confirmando={removendo}
        rotuloConfirmar="Excluir"
        onConfirmar={() => void remover()}
        onCancelar={() => setParaRemover(null)}
      />
    </Cartao>
  );
}

/* ------------------------------------------------- regras de priorização */

function SecaoRegrasDePrioridade({
  fila,
  regras,
}: {
  fila: FilaCadastrada;
  regras: readonly RegraDePrioridade[];
}) {
  const [criando, setCriando] = useState(false);
  const [paraExcluir, setParaExcluir] = useState<{ id: string; nome: string } | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const daFila = regrasDaFila(regras, fila.id);

  async function excluir() {
    if (!paraExcluir) return;
    setExcluindo(true);
    setErro(null);
    const resultado = await excluirRegraDePrioridade(paraExcluir.id);
    setExcluindo(false);
    if (resultado.ok) setParaExcluir(null);
    else setErro(resultado.erro);
  }

  return (
    <Cartao
      titulo="Regras de Priorização"
      acoes={
        <Botao variante="primario" onClick={() => setCriando(true)} disabled={criando}>
          Criar nova regra de priorização
        </Botao>
      }
    >
      {criando ? (
        <FormularioRegraDePrioridade filaId={fila.id} onFechar={() => setCriando(false)} />
      ) : null}

      {daFila.length === 0 ? (
        <div className="vazio">
          <b>Essa fila ainda não possui regras de priorização!</b>
          <p>Adicione sua primeira regra e defina a prioridade em que os clientes devem ser atendidos</p>
        </div>
      ) : (
        daFila.map((r) => (
          <div key={r.id} className="form-linha linha-lista">
            <span className="sub">
              {r.nome} · {rotuloDoNivel(r.nivel)}
            </span>
            <BotaoDeIcone
              nome="x"
              rotulo={`Excluir a regra ${r.nome}`}
              onClick={() => setParaExcluir({ id: r.id, nome: r.nome })}
            />
          </div>
        ))
      )}

      {erro ? <Etiqueta tom="erro">{erro}</Etiqueta> : null}

      <ModalConfirmacao
        aberto={paraExcluir !== null}
        titulo="Confirmar exclusão"
        mensagem={<>Excluir a regra "{paraExcluir?.nome}"? Esta ação não pode ser desfeita.</>}
        confirmando={excluindo}
        onConfirmar={() => void excluir()}
        onCancelar={() => setParaExcluir(null)}
      />
    </Cartao>
  );
}

function FormularioRegraDePrioridade({ filaId, onFechar }: { filaId: string; onFechar: () => void }) {
  const [nome, setNome] = useState('');
  const [nivel, setNivel] = useState(NIVEIS_ATRIBUIVEIS[0] ?? '');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function criar(evento: FormEvent) {
    evento.preventDefault();
    if (!nome.trim()) return;
    setEnviando(true);
    setErro(null);
    const resultado = await criarRegraDePrioridade({
      nome: nome.trim(),
      nivel,
      escopoTipo: 'fila',
      escopoId: filaId,
    });
    setEnviando(false);
    if (resultado.ok) onFechar();
    else setErro(resultado.erro);
  }

  return (
    <form className="form-cadastro" onSubmit={(e) => void criar(e)}>
      <div className="form-linha">
        <label className="form-campo">
          <span className="sub">Nome da regra de priorização</span>
          <Campo value={nome} onChange={(e) => setNome(e.target.value)} required disabled={enviando} />
        </label>
        <label className="form-campo" style={{ flexBasis: '200px' }}>
          <span className="sub">Nível</span>
          <Selecao value={nivel} onChange={(e) => setNivel(e.target.value)} disabled={enviando} aria-label="Nível">
            {NIVEIS_ATRIBUIVEIS.map((n) => (
              <option key={n} value={n}>
                {rotuloDoNivel(n)}
              </option>
            ))}
          </Selecao>
        </label>
      </div>

      {erro ? <Etiqueta tom="erro">{erro}</Etiqueta> : null}

      <div className="cl-acoes">
        <Botao type="button" onClick={onFechar} disabled={enviando}>
          Cancelar
        </Botao>
        <Botao type="submit" variante="primario" disabled={enviando || !nome.trim()}>
          {enviando ? 'Criando…' : 'Criar'}
        </Botao>
      </div>
    </form>
  );
}
