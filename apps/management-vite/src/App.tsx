import { Navigate, Route, Routes } from 'react-router-dom';
import { ClosureNotice } from '@pipe/ui';
import { RequireSession } from './components/exigir-session';
import { useRegisterNavigation } from './lib/navigation';
import { PageLogin } from './pages/login';
import { NaoEncontrado } from './pages/nao-encontrado';
import { PagePortal } from './pages/portal';
import { ContactRoute } from './pages/flow/contact';
import { ContactHome } from './pages/flow/home';
import { ChannelsPage } from './pages/flow/channels/channels';
import { ServicesPage } from './pages/flow/services/servicos';
import { ContactsShell } from './pages/flow/contacts/shell';
import { BotListContacts } from './pages/flow/contacts/lista';
import { BotDetailContact } from './pages/flow/contacts/detalhe/detalhe';
import { IntegrationsShell } from './pages/flow/integrations/shell';
import { PageIntegrations } from './pages/flow/integrations/integrations';
import { PageWebhook } from './pages/flow/integrations/webhook/webhook';
import { PageLog } from './pages/flow/log/log';
import { GrowthShell } from './pages/flow/growth/shell';
import { PageActiveMessages } from './pages/flow/growth/active-messages/active-messages';
import PageClickTracker from './pages/flow/growth/clicktracker/clicktracker';
import PageAds from './pages/flow/growth/ads/anuncios';
import PaymentsPageReport from './pages/flow/growth/payments/payments';
import PageTrackedLinks from './pages/flow/growth/tracked-links/links-rastreados';
import { SettingsShell } from './pages/flow/settings/shell';
import { SettingsBasicPage } from './pages/flow/settings/basic/basicas';
import { BotPageApi } from './pages/flow/settings/api/api';
import { BotPageKeys } from './pages/flow/settings/keys/keys';
import { WelcomePage } from './pages/flow/settings/welcome/boasvindas';
import { PersistentMenuPage } from './pages/flow/settings/persistent-menu/menu-persistente';
import { TeamPage } from './pages/flow/team/equipe';
import { EditMemberPage } from './pages/flow/team/editar';
import { PageContents } from './pages/flow/contents/conteudos';
import { AnalyticsShell } from './pages/flow/analytics/shell';
import { ABA_PADRAO } from './pages/flow/analytics/abas';
import { DashboardPage } from './pages/flow/analytics/dashboard/dashboard';
import { OverviewPage } from './pages/flow/analytics/overview/page';
import { JourneyPage } from './pages/flow/analytics/journey/page';
import { ReportsPage } from './pages/flow/analytics/reports/page';
import { ActiveMessagesPage as AnaliseMensagensAtivas } from './pages/flow/analytics/active-messages/page';
import { ManagerPage } from './pages/flow/analytics/report-manager/manager';
import { DictionaryPage } from './pages/flow/analytics/data-dictionary/dictionary';
import { AttendanceShell } from './pages/operation/shell';
import { PageMonitoring } from './pages/operation/monitoring';
import { PageHistory } from './pages/operation/history';
import { PageAttendance } from './pages/operation/reports-attendance';
import { PageEffort } from './pages/operation/reports-effort';
import { PageSatisfaction } from './pages/operation/reports-satisfaction';
import { PageQualityReview } from './pages/operation/quality-review';
import { EvaluationPageRecord } from './pages/operation/quality-review-ficha';
import { AttendancePageRules } from './pages/registrations/rules-attendance';
import { PageHours } from './pages/registrations/regras-horarios';
import { AgentsPageManagement } from './pages/registrations/agents-management';
import { AgentPageEdit } from './pages/registrations/agents-edit';
import { AgentPagePermissions } from './pages/registrations/agents-permissions';
import { PageQueues } from './pages/registrations/agents-queues';
import { QueuePageEdit } from './pages/registrations/agents-queues-edit';
import { PageBreaks } from './pages/registrations/agents-breaks';
import { PageTemplates } from './pages/registrations/communication-templates';
import { PageCannedResponses } from './pages/registrations/communication-respostas';
import { PageRules } from './pages/registrations/settings-rules';
import { SlaPageRules } from './pages/registrations/regras-sla';
import { PageData } from './pages/registrations/settings-data';
import { PageSettingsGeneral } from './pages/registrations/settings-general';
import { PageChannels } from './pages/registrations/channels';
import { ShellChannelWhatsapp } from './pages/flow/channels/whatsapp/shell';
import { AbaVisaoGeral } from './pages/flow/channels/whatsapp/visao-geral';
import { AbaPerfil } from './pages/flow/channels/whatsapp/perfil';
import { TabSettings } from './pages/flow/channels/whatsapp/settings';
import { AbaAlerta } from './pages/flow/channels/whatsapp/alerta';
import { PageChannelInstagram } from './pages/flow/channels/instagram/page';
import { PageChannelMessenger } from './pages/flow/channels/messenger/page';
import { ContractPage } from './pages/contract/page';
import { CertificatesPage } from './pages/contract/certificates/page';
import { MembersPage } from './pages/contract/members/page';
import { PageMyAccount } from './pages/my-account/page';
import { PageDeployment } from './pages/deployment/page';
import { PageCreateFlow } from './pages/create/flow/page';
import { PageCreateRouter } from './pages/create/router/page';
import { PageWelcome } from './pages/welcome/page';
import { PageUpdates } from './pages/updates/page';
import { PageInvitation } from './pages/invitation/page';
import { PageNoAccess } from './pages/switch-account/no-access/page';
import { PageBuilder } from './pages/builder';

