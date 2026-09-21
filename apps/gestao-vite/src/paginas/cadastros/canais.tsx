import { IconeGestao } from '../../componentes/icones-gestao';
import { IconePortal } from '../../componentes/icones-portal';
import { Icone } from '@pipe/ui';

/**
 * Canais de atendimento — `attendance/desk/channels` da origem
 * (`docs/capturas/blip/dom/FICHA-channels.md`, foto `07` em
 * `docs/capturas/blip/canais/`): título sem subtítulo nem botão, e uma GRADE
 * fixa de 4 cartões (`bds-paper` de 242×292), cada um com ícone, título 16/700,
 * subtítulo 14/400 e um botão no pé — "Conectado" (terciário, com o
 * `checkball`) ou "Conectar" (primário, com a seta).
 *
 * É a lista de INTEGRAÇÕES DE ATENDIMENTO do Desk (quem recebe os tickets), não
 * a configuração dos canais de conversa: WhatsApp, Instagram e Messenger são
 * conectados e configurados DENTRO DO BOT, em `/{tipo}/{id}/canais/*`
 * (`FICHA-conectar-canal-no-bot.md` §4.1). O que morava aqui — os cartões de
 * conectar WhatsApp/Instagram/Messenger, "Detalhes" e "Desconectar" — se mudou
 * para lá; ficou só o que é desta tela.
 *
 * Pipe Desk é o Desk da Pipe, sempre conectado. Salesforce, Salesforce MIAW e
 * Canal Personalizado são integrações que a Pipe não tem: os cartões ficam,
 * com o botão da origem sem destino (`aria-disabled`), em vez de fingir um
 * fluxo de conexão que a captura também não abriu (foto `07`: "não foram
 * clicados").
 */

type CartaoDoCatalogo = {
  titulo: string;
  subtitulo: string;
  icone: 'desk' | 'salesforce' | 'nuvem';
  conectado?: boolean;
};

const CATALOGO: readonly CartaoDoCatalogo[] = [
  { titulo: 'Pipe Desk', subtitulo: 'Canal de atendimento do Pipe', icone: 'desk', conectado: true },
  { titulo: 'Salesforce', subtitulo: 'Live Agent da Salesforce', icone: 'salesforce' },
  { titulo: 'Salesforce MIAW', subtitulo: 'Nova integração', icone: 'salesforce' },
  { titulo: 'Canal Personalizado', subtitulo: 'Conecte-se a outros canais', icone: 'nuvem' },
];

export function PaginaCanais() {
  return (
    <>
      <div className="board-head">
        <h2>Canais de atendimento</h2>
      </div>

      <div className="canais-grade">
        {CATALOGO.map((c) => (
          <section className="canal-cartao" key={c.titulo}>
            <span className="canal-icone" aria-hidden="true">
              {c.icone === 'desk' ? (
                <img src="/pipe/simbolo.svg" alt="" width={40} height={40} />
              ) : (
                <Icone nome={c.icone === 'nuvem' ? 'balao' : 'pessoas'} tamanho={40} />
              )}
            </span>
            <h3>{c.titulo}</h3>
            <p>{c.subtitulo}</p>
            <div className="canal-acao">
              {c.conectado ? (
                <span className="btn fantasma">
                  Conectado
                  <IconeGestao nome="circuloOk" tamanho={20} />
                </span>
              ) : (
                <span className="btn primario" aria-disabled="true" title="Integração ainda não disponível no Pipe">
                  Conectar
                  <IconePortal nome="direita" tamanho={16} />
                </span>
              )}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
