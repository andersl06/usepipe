import Link from 'next/link';
import { GRUPOS } from '../../componentes/configuracoes/cabecalho';

/**
 * O índice das configurações.
 *
 * Era um `redirect` para a primeira seção, e isso fazia sentido enquanto havia
 * duas: com nove, a engrenagem precisa abrir num lugar que diga o que existe.
 *
 * Cada item traz uma linha do que a seção faz. É o que um menu de 28px não
 * consegue dizer, e é a diferença entre a pessoa procurar "onde muda o fuso" no
 * menu inteiro e ler "fuso horário" na descrição do espaço de trabalho.
 */
export default function PaginaConfiguracoes() {
  return (
    <>
      <div className="cfg-cabecalho">
        <h2>Configurações</h2>
        <p className="sub">
          O que se configura uma vez, fora do caminho do que se usa todo dia.
        </p>
      </div>

      {GRUPOS.map((grupo) => (
        <section className="cfg-grupo" key={grupo.rotulo} aria-labelledby={`g-${grupo.rotulo}`}>
          <h3 className="lbl" id={`g-${grupo.rotulo}`}>
            {grupo.rotulo}
          </h3>
          <ul className="cfg-indice">
            {grupo.secoes.map((secao) => (
              <li key={secao.href}>
                <Link href={secao.href}>
                  <b>{secao.rotulo}</b>
                  <span className="sub">{secao.descricao}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
