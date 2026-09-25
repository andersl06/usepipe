import { Route, Routes } from 'react-router-dom';
import { ClosureNotice } from '@pipe/ui';
import { ExigirSession } from './components/exigir-session';
import { Shell } from './components/shell';
import { useRegistrarNavigation } from './lib/navigation';
import { PageLogin } from './pages/login';
import { PageInvitation } from './pages/invitation';
import { PageAttendances } from './pages/attendances/page';
import { PageContacts } from './pages/contacts/page';
import { PageMetrics } from './pages/analytics/page';
import { PageActiveMessage } from './pages/active-message/page';
import { PageBulkActions } from './pages/bulk-actions/page';
import { PagePreferences } from './pages/preferences/page';
import { NaoEncontrado } from './pages/nao-encontrado';

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
      <Route path="/login" element={<PageLogin />} />
      <Route path="/invite/:token" element={<PageInvitation />} />

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
