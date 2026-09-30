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
import { SatisfactionSurveysController } from './controllers/satisfaction-surveys.js';
import { FlowFunctionsController } from './controllers/flow-functions.js';
import { ManagementKnowledgeController } from './controllers/management-knowledge.js';

/**
 * Root module. Controllers call domain functions directly, as the Desk does with `servidor/consultas.ts`, instead of using constructor type injection. This avoids `emitDecoratorMetadata`, which conflicts with the base tsconfig's `verbatimModuleSyntax`, and lets rules be tested without starting Nest. Guards are registered as ready values for the same reason. The two guards cover distinct markers: `@Escopos(...)` requires an API key for integrations, while `@ComSessao()` requires a browser session. An unmarked route is deliberately public: the Meta webhook authenticates by signature, and `/saude` is public.
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
    SatisfactionSurveysController,
    FlowFunctionsController,
    ManagementKnowledgeController,
  ],
  providers: [
    { provide: APP_GUARD, useValue: new ApiKeyGuard(new Reflector()) },
    { provide: APP_GUARD, useValue: new SessionGuard(new Reflector()) },
  ],
})
export class AppModulo {}
