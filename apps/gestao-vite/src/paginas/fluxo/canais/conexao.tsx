import { useState } from 'react';
import { Botao, Campo, Etiqueta, Seletor } from '@pipe/ui';
import type { CanalDoFluxo } from '@pipe/contracts';
import { IconePortal } from '../../../componentes/icones-portal';
import {
  canaisParaOferecer,
  podeConfirmarDesconexao,
  rotuloDoCanal,
  type TipoDeCanalDoBot,
} from '../../../lib/canal-do-fluxo';
import { desligarCanalDoFluxo, ligarCanalAoFluxo } from '../../../lib/canais-gravar';
import { Modal } from '../../cadastros/_modal';

/**
 * As peças de conexão/desconexão que as três páginas de canal dividem.
 *
 * `EscolherCanalExistente` é a etapa "Ativação do número" da origem
 * (`WhatsAppSelectedNumber.html`: título, "Escolha qual dos números válidos…",
 * o select "Escolher número", "Ativar número"), usada aqui para o que a origem
 * não precisa ter: na Blip o número nasce no bot; na Pipe o canal é uma linha
 * própria (`canal`) e pode existir sem bot — criado pela tela antiga de
 * Atendimento, ou desligado de um bot. Decisão Pipe, registrada na FICHA §5.
 * A regra "um bot por número" aparece no próprio select: o número que está
 * com outro bot vem desabilitado dizendo qual — a origem manda "remover do
 * anterior", a tela aponta onde.
 *
 * `ModalDesconectar` é o modal do Instagram/Messenger da origem (`class H`,
 * portal.js 120544; textos em `instagram.modals.disconnect` /
 * `messenger.modals.disconnect`): descrição, motivo obrigatório, checkbox de
 * concordância, "Voltar" / "Desconectar {canal}". O WhatsApp atual da origem
 * não tem esse modal (FICHA §4.5); os textos usados são os de
 * `whatsapp.overview.deprecated.modal.disconnect`, os únicos que existem.
 */

interface TextosDaEscolha {
  titulo: string;
  instrucao: string;
  placeholder: string;
  ativar: string;
  naoEncontrou: string;
}

const ESCOLHA: Readonly<Record<TipoDeCanalDoBot, TextosDaEscolha>> = {
  whatsapp_cloud: {
    titulo: 'Ativação do número',
    instrucao: 'Escolha qual dos números válidos de WhatsApp você deseja ativar.',
    placeholder: 'Escolher número',
    ativar: 'Ativar número',
    naoEncontrou: 'Não encontrou seu número?',
  },
  /* Sem prova na origem para os dois abaixo — a mesma etapa, trocando o substantivo. */
  instagram: {
    titulo: 'Ativação da conta',
    instrucao: 'Escolha qual das contas de Instagram conectadas você deseja ativar.',
    placeholder: 'Escolher conta',
    ativar: 'Ativar conta',
    naoEncontrou: 'Não encontrou sua conta?',
  },
  messenger: {
    titulo: 'Ativação da Página',
    instrucao: 'Escolha qual das Páginas conectadas você deseja ativar.',
    placeholder: 'Escolher Página',
    ativar: 'Ativar Página',
    naoEncontrou: 'Não encontrou sua Página?',
  },
};

export function EscolherCanalExistente({
  fluxoId,
  tipo,
  disponiveis,
  onVoltar,
}: {
  fluxoId: string;
  tipo: TipoDeCanalDoBot;
  disponiveis: readonly CanalDoFluxo[];
  /** "Volte e cadastre agora." — leva de volta à etapa de conexão. */
  onVoltar: () => void;
}) {
  const textos = ESCOLHA[tipo];
  const { livres, emUso } = canaisParaOferecer(disponiveis, tipo, fluxoId);
  const [escolhido, setEscolhido] = useState('');
  const [ativando, setAtivando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function ativar() {
    if (!escolhido) return;
    setAtivando(true);
    setErro(null);
    const resultado = await ligarCanalAoFluxo(fluxoId, escolhido);
    setAtivando(false);
    if (!resultado.ok) setErro(resultado.erro);
  }

  return (
    <div className="cb-coluna">
      <h2 className="cb-titulo-20">{textos.titulo}</h2>
      <p className="cb-typo-16">{textos.instrucao}</p>
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
              {rotuloDoCanal(c)}
            </option>
          ))}
          {emUso.map((c) => (
            <option key={c.id} value={c.id} disabled>
              {rotuloDoCanal(c)} — em uso por {c.fluxoNome}
            </option>
          ))}
        </Seletor>
        <p className="cb-typo-12">
          {textos.naoEncontrou}{' '}
          <button type="button" className="cb-ligacao" onClick={onVoltar}>
            Volte e cadastre agora.
          </button>
        </p>
      </div>
      {erro ? <Etiqueta tom="erro">{erro}</Etiqueta> : null}
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
  descricao: string;
  pergunta: string;
  botao: string;
}

