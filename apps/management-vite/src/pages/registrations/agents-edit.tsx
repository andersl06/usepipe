import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Botao, Etiqueta } from '@pipe/ui';
import { ChipsInput } from '@pipe/ui/chips-input';
import { useRead } from '../../lib/query';
import type { AgentRegistered, QueueRegistered } from '../../lib/registrations';
import { applyInSelection, saveAgent } from '../../lib/agents-gravar';
import { editTitle, resolveEmails } from '../../lib/agents';
import { useContact } from '../flow/contact';
import { attendanceBase } from '../operation/shell';
import { CabecalhoAtendente, LinhaConfig, SubtituloAtendente, TicketsSimultaneos } from './agents-pagina';

/**
 * `team/create` e `team/edit` da Blip, sem `:id` na URL: a seleção viaja em `?agents=` (R-03).
 *
 * Adicionar: e-mails (chips), Filas (o mesmo `ChipsInput` do filtro de filas do Monitoramento e do Histórico, D-C16) e Tickets simultâneos. No Pipe a pessoa precisa já ter conta no tenant (convite em Contrato); e-mail sem cadastro é recusado com o motivo, em vez de fingir que adicionou.
 *
 * Editar: um atendente mostra Filas e Tickets simultâneos; vários mostram o título "Editar N atendentes" e acrescentam as filas escolhidas a todos. O Pipe só tem fila (o teto vem de pertencer a ela), então não há campo de equipe.
 */
export function AgentPageEdit({ modo }: { modo: 'editar' | 'adicionar' }) {
  const [params] = useSearchParams();
  const { contact } = useContact();
  const base = attendanceBase(contact);
  const readAgents = useRead<AgentRegistered[]>('/v1/management/agents/management');
  const readQueues = useRead<{ queues: QueueRegistered[] }>('/v1/management/agents/queues');
  if (!readAgents.data || !readQueues.data) return null;
  const queues = readQueues.data.queues.map((f) => ({ id: f.id, nome: f.name }));

  if (modo === 'adicionar') {
    return <Adicionar agents={readAgents.data} queues={queues} base={base} />;
  }
  const ids = (params.get('agents') ?? '').split(',').filter(Boolean);
  const selecionados = readAgents.data.filter((a) => ids.includes(a.id));
  return <Editar selecionados={selecionados} queues={queues} base={base} />;
}

type Opcoes = { id: string; nome: string }[];

function Rodape({
  enviando,
  desabilitarSalvar,
  aoCancelar,
}: {
  enviando: boolean;
  desabilitarSalvar: boolean;
  aoCancelar: () => void;
}) {
  return (
    <div className="atend-rodape">
      <Botao type="button" onClick={aoCancelar} disabled={enviando}>
        Cancelar
      </Botao>
      <Botao type="submit" variante="primario" disabled={enviando || desabilitarSalvar}>
        {enviando ? 'Salvando…' : 'Salvar'}
      </Botao>
    </div>
  );
}

function capacidadeDe(padrao: boolean, valor: string): number | null {
  return padrao || !valor.trim() ? null : Number(valor);
}

