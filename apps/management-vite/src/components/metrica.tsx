import { ManagementIcon } from './icones-management';

/**
 * Reference metric card in `referencias-blip/portal/dom/monitoring.html` centers `bds-typo variant="fs-24"` value over `bds-typo variant="fs-12" class="text-center"` label with a 16px `bds-icon name="info" size="x-small"` in `bds-grid direction="row" gap="half"`. Use native `<details>` for keyboard/click access and Esc close without JavaScript; reject HTML `title=""` because it is not keyboard accessible. Keep literal source `tooltip-text` as the first line; put our spec formula and denominator inside the popup, not as a third card line.
 */
export function Metrica({
  value,
  rotulo,
  dica,
  formula,
  denominador,
  destaque = false,
  tom,
}: {
  value: string;
  rotulo: string;
  /** O `tooltip-text` deles, palavra por palavra. */
  dica: string;
  /** Formula and population from our spec are the tooltip's second line. */
  formula?: string;
  /** Denominator, such as `entre 6 na fila`, is the tooltip's third line. */
  denominador?: string;
  /** Brand color applies only to the two numbers answering how the operation is doing now. */
  destaque?: boolean;
  /** Tinta de erro: "Perdidos" e "Abandonados", como o `color-delete` deles. */
  tom?: 'erro';
}) {
  const classe = ['metric', destaque ? 'agora' : '', tom === 'erro' ? 'error' : '']
    .filter(Boolean)
    .join(' ');
  return (
    <div className={classe}>
      <span className="v">{value}</span>
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
        <ManagementIcon nome="informacao" tamanho={16} />
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
