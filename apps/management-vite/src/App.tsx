import { Navigate, Route, Routes } from 'react-router-dom';
import { ClosureNotice } from '@pipe/ui';
import { RequireSession } from './components/exigir-session';
import { useRegisterNavigation } from './lib/navigation';
import { APPLICATION } from './lib/application-paths';
import { PageLogin } from './pages/login';
import { NaoEncontrado } from './pages/nao-encontrado';
import { PagePortal } from './pages/portal';
import { LegacyRedirect, LegacyContactRedirect } from './pages/legacy-redirects';
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
import { PageCreateName } from './pages/create/name/page';
import { PageWelcome } from './pages/welcome/page';
import { PageUpdates } from './pages/updates/page';
import { PageInvitation } from './pages/invitation/page';
import { PageNoAccess } from './pages/switch-account/no-access/page';
import { PageBuilder } from './pages/builder';

/**
 * Contact child routes render beneath `ContactRoute`, mounted once below (search this file for
 * `ContactRoute` to find the single mount point), ONE tree for both flow and router — Blip has
 * no type segment in the URL and resolves everything by short name (D-52, `route-inventory.md`
 * §1). The segments below use Blip's own names where `route-inventory.md` §2 documents one
 * (D-54); where it doesn't, they keep ours.
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
    {/* `services` → `templates/pipeline` (D-54; route-inventory.md §2, "serviços do roteador"). */}
    <Route path="templates/pipeline" element={<ServicesPage />} />

    {/*
 * The Attendance module mirrors source `attendance/desk/*` inside the same contact: Portal bar, contact bar with Attendance selected, and its own `desk-sidebar` in `operacao/casca.tsx`. These screens formerly lived at separate paths such as `/monitoramento` and `/historico` with a second Portal shell; the original change report maps the move.
 */}
    <Route path="attendance" element={<AttendanceShell />}>
      <Route index element={<Navigate to="monitoring" replace />} />
      <Route path="monitoring" element={<PageMonitoring />} />
      <Route path="history" element={<PageHistory />} />
      {/* `quality-review` → `quality-assurance` (D-54). */}
      <Route path="quality-assurance" element={<PageQualityReview />} />
      <Route path="quality-assurance/:id" element={<EvaluationPageRecord />} />
      {/* `reports/attendance|effort|satisfaction` → `report`, `effort`, `survey-dashboard` (D-54). */}
      <Route path="report" element={<PageAttendance />} />
      <Route path="effort" element={<PageEffort />} />
      <Route path="survey-dashboard" element={<PageSatisfaction />} />
      {/* `agents/management` → `team` (D-54, "atendentes"), mirroring source `/team/create`, `/team/edit`, `/team/permission` without `:id`; batch-edit selection travels in `?atendentes=` (reference sheet §a.1/§a.4). */}
      <Route path="team" element={<AgentsPageManagement />} />
      <Route path="team/create" element={<AgentPageEdit modo="adicionar" />} />
      <Route path="team/edit" element={<AgentPageEdit modo="editar" />} />
      <Route path="team/permission" element={<AgentPagePermissions />} />
      {/* `agents/queues` → `queue-management` (D-54); child mirrors source `/queue-management/edit/:id` as a separate page, not a modal. */}
      <Route path="queue-management" element={<PageQueues />} />
      <Route path="queue-management/:queueId/edit" element={<QueuePageEdit />} />
      {/* `agents/breaks` → `personalizedbreaks` (D-54). */}
      <Route path="personalizedbreaks" element={<PageBreaks />} />
      {/* `communication/templates|canned-responses` → `message-template`, `replies` (D-54). */}
      <Route path="message-template" element={<PageTemplates />} />
      <Route path="replies" element={<PageCannedResponses />} />
      {/* `rules/attendance|sla|hours` → `rules`, `sla-policy`, `attendance-hours` (D-54). */}
      <Route path="rules" element={<AttendancePageRules />} />
      <Route path="sla-policy" element={<SlaPageRules />} />
      <Route path="attendance-hours" element={<PageHours />} />
      <Route path="preferences/general" element={<PageSettingsGeneral />} />
      <Route path="preferences/data" element={<PageData />} />
      <Route path="preferences/rules" element={<PageRules />} />
      <Route path="channels" element={<PageChannels />} />
    </Route>

    {/* `contacts` → `users` (D-54, route-inventory.md §2). */}
    <Route path="users" element={<ContactsShell />}>
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
      {/* `ads` → `adsbuying`, `payments` → `paymentsReport` (D-54). */}
      <Route path="adsbuying" element={<PageAds />} />
      <Route path="paymentsReport" element={<PaymentsPageReport />} />
      {/*
 * Kept as our own name (D-54): Blip's `clicktracker` already names the item above
 * (Click-to-WhatsApp ad performance). Tracked links have no Blip counterpart
 * (`growth/navigation.tsx`); adopting `clicktracker` here too would collide two screens
 * onto the same address.
 */}
      <Route path="tracked-links" element={<PageTrackedLinks />} />
    </Route>

    {/* `settings` → `configurations` (D-54; route-inventory.md §2, "settings/basic" → "configurations/basic"). Leaf names already match Blip's (`basic`, `welcome`, `keys`) and stay as they were. */}
    <Route path="configurations" element={<SettingsShell />}>
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
      {/* `report-manager` → `data-extractor` (D-54). */}
      <Route path="data-extractor" element={<ManagerPage />} />
      <Route path="data-dictionary" element={<DictionaryPage />} />
    </Route>

    {/* `builder` → `templates/builder` (D-54). Menu-hidden for routers (`itens.ts`'s `HIDDEN_IN_ROUTER`), but the tree is single now (D-52) — no type segment left to gate it by. */}
    <Route path="templates/builder" element={<PageBuilder />} />
  </>
);

