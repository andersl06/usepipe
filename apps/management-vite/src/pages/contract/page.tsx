import Link from '../../components/link';
import { Avatar } from '@pipe/ui';
import { BarraDoPortal } from '../../components/barra-do-portal';
import { IconePortal } from '../../components/icones-portal';
import { useSearchParams } from 'react-router-dom';
import { useEu } from '../../context/session';
import { portalUseShell } from '../../lib/shell';
import { useRead } from '../../lib/query';
import type { ContractSummary } from '../../lib/contract';
import { BotaoCopiar } from './copiar';
import { cardsVisible, permissionRequired, byGroup, type ContractCard } from './catalogo';
import './contract.css';

/**
 * Contract panel — the screen the portal's "Acompanhe seu contrato" card opens. The reference is `referencias-blip/pesquisa/blip-painel-do-contrato.md`, research on the `{conta}.tenant.fragment.blip.ai` micro-frontend. THE LAYOUT IS THEIRS: the summary card in a narrow column on the left, the card groups in a wide column on the right, a `1fr 3fr` grid with a 32 gap. **What changes the screen is the ROLE**, as there. The difference is where the role comes from: they have three hardcoded in the front end (`admin`/`member`/`guest`) and a literal matrix in the code; we have real RBAC in the database, and the matrix became eleven permissions (`conta.*`, migration `0019_permissoes_da_conta`). The funnel became a single step — `hasPermission` per card — because their other two steps are a LaunchDarkly flag and a subscription metric, and we have neither. What was left out because of that is listed in `catalogo.ts`'s header. The chrome is the PORTAL's (`pt-app` + `BarraDoPortal`), as in "Novidades": in the source this panel runs in an iframe inside the portal, with the full dark bar on top. That's why `/contrato` is in `estrutura-gestao.tsx`'s own-shell list.
 */
