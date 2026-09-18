import { IconeBusca, IconePortal } from '../../../../componentes/icones-portal';
import type { RelatorioPersonalizado } from '@pipe/core/analise';
import { CabecalhoDaPagina } from '../pecas';

/**
 * Relatórios Personalizados — o componente `customReports` do módulo
 * `analyticsComponents` (template 47754, controlador `bi`).
 *
 * Dois estados, os dois do template: a lista de `bds-paper.cards` e, sem
 * relatório, o `bds-typo.no-content-found` "Nenhum relatório encontrado :(".
 */
export function RelatoriosPersonalizados({
  relatorios,
  agora,
  fuso,
}: {
  relatorios: RelatorioPersonalizado[];
  agora: Date;
  fuso: string;
}) {
  return (
    <>
      {/* `page-header-title` + `helper-title`/`helper-body`/`helper-doc`, SEM
          `helper-confirm` — por isso não há ícone de ajuda. */}
      <CabecalhoDaPagina
        titulo="Relatórios personalizados"
        extra={
          <>
            {/* `<search-input class="flex mr3">`: a lupa de 32 e o campo, que
                nasce com largura 0 e só abre ao focar. O `<label>` faz o clique
                na lupa focar o campo, que é o `focusInput()` deles. */}
            <label className="rl-busca">
              <IconeBusca tamanho={32} className="rl-busca-lupa" />
              <input type="text" placeholder="Buscar relatórios" />
            </label>
            {/* `goToReport()` abre o editor de relatório, que não existe aqui. */}
            <span className="rl-criar">
              <button type="button" className="an-bp-btn" disabled>
                Criar relatório
              </button>
              <span className="pt-obra-selo">em breve</span>
            </span>
          </>
        }
      />

      <div className="fx-coluna rl-lista" id="reports-id">
        {relatorios.map((r) => (
          <div key={r.id} className="rl-cartao">
            <div className="rl-coluna rl-coluna--nome">
              <p className="an-t12 rl-rotulo">Nome do relatório</p>
              <p className="an-t14 rl-valor">{r.nome || 'Sem título'}</p>
            </div>
            <div className="rl-coluna rl-coluna--autor">
              <p className="an-t12 rl-rotulo">Criado por</p>
              <p className="an-t14 rl-valor">{r.criadoPor}</p>
            </div>
            <div className="rl-coluna rl-coluna--data">
              <p className="an-t12 rl-rotulo">Última modificação</p>
              <p className="an-t14 rl-valor">{dataDoRelatorio(r.modificadoEm, agora, fuso)}</p>
            </div>
            {/* `.card-icons.card-icons--hidden.w-10`: editar e excluir, só
                para o dono, e só aparecem com o cursor sobre o cartão. */}
            <div className="rl-icones">
              {r.souDono ? (
                <>
                  <span className="rl-icone" title="Editar">
                    <IconePortal nome="editar" tamanho={18} />
                  </span>
                  {/* `confirmDelete()` abre o modal de confirmação. */}
                  <a className="rl-icone" title="Remover" href={`#excluir-${r.id}`}>
                    <IconePortal nome="lixeira" tamanho={18} />
                  </a>
                </>
              ) : null}
            </div>
          </div>
        ))}

        {/* Fora da fileira: o `.cards` é `white-space: nowrap`, e o modal do
            `ModalService` nasce no `body`, não dentro do cartão. */}
        {relatorios
          .filter((r) => r.souDono)
          .map((r) => (
            <ConfirmarExclusao key={r.id} id={r.id} />
          ))}

        {relatorios.length === 0 ? (
          <p className="an-t16 rl-vazio">Nenhum relatório encontrado :(</p>
        ) : null}
      </div>
    </>
  );
}

/**
 * `handleReport()`: modificado HOJE mostra `moment(...).fromNow()`; outro dia,
 * `DD/MM/YYYY - HH:mm`; sem data, `N/A`. O "hoje" é o do fuso da conta.
 */
export function dataDoRelatorio(quando: Date | null, agora: Date, fuso: string): string {
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
 * O modal genérico do `ModalService` (`Rw`, template 84817) com os textos de
 * `reports.modal`: `modal-toolbar` com o `close`, título fs-32, corpo, e os
 * botões "Não" (secundário) e "Sim". Excluir grava — e aqui não há relatório
 * para excluir —, então o "Sim" leva o selo.
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