/**
 * Contact child routes render beneath parent `RotaDoContato` at `/fluxo/:id` or `/roteador/:id`. Router reference screens formerly lived incorrectly under `/fluxo/:id/*` (`auvpsegurosrouter`, `pipeprincipal`) and moved to `/roteador/:id/*`. Keep `/fluxo/:id/*` on the same screens until the chatbot-specific view is designed. `RotaDoContato` redirects a prefix that disagrees with contact type, making shared child routes safe for now.
 */
const contactRoutes = (
  <>
    <Route index element={<ContactHome />} />
    <Route path="channels" element={<ChannelsPage />} />
    {/*
 * Each channel has its own page within the bot, matching reference `application/detail/{bot}/channels/{canal}` (`referencias-blip/fichas/FICHA-conectar-canal-no-bot.md` §1). WhatsApp tabs formerly lived in `atendimento/canais/whatsapp/:canalId`, the wrong module; the channel now belongs to the bot without an ID in the URL.
 */}
    <Route path="channels/whatsapp" element={<ShellChannelWhatsapp />}>
      <Route index element={<AbaVisaoGeral />} />
      <Route path="profile" element={<AbaPerfil />} />
      <Route path="settings" element={<TabSettings />} />
      <Route path="alerta" element={<AbaAlerta />} />
    </Route>
    <Route path="channels/instagram" element={<PageChannelInstagram />} />
    <Route path="channels/messenger" element={<PageChannelMessenger />} />
    <Route path="services" element={<ServicesPage />} />

    {/*
 * The Attendance module mirrors source `attendance/desk/*` inside the same contact: Portal bar, contact bar with Attendance selected, and its own `desk-sidebar` in `operacao/casca.tsx`. These screens formerly lived at separate paths such as `/monitoramento` and `/historico` with a second Portal shell; the original change report maps the move.
 */}
    <Route path="attendance" element={<AttendanceShell />}>
      <Route index element={<Navigate to="monitoring" replace />} />
      <Route path="monitoring" element={<PageMonitoring />} />
      <Route path="history" element={<PageHistory />} />
      <Route path="quality-review" element={<PageQualityReview />} />
      <Route path="quality-review/:id" element={<EvaluationPageRecord />} />
      <Route path="reports/attendance" element={<PageAttendance />} />
      <Route path="reports/effort" element={<PageEffort />} />
      <Route path="reports/satisfaction" element={<PageSatisfaction />} />
      <Route path="agents/management" element={<AgentsPageManagement />} />
      {/*
 * Mirror source `/team/create` and `/team/edit` without `:id`; batch-edit selection travels in `?atendentes=` (reference sheet §a.1/§a.4).
 */}
      <Route path="agents/management/add" element={<AgentPageEdit modo="adicionar" />} />
      <Route path="agents/management/edit" element={<AgentPageEdit modo="editar" />} />
      {/* `/team/permission` da origem. */}
      <Route path="agents/management/permissions" element={<AgentPagePermissions />} />
      <Route path="agents/queues" element={<PageQueues />} />
      {/* Mirror source `/queue-management/edit/:id` as a separate page, not a modal. */}
      <Route path="agents/queues/:queueId/edit" element={<QueuePageEdit />} />
      <Route path="agents/breaks" element={<PageBreaks />} />
      <Route path="communication/templates" element={<PageTemplates />} />
      <Route path="communication/canned-responses" element={<PageCannedResponses />} />
      <Route path="rules/attendance" element={<AttendancePageRules />} />
      <Route path="rules/sla" element={<SlaPageRules />} />
      <Route path="rules/hours" element={<PageHours />} />
      <Route path="preferences/general" element={<PageSettingsGeneral />} />
      <Route path="preferences/data" element={<PageData />} />
      <Route path="preferences/rules" element={<PageRules />} />
      <Route path="channels" element={<PageChannels />} />
    </Route>

    <Route path="contacts" element={<ContactsShell />}>
      <Route index element={<BotListContacts />} />
      {/* fix(01-24): o nome do param tinha ficado PT (`contactId`) depois do
          rename, e `detalhe.tsx` já lê `contactId` — o contato nunca resolvia
          (D-29, contato no path continua "keep", mas precisa funcionar). */}
      <Route path=":contactId" element={<BotDetailContact />} />
    </Route>

    <Route path="integrations" element={<IntegrationsShell />}>
      <Route index element={<PageIntegrations />} />
      <Route path="webhook" element={<PageWebhook />} />
    </Route>

    <Route path="log" element={<PageLog />} />

    <Route path="growth" element={<GrowthShell />}>
      <Route index element={<Navigate to="active-messages" replace />} />
      <Route path="active-messages" element={<PageActiveMessages />} />
      <Route path="clicktracker" element={<PageClickTracker />} />
      <Route path="ads" element={<PageAds />} />
      <Route path="payments" element={<PaymentsPageReport />} />
      <Route path="tracked-links" element={<PageTrackedLinks />} />
    </Route>

    <Route path="settings" element={<SettingsShell />}>
      <Route index element={<Navigate to="basic" replace />} />
      <Route path="basic" element={<SettingsBasicPage />} />
      <Route path="welcome" element={<WelcomePage />} />
      <Route path="persistent-menu" element={<PersistentMenuPage />} />
      <Route path="api" element={<BotPageApi />} />
      <Route path="keys" element={<BotPageKeys />} />
    </Route>

    <Route path="team" element={<TeamPage />} />
    <Route path="team/edit/:userId" element={<EditMemberPage />} />

    <Route path="contents" element={<PageContents />} />

    <Route path="analytics" element={<AnalyticsShell />}>
      <Route index element={<Navigate to={ABA_PADRAO} replace />} />
      <Route path="dashboard" element={<DashboardPage />} />
      <Route path="overview" element={<OverviewPage />} />
      <Route path="journey" element={<JourneyPage />} />
      <Route path="reports" element={<ReportsPage />} />
      <Route path="active-messages" element={<AnaliseMensagensAtivas />} />
      <Route path="report-manager" element={<ManagerPage />} />
      <Route path="data-dictionary" element={<DictionaryPage />} />
    </Route>
  </>
);

