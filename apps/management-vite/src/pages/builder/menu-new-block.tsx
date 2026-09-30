import { IconePortal } from '@pipe/ui/icones-portal';
import type { Mapa } from './model';
import type { Subflows } from './subflows';
import { SubflowMenuSection } from './subflow-ui';

/**
 * The "NOVO BLOCO" sheet that the pill's "Adicionar bloco" opens (`#builder-command-buttons-add`): uppercase 16/semi-bold title with the "x" on the right, a divider, and a list of `bds-button variant="secondary" full-width justify-content="space-between"` — icon on the left, name on the right. Of their menu, only the blocks the Pipe engine runs make it in: "Padrão" (`builder-new-state`), "Humano" (`agent`), "Pesquisa de satisfação" (`survey:`, D-06 — the native BAH 3.0 model, `ref/inventario-satisfacao-e-tags.md` §1) and, on the main flow's canvas, "Subfluxo" (P13: the flow's subflows and "+ Criar novo subfluxo"), and "Agente de IA" (P14, `ai-agent:`; allowed in a subflow too). Pagamento, Componentes exclusivos, Catálogo, AI Answers and Biblioteca de blocos are Blip plan features with no engine behind them here.
 */

export function MenuNewBlock({
  onPadrao,
  onHumano,
  onPesquisa,
  onFechar,
  subflow,
  onAgente,
}: {
  onPadrao: () => void;
  onHumano: () => void;
  onPesquisa: () => void;
  onFechar: () => void;
  /** "Agente de IA" (P14): Blip's `ai-agent:` block, Anthropic or OpenAI per agent (D-58). */
  onAgente?: () => void;
  /** Present on the main flow's canvas only: subflows are created from the main flow. */
  subflow?: {
    mapa: Mapa;
    subfluxos: Subflows;
    onAbrir: (shortName: string) => void;
    onCriar: () => void;
  };
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
      {onAgente ? (
        <button type="button" className="bl-new-block-item" data-test="builder-add-ai-agent-state" onClick={onAgente}>
          <IconePortal nome="robo" tamanho={20} />
          <span>Agente de IA</span>
        </button>
      ) : null}
      {subflow ? (
        <SubflowMenuSection
          mapa={subflow.mapa}
          subfluxos={subflow.subfluxos}
          onAbrir={subflow.onAbrir}
          onCriar={subflow.onCriar}
        />
      ) : null}
    </div>
  );
}
