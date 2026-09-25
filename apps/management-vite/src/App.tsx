import { Navigate, Route, Routes } from 'react-router-dom';
import { ClosureNotice } from '@pipe/ui';
import { ExigirSession } from './components/exigir-session';
import { useRegistrarNavigation } from './lib/navigation';
import { PageLogin } from './pages/login';
import { NaoEncontrado } from './pages/nao-encontrado';
import { PagePortal } from './pages/portal';
import { ContactRota, contactBase, useContact } from './pages/flow/contact';
import { ContactHome } from './pages/flow/home';
import { ChannelsPage } from './pages/flow/channels/channels';
import { ServicesPage } from './pages/flow/services/servicos';
import { ContactsShell } from './pages/flow/contacts/shell';
import { BotListaContacts } from './pages/flow/contacts/lista';
import { BotDetalheContact } from './pages/flow/contacts/detalhe/detalhe';
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
import { EvaluationPageFicha } from './pages/operation/quality-review-ficha';
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
import { AbaSettings } from './pages/flow/channels/whatsapp/settings';
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

/** O redirecionamento do link antigo do canal WhatsApp para a página do canal DO BOT. */
function ParaOCanalDoBot() {
  const { contact } = useContact();
  return <Navigate to={`${contactBase(contact.tipo, contact.id)}/canais/whatsapp`} replace />;
}

/**
 * As rotas-filhas do contato — o que `/fluxo/:id` e `/roteador/:id` desenham
 * embaixo do estado-pai (`RotaDoContato`).
 *
 * `/fluxo/:id/*` era, até aqui, TODA a árvore capturada de um roteador
 * (`auvpsegurosrouter`, `pipeprincipal`) — telas de roteador, moradas no
 * prefixo errado. Elas se mudaram para `/roteador/:id/*`; `/fluxo/:id/*`
 * continua de pé, apontando para as MESMAS telas, até o dia em que alguém
 * desenhar o que um FLUXO (chatbot) realmente mostra aqui. `RotaDoContato`
 * redireciona quem entra pelo prefixo que não bate com o tipo do contato —
 * por isso é seguro as duas rotas comparilharem esta mesma árvore agora.
 */
