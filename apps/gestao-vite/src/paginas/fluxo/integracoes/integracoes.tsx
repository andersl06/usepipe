import Link from '../../../componentes/link';
import { useContato } from '../contato';
import { IlustracaoIntegracao, type NomeDeIlustracao } from './ilustracoes';

/**
 * A grade de Integrações — `auth.application.detail.integrations` da origem.
 *
 * Template (portal.js, módulo do controlador `IntegrationsController`):
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
 * NÃO há título acima da grade: a página começa na lista. O texto do botão é
 * `utils.forms.connect` ("Conectar") e vira `utils.forms.connected`
 * ("Conectado", variante primária) quando `<X>.IsValid` é "true" na
 * configuração do bot (`checkWebhook`/`checkDashbot`/`checkBotanalytics`).
 *
 * ponytail: só o Webhook tem tela no Pipe. Dashbot e Botanalytics são
 * cartões visuais (a origem os manda para estados próprios que não existem
 * aqui) e nenhuma integração está ativa, então os três dizem "Conectar".
 */
const CARTOES: readonly {
  id: string;
  ilustracao: NomeDeIlustracao;
  altura: number;
  titulo: string;
  resumo: string;
  rota?: string;
}[] = [
  {
    id: 'dashbot-card-integration',
    ilustracao: 'dashbot',
    altura: 67,
    titulo: 'Dashbot',
    resumo: 'Envie dados do seu chatbot para a sua conta do Dashbot',
  },
  {
    id: 'botanalytics-card-integration',
    ilustracao: 'botanalytics',
    altura: 57,
    titulo: 'Botanalytics',
    resumo: 'Envie dados do seu chatbot para a sua conta do Botanalytics',
  },
  {
    id: 'webhook-card-integration',
    ilustracao: 'webhook',
    altura: 57,
    titulo: 'Webhook',
    resumo: 'Envie os dados do seu chatbot para sua aplicação.',
    rota: 'webhook',
  },
];

export function PaginaIntegracoes() {
  const { contato } = useContato();
  const id = contato.id;
  return (
    <div className="ig-lista">
      {CARTOES.map((cartao) => {
        const miolo = (
          <>
            <IlustracaoIntegracao
              nome={cartao.ilustracao}
              altura={cartao.altura}
              className={cartao.altura === 67 ? 'ig-figura ig-figura--mb0' : 'ig-figura'}
            />
            <div className="ig-texto">
              <h4>{cartao.titulo}</h4>
              <small>{cartao.resumo}</small>
            </div>
            <div className="ig-botao-caixa">
              <span className="ig-botao">Conectar</span>
            </div>
          </>
        );
        return (
          <div className="ig-item" key={cartao.id}>
            {cartao.rota ? (
              <Link
                className="ig-cartao"
                id={cartao.id}
                href={`/fluxo/${id}/integracoes/${cartao.rota}`}
              >
                {miolo}
              </Link>
            ) : (
              <div className="ig-cartao" id={cartao.id} aria-disabled="true">
                {miolo}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
