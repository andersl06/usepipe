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
import { EstruturaGestao } from './componentes/estrutura-gestao';
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
import { PaginaDados } from './paginas/cadastros/configuracoes-dados';
import { PaginaConfiguracoesGerais } from './paginas/cadastros/configuracoes-gerais';
import { PaginaCanais } from './paginas/cadastros/canais';
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
import { PaginaGrowth } from './paginas/growth-portal';
import { PaginaBuilder } from './paginas/builder';

/**
 * As rotas da Gestão — as mesmas URLs do aplicativo em Next, para link salvo
 * e histórico continuarem valendo. A árvore segue a da origem: o contato
 * (`/fluxo/:id`) é o estado-pai, e cada módulo pendura nele.
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

        {/* A operação: as telas com o casco de duas barras + lateral (`EstruturaGestao`). */}
        <Route element={<EstruturaGestao />}>
          <Route path="/monitoramento" element={<PaginaMonitoramento />} />
          <Route path="/historico" element={<PaginaHistorico />} />
          <Route path="/relatorios/atendimento" element={<PaginaAtendimento />} />
          <Route path="/relatorios/esforco" element={<PaginaEsforco />} />
          <Route path="/relatorios/satisfacao" element={<PaginaSatisfacao />} />
          <Route path="/monitoria" element={<PaginaMonitoria />} />
          <Route path="/monitoria/:id" element={<PaginaFichaDeAvaliacao />} />
          <Route path="/regras/atendimento" element={<PaginaRegrasDeAtendimento />} />
          <Route path="/regras/horarios" element={<PaginaHorarios />} />
          <Route path="/atendentes/gestao" element={<PaginaGestaoDeAtendentes />} />
          <Route path="/atendentes/filas" element={<PaginaFilas />} />
          <Route path="/atendentes/pausas" element={<PaginaPausas />} />
          <Route path="/comunicacao/modelos" element={<PaginaModelos />} />
          <Route path="/comunicacao/respostas-prontas" element={<PaginaRespostasProntas />} />
          <Route path="/configuracoes" element={<Navigate to="/configuracoes/regras" replace />} />
          <Route path="/configuracoes/regras" element={<PaginaRegras />} />
          <Route path="/configuracoes/dados" element={<PaginaDados />} />
          <Route path="/configuracoes/gerais" element={<PaginaConfiguracoesGerais />} />
          <Route path="/implantacao" element={<PaginaImplantacao />} />
          <Route path="/canais" element={<PaginaCanais />} />
          <Route path="/growth" element={<PaginaGrowth />} />
          <Route path="/builder" element={<PaginaBuilder />} />
        </Route>

        <Route path="/fluxo/:id" element={<RotaDoContato />}>
          <Route index element={<HomeDoContato />} />
          <Route path="canais" element={<PaginaDeCanais />} />
          <Route path="servicos" element={<PaginaDeServicos />} />

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
            <Route index element={<Navigate to="api" replace />} />
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
        </Route>

        <Route path="*" element={<NaoEncontrado />} />
      </Route>
    </Routes>
  );
}