const contactRotas = (
  <>
    <Route index element={<ContactHome />} />
    <Route path="canais" element={<ChannelsPage />} />
    {/* Cada canal tem a própria página DENTRO do bot, como
        `application/detail/{bot}/channels/{canal}` da origem
        (`referencias-blip/fichas/FICHA-conectar-canal-no-bot.md` §1). As
        abas do WhatsApp moravam em `atendimento/canais/whatsapp/:canalId`, no
        módulo errado; o canal agora é o do bot, sem id na URL. */}
    <Route path="canais/whatsapp" element={<ShellChannelWhatsapp />}>
      <Route index element={<AbaVisaoGeral />} />
      <Route path="perfil" element={<AbaPerfil />} />
      <Route path="configuracoes" element={<AbaSettings />} />
      <Route path="alerta" element={<AbaAlerta />} />
    </Route>
    <Route path="canais/instagram" element={<PageChannelInstagram />} />
    <Route path="canais/messenger" element={<PageChannelMessenger />} />
    <Route path="servicos" element={<ServicesPage />} />

    {/* O módulo Atendimento — a `attendance/desk/*` da origem, dentro do
        MESMO contato: barra do portal + barra do contato (item "Atendimento"
        aceso) + a `desk-sidebar` própria, montada em `operacao/casca.tsx`.
        Estas telas viviam soltas em `/monitoramento`, `/historico` etc. e
        desenhavam um segundo portal — ver o mapa completo no relatório da
        tarefa que fez a mudança. */}
    <Route path="atendimento" element={<AttendanceShell />}>
      <Route index element={<Navigate to="monitoramento" replace />} />
      <Route path="monitoramento" element={<PageMonitoring />} />
      <Route path="historico" element={<PageHistory />} />
      <Route path="monitoria" element={<PageQualityReview />} />
      <Route path="monitoria/:id" element={<EvaluationPageFicha />} />
      <Route path="relatorios/atendimento" element={<PageAttendance />} />
      <Route path="relatorios/esforco" element={<PageEffort />} />
      <Route path="relatorios/satisfacao" element={<PageSatisfaction />} />
      <Route path="atendentes/gestao" element={<AgentsPageManagement />} />
      {/* `/team/create` e `/team/edit` da origem — sem `:id`, a seleção viaja
          em `?atendentes=` porque a edição é em lote (§a.1/§a.4 da ficha). */}
      <Route path="atendentes/gestao/adicionar" element={<AgentPageEdit modo="adicionar" />} />
      <Route path="atendentes/gestao/editar" element={<AgentPageEdit modo="editar" />} />
      {/* `/team/permission` da origem. */}
      <Route path="atendentes/gestao/permissoes" element={<AgentPagePermissions />} />
      <Route path="atendentes/filas" element={<PageQueues />} />
      {/* `/queue-management/edit/:id` da origem — página própria, não modal. */}
      <Route path="atendentes/filas/:filaId/editar" element={<QueuePageEdit />} />
      <Route path="atendentes/pausas" element={<PageBreaks />} />
      <Route path="comunicacao/modelos" element={<PageTemplates />} />
      <Route path="comunicacao/respostas-prontas" element={<PageCannedResponses />} />
      <Route path="regras/atendimento" element={<AttendancePageRules />} />
      <Route path="regras/sla" element={<SlaPageRules />} />
      <Route path="regras/horarios" element={<PageHours />} />
      <Route path="preferencias/gerais" element={<PageSettingsGeneral />} />
      <Route path="preferencias/dados" element={<PageData />} />
      <Route path="preferencias/regras" element={<PageRules />} />
      <Route path="canais" element={<PageChannels />} />
      {/* O link antigo das abas do WhatsApp (`atendimento/canais/whatsapp/:canalId`)
          cai na página do canal do bot — o canal agora é o do bot, não o da URL. */}
      <Route path="canais/whatsapp/:canalId/*" element={<ParaOCanalDoBot />} />
    </Route>

    <Route path="contatos" element={<ContactsShell />}>
      <Route index element={<BotListaContacts />} />
      <Route path=":contatoId" element={<BotDetalheContact />} />
    </Route>

    <Route path="integracoes" element={<IntegrationsShell />}>
      <Route index element={<PageIntegrations />} />
      <Route path="webhook" element={<PageWebhook />} />
    </Route>

    <Route path="log" element={<PageLog />} />

    <Route path="growth" element={<GrowthShell />}>
      <Route index element={<Navigate to="mensagens-ativas" replace />} />
      <Route path="mensagens-ativas" element={<PageActiveMessages />} />
      <Route path="clicktracker" element={<PageClickTracker />} />
      <Route path="anuncios" element={<PageAds />} />
      <Route path="pagamentos" element={<PaymentsPageReport />} />
      <Route path="links-rastreados" element={<PageTrackedLinks />} />
    </Route>

    <Route path="configuracoes" element={<SettingsShell />}>
      <Route index element={<Navigate to="basicas" replace />} />
      <Route path="basicas" element={<SettingsBasicPage />} />
      <Route path="boasvindas" element={<WelcomePage />} />
      <Route path="menu-persistente" element={<PersistentMenuPage />} />
      <Route path="api" element={<BotPageApi />} />
      <Route path="keys" element={<BotPageKeys />} />
    </Route>

    <Route path="equipe" element={<TeamPage />} />
    <Route path="equipe/editar/:usuarioId" element={<EditMemberPage />} />

    <Route path="conteudos" element={<PageContents />} />

    <Route path="analise" element={<AnalyticsShell />}>
      <Route index element={<Navigate to={ABA_PADRAO} replace />} />
      <Route path="dashboard" element={<DashboardPage />} />
      <Route path="visao-geral" element={<OverviewPage />} />
      <Route path="jornada" element={<JourneyPage />} />
      <Route path="relatorios" element={<ReportsPage />} />
      <Route path="mensagens-ativas" element={<AnaliseMensagensAtivas />} />
      <Route path="gerenciador-de-relatorios" element={<ManagerPage />} />
      <Route path="dicionario-de-dados" element={<DictionaryPage />} />
    </Route>
  </>
);

