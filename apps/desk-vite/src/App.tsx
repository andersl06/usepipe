import { Route, Routes } from 'react-router-dom';
import { AvisoEncerramento } from '@pipe/ui';
import { ExigirSessao } from './componentes/exigir-sessao';
import { Casca } from './componentes/casca';
import { useRegistrarNavegacao } from './lib/navegacao';
import { PaginaEntrar } from './paginas/entrar';
import { PaginaConvite } from './paginas/convite';
import { PaginaAtendimentos } from './paginas/atendimentos/page';
import { PaginaContatos } from './paginas/contatos/page';
import { PaginaMetricas } from './paginas/analytics/page';
import { PaginaMensagemAtiva } from './paginas/mensagem-ativa/page';
import { PaginaAcoesEmMassa } from './paginas/acoes-em-massa/page';
import { PaginaPreferencias } from './paginas/preferencias/page';
import { NaoEncontrado } from './paginas/nao-encontrado';

/**
 * As rotas do Desk — os MESMOS caminhos da referência (`~/desk-clone/README.md`,
 * "Telas replicadas"): `/` Atendimentos, `/chat` a conversa aberta,
 * `/activeMessage/send`, `/analytics`, `/contacts`, `/bulk-ticket`,
 * `/preferences`. `/chat/:id` leva o id para a conversa sobreviver ao F5.
 *
 * Só `/entrar` e `/convite/:token` são públicas. O resto fica atrás de
 * `ExigirSessao`.
 */
export function App() {
  useRegistrarNavegacao();
  return (
    <>
    <AvisoEncerramento />
    <Routes>
      <Route path="/entrar" element={<PaginaEntrar />} />
      <Route path="/convite/:token" element={<PaginaConvite />} />

      <Route element={<ExigirSessao />}>
        <Route element={<Casca />}>
          <Route path="/" element={<PaginaAtendimentos />} />
          <Route path="/chat" element={<PaginaAtendimentos />} />
          <Route path="/chat/:id" element={<PaginaAtendimentos />} />
          <Route path="/contacts" element={<PaginaContatos />} />
          <Route path="/contacts/:id" element={<PaginaContatos />} />
          <Route path="/analytics" element={<PaginaMetricas />} />
          <Route path="/activeMessage/send" element={<PaginaMensagemAtiva />} />
          <Route path="/bulk-ticket" element={<PaginaAcoesEmMassa />} />
          <Route path="/preferences" element={<PaginaPreferencias />} />
          <Route path="*" element={<NaoEncontrado />} />
        </Route>
      </Route>
    </Routes>
    </>
  );
}
