import { useState } from 'react';
import { Botao, Campo, Etiqueta, Seletor } from '@pipe/ui';
import type { ChannelOfFlow } from '@pipe/contracts';
import { IconePortal } from '../../../components/icones-portal';
import {
  channelsForOffer,
  podeConfirmarDesconexao,
  channelLabel,
  type TypeOfChannelOfBot,
} from '../../../lib/channel-of-flow';
import { flowDisconnectChannel, connectChannelToFlow } from '../../../lib/channels-gravar';
import { Modal } from '../../registrations/_modal';

/**
 * The connect/disconnect pieces the three channel pages share.
 *
 * `EscolherCanalExistente` is the source's "Ativação do número" step (`WhatsAppSelectedNumber.html`: title, "Escolha qual dos números válidos…", the "Escolher número" select, "Ativar número"), used here for something the source doesn't need: on Blip the number is born on the bot; on Pipe the channel is its own row (`canal`) and can exist without a bot — created by the old Attendance screen, or detached from a bot. Pipe decision, recorded in FICHA §5. The "one bot per number" rule shows up in the select itself: a number already tied to another bot appears disabled, naming which one — the source says to "remover do anterior" (remove from the previous one); the screen points to where.
 *
 * `ModalDesconectar` is the source's Instagram/Messenger modal (`class H`, portal.js 120544; text in `instagram.modals.disconnect` / `messenger.modals.disconnect`): description, mandatory reason, agreement checkbox, "Voltar" / "Desconectar {canal}". The source's current WhatsApp has no such modal (FICHA §4.5); the text used comes from `whatsapp.overview.deprecated.modal.disconnect`, the only one that exists.
 */

interface TextosDaEscolha {
  titulo: string;
  instruction: string;
  placeholder: string;
  ativar: string;
  naoEncontrou: string;
}

const ESCOLHA: Readonly<Record<TypeOfChannelOfBot, TextosDaEscolha>> = {
  whatsapp_cloud: {
    titulo: 'Ativação do número',
    instruction: 'Escolha qual dos números válidos de WhatsApp você deseja ativar.',
    placeholder: 'Escolher número',
    ativar: 'Ativar número',
    naoEncontrou: 'Não encontrou seu número?',
  },
  /* No evidence in the source for the two below — the same step, swapping the noun. */
  instagram: {
    titulo: 'Ativação da conta',
    instruction: 'Escolha qual das contas de Instagram conectadas você deseja ativar.',
    placeholder: 'Escolher conta',
    ativar: 'Ativar conta',
    naoEncontrou: 'Não encontrou sua conta?',
  },
  messenger: {
    titulo: 'Ativação da Página',
    instruction: 'Escolha qual das Páginas conectadas você deseja ativar.',
    placeholder: 'Escolher Página',
    ativar: 'Ativar Página',
    naoEncontrou: 'Não encontrou sua Página?',
  },
};

