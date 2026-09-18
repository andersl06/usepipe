import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { RecusaDeEntrada } from '@pipe/contracts';
import { caminhoInterno, descobrirEntrada, urlDeEntradaComGoogle, urlNaApi } from '../lib/entrada';
import { FundoPipe } from './fundo-pipe';

/**
 * A tela de entrada do Desk — copiada de `apps/gestao-vite/src/paginas/entrar.tsx`
 * (a tela de entrada é a da Gestão; só o título muda: "Entrar no Pipe Desk").
 * A descoberta é feita do navegador (o Vite faz o proxy em desenvolvimento; em
 * produção a origem deste app está em `PIPE_ORIGENS`).
 *
 * Duas regras a moldam:
 *
 * 1. **Nada de tenant aqui.** Quem chega nesta tela não está logado, então ela
 *    não sabe (e não pode contar) qual empresa usa o Pipe.
 * 2. **Cada recusa tem uma SAÍDA, não um "não autorizado".** Os sete códigos de
 *    `RECUSAS_DE_ENTRADA` chegam em `?erro=` e cada um manda a pessoa para um
 *    lugar diferente.
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
  google: {
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

function ehRecusa(codigo: string | null): codigo is RecusaDeEntrada {
  return codigo !== null && codigo in RECUSAS;
}

export function PaginaEntrar() {
  const [parametros, setParametros] = useSearchParams();
  const destino = caminhoInterno(parametros.get('destino'));
  const [email, setEmail] = useState(parametros.get('email') ?? '');
  const [enviando, setEnviando] = useState(false);

  const erro = parametros.get('erro');
  const recusa = ehRecusa(erro) ? RECUSAS[erro] : null;
  const aviso = recusa ? null : (AVISOS[parametros.get('metodo') ?? ''] ?? null);
  const alerta = recusa ?? aviso;

  /** O e-mail decide o caminho: IdP da empresa, ou o Google. */
  async function continuar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setEnviando(true);
    const entrada = await descobrirEntrada(email.trim());
    if (entrada.metodo === 'sso' && entrada.irPara) {
      window.location.assign(urlNaApi(entrada.irPara, destino));
      return;
    }
    // Sem SSO, a pessoa fica na mesma tela com o motivo e o e-mail já digitado.
    const volta = new URLSearchParams({ metodo: entrada.metodo, email: email.trim() });
    if (destino !== '/') volta.set('destino', destino);
    setParametros(volta, { replace: true });
    setEnviando(false);
  }

  return (
    <main className="entrar">
      {/* A entrada tem letra própria — é a única tela do produto que não usa a do aplicativo. */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&display=swap"
      />
      <FundoPipe />

      <div className="entrar-palco">
        <section className="entrar-cartao" aria-labelledby="entrar-titulo">
          <img className="entrar-lockup" src="/pipe/lockup.svg" alt="Pipe" />
          <h1 id="entrar-titulo" className="entrar-titulo-oculto">
            Entrar no Pipe Desk
          </h1>

          {alerta ? (
            <div className="entrar-alerta" role="alert">
              <h2>{alerta.titulo}</h2>
              <p>{alerta.saida}</p>
            </div>
          ) : null}

          {/* Link, e não botão: entrar com o Google é navegação de topo para a `api`. */}
          <a className="entrar-google" href={urlDeEntradaComGoogle({ destino })}>
            <LogoGoogle />
            <span>Entrar com Google</span>
          </a>

          <div className="entrar-ou">
            <span />
            <span className="entrar-ou-texto">ou</span>
            <span />
          </div>

          <form onSubmit={continuar}>
            <label htmlFor="entrar-email">E-mail</label>
            <input
              id="entrar-email"
              name="email"
              type="email"
              required
              autoComplete="email"
              spellCheck={false}
              placeholder="voce@empresa.com.br"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-describedby="entrar-ajuda"
            />

            {/* O campo de senha do desenho. Sem `name`: o Pipe ainda não tem entrada
                por senha, e a senha digitada não sai desta página.
                ponytail: ganha `name` no dia em que a API aceitar senha. */}
            <label htmlFor="entrar-senha">Senha</label>
            <input
              id="entrar-senha"
              type="password"
              placeholder="••••••••"
              autoComplete="current-password"
              aria-describedby="entrar-ajuda"
            />

            <div className="entrar-esqueci">
              <a href="mailto:suporte@usepipe.com.br">Esqueci minha senha</a>
            </div>

            <p id="entrar-ajuda" className="entrar-ajuda">
              Levamos você ao provedor de identidade da sua empresa, quando ela tiver um.
            </p>
            <button type="submit" disabled={enviando}>
              Entrar
            </button>
          </form>

          <div className="entrar-pe">
            <span>Primeiro acesso?</span>
            <a href="mailto:suporte@usepipe.com.br">Falar com o suporte</a>
          </div>
        </section>
      </div>
    </main>
  );
}

/** O "G" oficial, inline: a tela de entrada não depende de rede de terceiro. */
function LogoGoogle() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden focusable="false">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}
