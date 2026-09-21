import { useState } from 'react';
import type { CanalDoFluxo, CanalDoFluxoNaTela } from '@pipe/contracts';
import { Botao } from '@pipe/ui';
import { LogoPortal } from '../../../../componentes/icones-portal';
import { ErroDaApi } from '../../../../lib/api';
import { useLeitura } from '../../../../lib/consulta';
import { estadoDoCanalNoBot } from '../../../../lib/canal-do-fluxo';
import { ConectarInstagramManual } from '../../../cadastros/canal-conectar-manual';
import { FalhaDeLeitura, useContato } from '../../contato';
import { CascaDoCanal, type AbaDoCanal } from '../casca-do-canal';
import { AvisoDeOutroCanal, EscolherCanalExistente, ModalDesconectar } from '../conexao';

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

const ABAS: readonly AbaDoCanal[] = [
  { rotulo: 'Visão Geral', segmento: '' },
  { rotulo: 'Configurações', segmento: 'configuracoes', emBreve: true },
];

export function PaginaCanalInstagram() {
  const { contato } = useContato();
  const leitura = useLeitura<CanalDoFluxoNaTela>(`/v1/gestao/fluxos/${contato.id}/canal`);

  if (leitura.error && !(leitura.error instanceof ErroDaApi && leitura.error.status === 404)) {
    return <FalhaDeLeitura erro={leitura.error} />;
  }
  if (!leitura.data) return null;
  const situacao = estadoDoCanalNoBot(leitura.data.canal, 'instagram');

  return (
    <CascaDoCanal tipo="instagram" titulo="Instagram" abas={ABAS} conectado={situacao.estado === 'conectado'}>
      {situacao.estado === 'conectado' ? (
        <Conectado fluxoId={contato.id} canal={situacao.canal} />
      ) : situacao.estado === 'outro_canal' ? (
        <div className="cb-linha">
          <div className="cb-icone-coluna">
            <LogoPortal nome="instagram" tamanho={64} />
          </div>
          <div className="cb-coluna">
            <AvisoDeOutroCanal canal={situacao.canal} rotulo="Instagram" />
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
  const usuario = canal.numero ? `@${canal.numero.replace(/^@/, '')}` : canal.nome;
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
          {usuario}
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
          fluxoId={fluxoId}
          tipo="instagram"
          onFechar={() => setDesconectando(false)}
        />
      </div>
    </div>
  );
}

function Desconectado({ fluxoId, disponiveis }: { fluxoId: string; disponiveis: CanalDoFluxo[] }) {
  const [escolhendo, setEscolhendo] = useState(false);
  const temContaLivre = disponiveis.some(
    (c) => c.tipo === 'instagram' && c.ativo && (c.fluxoId === null || c.fluxoId === fluxoId),
  );

  if (escolhendo) {
    return (
      <EscolherCanalExistente
        fluxoId={fluxoId}
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
          <ConectarInstagramManual fluxoId={fluxoId} rotulo="Iniciar conexão" variante="primario" />
          {temContaLivre ? (
            <Botao type="button" onClick={() => setEscolhendo(true)}>
              Usar uma conta já conectada
            </Botao>
          ) : null}
        </div>
      </div>
    </div>
  );
}
