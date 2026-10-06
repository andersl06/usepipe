import { useState, type FormEvent } from 'react';
import { IconePortal } from '@pipe/ui/icones-portal';
import { Select } from '@pipe/ui/select';
import {
  INTERVALOS_RAPIDOS,
  cincoAnosAntes,
  periodDays,
  inicioDoIntervalo,
  periodValid,
} from './regras';

const REPORTS = [
  {
    value: 'notifications',
    nome: 'Mensagens ativas',
    dica: 'Dados sobre mensagens ativas enviadas e as pessoas usuárias que as receberam.',
  },
  {
    value: 'event-tracks',
    nome: 'Rastreamento de eventos',
    dica: 'Mostra todos os trackings da sua operação no Pipe.',
  },
  {
    value: 'users-conversations',
    nome: 'Métricas de chatbots e usuários',
    dica: 'Dados sobre usuários mensais (MAUs) e detalhes das conversas com eles.',
  },
  {
    value: 'thread-transcription',
    nome: 'Histórico completo de conversa',
    dica: 'Gera o histórico completo de conversas em PDF, ideal para auditorias e documentação jurídica.',
  },
] as const;

const REPORTS_OF_ATTENDANCE = [
  {
    value: 'attendants',
    nome: 'Status dos atendentes',
    dica: 'Dados sobre a atuação dos atendentes no Desk.',
  },
  {
    value: 'tickets',
    nome: 'Métricas de atendimento',
    dica: 'Dados sobre atendimentos: atendente, data de abertura e encerramento, tempos de resposta etc.',
  },
  {
    value: 'desk-messages',
    nome: 'Histórico de atendimento (Desk)',
    dica: 'Mensagens e dados sobre conversas no Desk. Inclui transcrição dos atendimentos.',
  },
] as const;

type Tipo =
  (typeof REPORTS)[number]['value'] | (typeof REPORTS_OF_ATTENDANCE)[number]['value'];

interface ReportGenerated {
  id: number;
  tipo: Tipo;
  inicio: string;
  fim: string;
}

const reportName = (tipo: Tipo) =>
  [...REPORTS, ...REPORTS_OF_ATTENDANCE].find((item) => item.value === tipo)?.nome ?? tipo;

const dataPt = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('pt-BR', { timeZone: 'UTC' });

