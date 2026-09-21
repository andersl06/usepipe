import { Outlet, useOutletContext } from 'react-router-dom';
import type { CanalDoFluxo, CanalDoFluxoNaTela } from '@pipe/contracts';
import { useLeitura } from '../../../../lib/consulta';
import { ErroDaApi } from '../../../../lib/api';
import type { CanalWhatsAppVisivel } from '../../../../lib/canais';
import { estadoDoCanalNoBot, type EstadoDoCanalNoBot } from '../../../../lib/canal-do-fluxo';
import { FalhaDeLeitura, useContato } from '../../contato';
import { CascaDoCanal, type AbaDoCanal } from '../casca-do-canal';
import './canal-whatsapp.css';

/**
 * O WhatsApp por dentro do BOT — `/application/detail/{bot}/channels/whatsapp-embedded`
 * (`FICHA-conectar-canal-no-bot.md` §1.2–1.3, template 79961): seta "‹" para
 * a lista de canais, título "WhatsApp", e as abas Visão Geral | Perfil da
 * empresa | Configurações | Configurações de alerta | Ambiente de testes, com
 * "Documentação" à direita.
 *
 * As duas abas do meio só existem com o número conectado
 * (`ng-show="currentActivationStep === VERIFIED"`) — foto `08` da ficha do
 * canal. "Ambiente de testes" a Pipe ainda não tem por dentro.
 *
 * Estas abas moravam em `cadastros/canal-whatsapp/**`, no módulo Atendimento,
 * com o canal escolhido pela URL (`/canais/whatsapp/:canalId`). Na origem o
 * canal é DO BOT: a página é uma só por bot, e o canal vem de
 * `GET /v1/gestao/fluxos/:id/canal`. O que as abas de perfil, configurações e
 * alerta precisam além disso — a saúde do número na Meta — continua vindo de
 * `/v1/canais/whatsapp` (que pede `canal.gerenciar`; sem ela, a Visão Geral
 * desenha com o que o bot sabe e as outras abas dizem o que houve).
 */

export interface ContextoDoCanalWhatsapp {
  fluxoId: string;
  canal: CanalDoFluxo;
  /** O canal como `/v1/canais/whatsapp` o vê (estado na Meta, qualidade…); nulo se a leitura não veio. */
  saude: CanalWhatsAppVisivel | null;
}

export function useCanalWhatsapp(): ContextoDoCanalWhatsapp {
  return useOutletContext<ContextoDoCanalWhatsapp>();
}

const ABAS: readonly AbaDoCanal[] = [
  { rotulo: 'Visão Geral', segmento: '' },
  { rotulo: 'Perfil da empresa', segmento: 'perfil', exigeConectado: true },
  { rotulo: 'Configurações', segmento: 'configuracoes', exigeConectado: true },
  { rotulo: 'Configurações de alerta', segmento: 'alerta' },
  { rotulo: 'Ambiente de testes', segmento: 'testes', emBreve: true },
];

/** O que a Visão Geral recebe quando NÃO há canal: a tela decide o passo. */
export interface ContextoSemCanal {
  fluxoId: string;
  situacao: EstadoDoCanalNoBot;
  disponiveis: CanalDoFluxo[];
}

export function CascaCanalWhatsapp() {
  const { contato } = useContato();
  const leitura = useLeitura<CanalDoFluxoNaTela>(`/v1/gestao/fluxos/${contato.id}/canal`);
  const situacao = leitura.data ? estadoDoCanalNoBot(leitura.data.canal, 'whatsapp_cloud') : null;
  const conectado = situacao?.estado === 'conectado';
  /* A saúde só interessa conectado; 403 (sem `canal.gerenciar`) não é falha da página. */
  const saudes = useLeitura<{ canais: CanalWhatsAppVisivel[] }>(conectado ? '/v1/canais/whatsapp' : null, {
    retry: false,
  });

  if (leitura.error && !(leitura.error instanceof ErroDaApi && leitura.error.status === 404)) {
    return <FalhaDeLeitura erro={leitura.error} />;
  }
  if (!leitura.data || !situacao) return null;

  const contexto: ContextoDoCanalWhatsapp | ContextoSemCanal =
    situacao.estado === 'conectado'
      ? {
          fluxoId: contato.id,
          canal: situacao.canal,
          saude: saudes.data?.canais.find((c) => c.id === situacao.canal.id) ?? null,
        }
      : { fluxoId: contato.id, situacao, disponiveis: leitura.data.disponiveis };

  return (
    <CascaDoCanal tipo="whatsapp_cloud" titulo="WhatsApp" abas={ABAS} conectado={conectado}>
      <Outlet context={contexto} />
    </CascaDoCanal>
  );
}
