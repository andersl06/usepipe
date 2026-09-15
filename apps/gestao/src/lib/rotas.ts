/**
 * O caminho pedido, repassado pelo middleware ao servidor num cabeçalho.
 *
 * Vive aqui, e não no `middleware.ts`, porque quem lê é código de servidor: um
 * import do middleware arrastaria o runtime de borda para dentro do Node.
 */
export const CABECALHO_CAMINHO = 'x-pipe-caminho';

/** A conta que o ENDEREÇO pede — o subdomínio, quando existe. */
export const CABECALHO_CONTA = 'x-pipe-conta';

/** As duas telas do onboarding, mais nada. Incluir outra reabre o laço. */
export const ROTAS_DO_ONBOARDING = /^[/](bem-vindo|minha-conta)([/]|$)/;

/**
 * O domínio em que as contas moram — `usepipe.ai` —, e é ele que separa
 * `<conta>.usepipe.ai` do hub `app.usepipe.ai`.
 *
 * VAZIO desliga o endereço por conta, e é assim que o desenvolvimento roda: o
 * cookie de sessão precisa valer para todo subdomínio, e navegador nenhum
 * compartilha cookie entre `a.localhost` e `b.localhost` — "localhost" conta
 * como domínio de topo. Com isto desligado a conta vem do cookie e a troca é
 * pelo seletor, que faz a mesma coisa.
 */
export const DOMINIO_DAS_CONTAS = (process.env['PIPE_DOMINIO_CONTAS'] ?? '').toLowerCase();

/**
 * Nomes que NÃO são conta: são o próprio produto.
 *
 * Sem esta lista, `app.usepipe.ai` seria lido como a conta "app" e a pessoa
 * cairia numa troca de conta para um lugar que não existe.
 */
const RESERVADOS = new Set(['app', 'www', 'portal', 'api', 'admin', 'desk', 'crm', 'status']);

/**
 * A conta pedida pelo endereço, ou `null` quando não há uma.
 *
 * É a peça que copia o `<conta>.blip.ai` da plataforma de origem: lá o
 * subdomínio É o seletor de conta, e o login volta para a origem de onde saiu —
 * por isso quem entra por um endereço de conta continua nela, e quem entra pelo
 * hub cai na sua conta pessoal.
 */
export function contaDoHost(host: string | null | undefined): string | null {
  if (!host || !DOMINIO_DAS_CONTAS) return null;
  const semPorta = host.split(':')[0]!.toLowerCase();
  if (semPorta === DOMINIO_DAS_CONTAS) return null;
  if (!semPorta.endsWith(`.${DOMINIO_DAS_CONTAS}`)) return null;

  const rotulo = semPorta.slice(0, -(DOMINIO_DAS_CONTAS.length + 1));
  // Só um nível: `a.b.usepipe.ai` não é conta, é engano ou tentativa.
  if (!rotulo || rotulo.includes('.') || RESERVADOS.has(rotulo)) return null;
  return rotulo;
}

/** O endereço completo de uma conta, para mandar a pessoa até ela. */
export function urlDaConta(slug: string, caminho = '/portal'): string {
  const porta = process.env['PIPE_PORTA_PUBLICA'];
  const esquema = process.env['PIPE_COOKIE_SEGURO'] === 'false' ? 'http' : 'https';
  return `${esquema}://${slug}.${DOMINIO_DAS_CONTAS}${porta ? `:${porta}` : ''}${caminho}`;
}