/**
 * Gestão routes retain the same URLs as the former Next app so bookmarks and history keep working. The tree uses contact `/fluxo/:id` for chatbot or `/roteador/:id` for router as parent state, with modules below. Only `/entrar` is public; `ExigirSessao` guards the rest.
 */
export function App() {
  useRegisterNavigation();
  return (
    <>
    <ClosureNotice />
    <Routes>
      <Route path="/login" element={<PageLogin />} />
      <Route path="/invite/:token" element={<PageInvitation />} />

      <Route element={<RequireSession />}>
        <Route path="/" element={<Navigate to="/portal" replace />} />
        <Route path="/portal" element={<PagePortal />} />
        <Route path="/updates" element={<PageUpdates />} />
        <Route path="/contract" element={<ContractPage />} />
        <Route path="/contract/certificates" element={<CertificatesPage />} />
        <Route path="/contract/members" element={<MembersPage />} />
        <Route path="/my-account" element={<PageMyAccount />} />
        <Route path="/bem-vindo" element={<PageWelcome />} />
        <Route path="/switch-account/no-access" element={<PageNoAccess />} />
        {/* D-31 (`std/nav-contract.md` §Gestão): passo do wizard no path, não
            em `?passo=`. `:passo?` cobre a base (sem passo, primeira tela)
            e cada segmento de passo com a MESMA rota declarativa. */}
        <Route path="/create/flow/:passo?" element={<PageCreateFlow />} />
        <Route path="/create/router/:passo?" element={<PageCreateRouter />} />

        {/*
 * Implantação is account onboarding, with no contact to nest beneath. It renders its own `pt-app` and `BarraDoPortal` chrome in `page.tsx`, like Novidades and the contract panel. Builder and Growth moved inside the contact; after that, `EstruturaGestao` had no route requiring its two-bar shell and was removed.
 */}
        <Route path="/deployment" element={<PageDeployment />} />

        <Route path="/flow/:id" element={<ContactRoute />}>
          {contactRoutes}
          {/*
 * Builder is hidden from the router menu by `HIDDEN_IN_ROUTER` in `fluxo/itens.ts`, matching the reference, so this route exists only here and not below `/roteador/:id`.
 */}
          <Route path="builder" element={<PageBuilder />} />
        </Route>
        <Route path="/router/:id" element={<ContactRoute />}>
          {contactRoutes}
        </Route>

        <Route path="*" element={<NaoEncontrado />} />
      </Route>
    </Routes>
    </>
  );
}
