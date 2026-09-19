import { Navigate, Route, Routes } from 'react-router-dom';
import { ExigirSessao } from './componentes/exigir-sessao';
import { useRegistrarNavegacao } from './lib/navegacao';
import { PaginaEntrar } from './paginas/entrar';
import { NaoEncontrado } from './paginas/nao-encontrado';
import { PaginaPortal } from './paginas/portal';
import { RotaDoContato } from './paginas/fluxo/contato';
import { HomeDoContato } from './paginas/fluxo/home';
import { PaginaDeCanais } from './paginas/fluxo/canais/canais';
import { PaginaDeServicos } from './paginas/fluxo/servicos/servicos';
import { CascaDeContatos } from './paginas/fluxo/contatos/casca';
import { ListaContatosDoBot } from './paginas/fluxo/contatos/lista';
import { DetalheContatoDoBot } from './paginas/fluxo/contatos/detalhe/detalhe';
import { CascaDeIntegracoes } from './paginas/fluxo/integracoes/casca';
import { PaginaIntegracoes } from './paginas/fluxo/integracoes/integracoes';
import { PaginaWebhook } from './paginas/fluxo/integracoes/webhook/webhook';
import { PaginaLog } from './paginas/fluxo/log/log';
import { CascaDeGrowth } from './paginas/fluxo/growth/casca';
import { PaginaMensagensAtivas } from './paginas/fluxo/growth/mensagens-ativas/mensagens-ativas';
import PaginaClickTracker from './paginas/fluxo/growth/clicktracker/clicktracker';
import PaginaAnuncios from './paginas/fluxo/growth/anuncios/anuncios';
import PaginaRelatorioDePagamentos from './paginas/fluxo/growth/pagamentos/pagamentos';
import { CascaDeConfiguracoes } from './paginas/fluxo/configuracoes/casca';
import { PaginaDeConfiguracoesBasicas } from './paginas/fluxo/configuracoes/basicas/basicas';
import { PaginaApiDoBot } from './paginas/fluxo/configuracoes/api/api';
import { PaginaChavesDoBot } from './paginas/fluxo/configuracoes/keys/keys';
import { PaginaDeBoasVindas } from './paginas/fluxo/configuracoes/boasvindas/boasvindas';
import { PaginaDeMenuPersistente } from './paginas/fluxo/configuracoes/menu-persistente/menu-persistente';
import { PaginaDeEquipe } from './paginas/fluxo/equipe/equipe';
import { PaginaConteudos } from './paginas/fluxo/conteudos/conteudos';
import { CascaDaAnalise } from './paginas/fluxo/analise/casca';
import { ABA_PADRAO } from './paginas/fluxo/analise/abas';
import { PaginaDoDashboard } from './paginas/fluxo/analise/dashboard/dashboard';
import { PaginaDaVisaoGeral } from './paginas/fluxo/analise/visao-geral/pagina';
import { PaginaDaJornada } from './paginas/fluxo/analise/jornada/pagina';
import { PaginaDosRelatorios } from './paginas/fluxo/analise/relatorios/pagina';
import { PaginaDeMensagensAtivas as AnaliseMensagensAtivas } from './paginas/fluxo/analise/mensagens-ativas/pagina';
import { PaginaDoGerenciador } from './paginas/fluxo/analise/gerenciador-de-relatorios/gerenciador';
import { PaginaDoDicionario } from './paginas/fluxo/analise/dicionario-de-dados/dicionario';
import { CascaDeAtendimento } from './paginas/operacao/casca';
import { PaginaMonitoramento } from './paginas/operacao/monitoramento';
import { PaginaHistorico } from './paginas/operacao/historico';
import { PaginaAtendimento } from './paginas/operacao/relatorios-atendimento';
import { PaginaEsforco } from './paginas/operacao/relatorios-esforco';
import { PaginaSatisfacao } from './paginas/operacao/relatorios-satisfacao';
import { PaginaMonitoria } from './paginas/operacao/monitoria';
import { PaginaFichaDeAvaliacao } from './paginas/operacao/monitoria-ficha';
import { PaginaRegrasDeAtendimento } from './paginas/cadastros/regras-atendimento';
import { PaginaHorarios } from './paginas/cadastros/regras-horarios';
import { PaginaGestaoDeAtendentes } from './paginas/cadastros/atendentes-gestao';
import { PaginaFilas } from './paginas/cadastros/atendentes-filas';
import { PaginaPausas } from './paginas/cadastros/atendentes-pausas';
import { PaginaModelos } from './paginas/cadastros/comunicacao-modelos';
import { PaginaRespostasProntas } from './paginas/cadastros/comunicacao-respostas';
import { PaginaRegras } from './paginas/cadastros/configuracoes-regras';
import { PaginaRegrasDeSla } from './paginas/cadastros/regras-sla';
import { PaginaDados } from './paginas/cadastros/configuracoes-dados';
import { PaginaConfiguracoesGerais } from './paginas/cadastros/configuracoes-gerais';
import { PaginaCanais } from './paginas/cadastros/canais';
import { CascaCanalWhatsapp } from './paginas/cadastros/canal-whatsapp/casca';
import { AbaVisaoGeral } from './paginas/cadastros/canal-whatsapp/visao-geral';
import { AbaPerfil } from './paginas/cadastros/canal-whatsapp/perfil';
import { AbaConfiguracoes } from './paginas/cadastros/canal-whatsapp/configuracoes';
import { AbaAlerta } from './paginas/cadastros/canal-whatsapp/alerta';
import { PaginaDoContrato } from './paginas/contrato/page';
import { PaginaDeCertificados } from './paginas/contrato/certificados/page';
import { PaginaDeMembros } from './paginas/contrato/membros/page';
import { PaginaMinhaConta } from './paginas/minha-conta/page';
import { PaginaImplantacao } from './paginas/implantacao/page';
import { PaginaCriarFluxo } from './paginas/criar/fluxo/page';
import { PaginaCriarRoteador } from './paginas/criar/roteador/page';
import { PaginaBemVindo } from './paginas/bem-vindo/page';
import { PaginaNovidades } from './paginas/novidades/page';
import { PaginaConvite } from './paginas/convite/page';
import { PaginaSemAcesso } from './paginas/trocar-conta/sem-acesso/page';
import { PaginaBuilder } from './paginas/builder';

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
const rotasDoContato = (
  <>
    <Route index element={<HomeDoContato />} />
    <Route path="canais" element={<PaginaDeCanais />} />
    <Route path="servicos" element={<PaginaDeServicos />} />

    {/* O módulo Atendimento — a `attendance/desk/*` da origem, dentro do
        MESMO contato: barra do portal + barra do contato (item "Atendimento"
        aceso) + a `desk-sidebar` própria, montada em `operacao/casca.tsx`.
        Estas telas viviam soltas em `/monitoramento`, `/historico` etc. e
        desenhavam um segundo portal — ver o mapa completo no relatório da
        tarefa que fez a mudança. */}
    <Route path="atendimento" element={<CascaDeAtendimento />}>
      <Route index element={<Navigate to="monitoramento" replace />} />
      <Route path="monitoramento" element={<PaginaMonitoramento />} />
      <Route path="historico" element={<PaginaHistorico />} />
      <Route path="monitoria" element={<PaginaMonitoria />} />
      <Route path="monitoria/:id" element={<PaginaFichaDeAvaliacao />} />
      <Route path="relatorios/atendimento" element={<PaginaAtendimento />} />
      <Route path="relatorios/esforco" element={<PaginaEsforco />} />
      <Route path="relatorios/satisfacao" element={<PaginaSatisfacao />} />
      <Route path="atendentes/gestao" element={<PaginaGestaoDeAtendentes />} />
      <Route path="atendentes/filas" element={<PaginaFilas />} />
      <Route path="atendentes/pausas" element={<PaginaPausas />} />
      <Route path="comunicacao/modelos" element={<PaginaModelos />} />
      <Route path="comunicacao/respostas-prontas" element={<PaginaRespostasProntas />} />
      <Route path="regras/atendimento" element={<PaginaRegrasDeAtendimento />} />
      <Route path="regras/sla" element={<PaginaRegrasDeSla />} />
      <Route path="regras/horarios" element={<PaginaHorarios />} />
      <Route path="preferencias/gerais" element={<PaginaConfiguracoesGerais />} />
      <Route path="preferencias/dados" element={<PaginaDados />} />
      <Route path="preferencias/regras" element={<PaginaRegras />} />
      <Route path="canais" element={<PaginaCanais />} />
      <Route path="canais/whatsapp/:canalId" element={<CascaCanalWhatsapp />}>
        <Route index element={<AbaVisaoGeral />} />
        <Route path="perfil" element={<AbaPerfil />} />
        <Route path="configuracoes" element={<AbaConfiguracoes />} />
        <Route path="alerta" element={<AbaAlerta />} />
      </Route>
    </Route>

    <Route path="contatos" element={<CascaDeContatos />}>
      <Route index element={<ListaContatosDoBot />} />
      <Route path=":contatoId" element={<DetalheContatoDoBot />} />
    </Route>

    <Route path="integracoes" element={<CascaDeIntegracoes />}>
      <Route index element={<PaginaIntegracoes />} />
      <Route path="webhook" element={<PaginaWebhook />} />
    </Route>

    <Route path="log" element={<PaginaLog />} />

    <Route path="growth" element={<CascaDeGrowth />}>
      <Route index element={<Navigate to="mensagens-ativas" replace />} />
      <Route path="mensagens-ativas" element={<PaginaMensagensAtivas />} />
      <Route path="clicktracker" element={<PaginaClickTracker />} />
      <Route path="anuncios" element={<PaginaAnuncios />} />
      <Route path="pagamentos" element={<PaginaRelatorioDePagamentos />} />
    </Route>

    <Route path="configuracoes" element={<CascaDeConfiguracoes />}>
      <Route index element={<Navigate to="basicas" replace />} />
      <Route path="basicas" element={<PaginaDeConfiguracoesBasicas />} />
      <Route path="boasvindas" element={<PaginaDeBoasVindas />} />
      <Route path="menu-persistente" element={<PaginaDeMenuPersistente />} />
      <Route path="api" element={<PaginaApiDoBot />} />
      <Route path="keys" element={<PaginaChavesDoBot />} />
    </Route>

    <Route path="equipe" element={<PaginaDeEquipe />} />

    <Route path="conteudos" element={<PaginaConteudos />} />

    <Route path="analise" element={<CascaDaAnalise />}>
      <Route index element={<Navigate to={ABA_PADRAO} replace />} />
      <Route path="dashboard" element={<PaginaDoDashboard />} />
      <Route path="visao-geral" element={<PaginaDaVisaoGeral />} />
      <Route path="jornada" element={<PaginaDaJornada />} />
      <Route path="relatorios" element={<PaginaDosRelatorios />} />
      <Route path="mensagens-ativas" element={<AnaliseMensagensAtivas />} />
      <Route path="gerenciador-de-relatorios" element={<PaginaDoGerenciador />} />
      <Route path="dicionario-de-dados" element={<PaginaDoDicionario />} />
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
  useRegistrarNavegacao();
  return (
    <Routes>
      <Route path="/entrar" element={<PaginaEntrar />} />
      <Route path="/convite/:token" element={<PaginaConvite />} />

      <Route element={<ExigirSessao />}>
        <Route path="/" element={<Navigate to="/portal" replace />} />
        <Route path="/portal" element={<PaginaPortal />} />
        <Route path="/novidades" element={<PaginaNovidades />} />
        <Route path="/contrato" element={<PaginaDoContrato />} />
        <Route path="/contrato/certificados" element={<PaginaDeCertificados />} />
        <Route path="/contrato/membros" element={<PaginaDeMembros />} />
        <Route path="/minha-conta" element={<PaginaMinhaConta />} />
        <Route path="/bem-vindo" element={<PaginaBemVindo />} />
        <Route path="/trocar-conta/sem-acesso" element={<PaginaSemAcesso />} />
        <Route path="/criar/fluxo" element={<PaginaCriarFluxo />} />
        <Route path="/criar/roteador" element={<PaginaCriarRoteador />} />

        {/* Implantação — onboarding de CONTA, sem contato nenhum para
            pendurar. Cromo próprio (`pt-app` + `BarraDoPortal`, como
            "Novidades" e o Painel do contrato), montado dentro da própria
            `page.tsx`. Builder e Growth, os outros dois módulos que
            `EstruturaGestao` desenhava fora do contato, se mudaram para
            dentro dele (abaixo); sem os dois, aquele casco de duas barras
            ficou sem rota nenhuma e saiu. */}
        <Route path="/implantacao" element={<PaginaImplantacao />} />

        {/* As rotas de antes de morarem no contato (Atendimento em
            `/{tipo}/:id/atendimento/*`, Builder em `/fluxo/:id/builder`,
            Growth em `/{tipo}/:id/growth/*`, todas abaixo). Nenhuma carrega um
            id de contato — não há como adivinhar de qual fluxo ou roteador era
            o link salvo — então a única saída honesta é o portal, de onde a
            pessoa escolhe o contato e chega lá de novo. */}
        {ROTAS_ANTIGAS_SEM_CONTATO.map((caminho) => (
          <Route key={caminho} path={caminho} element={<Navigate to="/portal" replace />} />
        ))}

        <Route path="/fluxo/:id" element={<RotaDoContato />}>
          {rotasDoContato}
          {/* Builder é escondido do menu do roteador (`ESCONDIDOS_NO_ROTEADOR`
              em `fluxo/itens.ts`, a mesma regra da origem) — por isso a rota
              só existe aqui, e não na árvore de `/roteador/:id` logo abaixo. */}
          <Route path="builder" element={<PaginaBuilder />} />
        </Route>
        <Route path="/roteador/:id" element={<RotaDoContato />}>
          {rotasDoContato}
        </Route>

        <Route path="*" element={<NaoEncontrado />} />
      </Route>
    </Routes>
  );
}
