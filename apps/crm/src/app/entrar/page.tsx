import type { Metadata } from 'next';
import type { RecusaDeEntrada } from '@pipe/contracts';
import { Simbolo } from '@pipe/ui';
import { caminhoInterno, urlDeEntradaComGoogle } from '../../lib/sessao';
import { continuar } from './acoes';

/**
 * A tela de entrada — a primeira coisa que um cliente vê, e a ÚNICA rota
 * pública deste aplicativo.
 *
 * Duas regras a moldam:
 *
 * 1. **Nada de tenant aqui.** Quem chega nesta tela não está logado, então ela
 *    não sabe (e não pode contar) qual empresa usa o Pipe. Por isso o nome da
 *    conta não aparece, e por isso a descoberta por e-mail responde igual para
 *    domínio conhecido e desconhecido — a simetria é da API, e a tela não a
 *    quebra mostrando o que "achou".
 * 2. **Cada recusa tem uma SAÍDA, não um "não autorizado".** Os sete códigos de
 *    `RECUSAS_DE_ENTRADA` chegam em `?erro=` e cada um manda a pessoa para um
 *    lugar diferente: pedir convite, falar com quem contratou, entrar pelo
 *    provedor da empresa. Genérico aqui é a pessoa desistindo.
 *
 * Sem sessão e sem banco: só `fetch` na API, e por isso ela abre com o Postgres
 * fora do ar — que é exatamente quando alguém precisa entrar para ver o que houve.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Entrar · Pipe CRM',
  description: 'Entrar no Pipe CRM.',
};

/**
 * Os sete códigos do contrato, cada um com o que aconteceu e o que fazer.
 *
 * `Record<RecusaDeEntrada, …>` de propósito: se a API acrescentar um código, o
 * `tsc` quebra AQUI, e não em produção com um erro em branco na cara do cliente.
 */
const RECUSAS: Record<RecusaDeEntrada, { titulo: string; saida: string }> = {
  dominio_publico: {
    titulo: 'Este e-mail é pessoal, e ele não diz de que empresa você é',
    saida:
      'Gmail, Outlook e afins não identificam uma conta do Pipe. Peça um convite a quem administra o Pipe na sua empresa: o link do convite entra direto, sem depender do domínio.',
  },
  dominio_desconhecido: {
    titulo: 'Nenhuma conta do Pipe usa este domínio',
    saida:
      'Fale com quem contratou o Pipe na sua empresa. Se a conta existe e o domínio ainda não foi verificado, a entrada é por convite.',
  },
  sem_convite: {
    titulo: 'Você ainda não foi convidado — ou o convite não serve mais',
    saida:
      'Convite vence em sete dias e vale uma vez só. Peça um novo a quem administra o Pipe na sua empresa.',
  },
  usuario_inativo: {
    titulo: 'Seu acesso foi desativado',
    saida:
      'A conta existe, mas alguém a desativou. Fale com o administrador do Pipe na sua empresa para reativá-la.',
  },
  email_nao_verificado: {
    titulo: 'O Google não confirmou o seu e-mail',
    saida:
      'Verifique o endereço na sua conta do Google e tente entrar de novo. Sem essa confirmação, não temos como saber que o e-mail é seu.',
  },
  sso_obrigatorio: {
    titulo: 'Sua empresa exige entrada pelo provedor de identidade dela',
    saida:
      'Não é por aqui que você entra. Digite o seu e-mail corporativo no campo abaixo e clique em Continuar: nós levamos você ao provedor certo.',
  },
  falha_no_provedor: {
    titulo: 'Não conseguimos concluir a conversa com o provedor',
    saida:
      'Foi uma falha nossa ou dele, e não uma recusa: tente entrar de novo. Se insistir, avise quem administra o Pipe na sua empresa.',
  },
};

/** O que a descoberta por e-mail devolve para a tela quando não roteia. */
const AVISOS: Record<string, { titulo: string; saida: string }> = {
  senha: {
    titulo: 'Esta empresa não entra por provedor de identidade',
    saida: 'Use o botão "Entrar com Google" aqui em cima, com o seu e-mail corporativo.',
  },
  invalido: {
    titulo: 'Informe um e-mail válido',
    saida: 'Faltou o "@" ou o domínio. Confira e tente de novo.',
  },
  falha: {
    titulo: 'Não conseguimos verificar este e-mail agora',
    saida: 'Tente de novo em instantes, ou entre direto com o Google.',
  },
};

function ehRecusa(codigo: string | undefined): codigo is RecusaDeEntrada {
  return codigo !== undefined && codigo in RECUSAS;
}

interface Parametros {
  erro?: string;
  destino?: string;
  metodo?: string;
  email?: string;
}

export default async function PaginaEntrar({
  searchParams,
}: {
  searchParams: Promise<Parametros>;
}) {
  const parametros = await searchParams;
  const destino = caminhoInterno(parametros.destino);
  const recusa = ehRecusa(parametros.erro) ? RECUSAS[parametros.erro] : null;
  const aviso = recusa ? null : (AVISOS[parametros.metodo ?? ''] ?? null);
  const alerta = recusa ?? aviso;

  return (
    <main className="entrar">
      <section className="entrar-cartao" aria-labelledby="entrar-titulo">
        <div className="entrar-marca">
          <Simbolo tamanho={40} />
          <b>Pipe CRM</b>
        </div>

        <h1 id="entrar-titulo">Entrar</h1>
        <p className="entrar-sub">Leads, oportunidades e o funil, alimentados pelas conversas.</p>

        {/* Em ordem de leitura ANTES dos botões, e com título próprio: quem usa
            leitor de tela precisa do motivo antes da ação, não depois dela. */}
        {alerta ? (
          <div className="entrar-alerta" role="alert">
            <h2>{alerta.titulo}</h2>
            <p>{alerta.saida}</p>
          </div>
        ) : null}

        {/* Link, e não botão: entrar com o Google é navegação de topo para outra
            origem. Um `fetch` daqui esbarraria no CORS e não traria o cookie. */}
        <a className="btn primario entrar-google" href={urlDeEntradaComGoogle({ destino })}>
          Entrar com Google
        </a>

        <div className="entrar-ou">
          <span>ou, se a sua empresa usa SSO</span>
        </div>

        <form action={continuar} className="entrar-form">
          <label htmlFor="entrar-email">E-mail corporativo</label>
          <input
            id="entrar-email"
            name="email"
            type="email"
            className="campo"
            required
            autoComplete="email"
            spellCheck={false}
            defaultValue={parametros.email ?? ''}
            aria-describedby="entrar-ajuda"
          />
          <p id="entrar-ajuda" className="entrar-ajuda">
            Levamos você ao provedor de identidade da sua empresa, quando ela tiver um. Não
            guardamos nada nesta etapa.
          </p>
          <input type="hidden" name="destino" value={destino} />
          <button type="submit" className="btn">
            Continuar
          </button>
        </form>

        <p className="entrar-rodape">
          Recebeu um convite? Abra o link que chegou por e-mail — ele entra e cria a sua conta
          no mesmo passo.
        </p>
      </section>
    </main>
  );
}
