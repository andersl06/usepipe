import Link from 'next/link';
import { Icone } from '@pipe/ui';
import { IconePortal } from '../../componentes/icones-portal';
import { IMAGEM, TAMANHO } from './regras-de-nome';

/**
 * As duas peças que o roteador e o fluxo têm IGUAIS — porque na origem elas são
 * o mesmo arquivo, e não duas telas parecidas.
 *
 * ═══ O CASCO (módulo 30189) ═══
 *
 * `auth.application.create` é um estado ABSTRATO: ele desenha o casco e os
 * estados-filhos só preenchem o miolo. O casco é
 * `<bds-theme-provider theme="dark">` envolvendo
 * `#create-application-container`, um `.full-screen-container` de fundo escuro.
 * A barra do portal SOME. Sobram quatro peças, nesta ordem:
 *
 *   1. o "x" (`bds-icon name="close" size="xxx-large"`), absoluto à direita —
 *      a única saída da tela, e Esc faz o mesmo;
 *   2. a marca centrada, 5rem de largura (`logoCenter` é o padrão, e só o
 *      estado `aiagent` o desliga);
 *   3. o `<form>`, que cresce e carrega o passo — aqui são os `children`;
 *   4. o rodapé "Precisa de ajuda…", que aparece em todos os passos das duas
 *      telas (`showFooter` só é falso no `aiagent`).
 *
 * ═══ O PASSO DO NOME (módulo 96904) ═══
 *
 * Um template só, para as duas telas. O que muda são três
 * `ng-if="$ctrl.template != 'master'"` trocando palavra: o sobretítulo, o
 * título e o rótulo do campo. O resto — o círculo da foto, o campo com rótulo
 * flutuante, o contador, os dois botões nas pontas — é byte a byte o mesmo.
 *
 * ═══ O QUE NÃO COPIAMOS, E POR QUÊ ═══
 *
 * Esc para fechar (`$document.on('keydown', 27 → close())`), a
 * pré-visualização da foto escolhida (`<img class="uploaded-img">`) e o contador
 * vivo do campo (`<span counter-for=… ng-maxlength="30">30</span>`, que começa
 * em 30 e desce): as três são estado de cliente, e estas telas não têm nenhum.
 * O "x" continua levando para `/portal`, a foto continua sendo escolhida,
 * enviada e gravada, e o limite continua valendo pelo `maxLength` e pela Server
 * Action. O que falta é só a conferência antes de enviar.
 */

/* Os destinos de fora do rodapé. Vazio = item não desenhado, a mesma regra do
   `URL_AJUDA` do portal: link para página que ainda não existe é pior do que um
   convite a menos. Na origem é `createApplication.needHelpUrl`, a página de
   contato comercial deles. */
const URL_ORCAMENTO = process.env['NEXT_PUBLIC_PIPE_ORCAMENTO_URL'] ?? '';

/* Sem página de orçamento, o pedido vira e-mail para o suporte — o MESMO
   endereço que o menu do "?" do portal usa. O rodapé não some: ele é parte do
   casco na origem, e escondê-lo porque falta uma variável de ambiente tirava da
   tela um pedaço que existe. */
const DESTINO_ORCAMENTO = URL_ORCAMENTO || 'mailto:suporte@usepipe.ai';

/** `createApplication.needHelp` e `createApplication.requestAQuote` — as duas
    frases do rodapé são as mesmas nas duas telas, sem variante por template. */
const RODAPE = {
  precisaDeAjuda: 'Precisa de ajuda para desenvolver o contato inteligente da sua empresa?',
  pecaOrcamento: 'Solicite um orçamento',
} as const;

/** O casco de tela cheia: o "x", a marca, o miolo e o rodapé. */
export function CascoDeCriacao({ children }: { children: React.ReactNode }) {
  return (
    <div className="cr-tela">
      {/* O `close-icon` deles: 40px (`size="xxx-large"`), absoluto à direita,
          a 3rem da borda. `close()` termina em
          `$state.go('auth.application.list')` — aqui, `/portal`. */}
      <Link className="cr-fechar" href="/portal" aria-label="Fechar">
        <Icone nome="x" tamanho={40} />
      </Link>

      {/* A `.logo-image` centrada: 5rem de largura. O lockup é o mesmo
          `.pt-lockup` da barra do portal, que já mede 80px e já é pintado com
          a tinta do cromo. */}
      <Link className="cr-marca" href="/portal" aria-label="Pipe">
        <span className="pt-lockup" role="img" aria-label="Pipe" />
      </Link>

      {children}

      {/* `.create-application-footer`: régua em cima, 1.5rem de recheio,
          54rem de largura, e o pedido de orçamento em negrito. */}
      <footer className="cr-rodape">
        <span>{RODAPE.precisaDeAjuda} </span>
        <a
          href={DESTINO_ORCAMENTO}
          {...(URL_ORCAMENTO ? { target: '_blank', rel: 'noreferrer' } : {})}
        >
          {RODAPE.pecaOrcamento}
        </a>
      </footer>
    </div>
  );
}

