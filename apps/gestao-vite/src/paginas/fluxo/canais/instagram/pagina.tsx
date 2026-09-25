import { useState } from 'react';
import type { ChannelOfFlow, ChannelOfFlowInScreen } from '@pipe/contracts';
import { Botao } from '@pipe/ui';
import { LogoPortal } from '../../../../componentes/icones-portal';
import { ApiError } from '../../../../lib/api';
import { useRead } from '../../../../lib/consulta';
import { channelInBotState } from '../../../../lib/canal-do-fluxo';
import { ConectarInstagramManual } from '../../../cadastros/canal-conectar-manual';
import { ReadFalha, useContact } from '../../contato';
import { ChannelShell, type ChannelAba } from '../casca-do-canal';
import { OtherChannelNotice, EscolherChannelExistente, ModalDesconectar } from '../conexao';

/**
 * O Instagram por dentro do BOT — `…channels/instagram` (template 230473,
 * `FICHA-conectar-canal-no-bot.md` §1.4 e §3.3): título "Instagram", abas
 * "Visão Geral" e "Configurações" (a segunda a Pipe não tem por dentro),
 * "Documentação" à direita.
 *
 * Visão Geral desconectada (`InstagramOverviewDisconnectedView.html`): o
 * ícone, a descrição em negrito, o aviso da permissão de administrador e
 * "Iniciar conexão" (botão com seta, à direita). Na origem ele abre os passos
 * do login do Facebook (`InstagramSteps.html`); a Pipe só tem o caminho
 * manual, então o botão abre o modal manual, e "Usar uma conta já conectada"
 * (decisão Pipe) oferece as contas que a conta já tem.
 *
 * Conectada (`InstagramOverviewConnectedView.html`): "Seu chatbot está
 * conectado à conta:", o chip `@usuário`, a descrição e "Desconectar canal"
 * (`variant="delete"`, à direita) com o modal de motivo + concordância.
 */

const ABAS: readonly ChannelAba[] = [
  { rotulo: 'Visão Geral', segment: '' },
  { rotulo: 'Configurações', segment: 'configuracoes', emBreve: true },
];

export function PageChannelInstagram() {
  const { contact } = useContact();
  const read = useRead<ChannelOfFlowInScreen>(`/v1/gestao/fluxos/${contact.id}/canal`);

  if (read.error && !(read.error instanceof ApiError && read.error.status === 404)) {
    return <ReadFalha error={read.error} />;
  }
  if (!read.data) return null;
  const situation = channelInBotState(read.data.channel, 'instagram');

  return (
    <ChannelShell tipo="instagram" titulo="Instagram" abas={ABAS} conectado={situation.state === 'conectado'}>
      {situation.state === 'conectado' ? (
        <Conectado flowId={contact.id} channel={situation.channel} />
      ) : situation.state === 'outro_canal' ? (
        <div className="cb-linha">
          <div className="cb-icone-coluna">
            <LogoPortal nome="instagram" tamanho={64} />
          </div>
          <div className="cb-coluna">
            <OtherChannelNotice channel={situation.channel} rotulo="Instagram" />
          </div>
        </div>
      ) : (
        <Desconectado flowId={contact.id} disponiveis={read.data.disponiveis} />
      )}
    </ChannelShell>
  );
}

function Conectado({ flowId, channel }: { flowId: string; channel: ChannelOfFlow }) {
  const [desconectando, setDesconectando] = useState(false);
  const user = channel.numero ? `@${channel.numero.replace(/^@/, '')}` : channel.nome;
  return (
    <div className="cb-linha">
      <div className="cb-icone-coluna">
        <LogoPortal nome="instagram" tamanho={64} />
      </div>
      <div className="cb-coluna">
        <p className="cb-typo-16">
          <strong>Seu chatbot está conectado à conta:</strong>
        </p>
        <span className="cb-chip">
          <span className="cb-chip-avatar" aria-hidden="true">
            <LogoPortal nome="instagram" tamanho={28} />
          </span>
          {user}
        </span>
        <p className="cb-typo-16">
          Você já pode conversar com seus clientes pelo Instagram e gerar mais insights para o seu
          negócio!
        </p>
        <div className="cb-acoes-direita">
          <Botao type="button" variante="perigo" onClick={() => setDesconectando(true)}>
            Desconectar canal
          </Botao>
        </div>
        <ModalDesconectar
          aberto={desconectando}
          flowId={flowId}
          tipo="instagram"
          onFechar={() => setDesconectando(false)}
        />
      </div>
    </div>
  );
}

function Desconectado({ flowId, disponiveis }: { flowId: string; disponiveis: ChannelOfFlow[] }) {
  const [escolhendo, setEscolhendo] = useState(false);
  const temAccountLivre = disponiveis.some(
    (c) => c.tipo === 'instagram' && c.ativo && (c.flowId === null || c.flowId === flowId),
  );

  if (escolhendo) {
    return (
      <EscolherChannelExistente
        flowId={flowId}
        tipo="instagram"
        disponiveis={disponiveis}
        onVoltar={() => setEscolhendo(false)}
      />
    );
  }

  return (
    <div className="cb-linha">
      <div className="cb-icone-coluna">
        <LogoPortal nome="instagram" tamanho={64} />
      </div>
      <div className="cb-coluna">
        <p className="cb-typo-16">
          <strong>
            Conecte seu chatbot ao canal de mensagens do Instagram e comece a transformar conversas em
            oportunidades!
          </strong>
        </p>
        <p className="cb-typo-16">
          ⚠️<strong>Atenção:</strong> para começar a conexão, você precisa ter permissão de
          administrador das páginas do Facebook e do Instagram da sua empresa. 🤓
        </p>
        <div className="cb-acoes-direita">
          <ConectarInstagramManual flowId={flowId} rotulo="Iniciar conexão" variante="primario" />
          {temAccountLivre ? (
            <Botao type="button" onClick={() => setEscolhendo(true)}>
              Usar uma conta já conectada
            </Botao>
          ) : null}
        </div>
      </div>
    </div>
  );
}