/**
 * Gestão routes live under `/application` (D-52), matching Blip's own shape: the portal list,
 * the contact tree keyed by short name (`ContactRoute`, below), the creation wizard under
 * `/application/create`, and the tenant-level screens (`tenant`, `product-updates`,
 * `deployment`, `switch-account`). Only `/login` and `/invite/:token` are public; `RequireSession`
 * guards the rest. Every pre-D-52 address redirects with replace through
 * `LegacyRedirect`/`LegacyContactRedirect` (`lib/application-paths.ts`), preserving the rest of
 * the path, the query, and the hash.
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
        <Route path="/" element={<Navigate to={APPLICATION} replace />} />
        <Route path="/application" element={<PagePortal />} />
        <Route path="/application/product-updates" element={<PageUpdates />} />
        <Route path="/application/tenant" element={<ContractPage />} />
        <Route path="/application/tenant/mtls" element={<CertificatesPage />} />
        <Route path="/application/tenant/members" element={<MembersPage />} />
        {/* Root-level: the Blip capture shows neither state nested under `/application` (`lib/application-paths.ts`'s header comment). */}
        <Route path="/my-account" element={<PageMyAccount />} />
        <Route path="/welcome" element={<PageWelcome />} />
        <Route path="/application/switch-account/no-access" element={<PageNoAccess />} />
        {/* D-31/D-52: the wizard step lives in the path, not `?passo=` or `:passo`. */}
        <Route path="/application/create/marketplace" element={<PageCreateFlow step="marketplace" />} />
        <Route path="/application/create/test" element={<PageCreateFlow step="test" />} />
        <Route path="/application/create/router" element={<PageCreateRouter />} />
        <Route path="/application/create/name/:template" element={<PageCreateName />} />

        {/*
 * Implantação is account onboarding, with no contact to nest beneath. It renders its own `pt-app` and `BarraDoPortal` chrome in `page.tsx`, like Novidades and the contract panel. Builder and Growth moved inside the contact; after that, `EstruturaGestao` had no route requiring its two-bar shell and was removed.
 */}
        <Route path="/application/deployment" element={<PageDeployment />} />

        <Route path="/application/detail/:shortName" element={<ContactRoute />}>
          {contactRoutes}
        </Route>

        {/* Pre-D-52 addresses: redirect with replace, preserving path/query/hash. */}
        <Route path="/portal" element={<LegacyRedirect />} />
        <Route path="/create/*" element={<LegacyRedirect />} />
        <Route path="/updates" element={<LegacyRedirect />} />
        <Route path="/contract/*" element={<LegacyRedirect />} />
        <Route path="/deployment" element={<LegacyRedirect />} />
        <Route path="/switch-account/*" element={<LegacyRedirect />} />
        <Route path="/flow/:id/*" element={<LegacyContactRedirect />} />
        <Route path="/router/:id/*" element={<LegacyContactRedirect />} />

        <Route path="*" element={<NaoEncontrado />} />
      </Route>
    </Routes>
    </>
  );
}
