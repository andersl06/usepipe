import Link from 'next/link';
import { GROUPS } from '../../components/settings/cabecalho';

/**
 * The settings index.
 *
 * It used to be a `redirect` to the first section, and that made sense back when there
 * were two: with nine, the gear icon needs to open somewhere that says what exists.
 *
 * Each item carries one line about what the section does. That's what a 28px menu
 * can't say, and it's the difference between someone hunting for "where do I change
 * the timezone" through the whole menu versus reading "timezone" in the workspace's
 * description.
 */
export default function PageSettings() {
  return (
    <>
      <div className="cfg-cabecalho">
        <h2>Configurações</h2>
        <p className="sub">
          O que se configura uma vez, fora do caminho do que se usa todo dia.
        </p>
      </div>

      {GROUPS.map((grupo) => (
        <section className="cfg-grupo" key={grupo.rotulo} aria-labelledby={`g-${grupo.rotulo}`}>
          <h3 className="lbl" id={`g-${grupo.rotulo}`}>
            {grupo.rotulo}
          </h3>
          <ul className="cfg-indice">
            {grupo.sections.map((section) => (
              <li key={section.href}>
                <Link href={section.href}>
                  <b>{section.rotulo}</b>
                  <span className="sub">{section.description}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
