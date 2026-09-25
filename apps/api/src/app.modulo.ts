import { Module } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { ApiKeyGuard } from './authentication.js';
import { SessionGuard } from './session.js';
import { AttachmentsController } from './controllers/attachments.js';
import { ChannelsController } from './controllers/channels.js';
import { ConversationsController } from './controllers/conversations.js';
import { CrmController } from './controllers/crm.js';
import { DeskController } from './controllers/desk.js';
import {
  AgentsController,
  ContactsController,
  QueuesController,
} from './controllers/catalogo.js';
import { InvitationsController, DomainsController } from './controllers/convites.js';
import { LoginController, MeController } from './controllers/login.js';
import {
  LabelsController,
  ConversationLabelsController,
  ContactLabelsController,
} from './controllers/etiquetas.js';
import { ManagementAnalyticsController } from './controllers/management-analytics.js';
import { ManagementBuilderController } from './controllers/management-builder.js';
import { ManagementRegistrationsController } from './controllers/management-registrations.js';
import { ManagementAccountController } from './controllers/management-account.js';
import { ManagementTeamController } from './controllers/management-team.js';
import { ManagementFlowController } from './controllers/management-flow.js';
import { ManagementIntegrationsController } from './controllers/management-integrations.js';
import { ManagementOperationsController } from './controllers/management-operations.js';
import { MyAccountController } from './controllers/my-account.js';
import { ContactImportsController } from './controllers/imports.js';
import { AccountsController } from './controllers/accounts.js';
import { ActiveMessagesController } from './controllers/messages-active.js';
import { TrackedLinksController } from './controllers/rastreador-de-cliques.js';
import { RedirectController } from './controllers/redirect.js';
import { OperationsController } from './controllers/operations.js';
import { SsoConnectionController, SsoLoginController } from './controllers/sso.js';
import { WhatsAppWebhookController } from './controllers/webhooks-whatsapp.js';
import { InstagramWebhookController } from './controllers/webhooks-instagram.js';
import { InstagramChannelsController } from './controllers/channels-instagram.js';
import { MessengerChannelsController } from './controllers/channels-messenger.js';
import { MessengerWebhookController } from './controllers/webhooks-messenger.js';

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