export function ContractPage() {
  const eu = useEu();
  const shell = portalUseShell();
  const [search] = useSearchParams();
  const parametros = { demo: search.get('demo') ?? undefined };
  const read = useRead<ContractSummary>('/v1/management/contract/summary');
  if (!read.data) return null;
  const resumo = read.data;

  /*
   * Demo mode is ONLY this: a `?demo=1` in the URL that makes the filter return the whole catalog. It doesn't touch the session, doesn't become a cookie, and never reaches any Server Action — see the header of `acoes.ts`.
   */
  const demo = parametros.demo === '1';
  const sections = byGroup(cardsVisible(eu.permissions, { demo }));
  const podeEditarResumo = eu.permissions.includes('conta.resumo.escrever');

  return (
    <div className="pt-app">
      <BarraDoPortal data={shell} />

      {demo ? <DemoTier /> : null}

      <main className="pt-conteudo">
        {/*
 * With no groups, the summary card lies flat and takes the full width — it's their `horizontal` state (`Ve`, `grid-column: 1 / 3`), the `guest` state.
 */}
        <div className={sections.length === 0 ? 'ct-grade ct-grade--faixa' : 'ct-grade'}>
          <SummaryCard
            resumo={resumo}
            podeEditar={podeEditarResumo}
            faixa={sections.length === 0}
          />

          <div className="ct-groups">
            {sections.length === 0 ? (
              /*
               * Their `guest` state: just the summary card, and nothing else. A line of explanatory text, instead of a blank that looks like a broken screen.
               */
              <p className="pt-nada">
                Você tem acesso de leitura a este contrato. As configurações do contrato ficam com
                quem administra a conta.
              </p>
            ) : (
              sections.map(({ grupo, cards }) => (
                <section key={grupo.id} className="ct-section">
                  <h2 className="ct-titulo">
                    {grupo.titulo}
                    {/*
 * The info icon with tooltip they place next to each group title — `bds-icon name="info" theme="solid"` with no `size`, and the component's default is `medium`, 24. A native `title`: their tooltip doesn't do anything the browser's own doesn't already do.
 */}
                    <span className="ct-info" title={grupo.tooltip} aria-label={grupo.tooltip}>
                      <IconePortal nome="informacao" tamanho={24} />
                    </span>
                  </h2>

                  <div className="ct-cards">
                    {cards.map((card) => (
                      <Card
                        key={card.id}
                        card={card}
                        demo={demo}
                        hasPermission={eu.permissions.includes(permissionRequired(card))}
                      />
                    ))}
                  </div>
                </section>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

/* ------------------------------------------------------------ demonstration */

function DemoTier() {
  return (
    <div className="ct-previa" role="status">
      <b>Prévia do painel.</b> Você está vendo todos os cartões, como se o contrato tivesse o plano
      mais alto e você fosse administrador. Nada aqui pode ser salvo neste modo.
      <Link href="/contract">Sair da prévia</Link>
    </div>
  );
}

/* --------------------------------------------------------- summary card */

/** A data como eles escrevem: `13.09.2026`. */
function dataComPontos(instante: string | null, fuso: string): string {
  if (!instante) return '—';
  return new Date(instante)
    .toLocaleDateString('pt-BR', {
      timeZone: fuso,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
    .replaceAll('/', '.');
}

function SummaryCard({
  resumo,
  podeEditar,
  faixa,
}: {
  resumo: ContractSummary;
  podeEditar: boolean;
  faixa: boolean;
}) {
  return (
    <aside className={faixa ? 'ct-resumo ct-resumo--faixa' : 'ct-resumo'}>
      {/*
 * The contract's photo, in their 92px box (`.avatar.placeholder`) with the 72px avatar (`bds-avatar size="extra-large"`) centered inside. Editable under the same rule as the name — and the place where it's edited already exists: "Minha conta". Rebuilding the form here would create two paths to the same write.
 */}
      <div className="ct-foto-caixa">
        {resumo.logoUrl ? (
          <img className="ct-foto" src={resumo.logoUrl} alt="" width={72} height={72} />
        ) : (
          <Avatar nome={resumo.nome} className="ct-foto" />
        )}
      </div>

      {/*
 * `He`: everything that isn't the photo. Exists so the horizontal card can indent the body by 32 without touching the vertical card.
 */}
      <div className="ct-corpo">
        <div className="ct-block">
          {/* The "Nome do contrato" label they place above the name. */}
          <span className="ct-rotulo">Nome do contrato</span>
          <h1 className="ct-nome">{resumo.nome}</h1>

          {/*
 * Their `{id}.blip.ai`, bold with a copy button. Our address identifier is the account slug.
 */}
          <p className="ct-endereco">
            <b>{resumo.slug}</b>
            <BotaoCopiar value={resumo.slug} oQue="o endereço do contrato" />
          </p>
        </div>

        {podeEditar ? (
          <p className="ct-block">
            <Link className="ct-editar" href="/my-account">
              Editar os dados do contrato
            </Link>
          </p>
        ) : null}

        <dl className="ct-data">
          <div className="ct-block">
            <dt>ID</dt>
            <dd>
              <span className="ct-id">{resumo.id}</span>
              <BotaoCopiar value={resumo.id} oQue="o ID do contrato" />
            </dd>
          </div>

          <div className="ct-block">
            <dt>Data de criação</dt>
            <dd>{dataComPontos(resumo.criadoEm, resumo.fuso)}</dd>
          </div>

          {/* "Chatbots" and "Membros" only appear when present — it's their `ng-if`. */}
          {resumo.flows > 0 ? (
            <div className="ct-block">
              <dt>Fluxos e roteadores</dt>
              <dd>{resumo.flows}</dd>
            </div>
          ) : null}

          {resumo.members > 0 ? (
            <div className="ct-block">
              <dt>Membros</dt>
              <dd>{resumo.members}</dd>
            </div>
          ) : null}
        </dl>

        {/*
 * "Deixar contrato" sits at the bottom of the card, as there. Grayed out because actually leaving is more than deleting a link: in the source the screen first asks the server whether the person is the ONLY admin of any chatbot and blocks if so, then ends the session and drops them into another contract. Both steps belong to the `api`, which doesn't have that endpoint yet.
 */}
        <div className="ct-rodape">
          <span className="pt-obra">
            Deixar contrato
            <span className="pt-obra-selo">em breve</span>
          </span>
        </div>
      </div>
    </aside>
  );
}

/* ----------------------------------------------------------------- cards */

function Card({
  card,
  demo,
  hasPermission,
}: {
  card: ContractCard;
  demo: boolean;
  hasPermission: boolean;
}) {
  /*
   * In the preview, the label for whatever would hide the card in the real world: the missing permission and, when the source had one, the flag. That's what the panel exists to explain.
   */
  const whyItWouldDisappear = demo
    ? [hasPermission ? null : `exige ${permissionRequired(card)}`, card.flagNaOrigem]
        .filter((p) => p !== null && p !== undefined)
        .join(' · ')
    : '';

  const miolo = (
    <>
      {/* `de`: a 48px box with the `size="xx-large"` (36) icon inside. */}
      <span className="ct-card-icon">
        <IconePortal nome={card.icone} tamanho={36} />
      </span>
      <span className="ct-card-text">
        {/*
 * Their `flex row justify-between` row: title on the left, tag flush right.
 */}
        <span className="ct-card-title">
          <b>{card.titulo}</b>
          {card.pronto ? null : <span className="pt-obra-selo">em breve</span>}
        </span>
        <span>{card.description}</span>
        {whyItWouldDisappear ? <span className="ct-porque">{whyItWouldDisappear}</span> : null}
      </span>
    </>
  );

  /*
   * A card whose route doesn't exist yet stays in place, grayed out and badged — that's what the portal already does with anything under construction (`pt-obra`), and removing it would hide that the product has it.
   */
  if (!card.pronto) {
    return <div className="ct-card pt-obra">{miolo}</div>;
  }

  return (
    <Link className="ct-card" href={card.rota}>
      {miolo}
    </Link>
  );
}
