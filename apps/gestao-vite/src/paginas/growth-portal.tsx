
/**
 * Growth — mensagem ativa e campanha.
 *
 * Diferente do Builder, aqui a regra já está escrita e é vinculante: a spec
 * `docs/specs/2026-09-06-mensagem-ativa-e-janelas.md` define a tabela, os sete
 * estados e a regra das duas janelas. Falta a tela e o disparo.
 *
 * O que esta página não faz, de propósito, é inventar um botão de disparo que
 * não envia nada. Ela diz o que vale hoje, e o que vale hoje já muda decisão:
 * quem não sabe da janela de 90 dias monta lista de disparo errada.
 */
export function PaginaGrowth() {
  return (
    <div className="g-leitura">
      <div className="board-head">
        <h2>Growth</h2>
        <span className="sub">
          Mensagem ativa e campanha. A regra está definida; a tela de disparo ainda não existe.
        </span>
      </div>

      <section className="card">
        <h3>As duas janelas, que não são a mesma</h3>
        <p className="sub">
          A <b>janela de 24 horas</b> decide o formato: dentro dela o atendente escreve texto livre;
          fora dela só sai <b>template aprovado</b>. É a janela que o Desk já respeita, trocando o
          campo de texto pelo seletor de template quando ela fecha.
        </p>
        <p className="sub">
          A <b>janela de 90 dias</b> decide outra coisa: se o contato ainda TEM histórico. Passado
          esse prazo ele volta a ser desconhecido, e a conversa só recomeça por mensagem ativa. São
          duas recusas diferentes, e o erro clássico é mostrar a mesma mensagem para as duas — quem
          recebe &ldquo;janela fechada&rdquo; quando o caso é &ldquo;sem histórico&rdquo; tenta o
          template errado.
        </p>
      </section>

      <section className="card">
        <h3>Mensagem ativa não é atendimento</h3>
        <p className="sub">
          Um disparo sem resposta não é ticket. Ele vive <b>24 horas</b> de vida útil mais{' '}
          <b>48 horas</b> de rastro na lista, e só vira conversa quando alguém responde. Enquanto
          não vira, ele não entra em nenhuma média de tempo: contar disparo como atendimento infla o
          volume e derruba o TMR sem que ninguém tenha atendido melhor.
        </p>
        <p className="note">
          Os sete estados definidos são: agendada, enviando, enviada, entregue, lida, falha e
          expirada. O relatório que vai ler isso é o de{' '}
          o relatório de Atendimento dentro do contato, e ele precisa continuar mostrando
          a população descartada ao lado de cada média.
        </p>
      </section>

      <section className="card">
        <h3>O que falta para a tela existir</h3>
        <p className="sub">
          A tabela <code className="mono">mensagem_ativa</code>, particionada por mês; a coluna{' '}
          <code className="mono">contato.ultima_conversa_em</code>, que sustenta a janela de 90
          dias; e o serviço de envio. Os modelos aprovados já são cadastrados em{' '}
          Comunicação ├ Modelos de mensagens, dentro do contato.
        </p>
      </section>
    </div>
  );
}