export function ReportsManager({ bot, hoje }: { bot: string; hoje: string }) {
  const [tipo, setTipo] = useState<Tipo | ''>('');
  const [botEscolhido, setBotEscolhido] = useState('');
  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');
  const [contactFilter, setContactFilter] = useState('');
  const [reports, setReports] = useState<ReportGenerated[]>([]);
  const [error, setError] = useState(false);
  const [avisoVisivel, setAvisoVisivel] = useState(true);
  const [termoAberto, setTermoAberto] = useState(false);
  const [helpHistoryOpen, setHelpHistoryOpen] = useState(false);
  const [feedbackEnviado, setFeedbackEnviado] = useState(false);
  const minimo = cincoAnosAntes(hoje);

  const gerar = (evento: FormEvent) => {
    evento.preventDefault();
    if (
      !botEscolhido ||
      !tipo ||
      !periodValid(inicio, fim) ||
      (tipo === 'thread-transcription' && contactFilter.trim().length < 5)
    ) {
      setError(true);
      return;
    }
    setReports((current) => [{ id: Date.now(), tipo, inicio, fim }, ...current]);
    setError(false);
  };

  return (
    <div className="rm-tela">
      <header className="rm-cabecalho">
        <h1>Gerenciador de relatórios</h1>
        <p>
          Gere relatórios para diferentes dados do seu contato inteligente ou acesse os relatórios
          que você já criou.
        </p>
      </header>

      <form className="rm-formulario" onSubmit={gerar} noValidate>
        <div className="rm-cards">
          <section className="rm-paper rm-parametros">
            {avisoVisivel ? (
              <div className="rm-aviso" role="status">
                <span className="rm-aviso-icone">!</span>
                <span>
                  Não é possível gerar relatórios de atendimento para um router ou chatbot sem
                  atendimento ativo.
                </span>
                <button
                  type="button"
                  aria-label="Fechar aviso"
                  onClick={() => setAvisoVisivel(false)}
                >
                  ×
                </button>
              </div>
            ) : null}

            <h2>Escolha um chatbot para extrair os dados</h2>
            <label className="rm-campo rm-campo-interno">
              <span className="rm-select">
                <IconePortal nome="robo" tamanho={20} />
                <span className="rm-campo-miolo">
                  <span>Bot</span>
                  <Select
                    value={botEscolhido}
                    onChange={(e) => setBotEscolhido(e.target.value)}
                    aria-label="Bot"
                    aria-invalid={error && !botEscolhido}
                  >
                    <option value="">Selecione...</option>
                    <option value={bot}>{bot}</option>
                  </Select>
                </span>
              </span>
            </label>
            {error && !botEscolhido ? <p className="rm-error">Campo obrigatório</p> : null}

            <div className="rm-divisor" />

            <h3>Selecione o período do relatório</h3>
            <p>Configure um intervalo de até 90 dias para qualquer período nos últimos 5 anos.</p>
            <div className="rm-datas">
              <label className="rm-campo rm-campo-interno">
                <span className="rm-data">
                  <IconePortal nome="calendario" tamanho={20} />
                  <span className="rm-campo-miolo">
                    <span>Data Inicial</span>
                    <input
                      type="date"
                      value={inicio}
                      min={minimo}
                      max={fim || hoje}
                      onChange={(e) => setInicio(e.target.value)}
                      aria-label="Data Inicial"
                      aria-invalid={error && !inicio}
                    />
                  </span>
                </span>
              </label>
              <label className="rm-campo rm-campo-interno">
                <span className="rm-data">
                  <IconePortal nome="calendario" tamanho={20} />
                  <span className="rm-campo-miolo">
                    <span>Data Final</span>
                    <input
                      type="date"
                      value={fim}
                      min={inicio || minimo}
                      max={hoje}
                      onChange={(e) => setFim(e.target.value)}
                      aria-label="Data Final"
                      aria-invalid={error && !fim}
                    />
                  </span>
                </span>
              </label>
            </div>
            <div className="rm-intervalos" aria-label="Intervalos rápidos">
              {INTERVALOS_RAPIDOS.map((dias) => (
                <button
                  key={dias}
                  type="button"
                  onClick={() => {
                    setFim(hoje);
                    setInicio(inicioDoIntervalo(hoje, dias));
                    setError(false);
                  }}
                >
                  {dias} dias
                </button>
              ))}
            </div>
            {error && inicio && fim && !periodValid(inicio, fim) ? (
              <p className="rm-error">O período deve ser de no máximo 90 dias</p>
            ) : null}
          </section>

          <section className="rm-paper rm-tipos">
            <h2>Defina o tipo de relatório</h2>
            <p>
              Selecione entre as opções os dados que deseja analisar no relatório. Entenda melhor
              cada um deles no{' '}
              <a href="../data-dictionary?path=reportManager">Dicionário de Dados.</a>
            </p>
            <Options itens={REPORTS} escolhido={tipo} aoEscolher={setTipo} />
            {tipo === 'thread-transcription' ? (
              <label className="rm-campo rm-contact">
                <span className="rm-contact-label">
                  Contato
                  <button type="button" onClick={() => setHelpHistoryOpen(true)}>
                    (Saiba como gerar corretamente)
                  </button>
                </span>
                <input
                  type="search"
                  value={contactFilter}
                  onChange={(e) => setContactFilter(e.target.value)}
                  placeholder="Informe o nome, telefone, e-mail, BSUID ou ID do contato."
                  aria-invalid={error && contactFilter.trim().length < 5}
                />
                {error && contactFilter.trim().length < 5 ? (
                  <span className="rm-error">
                    O filtro de contato deve ter pelo menos 5 caracteres
                  </span>
                ) : null}
              </label>
            ) : null}

            <div className="rm-divisor" />

            <h2>Relatórios de atendimento</h2>
            <p>É necessário selecionar um bot com atendimento ativo para gerar estes relatórios.</p>
            <Options itens={REPORTS_OF_ATTENDANCE} escolhido={tipo} aoEscolher={setTipo} />
            {error && !tipo ? <p className="rm-error">Campo obrigatório</p> : null}
          </section>
        </div>

        <div className="rm-gerar">
          <button type="submit" className="an-bds-btn">
            <span aria-hidden="true">▤</span>
            Gerar Relatório
          </button>
        </div>
      </form>

      <section className="rm-reports rm-paper">
        <h2>Meus relatórios</h2>
        <p>Uma lista com todos os relatórios que você já criou.</p>
        <div className="rm-tabela-caixa">
          <table>
            <thead>
              <tr>
                <th>Gerado em</th>
                <th>Relatório</th>
                <th>Bot</th>
                <th>Período</th>
                <th>Início</th>
                <th>Fim</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {reports.length === 0 ? (
                <tr>
                  <td colSpan={7} className="rm-empty">
                    Nenhum arquivo gerado nos últimos 7 dias.
                  </td>
                </tr>
              ) : (
                reports.map((report) => (
                  <tr key={report.id}>
                    <td>agora</td>
                    <td>{reportName(report.tipo)}</td>
                    <td>{botEscolhido}</td>
                    <td>{periodDays(report.inicio, report.fim)} dias</td>
                    <td>{dataPt(report.inicio)}</td>
                    <td>{dataPt(report.fim)}</td>
                    <td>
                      <span className="rm-pendente">Pendente...</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="rm-termo-acao">
        <button
          type="button"
          className="an-bds-btn an-bds-btn--secundario"
          onClick={() => setTermoAberto(true)}
        >
          <span aria-hidden="true">▤</span>
          Termo de responsabilidade
        </button>
      </div>

      <footer className="rm-feedback">
        <div className="rm-feedback-chamada" aria-hidden="true">
          ☻
        </div>
        <div>
          <h2>Queremos te ouvir</h2>
          <p>Deixe seu feedback sobre essa extensão</p>
        </div>
        <form
          onSubmit={(evento) => {
            evento.preventDefault();
            setFeedbackEnviado(true);
          }}
        >
          <textarea aria-label="Feedback" rows={2} required />
          <button type="submit" className="an-bds-btn">
            Enviar
          </button>
          {feedbackEnviado ? <span role="status">Feedback enviado!</span> : null}
        </form>
      </footer>

      {termoAberto ? (
        <div className="rm-modal" role="dialog" aria-modal="true" aria-labelledby="rm-termo-titulo">
          <button
            className="rm-modal-fundo"
            type="button"
            aria-label="Fechar"
            onClick={() => setTermoAberto(false)}
          />
          <div className="rm-modal-caixa">
            <button
              className="rm-modal-fechar"
              type="button"
              aria-label="Fechar"
              onClick={() => setTermoAberto(false)}
            >
              ×
            </button>
            <div className="rm-modal-illustration" aria-hidden="true">
              ✓
            </div>
            <div className="rm-modal-texto">
              <h2 id="rm-termo-titulo">Termo de Responsabilidade</h2>
              <p>
                A solicitação e obtenção de Relatórios representam uma interação com a Plataforma
                Pipe. O Cliente, controlador dos dados pessoais, declara ciência e concordância de
                que, se der causa a qualquer incidente de vazamento de dados, será exclusivamente
                responsável nos termos da legislação vigente, não havendo responsabilidade da Pipe.
              </p>
            </div>
            <button
              type="button"
              className="an-bds-btn rm-modal-botao"
              onClick={() => setTermoAberto(false)}
            >
              Fechar
            </button>
          </div>
        </div>
      ) : null}

      {helpHistoryOpen ? (
        <div className="rm-modal" role="dialog" aria-modal="true" aria-labelledby="rm-ajuda-titulo">
          <button
            className="rm-modal-fundo"
            type="button"
            aria-label="Fechar"
            onClick={() => setHelpHistoryOpen(false)}
          />
          <div className="rm-modal-caixa rm-modal-ajuda">
            <button
              className="rm-modal-fechar"
              type="button"
              aria-label="Fechar"
              onClick={() => setHelpHistoryOpen(false)}
            >
              ×
            </button>
            <div className="rm-modal-texto">
              <h2 id="rm-ajuda-titulo">Como funciona o Histórico Completo de Conversas</h2>
              <p>
                Para obter resultados mais precisos e evitar erros na geração do relatório,
                considere as orientações abaixo.
              </p>
              <ul>
                <li>
                  <b>Limite de resultados:</b> buscas genéricas retornam no máximo 5 contatos.
                </li>
                <li>
                  <b>Busca individual:</b> o relatório é gerado para um contato por vez.
                </li>
                <li>
                  <b>Expiração de mídias:</b> links de fotos, vídeos e áudios ficam disponíveis por
                  72 horas.
                </li>
                <li>
                  <b>Tipos de busca:</b> e-mail, BSUID e ID usam busca exata; nome e telefone
                  aceitam busca aproximada.
                </li>
                <li>
                  <b>Bot e período:</b> confirme onde e quando a conversa ocorreu.
                </li>
              </ul>
            </div>
            <button
              type="button"
              className="an-bds-btn rm-modal-botao"
              onClick={() => setHelpHistoryOpen(false)}
            >
              Fechar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Options({
  itens,
  escolhido,
  aoEscolher,
}: {
  itens: readonly { value: Tipo; nome: string; dica: string }[];
  escolhido: Tipo | '';
  aoEscolher: (tipo: Tipo) => void;
}) {
  return (
    <div className="rm-options">
      {itens.map((item) => (
        <label key={item.value} className="rm-option">
          <input
            type="radio"
            name="relatorio"
            value={item.value}
            checked={escolhido === item.value}
            onChange={() => aoEscolher(item.value)}
          />
          <span title={item.dica}>{item.nome}</span>
        </label>
      ))}
    </div>
  );
}