/**
 * As rotas que viviam soltas na raiz, sem contato, hoje redirecionadas para o
 * portal — ver a nota onde são usadas.
 *
 * A maior parte é o Atendimento de antes de morar no contato. `/builder` e
 * `/growth` entraram nesta entrega: Builder e Growth eram os dois módulos que
 * `estrutura-gestao.tsx` desenhava fora de qualquer contato, e os dois se
 * mudaram para dentro dele — Builder para `/fluxo/:id/builder`, Growth para
 * `/fluxo/:id/growth/*` e `/roteador/:id/growth/*` (que já existiam; `/growth`
 * solto, em `paginas/growth-portal.tsx`, era duplicata e foi removido).
 */
const ROTAS_ANTIGAS_SEM_CONTATO = [
  '/builder',
  '/growth',
  '/monitoramento',
  '/historico',
  '/relatorios/atendimento',
  '/relatorios/esforco',
  '/relatorios/satisfacao',
  '/monitoria',
  '/monitoria/:id',
  '/regras/atendimento',
  '/regras/horarios',
  '/atendentes/gestao',
  '/atendentes/filas',
  '/atendentes/pausas',
  '/comunicacao/modelos',
  '/comunicacao/respostas-prontas',
  '/configuracoes',
  '/configuracoes/regras',
  '/configuracoes/dados',
  '/configuracoes/gerais',
  '/canais',
];

/**
 * As rotas da Gestão — as mesmas URLs do aplicativo em Next, para link salvo
 * e histórico continuarem valendo. A árvore segue a da origem: o contato
 * (`/fluxo/:id` para chatbot, `/roteador/:id` para roteador) é o estado-pai,
 * e cada módulo pendura nele.
 *
 * Só `/entrar` é pública. O resto fica atrás de `ExigirSessao`.
 */
export function App() {
  useRegistrarNavigation();
  return (
    <>
    <ClosureNotice />
    <Routes>
      <Route path="/login" element={<PageLogin />} />
      <Route path="/invite/:token" element={<PageInvitation />} />

      <Route element={<ExigirSession />}>
        <Route path="/" element={<Navigate to="/portal" replace />} />
        <Route path="/portal" element={<PagePortal />} />
        <Route path="/updates" element={<PageUpdates />} />
        <Route path="/contract" element={<ContractPage />} />
        <Route path="/contract/certificates" element={<CertificatesPage />} />
        <Route path="/contract/members" element={<MembersPage />} />
        <Route path="/my-account" element={<PageMyAccount />} />
        <Route path="/bem-vindo" element={<PageWelcome />} />
        <Route path="/switch-account/no-access" element={<PageNoAccess />} />
        <Route path="/create/flow" element={<PageCreateFlow />} />
        <Route path="/create/router" element={<PageCreateRouter />} />

        {/* Implantação — onboarding de CONTA, sem contato nenhum para
            pendurar. Cromo próprio (`pt-app` + `BarraDoPortal`, como
            "Novidades" e o Painel do contrato), montado dentro da própria
            `page.tsx`. Builder e Growth, os outros dois módulos que
            `EstruturaGestao` desenhava fora do contato, se mudaram para
            dentro dele (abaixo); sem os dois, aquele casco de duas barras
            ficou sem rota nenhuma e saiu. */}
        <Route path="/deployment" element={<PageDeployment />} />

        {/* As rotas de antes de morarem no contato (Atendimento em
            `/{tipo}/:id/atendimento/*`, Builder em `/fluxo/:id/builder`,
            Growth em `/{tipo}/:id/growth/*`, todas abaixo). Nenhuma carrega um
            id de contato — não há como adivinhar de qual fluxo ou roteador era
            o link salvo — então a única saída honesta é o portal, de onde a
            pessoa escolhe o contato e chega lá de novo. */}
        {ROTAS_ANTIGAS_SEM_CONTATO.map((caminho) => (
          <Route key={caminho} path={caminho} element={<Navigate to="/portal" replace />} />
        ))}

        <Route path="/flow/:id" element={<ContactRota />}>
          {contactRotas}
          {/* Builder é escondido do menu do roteador (`ESCONDIDOS_NO_ROTEADOR`
              em `fluxo/itens.ts`, a mesma regra da origem) — por isso a rota
              só existe aqui, e não na árvore de `/roteador/:id` logo abaixo. */}
          <Route path="builder" element={<PageBuilder />} />
        </Route>
        <Route path="/router/:id" element={<ContactRota />}>
          {contactRotas}
        </Route>

        <Route path="*" element={<NaoEncontrado />} />
      </Route>
    </Routes>
    </>
  );
}
