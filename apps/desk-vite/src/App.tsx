import { useEffect } from 'react';
import { Route, Routes } from 'react-router-dom';
import { ClosureNotice } from '@pipe/ui';
import { RequireSession } from './components/exigir-session';
import { Shell } from './components/shell';
import { useRegisterNavigation } from './lib/navigation';
import { useLiveEvents } from './lib/live-events';
import { useSession } from './context/session';
import { tenantLoginUrl } from './lib/tenant-login';
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
 * Desk routes mirror the reference (`~/desk-clone/README.md`, "Telas replicadas"): `/` attendance, `/chat` the open conversation, `/activeMessage/send`, `/analytics`, `/contacts`, `/bulk-ticket`, and `/preferences`. `/chat/:id` puts the conversation ID in the URL so it survives F5. Only `/entrar` and `/convite/:token` are public; `ExigirSessao` guards everything else.
 */
export function App() {
  useRegisterNavigation();
  useLiveEvents(Boolean(useSession().eu));
  return (
    <>
    <ClosureNotice />
    <Routes>
      <Route path="/login" element={<TenantLoginOrLocal><PageLogin /></TenantLoginOrLocal>} />
      <Route path="/invite/:token" element={<TenantLoginOrLocal><PageInvitation /></TenantLoginOrLocal>} />

      <Route element={<RequireSession />}>
        <Route element={<Shell />}>
          <Route path="/" element={<PageAttendances />} />
          <Route path="/contacts" element={<PageContacts />} />
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

function TenantLoginOrLocal({ children }: { children: React.ReactNode }) {
  const loginUrl = tenantLoginUrl(window.location, import.meta.env.DEV);
  useEffect(() => {
    if (loginUrl) window.location.replace(loginUrl);
  }, [loginUrl]);
  return loginUrl ? null : children;
}
