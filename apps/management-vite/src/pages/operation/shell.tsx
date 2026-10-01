import { Outlet, useLocation } from 'react-router-dom';
import { estaAtivo } from '@pipe/ui';
import Link from '../../components/link';
import { IconePortal, type NomeDeIconePortal } from '@pipe/ui/icones-portal';
import { useEu } from '../../context/session';
import { buildDeskUrl } from '../../lib/tenant-links';
import { ShellModule, contactPath, useContact } from '../flow/contact';
import type { Contact } from '../flow/barra-of-contact';
import './attendance.css';

/**
 * The Atendimento module — what the source draws at `/application/detail/<bot>/attendance/desk/<tela>`: the SAME frame as every contact screen (`CascaDoModulo`: portal bar + contact bar) plus this module's own `desk-sidebar`.
 *
 * These screens used to live loose at the root (`/monitoramento`, `/historico`, …) and drew a SECOND portal, with its own header and sidebar (`estrutura-gestao.tsx`) — the "two portals" this module closes. The `desk-sidebar` is the SAME sidebar as always (`.g-lateral`/`.g-item`/`.g-grupo`, measured in `blip-medidas-monitoramento.md` §3): only the shell around it changed, from the portal to the contact.
 *
 * Groups and items, in the order and names measured on the DOM (`referencias-blip/portal/dom/monitoring.html`, `data-testid="menu-tree-sidebar-group-*"`): Relatórios (Reports), Comunicação (Messaging), Regras (Rules), Atendentes (Agents), Preferências (Settings, "Configurações" in the source — the Pipe name already used by `configuracoes-gerais.tsx`/`-dados.tsx` stays). "Esforço por atendente" and "Monitoria com IA" don't appear in this capture (account/plan without the feature enabled) but are already our own screen — they enter the Relatórios group, next to Atendimento and Satisfação. "Calls" and "Vendas" (Reports) have no screen here — we don't have telephony or a sales funnel — so they don't enter.
 */

type ItemLateral = { rotulo: string; rota: string; icone: NomeDeIconePortal };
type GrupoLateral = { rotulo: string; icone: NomeDeIconePortal; filhos: readonly { rotulo: string; rota: string }[] };

const ITENS: readonly ItemLateral[] = [
  { rotulo: 'Monitoramento', rota: 'monitoring', icone: 'monitoramento' },
  { rotulo: 'Histórico', rota: 'history', icone: 'relogio' },
];

const GROUPS: readonly GrupoLateral[] = [
  {
    rotulo: 'Relatórios',
    icone: 'relatorios',
    filhos: [
      { rotulo: 'Atendimento', rota: 'report' },
      { rotulo: 'Satisfação', rota: 'survey-dashboard' },
      { rotulo: 'Esforço por atendente', rota: 'effort' },
      { rotulo: 'Monitoria com IA', rota: 'quality-assurance' },
    ],
  },
  {
    rotulo: 'Comunicação',
    icone: 'comunicacao',
    filhos: [
      { rotulo: 'Respostas prontas', rota: 'replies' },
      { rotulo: 'Modelos de mensagens', rota: 'message-template' },
    ],
  },
  {
    rotulo: 'Regras',
    icone: 'regras',
    filhos: [
      { rotulo: 'Atendimento', rota: 'rules' },
      { rotulo: 'SLA', rota: 'sla-policy' },
      { rotulo: 'Horários', rota: 'attendance-hours' },
    ],
  },
  {
    rotulo: 'Atendentes',
    icone: 'atendentes',
    filhos: [
      { rotulo: 'Gestão de atendentes', rota: 'team' },
      { rotulo: 'Filas de atendimento', rota: 'queue-management' },
      { rotulo: 'Pausas personalizadas', rota: 'personalizedbreaks' },
    ],
  },
  {
    rotulo: 'Preferências',
    icone: 'preferencias-gerais',
    filhos: [
      { rotulo: 'Configurações gerais', rota: 'general-settings' },
      { rotulo: 'Dados', rota: 'preferences/data' },
      { rotulo: 'Canais de atendimento', rota: 'channels' },
    ],
  },
];

/** `${flowPath(shortName)}/attendance` — o prefixo que toda tela deste módulo pendura. */
export function attendanceBase(contact: Pick<Contact, 'shortName'>): string {
  return `${contactPath(contact)}/attendance`;
}

function NavigationAttendance({ base, caminho, deskUrl }: { base: string; caminho: string; deskUrl: string | null }) {
  return (
    <nav className="g-lateral" aria-label="Atendimento">
      <div className="g-lateral-itens">
        {ITENS.map((i) => {
          const href = `${base}/${i.rota}`;
          return (
            <Link
              key={i.rota}
              href={href}
              className="g-item"
              aria-current={estaAtivo(href, caminho) ? 'page' : undefined}
            >
              <IconePortal nome={i.icone} tamanho={24} />
              {i.rotulo}
            </Link>
          );
        })}

        {GROUPS.map((g) => {
          const aberto = g.filhos.some((f) => estaAtivo(`${base}/${f.rota}`, caminho));
          return (
            <details key={g.rotulo} className="g-grupo" open={aberto}>
              <summary className="g-item">
                <IconePortal nome={g.icone} tamanho={24} />
                {g.rotulo}
                <IconePortal nome="baixo" tamanho={20} />
              </summary>
              <div className="g-grupo-filhos">
                {g.filhos.map((f) => {
                  const href = `${base}/${f.rota}`;
                  return (
                    <Link
                      key={f.rota}
                      href={href}
                      className="g-subitem"
                      aria-current={estaAtivo(href, caminho) ? 'page' : undefined}
                    >
                      {f.rotulo}
                    </Link>
                  );
                })}
              </div>
            </details>
          );
        })}
      </div>

      {deskUrl && <a className="g-lateral-rodape" href={deskUrl} target="_blank" rel="noreferrer">
        Pipe Desk
        <IconePortal nome="externo" tamanho={20} />
      </a>}
    </nav>
  );
}

/**
 * The module's parent route: `CascaDoModulo` brings the portal bar and the contact bar (with "Atendimento" lit, see `itens.ts`); here only the `desk-sidebar` enters next to the `<Outlet>`, outside the 80% indent that `fx-coluna` applies to single-column screens (same output as `configuracoes/casca.tsx`).
 */
export function AttendanceShell() {
  const { contact } = useContact();
  const eu = useEu();
  const deskUrl = buildDeskUrl(window.location, eu.tenant.slug, import.meta.env.DEV);
  const base = attendanceBase(contact);
  const caminho = useLocation().pathname;
  return (
    <ShellModule ativo="Atendimento">
      <div className="at-shell">
        <NavigationAttendance base={base} caminho={caminho} deskUrl={deskUrl} />
        <section className="at-miolo">
          <div className="p-conteudo">
            <Outlet />
          </div>
        </section>
      </div>
    </ShellModule>
  );
}
