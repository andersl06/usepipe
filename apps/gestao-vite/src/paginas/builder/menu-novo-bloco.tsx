import { Icone } from '@pipe/ui';
import { IconeGestao } from '../../componentes/icones-gestao';

/**
 * O papel "NOVO BLOCO" que o "Adicionar bloco" da pílula abre
 * (`#builder-command-buttons-add`): título em caixa alta 16/semi-bold com o
 * "x" à direita, um fio, e uma lista de `bds-button variant="secondary"
 * full-width justify-content="space-between"` — ícone à esquerda, nome à
 * direita. Do menu deles só entram os dois blocos que o motor do Pipe roda:
 * "Padrão" (`builder-new-state`) e "Humano" (`agent`). Agente, Pagamento,
 * Componentes exclusivos, Catálogo, AI Answers, Biblioteca de blocos e
 * Subfluxo são recursos de plano da Blip sem motor por trás aqui.
 */

export function MenuNovoBloco({
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
          <Icone nome="x" tamanho={20} />
        </button>
      </div>
      <hr className="bl-painel-fio" />
      <button type="button" className="bl-novo-bloco-item" data-test="button-create-new-block" onClick={onPadrao}>
        <Icone nome="grade" tamanho={20} />
        <span>Padrão</span>
      </button>
      <button type="button" className="bl-novo-bloco-item" data-test="builder-add-desk-state" onClick={onHumano}>
        <IconeGestao nome="atendente" tamanho={20} />
        <span>Humano</span>
      </button>
    </div>
  );
}
