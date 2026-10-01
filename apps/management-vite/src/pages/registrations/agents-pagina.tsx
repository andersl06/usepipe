import type { ReactNode } from 'react';
import { Avatar, BotaoDeIcone } from '@pipe/ui';

/** Cabeçalho comum de Adicionar, Editar e Permissões: botão voltar e título. */
export function CabecalhoAtendente({ titulo, aoVoltar }: { titulo: string; aoVoltar: () => void }) {
  return (
    <div className="atend-cab">
      <BotaoDeIcone nome="esquerda" rotulo="Voltar para Gestão de atendentes" onClick={aoVoltar} />
      <h2>{titulo}</h2>
    </div>
  );
}

/** Avatar com iniciais e subtítulo, mostrados acima do cartão de Editar e de Permissões. */
export function SubtituloAtendente({ nome, children }: { nome: string; children: ReactNode }) {
  return (
    <>
      <Avatar nome={nome} className="atend-avatar" />
      <p className="atend-subtitulo">{children}</p>
    </>
  );
}

/** Linha do cartão: rótulo e ajuda à esquerda, controle à direita. */
export function LinhaConfig({
  rotulo,
  ajuda,
  children,
}: {
  rotulo: string;
  ajuda?: string;
  children: ReactNode;
}) {
  return (
    <div className="atend-linha">
      <div>
        <div className="atend-linha-rotulo">{rotulo}</div>
        {ajuda ? <div className="atend-linha-ajuda">{ajuda}</div> : null}
      </div>
      <div className="atend-linha-campo">{children}</div>
    </div>
  );
}

/** Valor exibido no texto do interruptor; o padrão real é a capacidade de cada fila (`fila.capacidade_padrao`), sem número único. */
const TICKETS_PADRAO_EXIBIDO = 200;

/** Tickets simultâneos: interruptor "padrão" e, desligado, campo numérico. */
export function TicketsSimultaneos({
  padrao,
  valor,
  onPadrao,
  onValor,
  desabilitado,
}: {
  padrao: boolean;
  valor: string;
  onPadrao: (padrao: boolean) => void;
  onValor: (valor: string) => void;
  desabilitado?: boolean;
}) {
  return (
    <>
      <div className="atend-padrao">
        <button
          type="button"
          className="interruptor interruptor-curto"
          role="switch"
          aria-checked={padrao}
          aria-label="Usar configuração padrão de tickets simultâneos"
          disabled={desabilitado}
          onClick={() => onPadrao(!padrao)}
        >
          <span className="interruptor-bolinha" />
        </button>
        <span>Usar configuração padrão ({TICKETS_PADRAO_EXIBIDO} tickets simultâneos)</span>
      </div>
      {padrao ? null : (
        <input
          type="number"
          min={1}
          max={200}
          className="atend-numero"
          aria-label="Tickets simultâneos"
          value={valor}
          onChange={(e) => onValor(e.target.value)}
          disabled={desabilitado}
        />
      )}
    </>
  );
}