const DESCONEXAO: Readonly<Record<TipoDeCanalDoBot, TextosDaDesconexao>> = {
  whatsapp_cloud: {
    titulo: 'Quer mesmo desconectar o WhatsApp?',
    descricao:
      'Com essa ação, seu chatbot vai parar de funcionar neste canal. Para voltar a usá-lo, será necessário repetir todo o processo de conexão.',
    pergunta: 'Por qual motivo você quer desconectar o WhatsApp?',
    botao: 'Desconectar WhatsApp',
  },
  instagram: {
    titulo: 'Quer mesmo desconectar o Instagram?',
    descricao:
      'Com essa ação, seu chatbot vai parar de funcionar neste canal. Para voltar a usá-lo, todo o processo de conexão deverá ser refeito pela pessoa administradora da página comercial do Facebook',
    pergunta: 'Por qual motivo você quer desconectar o Instagram?',
    botao: 'Desconectar Instagram',
  },
  messenger: {
    titulo: 'Quer mesmo desconectar o Messenger?',
    descricao:
      'Com essa ação, seu chatbot vai parar de funcionar neste canal. Para voltar a usá-lo, todo o processo de conexão deverá ser refeito pela pessoa administradora da página comercial do Facebook',
    pergunta: 'Por qual motivo você quer desconectar o Messenger?',
    botao: 'Desconectar Messenger',
  },
};

export function ModalDesconectar({
  aberto,
  fluxoId,
  tipo,
  onFechar,
}: {
  aberto: boolean;
  fluxoId: string;
  tipo: TipoDeCanalDoBot;
  onFechar: () => void;
}) {
  const textos = DESCONEXAO[tipo];
  const [motivo, setMotivo] = useState('');
  const [concordou, setConcordou] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function fechar() {
    setMotivo('');
    setConcordou(false);
    setErro(null);
    onFechar();
  }

  async function confirmar() {
    if (!podeConfirmarDesconexao(motivo, concordou)) {
      setErro('Preencha o motivo antes de continuar com a desconexão');
      return;
    }
    setEnviando(true);
    setErro(null);
    const resultado = await desligarCanalDoFluxo(fluxoId, motivo.trim());
    setEnviando(false);
    if (!resultado.ok) {
      setErro(resultado.erro);
      return;
    }
    fechar();
  }

  return (
    <Modal aberto={aberto} titulo={textos.titulo} onFechar={fechar}>
      <div className="cb-modal-desconectar">
        <p className="cb-typo-16">{textos.descricao}</p>
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
        {erro ? <Etiqueta tom="erro">{erro}</Etiqueta> : null}
        <div className="cb-acoes-modal">
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
 * Decisão Pipe (FICHA §5): `fluxo.canal_id` é uma coluna só, então o bot que
 * já está com um canal de outro tipo não conecta este sem desligar aquele. A
 * origem não tem esta situação — lá um bot tem vários canais.
 */
export function AvisoDeOutroCanal({ canal, rotulo }: { canal: CanalDoFluxo; rotulo: string }) {
  return (
    <div className="ig-faixa-alerta" role="status">
      <IconePortal nome="alerta" tamanho={24} />
      <p className="ig-typo-16">
        Este bot já está conectado ao canal <strong>{rotuloDoCanal(canal)}</strong>. Desconecte-o
        na página daquele canal antes de conectar o {rotulo}.
      </p>
    </div>
  );
}
