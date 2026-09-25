import { Navigate, Route, Routes } from 'react-router-dom';
import { ClosureNotice } from '@pipe/ui';
import { ExigirSession } from './componentes/exigir-sessao';
import { useRegistrarNavigation } from './lib/navegacao';
import { PageLogin } from './paginas/entrar';
import { NaoEncontrado } from './paginas/nao-encontrado';
import { PagePortal } from './paginas/portal';
import { ContactRota, contactBase, useContact } from './paginas/fluxo/contato';
import { ContactHome } from './paginas/fluxo/home';
import { ChannelsPage } from './paginas/fluxo/canais/canais';
import { ServicesPage } from './paginas/fluxo/servicos/servicos';
import { ContactsShell } from './paginas/fluxo/contatos/casca';
import { BotListaContacts } from './paginas/fluxo/contatos/lista';
import { BotDetalheContact } from './paginas/fluxo/contatos/detalhe/detalhe';
import { IntegrationsShell } from './paginas/fluxo/integracoes/casca';
import { PageIntegrations } from './paginas/fluxo/integracoes/integracoes';
import { PageWebhook } from './paginas/fluxo/integracoes/webhook/webhook';
import { PageLog } from './paginas/fluxo/log/log';
import { GrowthShell } from './paginas/fluxo/growth/casca';
import { PageActiveMessages } from './paginas/fluxo/growth/mensagens-ativas/mensagens-ativas';
import PageClickTracker from './paginas/fluxo/growth/clicktracker/clicktracker';
import PageAds from './paginas/fluxo/growth/anuncios/anuncios';
import PaymentsPageReport from './paginas/fluxo/growth/pagamentos/pagamentos';
import PageTrackedLinks from './paginas/fluxo/growth/links-rastreados/links-rastreados';
import { SettingsShell } from './paginas/fluxo/configuracoes/casca';
import { SettingsBasicPage } from './paginas/fluxo/configuracoes/basicas/basicas';
import { BotPageApi } from './paginas/fluxo/configuracoes/api/api';
import { BotPageKeys } from './paginas/fluxo/configuracoes/keys/keys';
import { WelcomePage } from './paginas/fluxo/configuracoes/boasvindas/boasvindas';
import { PersistentMenuPage } from './paginas/fluxo/configuracoes/menu-persistente/menu-persistente';
import { TeamPage } from './paginas/fluxo/equipe/equipe';
import { EditMemberPage } from './paginas/fluxo/equipe/editar';
import { PageContents } from './paginas/fluxo/conteudos/conteudos';
import { AnalyticsShell } from './paginas/fluxo/analise/casca';
import { ABA_PADRAO } from './paginas/fluxo/analise/abas';
import { DashboardPage } from './paginas/fluxo/analise/dashboard/dashboard';
import { OverviewPage } from './paginas/fluxo/analise/visao-geral/pagina';
import { JourneyPage } from './paginas/fluxo/analise/jornada/pagina';
import { ReportsPage } from './paginas/fluxo/analise/relatorios/pagina';
import { ActiveMessagesPage as AnaliseMensagensAtivas } from './paginas/fluxo/analise/mensagens-ativas/pagina';
import { ManagerPage } from './paginas/fluxo/analise/gerenciador-de-relatorios/gerenciador';
import { DictionaryPage } from './paginas/fluxo/analise/dicionario-de-dados/dicionario';
import { AttendanceShell } from './paginas/operacao/casca';
import { PageMonitoring } from './paginas/operacao/monitoramento';
import { PageHistory } from './paginas/operacao/historico';
import { PageAttendance } from './paginas/operacao/relatorios-atendimento';
import { PageEffort } from './paginas/operacao/relatorios-esforco';
import { PageSatisfaction } from './paginas/operacao/relatorios-satisfacao';
import { PageQualityReview } from './paginas/operacao/monitoria';
import { EvaluationPageFicha } from './paginas/operacao/monitoria-ficha';
import { AttendancePageRules } from './paginas/cadastros/regras-atendimento';
import { PageHours } from './paginas/cadastros/regras-horarios';
import { AgentsPageManagement } from './paginas/cadastros/atendentes-gestao';
import { AgentPageEdit } from './paginas/cadastros/atendentes-edicao';
import { AgentPagePermissions } from './paginas/cadastros/atendentes-permissoes';
import { PageQueues } from './paginas/cadastros/atendentes-filas';
import { QueuePageEdit } from './paginas/cadastros/atendentes-filas-edicao';
import { PageBreaks } from './paginas/cadastros/atendentes-pausas';
import { PageTemplates } from './paginas/cadastros/comunicacao-modelos';
import { PageCannedResponses } from './paginas/cadastros/comunicacao-respostas';
import { PageRules } from './paginas/cadastros/configuracoes-regras';
import { SlaPageRules } from './paginas/cadastros/regras-sla';
import { PageData } from './paginas/cadastros/configuracoes-dados';
import { PageSettingsGeneral } from './paginas/cadastros/configuracoes-gerais';
import { PageChannels } from './paginas/cadastros/canais';
import { ShellChannelWhatsapp } from './paginas/fluxo/canais/whatsapp/casca';
import { AbaVisaoGeral } from './paginas/fluxo/canais/whatsapp/visao-geral';
import { AbaPerfil } from './paginas/fluxo/canais/whatsapp/perfil';
import { AbaSettings } from './paginas/fluxo/canais/whatsapp/configuracoes';
import { AbaAlerta } from './paginas/fluxo/canais/whatsapp/alerta';
import { PageChannelInstagram } from './paginas/fluxo/canais/instagram/pagina';
import { PageChannelMessenger } from './paginas/fluxo/canais/messenger/pagina';
import { ContractPage } from './paginas/contrato/page';
import { CertificatesPage } from './paginas/contrato/certificados/page';
import { MembersPage } from './paginas/contrato/membros/page';
import { PageMyAccount } from './paginas/minha-conta/page';
import { PageDeployment } from './paginas/implantacao/page';
import { PageCreateFlow } from './paginas/criar/fluxo/page';
import { PageCreateRouter } from './paginas/criar/roteador/page';
import { PageWelcome } from './paginas/bem-vindo/page';
import { PageUpdates } from './paginas/novidades/page';
import { PageInvitation } from './paginas/convite/page';
import { PageNoAccess } from './paginas/trocar-conta/sem-acesso/page';
import { PageBuilder } from './paginas/builder';

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
      <Route path="/entrar" element={<PageLogin />} />
      <Route path="/convite/:token" element={<PageInvitation />} />

      <Route element={<ExigirSession />}>
        <Route path="/" element={<Navigate to="/portal" replace />} />
        <Route path="/portal" element={<PagePortal />} />
        <Route path="/novidades" element={<PageUpdates />} />
        <Route path="/contrato" element={<ContractPage />} />
        <Route path="/contrato/certificados" element={<CertificatesPage />} />
        <Route path="/contrato/membros" element={<MembersPage />} />
        <Route path="/minha-conta" element={<PageMyAccount />} />
        <Route path="/bem-vindo" element={<PageWelcome />} />
        <Route path="/trocar-conta/sem-acesso" element={<PageNoAccess />} />
        <Route path="/criar/fluxo" element={<PageCreateFlow />} />
        <Route path="/criar/roteador" element={<PageCreateRouter />} />

        {/* Implantação — onboarding de CONTA, sem contato nenhum para
            pendurar. Cromo próprio (`pt-app` + `BarraDoPortal`, como
            "Novidades" e o Painel do contrato), montado dentro da própria
            `page.tsx`. Builder e Growth, os outros dois módulos que
            `EstruturaGestao` desenhava fora do contato, se mudaram para
            dentro dele (abaixo); sem os dois, aquele casco de duas barras
            ficou sem rota nenhuma e saiu. */}
        <Route path="/implantacao" element={<PageDeployment />} />

        {/* As rotas de antes de morarem no contato (Atendimento em
            `/{tipo}/:id/atendimento/*`, Builder em `/fluxo/:id/builder`,
            Growth em `/{tipo}/:id/growth/*`, todas abaixo). Nenhuma carrega um
            id de contato — não há como adivinhar de qual fluxo ou roteador era
            o link salvo — então a única saída honesta é o portal, de onde a
            pessoa escolhe o contato e chega lá de novo. */}
        {ROTAS_ANTIGAS_SEM_CONTATO.map((caminho) => (
          <Route key={caminho} path={caminho} element={<Navigate to="/portal" replace />} />
        ))}

        <Route path="/fluxo/:id" element={<ContactRota />}>
          {contactRotas}
          {/* Builder é escondido do menu do roteador (`ESCONDIDOS_NO_ROTEADOR`
              em `fluxo/itens.ts`, a mesma regra da origem) — por isso a rota
              só existe aqui, e não na árvore de `/roteador/:id` logo abaixo. */}
          <Route path="builder" element={<PageBuilder />} />
        </Route>
        <Route path="/roteador/:id" element={<ContactRota />}>
          {contactRotas}
        </Route>

        <Route path="*" element={<NaoEncontrado />} />
      </Route>
    </Routes>
    </>
  );
}
