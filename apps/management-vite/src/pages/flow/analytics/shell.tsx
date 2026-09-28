import { Outlet } from 'react-router-dom';
import { ContactBars, contactPath, useContact } from '../contact';
import { CLUSTER_DA_CAPTURA, FLAGS_DA_CAPTURA, analyticsTabs } from './abas';
import { AnalyticsView } from './vista';
import './analytics.css';

/**
 * The contact's Analysis — the source's `auth.application.detail.analytics` state,
 * `/application/detail/{shortName}/analytics/*`.
 *
 * The reference is `supernova.blip.ai/portal.js`: the `#analytics-tabs-view`
 * template (module 95760), which the state renders in the contact detail's
 * `tabsNav` view, and the `ra` controller. Each tab is a child state; here, each
 * one is a child route, and this shell is what all eight share: the portal bar,
 * the contact bar with "Análise" lit up, and the tab row.
 *
 * The template's `analytics-redirect-modal` does NOT enter here: it only opens with
 * `isShowAnalyticsSuite`, and that flag is `false` for this contract.
 */
export function AnalyticsShell() {
  const { contact } = useContact();

  return (
    <div className="pt-app">
      <ContactBars ativo="Análise" />

      {/*
 * `#main-content-area.main-detail-content.pa0`: no indent — each tab indents
 * itself, with its own `.container`.
 */}
      <main className="an-miolo">
        <AnalyticsView
          base={`${contactPath(contact)}/analytics`}
          abas={analyticsTabs(FLAGS_DA_CAPTURA, CLUSTER_DA_CAPTURA)}
        >
          <Outlet />
        </AnalyticsView>
      </main>
    </div>
  );
}
