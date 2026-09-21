import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Botao, EstadoVazio } from '@pipe/ui';
import { ConectarWhatsApp } from '../../../../componentes/cadastro-embutido-whatsapp';
import { IconePortal, LogoPortal } from '../../../../componentes/icones-portal';
import { rotuloDoMotivo } from '../../../../lib/canais';
import { numeroParaWaMe } from '../../../../lib/canal-do-fluxo';
import { ConectarWhatsappManual } from '../../../cadastros/canal-conectar-manual';
import { AvisoDeOutroCanal, EscolherCanalExistente, ModalDesconectar } from '../conexao';
import type { ContextoDoCanalWhatsapp, ContextoSemCanal } from './casca';

/**
 * Visão Geral do WhatsApp — o `bds-tab-panel group="content-tab-0"` do
 * template 79961, que troca o parcial pelo passo de ativação
 * (`FICHA-conectar-canal-no-bot.md` §2):
 *
 * - `VERIFIED` → `WhatsAppVerified.html` (foto `01`): "Seu chatbot está
 *   conectado ao número:", o chip verde, os dois parágrafos e "Testar no
 *   WhatsApp";
 * - `LOGIN` → `WhatsAppStart.html`: o ícone, `welcome.instructions` e
 *   "Vamos lá!" (botão com seta, à direita);
 * - `FACEBOOK_CONNECTION` → `WhatsAppFacebookConnectionStep.html`: "Conecte o
 *   Pipe ao Facebook" (a marca é a tinta), os dois parágrafos, "Voltar" e
 *   "Conectar-se ao Facebook" (o cadastro embutido da Meta, que só funciona
 *   com aplicativo aprovado — `cadastro-embutido-whatsapp.tsx`);
 * - `SELECT_PHONE` → `WhatsAppSelectedNumber.html`, usada aqui para escolher
 *   um número que a conta já tem (`EscolherCanalExistente`, decisão Pipe).
 *
 * Os passos `AWAIT_CONTAINER`, `ASK_PIN`, `PHONE_NOT_FOUND` e os dois de
 * bloqueio comercial não existem na Pipe: o cliente é dono do WABA dele e o
 * número não passa por container nem por saldo (FICHA §4.6).
 *
 * Acréscimos Pipe, ditos como tais: "Conectar manualmente" ao lado do botão
 * do Facebook (o caminho de quem não tem app aprovado na Meta) e "Desconectar
 * canal" no estado conectado — o WhatsApp atual da origem não tem esse botão
 * (FICHA §4.5), mas sem ele não há como "remover do anterior" para trocar de
 * bot. Só desliga DO BOT: o número continua conectado à Meta.
 */

type Passo = 'inicio' | 'conexao' | 'escolher';

export function AbaVisaoGeral() {
  const contexto = useOutletContext<ContextoDoCanalWhatsapp | ContextoSemCanal>();
  if ('canal' in contexto) return <Conectado {...contexto} />;
  return <NaoConectado {...contexto} />;
}

function Conectado({ fluxoId, canal, saude }: ContextoDoCanalWhatsapp) {
  const [desconectando, setDesconectando] = useState(false);
  const numero = saude?.numero ?? canal.numero ?? canal.nome;
  const numeroWa = numeroParaWaMe(saude?.numero ?? canal.numero);

  if (saude && saude.estado === 'indisponivel') {
    return (
      <div className="cb-vazio">
        <EstadoVazio titulo="Ainda não é possível usar este número" ilustracao="erro">
          <p className="sub">{rotuloDoMotivo(saude.motivo)}</p>
        </EstadoVazio>
        <Botao type="button" variante="perigo" onClick={() => setDesconectando(true)}>
          Desconectar canal
        </Botao>
        <ModalDesconectar
          aberto={desconectando}
          fluxoId={fluxoId}
          tipo="whatsapp_cloud"
          onFechar={() => setDesconectando(false)}
        />
      </div>
    );
  }

  return (
    <div className="cb-coluna">
      <h2 className="cb-titulo-20">Seu chatbot está conectado ao número:</h2>
      <span className="cb-chip">
        <span className="cb-chip-avatar" aria-hidden="true">
          <LogoPortal nome="whatsapp" tamanho={28} />
        </span>
        {numero}
      </span>
      <p className="cb-typo-16">
        Você já pode conversar com seus clientes pelo WhatsApp, configurar as funcionalidades do
        canal e gerar mais insights para o seu negócio!
      </p>
      <p className="cb-typo-16">
        Com o número conectado, você tem a possibilidade de interagir com seus clientes e leads
        proativamente, sem precisar que ele te chame no WhatsApp primeiro. Conheça nossas{' '}
        <strong>boas práticas</strong>!
      </p>
      <div className="cb-acoes-entre">
        <Botao
          type="button"
          variante="primario"
          disabled={!numeroWa}
          onClick={() => window.open(`https://wa.me/${numeroWa}`, '_blank', 'noopener,noreferrer')}
        >
          Testar no WhatsApp
        </Botao>
        <Botao type="button" variante="perigo" onClick={() => setDesconectando(true)}>
          Desconectar canal
        </Botao>
      </div>
      <ModalDesconectar
        aberto={desconectando}
        fluxoId={fluxoId}
        tipo="whatsapp_cloud"
        onFechar={() => setDesconectando(false)}
      />
    </div>
  );
}

