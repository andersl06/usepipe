import { IconeGestao } from './icones-gestao';

/**
 * Métrica de cartão, com a explicação ao lado do rótulo.
 *
 * O ícone de informação é `<details>` puro: abre no clique e no teclado, fecha
 * no `Esc` do navegador, e não custa uma linha de JavaScript. A dica de
 * `title=""` do HTML foi descartada de propósito — ela não abre com teclado, e
 * o texto aqui é a definição da métrica, não um enfeite.
 *
 * O TEXTO SAI DA NOSSA SPEC, não da tela da Blip: `docs/specs/
 * 2026-09-05-metricas-atendimento.md` diz a fórmula e a população de cada
 * número, e é isso que o supervisor precisa ler para saber o que está vendo.
 * Cada dica traz as duas coisas.
 */
export function Metrica({
  valor,
  rotulo,
  dica,
  denominador,
  destaque = false,
}: {
  valor: string;
  rotulo: string;
  /** Fórmula e população, palavra por palavra da spec de métricas. */
  dica: string;
  denominador?: string;
  /** Moss só nos dois números que respondem "como está a operação agora". */
  destaque?: boolean;
}) {
  return (
    <div className={destaque ? 'metric agora' : 'metric'}>
      <span className="v">{valor}</span>
      <span className="k">
        {rotulo}
        <Dica texto={dica} rotulo={rotulo} />
      </span>
      {denominador ? <span className="den">{denominador}</span> : null}
    </div>
  );
}

function Dica({ texto, rotulo }: { texto: string; rotulo: string }) {
  return (
    <details className="dica">
      <summary aria-label={`Como "${rotulo}" é calculado`} title={texto}>
        <IconeGestao nome="informacao" tamanho={13} />
      </summary>
      <div className="dica-balao" role="note">
        {texto}
      </div>
    </details>
  );
}

/** Cor de estado dos pontos. Nossos tokens, nunca o azul da referência. */
export type EstadoDoPonto = 'sucesso' | 'alerta' | 'erro' | 'neutro';

/**
 * Contagem de status, com o ponto colorido antes do rótulo.
 *
 * É o único lugar da tela onde a cor de estado aparece sem pedir ação, e cabe
 * na régua porque são sete pontos de 7px: a cor aqui é o que deixa o supervisor
 * achar "perdidos" sem ler os quatro rótulos.
 */
export function Status({
  valor,
  rotulo,
  estado,
}: {
  valor: string;
  rotulo: string;
  estado: EstadoDoPonto;
}) {
  return (
    <div>
      <b>{valor}</b>
      <span>
        <span className={`sw ${estado}`} aria-hidden="true" />
        {rotulo}
      </span>
    </div>
  );
}
