import { Outlet, useLocation } from 'react-router-dom';
import { estaAtivo } from '@pipe/ui';
import Link from '../../components/link';
import { IconePortal, type NomeDeIconePortal } from '../../components/icones-portal';
import { URL_DESK } from '../../components/structure-management';
import { ModuloShell, contactBase, useContact } from '../flow/contact';
import './attendance.css';

/**
 * O módulo Atendimento — o que a origem desenha em
 * `/application/detail/<bot>/attendance/desk/<tela>`: a MESMA moldura de
 * todas as telas do contato (`CascaDoModulo`: barra do portal + barra do
 * contato) mais a `desk-sidebar` própria deste módulo.
 *
 * Estas telas viviam soltas na raiz (`/monitoramento`, `/historico`, …) e
 * desenhavam um SEGUNDO portal, com cabeçalho e lateral próprios
 * (`estrutura-gestao.tsx`) — o "dois portais" que este módulo fecha. A
 * `desk-sidebar` é a MESMA lateral de sempre (`.g-lateral`/`.g-item`/
 * `.g-grupo`, medida em `blip-medidas-monitoramento.md` §3): só o casco em
 * volta mudou, do portal para o contato.
 *
 * Grupos e itens, na ordem e nomes medidos no DOM (`referencias-blip/portal/dom/
 * monitoring.html`, `data-testid="menu-tree-sidebar-group-*"`):
 * Relatórios (Reports), Comunicação (Messaging), Regras (Rules), Atendentes
 * (Agents), Preferências (Settings, "Configurações" na origem — o nome Pipe
 * já usado por `configuracoes-gerais.tsx`/`-dados.tsx` fica). "Esforço por
 * atendente" e "Monitoria com IA" não aparecem nesta captura (conta/plano sem
 * o recurso ligado) mas já são tela nossa — entram no grupo Relatórios, ao
 * lado de Atendimento e Satisfação. "Calls" e "Vendas" (Reports) não têm tela
 * aqui — não temos telefonia nem funil de vendas — e por isso não entram.
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
      { rotulo: 'Atendimento', rota: 'reports/attendance' },
      { rotulo: 'Satisfação', rota: 'reports/satisfaction' },
      { rotulo: 'Esforço por atendente', rota: 'reports/effort' },
      { rotulo: 'Monitoria com IA', rota: 'quality-review' },
    ],
  },
  {
    rotulo: 'Comunicação',
    icone: 'comunicacao',
    filhos: [
      { rotulo: 'Respostas prontas', rota: 'communication/canned-responses' },
      { rotulo: 'Modelos de mensagens', rota: 'communication/templates' },
    ],
  },
  {
    rotulo: 'Regras',
    icone: 'regras',
    filhos: [
      { rotulo: 'Atendimento', rota: 'rules/attendance' },
      { rotulo: 'SLA', rota: 'rules/sla' },
      { rotulo: 'Horários', rota: 'rules/hours' },
    ],
  },
  {
    rotulo: 'Atendentes',
    icone: 'atendentes',
    filhos: [
      { rotulo: 'Gestão de atendentes', rota: 'agents/management' },
      { rotulo: 'Filas de atendimento', rota: 'agents/queues' },
      { rotulo: 'Pausas personalizadas', rota: 'agents/breaks' },
    ],
  },
  {
    rotulo: 'Preferências',
    icone: 'preferencias-gerais',
    filhos: [
      { rotulo: 'Configurações gerais', rota: 'preferences/general' },
      { rotulo: 'Dados', rota: 'preferences/data' },
      { rotulo: 'Canais de atendimento', rota: 'channels' },
    ],
  },
];

/** `/{tipo}/{id}/attendance` — o prefixo que toda tela deste módulo pendura. */
export function attendanceBase(tipo: string, id: string): string {
  return `${contactBase(tipo, id)}/attendance`;
}

function NavigationAttendance({ base, caminho }: { base: string; caminho: string }) {
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

      <a className="g-lateral-rodape" href={URL_DESK} target="_blank" rel="noreferrer">
        Pipe Desk
        <IconePortal nome="externo" tamanho={20} />
      </a>
    </nav>
  );
}

/**
 * A rota-pai do módulo: `CascaDoModulo` traz a barra do portal e a barra do
 * contato (com "Atendimento" aceso, ver `itens.ts`); aqui só entra a
 * `desk-sidebar` ao lado do `<Outlet>`, fora do recuo de 80% que `fx-coluna`
 * aplica às telas de coluna única (mesma saída de `configuracoes/casca.tsx`).
 */
export function AttendanceShell() {
  const { contact } = useContact();
  const base = attendanceBase(contact.tipo, contact.id);
  const caminho = useLocation().pathname;
  return (
    <ModuloShell ativo="Atendimento">
      <div className="at-casca">
        <NavigationAttendance base={base} caminho={caminho} />
        <section className="at-miolo">
          <div className="p-conteudo">
            <Outlet />
          </div>
        </section>
      </div>
    </ModuloShell>
  );
}
