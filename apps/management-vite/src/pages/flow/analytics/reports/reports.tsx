import { SearchIcon, IconePortal } from '../../../../components/icones-portal';
import type { ReportCustom } from '@pipe/core/analytics';
import { PageHeader } from '../pecas';

/**
 * Custom Reports — the `customReports` component from the `analyticsComponents` module (template 47754, controller `bi`). Two states, both from the template: the `bds-paper.cards` list, and, with no report, the `bds-typo.no-content-found` "Nenhum relatório encontrado :(".
 */
export function ReportsCustom({
  reports,
  agora,
  fuso,
}: {
  reports: ReportCustom[];
  agora: Date;
  fuso: string;
}) {
  return (
    <>
      {/*
 * `page-header-title` + `helper-title`/`helper-body`/`helper-doc`, WITHOUT `helper-confirm` — that's why there's no help icon.
 */}
      <PageHeader
        titulo="Relatórios personalizados"
        extra={
          <>
            {/*
 * `<search-input class="flex mr3">`: the 32px magnifying glass and the field, which starts at width 0 and only opens on focus. The `<label>` makes clicking the glass focus the field, which is their `focusInput()`.
 */}
            <label className="rl-search">
              <SearchIcon tamanho={32} className="rl-search-magnifier" />
              <input type="text" placeholder="Buscar relatórios" />
            </label>
            {/* `goToReport()` opens the report editor, which doesn't exist here. */}
            <span className="rl-create">
              <button type="button" className="an-bp-btn" disabled>
                Criar relatório
              </button>
              <span className="pt-obra-selo">em breve</span>
            </span>
          </>
        }
      />

      <div className="fx-column rl-lista" id="reports-id">
        {reports.map((r) => (
          <div key={r.id} className="rl-card">
            <div className="rl-column rl-column--name">
              <p className="an-t12 rl-rotulo">Nome do relatório</p>
              <p className="an-t14 rl-value">{r.nome || 'Sem título'}</p>
            </div>
            <div className="rl-column rl-column--author">
              <p className="an-t12 rl-rotulo">Criado por</p>
              <p className="an-t14 rl-value">{r.createdBy}</p>
            </div>
            <div className="rl-column rl-column--data">
              <p className="an-t12 rl-rotulo">Última modificação</p>
              <p className="an-t14 rl-value">{reportData(r.modificadoEm, agora, fuso)}</p>
            </div>
            {/*
 * `.card-icons.card-icons--hidden.w-10`: edit and delete, only for the owner, and only appear on hover over the card.
 */}
            <div className="rl-icones">
              {r.souDono ? (
                <>
                  <span className="rl-icone" title="Editar">
                    <IconePortal nome="editar" tamanho={18} />
                  </span>
                  {/* `confirmDelete()` opens the confirmation modal. */}
                  <a className="rl-icone" title="Remover" href={`#excluir-${r.id}`}>
                    <IconePortal nome="lixeira" tamanho={18} />
                  </a>
                </>
              ) : null}
            </div>
          </div>
        ))}

        {/*
 * Outside the row: `.cards` is `white-space: nowrap`, and the `ModalService` modal is born in the `body`, not inside the card.
 */}
        {reports
          .filter((r) => r.souDono)
          .map((r) => (
            <ConfirmarExclusao key={r.id} id={r.id} />
          ))}

        {reports.length === 0 ? (
          <p className="an-t16 rl-empty">Nenhum relatório encontrado :(</p>
        ) : null}
      </div>
    </>
  );
}

/**
 * `handleReport()`: modified TODAY shows `moment(...).fromNow()`; another day, `DD/MM/YYYY - HH:mm`; no date, `N/A`. "Today" is in the account's timezone.
 */
export function reportData(quando: Date | null, agora: Date, fuso: string): string {
  if (!quando) return 'N/A';
  const dia = (d: Date) => d.toLocaleDateString('pt-BR', { timeZone: fuso });
  if (dia(quando) !== dia(agora)) {
    const hora = quando.toLocaleTimeString('pt-BR', {
      timeZone: fuso,
      hour: '2-digit',
      minute: '2-digit',
    });
    return `${dia(quando)} - ${hora}`;
  }
  return haQuanto((agora.getTime() - quando.getTime()) / 1000);
}

/** Os limiares do `fromNow()` do moment, com o texto do locale `pt-br` dele. */
function haQuanto(segundos: number): string {
  const s = Math.round(segundos);
  if (s < 45) return 'há poucos segundos';
  if (s < 90) return 'há um minuto';
  const min = Math.round(s / 60);
  if (min < 45) return `há ${min} minutos`;
  if (min < 90) return 'há uma hora';
  const h = Math.round(min / 60);
  if (h < 22) return `há ${h} horas`;
  return 'há um dia';
}

/**
 * The generic `ModalService` modal (`Rw`, template 84817) with the `reports.modal` texts: `modal-toolbar` with the `close`, fs-32 title, body, and the "Não" (secondary) and "Sim" buttons. Deleting writes to the database — and here there's no report to delete —, so the "Sim" button gets the "coming soon" badge.
 */
function ConfirmarExclusao({ id }: { id: string }) {
  return (
    <div className="an-modal" id={`excluir-${id}`} role="dialog" aria-modal="true">
      <a className="an-modal-fundo" href="#" aria-label="Fechar" />
      <div className="an-modal-legado">
        <div className="rl-confirma-barra">
          <a href="#" aria-label="Fechar">
            <IconePortal nome="fechar" tamanho={24} />
          </a>
        </div>
        <div className="an-modal-legado-corpo">
          <p className="an-t32 rl-confirma-titulo">Confirmar exclusão</p>
          <p className="an-t16 rl-confirma-texto">
            Você tem certeza que deseja excluir este relatório?
          </p>
        </div>
        <div className="rl-confirma-pe">
          <a className="an-bds-btn an-bds-btn--secundario rl-confirma-nao" href="#">
            Não
          </a>
          <button type="button" className="an-bds-btn" disabled>
            Sim
          </button>
          <span className="pt-obra-selo">em breve</span>
        </div>
      </div>
    </div>
  );
}
