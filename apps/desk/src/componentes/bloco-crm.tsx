import type { FichaDoCrm } from '../lib/crm.js';

/**
 * O que o CRM sabe do cliente, no painel do contato.
 *
 * Leitura e só leitura. Editar daqui exigiria log de auditoria — a mesma pendência
 * que já segura a edição de contato no painel, e não vou abri-la de lado.
 *
 * **Sem ficha, não renderiza nada.** Falha fechada: sem espelho no CRM não há link,
 * e é melhor o cartão sumir do que existir um botão que leva à home do CRM e faz o
 * atendente procurar o cliente à mão no meio de uma conversa.
 *
 * O link abre em outra aba de propósito: é assim que "sair para a ficha e voltar"
 * funciona sem perder a conversa nem a aba escolhida do painel — a URL do Desk fica
 * intacta atrás.
 */
export function BlocoCrm({ ficha }: { ficha: FichaDoCrm | null }) {
  if (!ficha) return null;

  return (
    <section>
      <span className="rotulo">CRM</span>
      <dl className="kv">
        {ficha.nome ? (
          <>
            <dt>Nome</dt>
            <dd>{ficha.nome}</dd>
          </>
        ) : null}
        {ficha.empresa ? (
          <>
            <dt>Empresa</dt>
            <dd>{ficha.empresa}</dd>
          </>
        ) : null}
        {ficha.email ? (
          <>
            <dt>E-mail</dt>
            <dd>{ficha.email}</dd>
          </>
        ) : null}
      </dl>
      <a
        href={ficha.link}
        target="_blank"
        rel="noreferrer"
        title="Abre a ficha deste cliente no Pipe CRM, em outra aba"
      >
        Abrir no CRM
      </a>
    </section>
  );
}