function Adicionar({ agents, queues, base }: { agents: AgentRegistered[]; queues: Opcoes; base: string }) {
  const navegar = useNavigate();
  const [emails, setEmails] = useState<string[]>([]);
  const [filas, setFilas] = useState<string[]>([]);
  const [padrao, setPadrao] = useState(true);
  const [valor, setValor] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    const { ids, unknown } = resolveEmails(agents, emails);
    if (unknown.length > 0) {
      setError(`Sem cadastro neste Pipe: ${unknown.join(', ')}. Convide a pessoa em Contrato antes de adicionar.`);
      return;
    }
    setEnviando(true);
    setError(null);
    const resultado = await applyInSelection(ids, filas, capacidadeDe(padrao, valor));
    setEnviando(false);
    if (resultado.ok) navegar(`${base}/team`);
    else setError(resultado.error);
  }

  return (
    <form onSubmit={(e) => void salvar(e)}>
      <CabecalhoAtendente titulo="Adicionar atendentes" aoVoltar={() => navegar(`${base}/team`)} />
      <div className="atend-cartao">
        <LinhaConfig rotulo="E-mail" ajuda="Adicione um ou mais atendentes">
          <ChipsInput
            rotulo="E-mail"
            placeholder="Insira os e-mails dos atendentes"
            values={emails}
            onChange={setEmails}
          />
          <p className="atend-linha-ajuda">Para adicionar mais de um atendente, separe os e-mails apertando Enter</p>
        </LinhaConfig>
        <LinhaConfig rotulo="Filas" ajuda="Indique as filas nas quais este atendente irá operar">
          <ChipsInput
            rotulo="Filas"
            placeholder="Selecione as filas de atendimento"
            options={queues}
            values={filas}
            onChange={setFilas}
          />
        </LinhaConfig>
        <LinhaConfig
          rotulo="Tickets simultâneos"
          ajuda="Defina a quantidade de tickets que podem ser distribuídos para este atendente"
        >
          <TicketsSimultaneos
            padrao={padrao}
            valor={valor}
            onPadrao={setPadrao}
            onValor={setValor}
            desabilitado={enviando}
          />
        </LinhaConfig>
      </div>
      {error ? <Etiqueta tom="erro">{error}</Etiqueta> : null}
      <Rodape
        enviando={enviando}
        desabilitarSalvar={emails.length === 0 || filas.length === 0}
        aoCancelar={() => navegar(`${base}/team`)}
      />
    </form>
  );
}

function Editar({
  selecionados,
  queues,
  base,
}: {
  selecionados: AgentRegistered[];
  queues: Opcoes;
  base: string;
}) {
  const navegar = useNavigate();
  const unico = selecionados.length === 1 ? selecionados[0]! : null;
  const atuais = unico?.queueIds ?? [];
  const [filas, setFilas] = useState<string[]>(atuais);
  const [padrao, setPadrao] = useState(true);
  const [valor, setValor] = useState('');
  const [tocouTeto, setTocouTeto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (selecionados.length === 0) {
    return (
      <>
        <CabecalhoAtendente titulo="Editar atendente" aoVoltar={() => navegar(`${base}/team`)} />
        <div className="empty">
          <b>Nenhum atendente selecionado</b>
        </div>
      </>
    );
  }

  const mudou = tocouTeto || filas.length !== atuais.length || filas.some((f) => !atuais.includes(f));

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    setError(null);
    const capacidade = tocouTeto ? capacidadeDe(padrao, valor) : undefined;
    const resultado = unico
      ? await saveAgent(unico.id, atuais, filas, capacidade)
      : await applyInSelection(
          selecionados.map((a) => a.id),
          filas,
          capacidade ?? null,
        );
    setEnviando(false);
    if (resultado.ok) navegar(`${base}/team`);
    else setError(resultado.error);
  }

  return (
    <form onSubmit={(e) => void salvar(e)}>
      <CabecalhoAtendente
        titulo={unico ? 'Editar atendente' : editTitle(selecionados.length)}
        aoVoltar={() => navegar(`${base}/team`)}
      />
      <SubtituloAtendente nome={unico ? unico.name : selecionados.map((a) => a.name).join(', ')}>
        {unico ? `Editar atendente ${unico.name}` : 'Para editar os atendentes selecionados, altere ao menos um campo.'}
      </SubtituloAtendente>
      <div className="atend-cartao">
        <LinhaConfig rotulo="Filas" ajuda="Indique as filas nas quais este atendente irá operar">
          <ChipsInput
            rotulo="Filas"
            placeholder="Selecione as filas de atendimento"
            options={queues}
            values={filas}
            onChange={setFilas}
          />
        </LinhaConfig>
        <LinhaConfig
          rotulo="Tickets simultâneos"
          ajuda="Defina a quantidade de tickets que podem ser distribuídos para este atendente"
        >
          <TicketsSimultaneos
            padrao={padrao}
            valor={valor}
            onPadrao={(p) => {
              setPadrao(p);
              setTocouTeto(true);
            }}
            onValor={(v) => {
              setValor(v);
              setTocouTeto(true);
            }}
            desabilitado={enviando}
          />
        </LinhaConfig>
      </div>
      {error ? <Etiqueta tom="erro">{error}</Etiqueta> : null}
      <Rodape enviando={enviando} desabilitarSalvar={!mudou} aoCancelar={() => navegar(`${base}/team`)} />
    </form>
  );
}
