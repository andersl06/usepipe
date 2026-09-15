import { redirect } from 'next/navigation';

/**
 * A raiz é a PORTA, e a porta é o portal.
 *
 * Na origem, abrir o endereço da conta cai em `auth.application.list` — a lista
 * de contatos. O atendimento não é uma tela de primeiro nível: ele mora DENTRO
 * de um contato (`/application/detail/{contato}/attendance`) e só existe depois
 * que há um contato criado.
 *
 * Aqui a raiz era o Monitoramento, e quem acabava de entrar caía num quadro de
 * operação sem ter um fluxo sequer — filas vazias, nenhum atendente, nenhuma
 * conversa. O Monitoramento continua existindo, em `/monitoramento`; o que
 * mudou é que ele deixou de ser a primeira coisa que a pessoa vê.
 *
 * ponytail: os módulos (Atendimento, Builder, Análise…) ainda são rotas de
 * primeiro nível. Na origem eles são rotas DE UM CONTATO, e a barra deles só
 * aparece depois de escolher um. Quando `app/fluxo/[id]` crescer, é para lá que
 * essas rotas mudam de endereço.
 */
export default function Raiz() {
  redirect('/portal');
}