export function ChooseChannelExisting({
  flowId,
  tipo,
  disponiveis,
  onVoltar,
}: {
  flowId: string;
  tipo: TypeOfChannelOfBot;
  disponiveis: readonly ChannelOfFlow[];
  /** "Volte e cadastre agora." — takes you back to the connection step. */
  onVoltar: () => void;
}) {
  const textos = ESCOLHA[tipo];
  const { livres, emUso } = channelsForOffer(disponiveis, tipo, flowId);
  const [escolhido, setEscolhido] = useState('');
  const [ativando, setAtivando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ativar() {
    if (!escolhido) return;
    setAtivando(true);
    setError(null);
    const resultado = await connectChannelToFlow(flowId, escolhido);
    setAtivando(false);
    if (!resultado.ok) setError(resultado.error);
  }

  return (
    <div className="cb-column">
      <h2 className="cb-titulo-20">{textos.titulo}</h2>
      <p className="cb-typo-16">{textos.instruction}</p>
      <div className="cb-select-caixa">
        <Seletor
          value={escolhido}
          onChange={(e) => setEscolhido(e.target.value)}
          disabled={ativando}
          aria-label={textos.placeholder}
        >
          <option value="">{textos.placeholder}</option>
          {livres.map((c) => (
            <option key={c.id} value={c.id}>
              {channelLabel(c)}
            </option>
          ))}
          {emUso.map((c) => (
            <option key={c.id} value={c.id} disabled>
              {channelLabel(c)} — em uso por {c.flowName}
            </option>
          ))}
        </Seletor>
        <p className="cb-typo-12">
          {textos.naoEncontrou}{' '}
          <button type="button" className="cb-connection" onClick={onVoltar}>
            Volte e cadastre agora.
          </button>
        </p>
      </div>
      {error ? <Etiqueta tom="erro">{error}</Etiqueta> : null}
      <div>
        <Botao type="button" variante="primario" disabled={!escolhido || ativando} onClick={() => void ativar()}>
          {ativando ? 'Ativando…' : textos.ativar}
        </Botao>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- Desconectar */

interface TextosDaDesconexao {
  titulo: string;
  description: string;
  pergunta: string;
  botao: string;
}

const DESCONEXAO: Readonly<Record<TypeOfChannelOfBot, TextosDaDesconexao>> = {
  whatsapp_cloud: {
    titulo: 'Quer mesmo desconectar o WhatsApp?',
    description:
      'Com essa ação, seu chatbot vai parar de funcionar neste canal. Para voltar a usá-lo, será necessário repetir todo o processo de conexão.',
    pergunta: 'Por qual motivo você quer desconectar o WhatsApp?',
    botao: 'Desconectar WhatsApp',
  },
  instagram: {
    titulo: 'Quer mesmo desconectar o Instagram?',
    description:
      'Com essa ação, seu chatbot vai parar de funcionar neste canal. Para voltar a usá-lo, todo o processo de conexão deverá ser refeito pela pessoa administradora da página comercial do Facebook',
    pergunta: 'Por qual motivo você quer desconectar o Instagram?',
    botao: 'Desconectar Instagram',
  },
  messenger: {
    titulo: 'Quer mesmo desconectar o Messenger?',
    description:
      'Com essa ação, seu chatbot vai parar de funcionar neste canal. Para voltar a usá-lo, todo o processo de conexão deverá ser refeito pela pessoa administradora da página comercial do Facebook',
    pergunta: 'Por qual motivo você quer desconectar o Messenger?',
    botao: 'Desconectar Messenger',
  },
};

export function ModalDesconectar({
  aberto,
  flowId,
  tipo,
  onFechar,
}: {
  aberto: boolean;
  flowId: string;
  tipo: TypeOfChannelOfBot;
  onFechar: () => void;
}) {
  const textos = DESCONEXAO[tipo];
  const [motivo, setMotivo] = useState('');
  const [concordou, setConcordou] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function fechar() {
    setMotivo('');
    setConcordou(false);
    setError(null);
    onFechar();
  }

  async function confirmar() {
    if (!podeConfirmarDesconexao(motivo, concordou)) {
      setError('Preencha o motivo antes de continuar com a desconexão');
      return;
    }
    setEnviando(true);
    setError(null);
    const resultado = await flowDisconnectChannel(flowId, motivo.trim());
    setEnviando(false);
    if (!resultado.ok) {
      setError(resultado.error);
      return;
    }
    fechar();
  }

  return (
    <Modal aberto={aberto} titulo={textos.titulo} onFechar={fechar}>
      <div className="cb-modal-desconectar">
        <p className="cb-typo-16">{textos.description}</p>
        <label>
          <span className="sub">{textos.pergunta}</span>
          <Campo
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Escreva o motivo aqui"
            disabled={enviando}
            maxLength={500}
          />
        </label>
        <label className="cb-concordo">
          <input
            type="checkbox"
            checked={concordou}
            onChange={(e) => setConcordou(e.target.checked)}
            disabled={enviando}
          />
          <span className="cb-typo-14">Eu concordo com os resultados da desconexão</span>
        </label>
        {error ? <Etiqueta tom="erro">{error}</Etiqueta> : null}
        <div className="cb-actions-modal">
          <Botao type="button" onClick={fechar} disabled={enviando}>
            Voltar
          </Botao>
          <Botao
            type="button"
            variante="perigo"
            disabled={enviando || !podeConfirmarDesconexao(motivo, concordou)}
            onClick={() => void confirmar()}
          >
            {enviando ? 'Desconectando…' : textos.botao}
          </Botao>
        </div>
      </div>
    </Modal>
  );
}

/* ----------------------------------------------------- Outro canal no bot */

/**
 * Pipe decision (FICHA §5): `fluxo.canal_id` is a single column, so a bot already holding a channel of another type can't connect this one without disconnecting that one first. The source doesn't have this situation — there, one bot can have several channels.
 */
export function OtherChannelNotice({ channel, rotulo }: { channel: ChannelOfFlow; rotulo: string }) {
  return (
    <div className="ig-faixa-alerta" role="status">
      <IconePortal nome="alerta" tamanho={24} />
      <p className="ig-typo-16">
        Este bot já está conectado ao canal <strong>{channelLabel(channel)}</strong>. Desconecte-o
        na página daquele canal antes de conectar o {rotulo}.
      </p>
    </div>
  );
}
