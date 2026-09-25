import { Outlet } from 'react-router-dom';
import { ContactBarras, contactBase, useContact } from '../contato';
import { CLUSTER_DA_CAPTURA, FLAGS_DA_CAPTURA, analyticsAbas } from './abas';
import { AnalyticsVista } from './vista';
import './analise.css';

/**
 * A Análise do contato — o estado `auth.application.detail.analytics` da
 * origem, `/application/detail/{shortName}/analytics/*`.
 *
 * A régua é `supernova.blip.ai/portal.js`: o template `#analytics-tabs-view`
 * (módulo 95760), que o estado desenha na vista `tabsNav` do detalhe do
 * contato, e o controlador `ra`. Cada aba é um estado-filho; aqui, cada uma é
 * uma rota-filha, e esta casca é o que as oito têm em comum: a barra do portal,
 * a barra do contato com "Análise" acesa e a fileira de abas.
 *
 * O `analytics-redirect-modal` do template NÃO entra: ele só abre com
 * `isShowAnalyticsSuite`, e a flag está `false` para este contrato.
 */
export function AnalyticsShell() {
  const { contact } = useContact();
  const id = contact.id;

  return (
    <div className="pt-app">
      <ContactBarras ativo="Análise" />

      {/* `#main-content-area.main-detail-content.pa0`: sem recuo — quem recua
          é cada aba, com o `.container` dela. */}
      <main className="an-miolo">
        <AnalyticsVista
          base={`${contactBase(contact.tipo, id)}/analise`}
          abas={analyticsAbas(FLAGS_DA_CAPTURA, CLUSTER_DA_CAPTURA)}
        >
          <Outlet />
        </AnalyticsVista>
      </main>
    </div>
  );
}
