import { Module } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { ApiKeyGuard } from './autenticacao.js';
import { SessionGuard } from './sessao.js';
import { AttachmentsController } from './controladores/anexos.js';
import { ChannelsController } from './controladores/canais.js';
import { ConversationsController } from './controladores/conversas.js';
import { CrmController } from './controladores/crm.js';
import { DeskController } from './controladores/desk.js';
import {
  AgentsController,
  ContactsController,
  QueuesController,
} from './controladores/catalogo.js';
import { InvitationsController, DomainsController } from './controladores/convites.js';
import { LoginController, MeController } from './controladores/entrar.js';
import {
  LabelsController,
  ConversationLabelsController,
  ContactLabelsController,
} from './controladores/etiquetas.js';
import { ManagementAnalyticsController } from './controladores/gestao-analise.js';
import { ManagementBuilderController } from './controladores/gestao-builder.js';
import { ManagementRegistrationsController } from './controladores/gestao-cadastros.js';
import { ManagementAccountController } from './controladores/gestao-conta.js';
import { ManagementTeamController } from './controladores/gestao-equipe.js';
import { ManagementFlowController } from './controladores/gestao-fluxo.js';
import { ManagementIntegrationsController } from './controladores/gestao-integracoes.js';
import { ManagementOperationsController } from './controladores/gestao-operacao.js';
import { MyAccountController } from './controladores/minha-conta.js';
import { ContactImportsController } from './controladores/importacoes.js';
import { AccountsController } from './controladores/contas.js';
import { ActiveMessagesController } from './controladores/mensagens-ativas.js';
import { TrackedLinksController } from './controladores/rastreador-de-cliques.js';
import { RedirectController } from './controladores/redirecionamento.js';
import { OperationsController } from './controladores/operacao.js';
import { SsoConnectionController, SsoLoginController } from './controladores/sso.js';
import { WhatsAppWebhookController } from './controladores/webhooks-whatsapp.js';
import { InstagramWebhookController } from './controladores/webhooks-instagram.js';
import { InstagramChannelsController } from './controladores/canais-instagram.js';
import { MessengerChannelsController } from './controladores/canais-messenger.js';
import { MessengerWebhookController } from './controladores/webhooks-messenger.js';

/**
 * Módulo raiz.
 *
 * Sem injeção por tipo de construtor de propósito: os controladores chamam funções
 * de domínio direto, como o Desk faz com `servidor/consultas.ts`. Isso dispensa
 * `emitDecoratorMetadata`, que brigaria com o `verbatimModuleSyntax` do tsconfig da
 * base, e deixa toda regra testável sem subir o Nest.
 *
 * Os guardas são registrados como valor pronto pelo mesmo motivo. São DOIS, e cada um
 * cuida do que está marcado: `@Escopos(...)` é chave de API (integração), `@ComSessao()`
 * é cookie de navegador (as telas). Rota sem marca nenhuma é pública de propósito —
 * o webhook da Meta, que se autentica pela assinatura, e `/saude`.
 */
@Module({
  controllers: [
    WhatsAppWebhookController,
    InstagramWebhookController,
    MessengerWebhookController,
    LoginController,
    SsoLoginController,
    MeController,
    MyAccountController,
    ManagementFlowController,
    ManagementBuilderController,
    ManagementTeamController,
    ManagementIntegrationsController,
    ManagementAnalyticsController,
    ManagementOperationsController,
    ManagementRegistrationsController,
    ManagementAccountController,
    DeskController,
    SsoConnectionController,
    InvitationsController,
    DomainsController,
    OperationsController,
    ConversationsController,
    LabelsController,
    ConversationLabelsController,
    ContactLabelsController,
    ActiveMessagesController,
    TrackedLinksController,
    RedirectController,
    CrmController,
    AttachmentsController,
    ChannelsController,
    InstagramChannelsController,
    MessengerChannelsController,
    ContactsController,
    QueuesController,
    AgentsController,
    ContactImportsController,
    AccountsController,
  ],
  providers: [
    { provide: APP_GUARD, useValue: new ApiKeyGuard(new Reflector()) },
    { provide: APP_GUARD, useValue: new SessionGuard(new Reflector()) },
  ],
})
export class AppModulo {}
