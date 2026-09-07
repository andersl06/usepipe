export const dynamic = 'force-static';

/**
 * Builder — o primeiro módulo da barra, e o único que ainda não tem produto
 * atrás.
 *
 * A tela existe para que o módulo não seja item apagado: quem clicar descobre
 * o que vai morar aqui e por que o layout desta parte não vai ser este. Na
 * plataforma de referência o construtor de fluxo e o roteador NÃO usam o casco
 * de duas barras com lateral — é outra tela, com tela cheia e um canvas.
 */
export default function PaginaBuilder() {
  return (
    <div className="g-leitura">
      <div className="board-head">
        <h2>Builder</h2>
        <span className="sub">O fluxo que atende antes da pessoa. Ainda não construído.</span>
      </div>

      <section className="card">
        <h3>O que vai morar aqui</h3>
        <p className="sub">
          O <b>fluxo</b> é o que responde antes de existir atendente: recebe a primeira mensagem,
          faz as perguntas de triagem, resolve o que dá para resolver sozinho e só então passa a
          conversa adiante. O que ele passa adiante — para qual fila, com qual contexto já
          coletado — é a decisão do <b>roteador</b>.
        </p>
        <p className="sub">
          Hoje a triagem que temos é a fila padrão da caixa de entrada, em <b>Canais</b>, e a regra
          de distribuição dentro da fila, em <b>Atendentes ├ Filas de atendimento</b>. É o suficiente
          para operar; não é suficiente para automatizar.
        </p>
        <p className="note">
          Quando esta tela existir, ela não vai ter a lateral nem as duas barras. Fluxo se desenha
          em canvas, com a tela inteira — a disposição de relatório atrapalharia. É a mesma
          separação que a plataforma de referência faz.
        </p>
      </section>

      <section className="card">
        <h3>O que precisa ser decidido antes</h3>
        <p className="sub">
          Se o <b>roteador é entidade própria</b> — uma peça que recebe tudo e decide o destino,
          como lá — ou se roteamento continua sendo <b>regra da fila</b>, sem peça nova. A primeira
          opção copia a arquitetura deles e cria um objeto a mais para configurar; a segunda cabe
          no que já existe e trava quando a regra deixar de ser &ldquo;por canal&rdquo;.
        </p>
      </section>
    </div>
  );
}