function NaoConectado({ fluxoId, situacao, disponiveis }: ContextoSemCanal) {
  const [passo, setPasso] = useState<Passo>('inicio');
  const temNumeroLivre = disponiveis.some(
    (c) => c.tipo === 'whatsapp_cloud' && c.ativo && (c.fluxoId === null || c.fluxoId === fluxoId),
  );

  if (situacao.estado === 'outro_canal') {
    return (
      <div className="cb-linha">
        <div className="cb-icone-coluna">
          <LogoPortal nome="whatsapp" tamanho={64} />
        </div>
        <div className="cb-coluna">
          <AvisoDeOutroCanal canal={situacao.canal} rotulo="WhatsApp" />
        </div>
      </div>
    );
  }

  if (passo === 'inicio') {
    return (
      <div className="cb-linha">
        <div className="cb-icone-coluna">
          <LogoPortal nome="whatsapp" tamanho={64} />
        </div>
        <div className="cb-coluna">
          <p className="cb-typo-16">
            Quer estar presente no canal mais utilizado no mundo? Chegou a hora de conectar seu
            contato inteligente ao WhatsApp e ganhar proximidade real com clientes! Para começar,
            vamos ativar o número escolhido e depois verificar a autenticidade de sua empresa.
          </p>
          <div className="cb-acoes-direita">
            <Botao type="button" variante="primario" onClick={() => setPasso('conexao')}>
              Vamos lá!
              <IconePortal nome="direita" tamanho={16} />
            </Botao>
          </div>
        </div>
      </div>
    );
  }

  if (passo === 'escolher') {
    return (
      <EscolherCanalExistente
        fluxoId={fluxoId}
        tipo="whatsapp_cloud"
        disponiveis={disponiveis}
        onVoltar={() => setPasso('conexao')}
      />
    );
  }

  return (
    <div className="cb-passo-facebook">
      <div className="cb-passo-facebook-texto">
        <h2 className="cb-titulo-32">Conecte o Pipe ao Facebook</h2>
        <p className="cb-typo-16">
          Ao clicar no botão &quot;Conectar-se ao Facebook&quot;, uma nova janela se abrirá e você
          precisará fazer login com uma <strong>conta administradora</strong> do Gerenciador de
          Negócios da sua empresa no Facebook.
        </p>
        <p className="cb-typo-16">
          Ao finalizar este processo, é só voltar para esta janela que continuaremos a conexão por
          aqui. 😊
        </p>
        <div className="cb-acoes-entre" style={{ width: '100%' }}>
          <Botao type="button" onClick={() => setPasso('inicio')}>
            <IconePortal nome="esquerda" tamanho={16} />
            Voltar
          </Botao>
          <ConectarWhatsApp
            fluxoId={fluxoId}
            rotulo="Conectar-se ao Facebook"
            className="cb-botao-facebook"
            prefixo={<LogoDoFacebook />}
          />
        </div>
        {/* Acréscimos Pipe: sem aplicativo aprovado na Meta, o caminho é o manual; e o
            número que a conta já tem pode ser escolhido em vez de cadastrado de novo. */}
        <div className="cb-acoes-entre" style={{ width: '100%' }}>
          <ConectarWhatsappManual fluxoId={fluxoId} rotulo="Conectar manualmente" />
          {temNumeroLivre ? (
            <Botao type="button" onClick={() => setPasso('escolher')}>
              Usar um número já conectado
            </Botao>
          ) : null}
        </div>
      </div>
      <div className="cb-passo-facebook-figura" aria-hidden="true">
        <LogoPortal nome="whatsapp" tamanho={120} />
      </div>
    </div>
  );
}

/** O `icon-left="facebook" type-icon="logo"` do botão da origem. */
function LogoDoFacebook() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M13.5 21v-7.2h2.4l.4-2.9h-2.8V9.1c0-.8.2-1.4 1.4-1.4h1.5V5.1c-.3 0-1.2-.1-2.2-.1-2.2 0-3.7 1.3-3.7 3.8v2.1H8v2.9h2.5V21h3Z"
      />
    </svg>
  );
}
