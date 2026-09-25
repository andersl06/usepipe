import { Route, Routes } from 'react-router-dom';
import { ClosureNotice } from '@pipe/ui';
import { ExigirSession } from './componentes/exigir-sessao';
import { Shell } from './componentes/casca';
import { useRegistrarNavigation } from './lib/navegacao';
import { PageLogin } from './paginas/entrar';
import { PageInvitation } from './paginas/convite';
import { PageAttendances } from './paginas/atendimentos/page';
import { PageContacts } from './paginas/contatos/page';
import { PageMetrics } from './paginas/analytics/page';
import { PageActiveMessage } from './paginas/mensagem-ativa/page';
import { PageBulkActions } from './paginas/acoes-em-massa/page';
import { PagePreferences } from './paginas/preferencias/page';
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
  useRegistrarNavigation();
  return (
    <>
    <ClosureNotice />
    <Routes>
      <Route path="/entrar" element={<PageLogin />} />
      <Route path="/convite/:token" element={<PageInvitation />} />

      <Route element={<ExigirSession />}>
        <Route element={<Shell />}>
          <Route path="/" element={<PageAttendances />} />
          <Route path="/chat" element={<PageAttendances />} />
          <Route path="/chat/:id" element={<PageAttendances />} />
          <Route path="/contacts" element={<PageContacts />} />
          <Route path="/contacts/:id" element={<PageContacts />} />
          <Route path="/analytics" element={<PageMetrics />} />
          <Route path="/activeMessage/send" element={<PageActiveMessage />} />
          <Route path="/bulk-ticket" element={<PageBulkActions />} />
          <Route path="/preferences" element={<PagePreferences />} />
          <Route path="*" element={<NaoEncontrado />} />
        </Route>
      </Route>
    </Routes>
    </>
  );
}
