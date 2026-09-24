import { IconeGestao } from './icones-gestao';

/**
 * Métrica de cartão — a coluna deles, lida em `referencias-blip/portal/dom/
 * monitoring.html`: número em cima (`bds-typo variant="fs-24"`), e embaixo a
 * linha do rótulo (`bds-typo variant="fs-12" class="text-center"`) com o
 * ícone de informação de 16px ao lado (`bds-icon name="info" size="x-small"`
 * numa `bds-grid direction="row" gap="half"`). Tudo centrado na coluna.
 *
 * O ícone de informação é `<details>` puro: abre no clique e no teclado, fecha
 * no `Esc` do navegador, e não custa uma linha de JavaScript. A dica de
 * `title=""` do HTML foi descartada de propósito — ela não abre com teclado.
 *
 * O TEXTO da dica é o `tooltip-text` deles, literal. O que é nosso — a
 * fórmula da spec de métricas e o denominador ("entre 6 na fila") — continua
 * existindo, mas DENTRO do balão: na tela deles o cartão não tem uma terceira
 * linha sob o rótulo, e a régua desta rodada é a forma deles.
 */
export function Metrica({
  valor,
  rotulo,
  dica,
  formula,
  denominador,
  destaque = false,
  tom,
}: {
  valor: string;
  rotulo: string;
  /** O `tooltip-text` deles, palavra por palavra. */
  dica: string;
  /** Fórmula e população, da nossa spec — segunda linha do balão. */
  formula?: string;
  /** População do número ("entre 6 na fila") — terceira linha do balão. */
  denominador?: string;
  /** Cor de marca só nos dois números que respondem "como está a operação agora". */
  destaque?: boolean;
  /** Tinta de erro: "Perdidos" e "Abandonados", como o `color-delete` deles. */
  tom?: 'erro';
}) {
  const classe = ['metric', destaque ? 'agora' : '', tom === 'erro' ? 'erro' : '']
    .filter(Boolean)
    .join(' ');
  return (
    <div className={classe}>
      <span className="v">{valor}</span>
      <span className="k">
        <span>{rotulo}</span>
        <Dica texto={dica} formula={formula} denominador={denominador} rotulo={rotulo} />
      </span>
    </div>
  );
}

export function Dica({
  texto,
  formula,
  denominador,
  rotulo,
}: {
  texto: string;
  formula?: string;
  denominador?: string;
  rotulo: string;
}) {
  return (
    <details className="dica">
      <summary aria-label={`Sobre "${rotulo}"`} title={texto}>
        <IconeGestao nome="informacao" tamanho={16} />
      </summary>
      <div className="dica-balao" role="note">
        {texto}
        {formula ? (
          <>
            <br />
            <br />
            {formula}
          </>
        ) : null}
        {denominador ? (
          <>
            <br />
            <br />
            {denominador}
          </>
        ) : null}
      </div>
    </details>
  );
}
