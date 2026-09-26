import { IconePortal } from '../../components/icones-portal';

/**
 * The "NOVO BLOCO" sheet that the pill's "Adicionar bloco" opens (`#builder-command-buttons-add`): uppercase 16/semi-bold title with the "x" on the right, a divider, and a list of `bds-button variant="secondary" full-width justify-content="space-between"` — icon on the left, name on the right. Of their menu, only the two blocks the Pipe engine runs make it in: "Padrão" (`builder-new-state`) and "Humano" (`agent`). Agente, Pagamento, Componentes exclusivos, Catálogo, AI Answers, Biblioteca de blocos, and Subfluxo are Blip plan features with no engine behind them here.
 */

export function MenuNewBlock({
  onPadrao,
  onHumano,
  onFechar,
}: {
  onPadrao: () => void;
  onHumano: () => void;
  onFechar: () => void;
}) {
  return (
    <div className="bl-novo-bloco" role="dialog" aria-label="Novo bloco">
      <div className="bl-novo-bloco-cabecalho">
        <h4>NOVO BLOCO</h4>
        <button type="button" className="iconbtn" aria-label="Fechar" onClick={onFechar}>
          <IconePortal nome="fechar" tamanho={20} />
        </button>
      </div>
      <hr className="bl-painel-fio" />
      <button type="button" className="bl-novo-bloco-item" data-test="button-create-new-block" onClick={onPadrao}>
        <IconePortal nome="fluxo" tamanho={20} />
        <span>Padrão</span>
      </button>
      <button type="button" className="bl-novo-bloco-item" data-test="builder-add-desk-state" onClick={onHumano}>
        <IconePortal nome="suporte" tamanho={20} />
        <span>Humano</span>
      </button>
    </div>
  );
}
