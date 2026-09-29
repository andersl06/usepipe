import { IconePortal } from '@pipe/ui/icones-portal';

/**
 * The "NOVO BLOCO" sheet that the pill's "Adicionar bloco" opens (`#builder-command-buttons-add`): uppercase 16/semi-bold title with the "x" on the right, a divider, and a list of `bds-button variant="secondary" full-width justify-content="space-between"` — icon on the left, name on the right. Of their menu, only the blocks the Pipe engine runs make it in: "Padrão" (`builder-new-state`), "Humano" (`agent`), and "Pesquisa de satisfação" (`survey:`, D-06 — the native BAH 3.0 model, `ref/inventario-satisfacao-e-tags.md` §1). Agente, Pagamento, Componentes exclusivos, Catálogo, AI Answers, Biblioteca de blocos, and Subfluxo are Blip plan features with no engine behind them here.
 */

export function MenuNewBlock({
  onPadrao,
  onHumano,
  onPesquisa,
  onFechar,
}: {
  onPadrao: () => void;
  onHumano: () => void;
  onPesquisa: () => void;
  onFechar: () => void;
}) {
  return (
    <div className="bl-new-block" role="dialog" aria-label="Novo bloco">
      <div className="bl-new-block-header">
        <h4>NOVO BLOCO</h4>
        <button type="button" className="iconbtn" aria-label="Fechar" onClick={onFechar}>
          <IconePortal nome="fechar" tamanho={20} />
        </button>
      </div>
      <hr className="bl-panel-wire" />
      <button type="button" className="bl-new-block-item" data-test="button-create-new-block" onClick={onPadrao}>
        <IconePortal nome="fluxo" tamanho={20} />
        <span>Padrão</span>
      </button>
      <button type="button" className="bl-new-block-item" data-test="builder-add-desk-state" onClick={onHumano}>
        <IconePortal nome="suporte" tamanho={20} />
        <span>Humano</span>
      </button>
      <button type="button" className="bl-new-block-item" data-test="builder-add-survey-state" onClick={onPesquisa}>
        <IconePortal nome="gostei" tamanho={20} />
        <span>Pesquisa de satisfação</span>
      </button>
    </div>
  );
}
