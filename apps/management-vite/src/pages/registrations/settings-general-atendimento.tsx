import type { ReactNode } from 'react';
import { Campo } from '@pipe/ui';
import { Select } from '@pipe/ui/select';
import { CardConfig } from '../../components/card-config';
import { inteiro, ligado, salvarSecao } from '../../lib/atendimento-config';
import type { ConfigAtendimento } from '../../lib/atendimento-config';

/** Caixa de seleção do cartão: o nome só vai no formulário quando marcada. */
function Caixa({ nome, marcada, children }: { nome: string; marcada: boolean; children: ReactNode }) {
  return (
    <label className="form-caixa">
      <input type="checkbox" name={nome} defaultChecked={marcada} />
      <span className="sub">{children}</span>
    </label>
  );
}

/**
 * Cartões de Configurações gerais que gravam em `tenant.configuracao_atendimento`. Cada um só existe
 * porque alguma parte do sistema lê a preferência (distribuição, Desk, envio, worker de encerramento).
 * A chave é o título do cartão na lista da página.
 */
export function cartoesDeAtendimento(c: ConfigAtendimento): Record<string, ReactNode> {
  const auto = c.encerramentoAutomatico;
  return {
    'Habilitar consulta a histórico de atendimentos no Pipe Desk': (
      <CardConfig
        titulo="Habilitar consulta a histórico de atendimentos no Pipe Desk"
        explanation="Permita consultas a informações de atendimentos anteriores no Pipe Desk. Lembre-se de conceder as permissões na página de Atendentes."
        acao={salvarSecao('historico', (d) => ({ ativo: ligado(d, 'ativo') }))}
        interruptor={{ name: 'ativo', rotulo: 'Habilitar consulta a histórico de atendimentos', ligado: c.historico.ativo }}
      >
        <></>
      </CardConfig>
    ),
    'Distribuição de tickets': (
      <CardConfig
        titulo="Distribuição de tickets"
        explanation="Defina o número máximo de atendimentos distribuídos automaticamente por atendente."
        acao={salvarSecao('distribuicao', (d) => ({
          modo: d.get('modo') === 'mais_tempo_sem_receber' ? 'mais_tempo_sem_receber' : 'menos_ativos',
          atendimentosPorAtendente: inteiro(d, 'atendimentos'),
          bloquearSolicitacaoManual: ligado(d, 'bloquear'),
        }))}
      >
        {(sujar) => (
          <div className="form-registration">
            <label className="form-campo">
              <span className="sub">Modo de distribuição</span>
              <Select name="modo" defaultValue={c.distribuicao.modo} onChange={sujar}>
                <option value="menos_ativos">Priorizar atendentes com menos tickets ativos (Padrão)</option>
                <option value="mais_tempo_sem_receber">
                  Priorizar atendentes que estão há mais tempo sem receber novos tickets
                </option>
              </Select>
            </label>
            <label className="form-campo">
              <span className="sub">Atendimentos por atendente (para ativar, utilize um valor maior que 0)</span>
              <Campo name="atendimentos" type="number" min={0} max={500} defaultValue={c.distribuicao.atendimentosPorAtendente} required />
            </label>
            <Caixa nome="bloquear" marcada={c.distribuicao.bloquearSolicitacaoManual}>
              Não permitir que atendentes solicitem tickets manualmente
            </Caixa>
          </div>
        )}
      </CardConfig>
    ),
    'Envio de mensagens ativas': (
      <CardConfig
        titulo="Envio de mensagens ativas"
        explanation="Habilitar o envio de mensagens ativas pelo Pipe Desk"
        acao={salvarSecao('mensagensAtivas', (d) => ({ ativo: ligado(d, 'ativo'), limitePorDisparo: inteiro(d, 'limite') }))}
        interruptor={{ name: 'ativo', rotulo: 'Habilitar o envio de mensagens ativas', ligado: c.mensagensAtivas.ativo }}
      >
        <label className="form-campo">
          <span className="sub">Limitar contatos por disparo de mensagem ativa (de 1 a 15)</span>
          <Campo name="limite" type="number" min={1} max={15} defaultValue={c.mensagensAtivas.limitePorDisparo} required />
        </label>
      </CardConfig>
    ),
    'Transferir tickets pelo Pipe Desk': (
      <CardConfig
        titulo="Transferir tickets pelo Pipe Desk"
        explanation="Habilita a transferência de tickets durante o atendimento"
        acao={salvarSecao('transferencia', (d) => ({
          habilitada: ligado(d, 'habilitada'),
          atendentesEspecificos: ligado(d, 'especificos'),
          offline: ligado(d, 'offline'),
        }))}
        interruptor={{ name: 'habilitada', rotulo: 'Habilitar a transferência de tickets', ligado: c.transferencia.habilitada }}
      >
        <div className="form-registration">
          <Caixa nome="especificos" marcada={c.transferencia.atendentesEspecificos}>
            Permitir transferência para atendentes específicos
          </Caixa>
          <Caixa nome="offline" marcada={c.transferencia.offline}>
            Permitir transferência para filas e atendentes offline
          </Caixa>
        </div>
      </CardConfig>
    ),
    'Envio de áudios': (
      <CardConfig
        titulo="Envio de áudios"
        explanation="Permitir que atendentes enviem áudios."
        acao={salvarSecao('midia', (d) => ({ ...c.midia, audio: ligado(d, 'ativo') }))}
        interruptor={{ name: 'ativo', rotulo: 'Permitir envio de áudios', ligado: c.midia.audio }}
      >
        <></>
      </CardConfig>
    ),
    Emojis: (
      <CardConfig
        titulo="Emojis"
        explanation="Permitir que atendentes usem emojis."
        acao={salvarSecao('midia', (d) => ({ ...c.midia, emoji: ligado(d, 'ativo') }))}
        interruptor={{ name: 'ativo', rotulo: 'Permitir emojis', ligado: c.midia.emoji }}
      >
        <></>
      </CardConfig>
    ),
    'Envio de arquivos': (
      <CardConfig
        titulo="Envio de arquivos"
        explanation="Permitir que atendentes enviem arquivos."
        acao={salvarSecao('midia', (d) => ({ ...c.midia, arquivos: ligado(d, 'ativo') }))}
        interruptor={{ name: 'ativo', rotulo: 'Permitir envio de arquivos', ligado: c.midia.arquivos }}
      >
        <></>
      </CardConfig>
    ),
    'Esconder número de clientes aguardando': (
      <CardConfig
        titulo="Esconder número de clientes aguardando"
        explanation="Esconder dos atendentes o número de clientes aguardando."
        acao={salvarSecao('esconderAguardando', (d) => ({ ativo: ligado(d, 'ativo') }))}
        interruptor={{ name: 'ativo', rotulo: 'Esconder o número de clientes aguardando', ligado: c.esconderAguardando.ativo }}
      >
        <></>
      </CardConfig>
    ),
    'Categoria Modo de Espera': (
      <CardConfig
        titulo="Categoria Modo de Espera"
        explanation="Ative o Modo de Espera para que seus atendentes possam pausar tickets enquanto realizam procedimentos internos. Enquanto o ticket estiver no Modo de Espera, o encerramento automático por inatividade será pausado."
        acao={salvarSecao('modoEspera', (d) => ({ ativo: ligado(d, 'ativo') }))}
        interruptor={{ name: 'ativo', rotulo: 'Ativar o Modo de Espera', ligado: c.modoEspera.ativo }}
      >
        <></>
      </CardConfig>
    ),
    'Encerramento automático de tickets': (
      <CardConfig
        titulo="Encerramento automático de tickets"
        explanation="Encerre automaticamente os tickets por inatividade. A regra de cada fila, quando existe, vence esta regra global."
        acao={salvarSecao('encerramentoAutomatico', (d) => ({
          ativo: ligado(d, 'ativo'),
          tempo: inteiro(d, 'tempo'),
          unidade: d.get('unidade') === 'horas' ? 'horas' : 'minutos',
          soSePrimeiroAtendimento: ligado(d, 'primeiro'),
          naoSeAguardandoAtendente: ligado(d, 'aguardando'),
          removerDaTela: auto?.removerDaTela ?? false,
          alerta: auto?.alerta ?? { ativo: false, mensagem: '', antecedencia: 1, unidade: 'minutos' },
          tags: auto?.tags ?? { ativo: false, tags: [] },
        }))}
        interruptor={{ name: 'ativo', rotulo: 'Encerrar automaticamente os tickets por inatividade', ligado: auto?.ativo ?? false }}
      >
        {(sujar) => (
          <div className="form-registration">
            <div className="form-linha">
              <label className="form-campo" style={{ flexBasis: '200px' }}>
                <span className="sub">Tempo de inatividade</span>
                <Campo name="tempo" type="number" min={1} defaultValue={auto?.tempo ?? 30} required />
              </label>
              <label className="form-campo" style={{ flexBasis: '200px' }}>
                <span className="sub">Unidade</span>
                <Select name="unidade" defaultValue={auto?.unidade ?? 'minutos'} onChange={sujar}>
                  <option value="minutos">Minutos</option>
                  <option value="horas">Horas</option>
                </Select>
              </label>
            </div>
            <Caixa nome="primeiro" marcada={auto?.soSePrimeiroAtendimento ?? false}>
              Encerrar só depois da primeira resposta do atendente
            </Caixa>
            <Caixa nome="aguardando" marcada={auto?.naoSeAguardandoAtendente ?? false}>
              Não encerrar quando o cliente falou por último
            </Caixa>
          </div>
        )}
      </CardConfig>
    ),
  };
}