/** As palavras que o passo do nome troca entre as duas telas. */
export interface RotulosDoPassoDoNome {
  /** `taglineRouter` ou `tagline` — serve de sobretítulo E de texto do botão. */
  tagline: string;
  /** `name.titleRouter` ou `name.titleScratch`. */
  tituloDoNome: string;
  /** `name.nameRouter` ou `name.name`. */
  rotuloDoNome: string;
  /** `modules.ui.uploadButton.title`. Igual nas duas, mas mora no `ROTULOS`
      de cada tela porque é a lista de palavras da tela. */
  definirImagem: string;
  /** `name.back`. */
  voltar: string;
}

/**
 * `#create-application-name-step`.
 *
 * Coluna centrada: o seletor de imagem 5rem abaixo do título, o campo de 28rem
 * com o rótulo flutuante e, 3rem abaixo, os dois botões nas pontas ("Voltar" à
 * esquerda com seta, e o de criar à direita).
 */
export function PassoDoNome({
  acao,
  voltarPara,
  rotulos,
  tituloDoErro,
  erro,
  nome,
}: {
  acao: (dados: FormData) => Promise<void>;
  voltarPara: string;
  rotulos: RotulosDoPassoDoNome;
  tituloDoErro: string;
  erro?: string;
  nome?: string;
}) {
  return (
    <form className="cr-forma" action={acao}>
      <div className="cr-titulos">
        <h4 className="cr-tagline">{rotulos.tagline}</h4>
        <h2 className="cr-titulo-nome">{rotulos.tituloDoNome}</h2>
      </div>

      <div className="cr-nome">
        {/* O aviso da origem é um `BlipToastService.show('danger', …)` — caixa
            flutuante com título e mensagem. Aqui ele é fixo acima do seletor:
            sem cliente, aviso que some sozinho não some, e aviso que não some
            flutuando tapa o formulário. O título é o mesmo. */}
        {erro ? (
          <p className="cr-aviso" role="alert">
            <b>{tituloDoErro}</b>
            <span>{erro}</span>
          </p>
        ) : null}

        {/* O `<upload-button>` deles: círculo de 150px, tracejado enquanto não
            há arquivo, com o `input[type=file]` cobrindo tudo por baixo. É
            OPCIONAL de verdade — `uploadApplicationImageSafely` engole o erro e
            segue —, e as Server Actions fazem o mesmo. */}
        <label className="cr-foto">
          <input type="file" name="imagem" accept={IMAGEM.aceitos.join(',')} />
          <span>{rotulos.definirImagem}</span>
        </label>

        <div className="cr-campo" data-erro={erro ? '' : undefined}>
          <input
            id="nome"
            name="nome"
            type="text"
            /* O espaço é o que faz `:placeholder-shown` valer: é ele que diz ao
               CSS que o campo está vazio, e é o que põe o rótulo flutuante de
               pé sem uma linha de JavaScript. */
            placeholder=" "
            required
            minLength={TAMANHO.nomeMin}
            maxLength={TAMANHO.nomeMax}
            defaultValue={nome ?? ''}
            autoFocus
          />
          <label htmlFor="nome">{rotulos.rotuloDoNome}</label>
        </div>

        {/* O contador `30` que desce a cada tecla vira este recado fixo: diz o
            mesmo limite sem depender de estado de cliente. */}
        <p className="cr-recado">Até {TAMANHO.nomeMax} caracteres.</p>

        <div className="cr-acoes">
          {/* `backFromNameStep()` volta ao estado ANTERIOR guardado
              (`$ctrl.beforeNameStep`), que é o passo de onde a pessoa veio — o
              convite no roteador, o marketplace no fluxo. O padrão do `$watch`
              deles, quando não há anterior, é justamente
              `auth.application.create.marketplace`.
              `bds-button variant="secondary" icon="arrow-left"`. */}
          <Link className="btn cr-botao" href={voltarPara}>
            <IconePortal nome="esquerda" tamanho={20} />
            {rotulos.voltar}
          </Link>
          <button type="submit" className="btn primario cr-botao">
            {rotulos.tagline}
          </button>
        </div>
      </div>
    </form>
  );
}
