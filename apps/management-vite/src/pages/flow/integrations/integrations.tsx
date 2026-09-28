import Link from '../../../components/link';
import { contactPath, useContact } from '../contact';
import { IllustrationIntegration, type IllustrationName } from './illustrations';

/**
 * The Integrations grid — the origin's `auth.application.detail.integrations`.
 *
 * Template (portal.js, the `IntegrationsController` controller's module):
 *
 *   <div class="container"> <div class="row"> <div class="twelve columns">
 *     <div class="integrations-list">
 *       <div class="integration-item tc">
 *         <card class="tc card card--with-hover card--square" id="dashbot-card-integration">
 *           <img src="/assets/img/integrations/dashbot.svg" height="67" class="mb0"/>
 *           <div class="integration-item-text"> <h4>dashbot.title</h4> <small>dashbot.headline</small> </div>
 *           <div class="integration-item-button"> <bds-button variant="tertiary">{{$ctrl.dashbotButtonText}}</bds-button> </div>
 *         </card>
 *       </div>
 *       … Botanalytics (height 57) … Webhook (height 57) …
 *
 * There's NO title above the grid: the page starts at the list. The button text is `utils.forms.connect` ("Conectar") and becomes `utils.forms.connected` ("Conectado", primary variant) when `<X>.IsValid` is "true" in the bot's configuration (`checkWebhook`/`checkDashbot`/`checkBotanalytics`).
 *
 * ponytail: only Webhook has a screen in Pipe. Dashbot and Botanalytics are visual cards (the origin sends them to their own states, which don't exist here) and no integration is active, so all three say "Conectar".
 */
const CARDS: readonly {
  id: string;
  illustration: IllustrationName;
  altura: number;
  titulo: string;
  resumo: string;
  rota?: string;
}[] = [
  {
    id: 'dashbot-card-integration',
    illustration: 'dashbot',
    altura: 67,
    titulo: 'Dashbot',
    resumo: 'Envie dados do seu chatbot para a sua conta do Dashbot',
  },
  {
    id: 'botanalytics-card-integration',
    illustration: 'botanalytics',
    altura: 57,
    titulo: 'Botanalytics',
    resumo: 'Envie dados do seu chatbot para a sua conta do Botanalytics',
  },
  {
    id: 'webhook-card-integration',
    illustration: 'webhook',
    altura: 57,
    titulo: 'Webhook',
    resumo: 'Envie os dados do seu chatbot para sua aplicação.',
    rota: 'webhook',
  },
];

export function PageIntegrations() {
  const { contact } = useContact();
  const base = contactPath(contact);
  return (
    <div className="ig-lista">
      {CARDS.map((card) => {
        const miolo = (
          <>
            <IllustrationIntegration
              nome={card.illustration}
              altura={card.altura}
              className={card.altura === 67 ? 'ig-figura ig-figura--mb0' : 'ig-figura'}
            />
            <div className="ig-texto">
              <h4>{card.titulo}</h4>
              <small>{card.resumo}</small>
            </div>
            <div className="ig-botao-caixa">
              <span className="ig-botao">Conectar</span>
            </div>
          </>
        );
        return (
          <div className="ig-item" key={card.id}>
            {card.rota ? (
              <Link
                className="ig-card"
                id={card.id}
                href={`${base}/integrations/${card.rota}`}
              >
                {miolo}
              </Link>
            ) : (
              <div className="ig-card" id={card.id} aria-disabled="true">
                {miolo}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
