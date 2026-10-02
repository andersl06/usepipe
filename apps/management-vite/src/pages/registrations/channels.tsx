import { ManagementIcon } from '../../components/icones-management';
import { IconePortal } from '@pipe/ui/icones-portal';
import { Botao, Icone } from '@pipe/ui';

const AVISO_EM_BREVE = 'Este recurso será liberado em breve para este fluxo.';

/**
 * Attendance channels — the source's `attendance/desk/channels` (`referencias-blip/fichas/FICHA-channels.md`, photo `07` in `referencias-blip/canais/`): a title with no subtitle or button, and a fixed GRID of 4 cards (343×270, measured live in `ref/verificacao/channels-blip.md`), each with an icon, 16/700 title, 14/400 subtitle, and a button at the bottom — "Conectado" (tertiary, with the `checkball`) or "Conectar" (primary, with the arrow).
 *
 * This is the Desk's list of ATTENDANCE INTEGRATIONS (who receives the tickets), not conversation-channel configuration: WhatsApp, Instagram, and Messenger are connected and configured INSIDE THE BOT, at `/{tipo}/{id}/canais/*` (`FICHA-conectar-canal-no-bot.md` §4.1). What used to live here — the cards for connecting WhatsApp/Instagram/Messenger, "Detalhes", and "Desconectar" — moved there; only what belongs to this screen stayed.
 *
 * Pipe Desk is Pipe's own Desk, always connected. Salesforce, Salesforce MIAW, and Canal Personalizado are integrations Pipe doesn't have: the cards stay, with the source's button pointing nowhere (`aria-disabled`), instead of faking a connection flow that the capture never opened either (photo `07`: "not clicked").
 */

type CatalogCard = {
  titulo: string;
  subtitulo: string;
  icone: 'desk' | 'salesforce' | 'nuvem';
  conectado?: boolean;
};

const CATALOGO: readonly CatalogCard[] = [
  { titulo: 'Pipe Desk', subtitulo: 'Canal de atendimento do Pipe', icone: 'desk', conectado: true },
  { titulo: 'Salesforce', subtitulo: 'Live Agent da Salesforce', icone: 'salesforce' },
  { titulo: 'Salesforce MIAW', subtitulo: 'Nova integração', icone: 'salesforce' },
  { titulo: 'Canal Personalizado', subtitulo: 'Conecte-se a outros canais', icone: 'nuvem' },
];

export function PageChannels() {
  return (
    <>
      <div className="board-head">
        <h2>Canais de atendimento</h2>
      </div>

      <div className="channels-grid">
        {CATALOGO.map((c) => (
          <section className="channel-card" key={c.titulo}>
            <span className="channel-icon" aria-hidden="true">
              {c.icone === 'desk' ? (
                <img src="/pipe/simbolo.svg" alt="" width={40} height={40} />
              ) : (
                <Icone nome={c.icone === 'nuvem' ? 'balao' : 'pessoas'} tamanho={40} />
              )}
            </span>
            <h3>{c.titulo}</h3>
            <p>{c.subtitulo}</p>
            <div className="channel-action">
              {c.conectado ? (
                <Botao className="fantasma" disabled aria-label="Pipe Desk conectado">
                  Conectado
                  <ManagementIcon nome="circuloOk" tamanho={20} />
                </Botao>
              ) : (
                <Botao variante="primario" disabled title={AVISO_EM_BREVE}>
                  Conectar
                  <IconePortal nome="direita" tamanho={16} />
                </Botao>
              )}
            </div>
          </section>
        ))}
      </div>
      <p className="note">{AVISO_EM_BREVE}</p>
    </>
  );
}
