import { useState } from 'react';
import type { CanalDoFluxo, CanalDoFluxoNaTela } from '@pipe/contracts';
import { Botao } from '@pipe/ui';
import { ErroDaApi } from '../../../../lib/api';
import { useLeitura } from '../../../../lib/consulta';
import { estadoDoCanalNoBot } from '../../../../lib/canal-do-fluxo';
import { ConectarMessengerManual } from '../../../cadastros/canal-conectar-manual';
import { FalhaDeLeitura, useContato } from '../../contato';
import { LogoDeCanal } from '../canais';
import { CascaDoCanal, type AbaDoCanal } from '../casca-do-canal';
import { AvisoDeOutroCanal, EscolherCanalExistente, ModalDesconectar } from '../conexao';

/**
 * O Messenger por dentro do BOT — `…channels/messenger`. A página atual da
 * origem é um micro-front que não está no bundle capturado
 * (`FICHA-conectar-canal-no-bot.md` §1.4 e §5); o que foi lido é o legado
 * `messengerDpr` (template 8080 + `MessengerOverviewTab.html`, 208152): título
 * "Messenger", aba "Visão Geral" com o ícone e o texto sobre a Página do
 * Facebook, e o modal de desconexão (`messenger.modals.disconnect`).
 *
 * O estado conectado NÃO foi capturado: aqui ele segue o desenho do Instagram
 * (chip com a Página + "Desconectar canal"), dito como decisão Pipe. A conexão
 * é a manual (`ConectarMessengerManual`, com `fluxoId`) e, decisão Pipe, a
 * escolha de uma Página que a conta já tem.
 */

const ABAS: readonly AbaDoCanal[] = [{ rotulo: 'Visão Geral', segmento: '' }];

export function PaginaCanalMessenger() {
  const { contato } = useContato();
  const leitura = useLeitura<CanalDoFluxoNaTela>(`/v1/gestao/fluxos/${contato.id}/canal`);

  if (leitura.error && !(leitura.error instanceof ErroDaApi && leitura.error.status === 404)) {
    return <FalhaDeLeitura erro={leitura.error} />;
  }
  if (!leitura.data) return null;
  const situacao = estadoDoCanalNoBot(leitura.data.canal, 'messenger');

  return (
    <CascaDoCanal tipo="messenger" titulo="Messenger" abas={ABAS} conectado={situacao.estado === 'conectado'}>
      {situacao.estado === 'conectado' ? (
        <Conectado fluxoId={contato.id} canal={situacao.canal} />
      ) : situacao.estado === 'outro_canal' ? (
        <div className="cb-linha">
          <div className="cb-icone-coluna">
            <LogoDeCanal nome="messenger" />
          </div>
          <div className="cb-coluna">
            <AvisoDeOutroCanal canal={situacao.canal} rotulo="Messenger" />
          </div>
        </div>
      ) : (
        <Desconectado fluxoId={contato.id} disponiveis={leitura.data.disponiveis} />
      )}
    </CascaDoCanal>
  );
}

function Conectado({ fluxoId, canal }: { fluxoId: string; canal: CanalDoFluxo }) {
  const [desconectando, setDesconectando] = useState(false);
  return (
    <div className="cb-linha">
      <div className="cb-icone-coluna">
        <LogoDeCanal nome="messenger" />
      </div>
      <div className="cb-coluna">
        <p className="cb-typo-16">
          <strong>Seu chatbot está conectado à Página:</strong>
        </p>
        <span className="cb-chip">
          <span className="cb-chip-avatar" aria-hidden="true">
            <LogoDeCanal nome="messenger" />
          </span>
          {canal.nome}
          {canal.numero ? ` (${canal.numero})` : ''}
        </span>
        <div className="cb-acoes-direita">
          <Botao type="button" variante="perigo" onClick={() => setDesconectando(true)}>
            Desconectar canal
          </Botao>
        </div>
        <ModalDesconectar
          aberto={desconectando}
          fluxoId={fluxoId}
          tipo="messenger"
          onFechar={() => setDesconectando(false)}
        />
      </div>
    </div>
  );
}

function Desconectado({ fluxoId, disponiveis }: { fluxoId: string; disponiveis: CanalDoFluxo[] }) {
  const [escolhendo, setEscolhendo] = useState(false);
  const temPaginaLivre = disponiveis.some(
    (c) => c.tipo === 'messenger' && c.ativo && (c.fluxoId === null || c.fluxoId === fluxoId),
  );

  if (escolhendo) {
    return (
      <EscolherCanalExistente
        fluxoId={fluxoId}
        tipo="messenger"
        disponiveis={disponiveis}
        onVoltar={() => setEscolhendo(false)}
      />
    );
  }

  return (
    <div className="cb-linha">
      <div className="cb-icone-coluna">
        <LogoDeCanal nome="messenger" />
      </div>
      <div className="cb-coluna">
        <p className="cb-typo-16">
          Seu chatbot será acessado através de uma página no Facebook. Por isso, é importante que
          você{' '}
          <a href="https://www.facebook.com/pages/create" target="_blank" rel="noopener noreferrer">
            crie uma página
          </a>{' '}
          para a sua empresa no Facebook. Caso sua empresa já tenha uma página, você poderá
          utilizá-la.
        </p>
        <div className="cb-acoes-direita">
          <ConectarMessengerManual fluxoId={fluxoId} rotulo="Conectar-se ao Messenger" variante="primario" />
          {temPaginaLivre ? (
            <Botao type="button" onClick={() => setEscolhendo(true)}>
              Usar uma Página já conectada
            </Botao>
          ) : null}
        </div>
      </div>
    </div>
  );
}
