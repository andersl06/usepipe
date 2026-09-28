import Link from '../../components/link';
import { Icone } from '@pipe/ui';
import { IconePortal } from '../../components/icones-portal';
import { APPLICATION } from '../../lib/application-paths';
import { IMAGE, TAMANHO } from './regras-de-nome';

/**
 * The two pieces the router and flow share IDENTICALLY — because in the source they're the same file, not two similar screens. ═══ THE SHELL (module 30189) ═══ `auth.application.create` is an ABSTRACT state: it draws the shell, and the child states only fill in the middle. The shell is a `<bds-theme-provider theme="dark">` wrapping `#create-application-container`, a dark-background `.full-screen-container`. The portal bar DISAPPEARS. Four pieces remain, in this order: 1. the "x" (`bds-icon name="close" size="xxx-large"`), absolute on the right — the screen's only exit, and Esc does the same; 2. the centered logo, 5rem wide (`logoCenter` is the default, and only the `aiagent` state turns it off); 3. the `<form>`, which grows and carries the step — here these are the `children`; 4. the "Precisa de ajuda…" footer, which appears on every step of both screens (`showFooter` is only false in `aiagent`). ═══ THE NAME STEP (module 96904) ═══ A single template for both screens. What changes are three `ng-if="$ctrl.template != 'master'"` swapping a word: the subtitle, the title and the field label. The rest — the photo circle, the field with the floating label, the counter, the two end-to-end buttons — is byte for byte the same. ═══ WHAT WE DIDN'T COPY, AND WHY ═══ Esc to close (`$document.on('keydown', 27 → close())`), the preview of the chosen photo (`<img class="uploaded-img">`), and the field's live counter (`<span counter-for=… ng-maxlength="30">30</span>`, which starts at 30 and counts down): all three are client state, and these screens have none. The "x" still leads to `/application`, the photo is still chosen, uploaded and saved, and the limit is still enforced by `maxLength` and by the Server Action. All that's missing is the check before submitting.
 */

/*
 * The footer's external destinations. Empty = item not drawn, the same rule as the portal's `URL_AJUDA`: a link to a page that doesn't exist yet is worse than one fewer invite. In the source it's `createApplication.needHelpUrl`, their sales contact page.
 */
const URL_BUDGET = (import.meta.env['VITE_PIPE_ORCAMENTO_URL'] as string | undefined) ?? '';

/*
 * With no quote page, the request becomes an email to support — the SAME address the portal's "?" menu uses. The footer doesn't disappear: it's part of the shell in the source, and hiding it because an environment variable is missing would remove a piece of the screen that exists.
 */
const DESTINATION_BUDGET = URL_BUDGET || 'mailto:suporte@usepipe.ai';

/**
 * `createApplication.needHelp` and `createApplication.requestAQuote` — the footer's two phrases are the same on both screens, with no per-template variant.
 */
const RODAPE = {
  precisaDeAjuda: 'Precisa de ajuda para desenvolver o contato inteligente da sua empresa?',
  pecaOrcamento: 'Solicite um orçamento',
} as const;

/** The full-screen shell: the "x", the logo, the middle, and the footer. */
export function CreationShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="cr-tela">
      {/*
 * Their `close-icon`: 40px (`size="xxx-large"`), absolute on the right, 3rem from the edge. `close()` ends at `$state.go('auth.application.list')` — here, `/application`.
 */}
      <Link className="cr-fechar" href={APPLICATION} aria-label="Fechar">
        <Icone nome="x" tamanho={40} />
      </Link>

      {/*
 * The centered `.logo-image`: 5rem wide. The lockup is the same `.pt-lockup` from the portal bar, which is already 80px and already painted with the chrome's ink.
 */}
      <Link className="cr-marca" href={APPLICATION} aria-label="Pipe">
        <span className="pt-lockup" role="img" aria-label="Pipe" />
      </Link>

      {children}

      {/*
 * `.create-application-footer`: a divider on top, 1.5rem padding, 54rem wide, and the quote request in bold.
 */}
      <footer className="cr-rodape">
        <span>{RODAPE.precisaDeAjuda} </span>
        <a
          href={DESTINATION_BUDGET}
          {...(URL_BUDGET ? { target: '_blank', rel: 'noreferrer' } : {})}
        >
          {RODAPE.pecaOrcamento}
        </a>
      </footer>
    </div>
  );
}

/** As palavras que o passo do nome troca entre as duas telas. */
export interface RotulosDoPassoDoNome {
  /** `taglineRouter` or `tagline` — used as both the subtitle and the button text. */
  tagline: string;
  /** `name.titleRouter` ou `name.titleScratch`. */
  tituloDoNome: string;
  /** `name.nameRouter` ou `name.name`. */
  rotuloDoNome: string;
  /**
   * `modules.ui.uploadButton.title`. The same in both, but lives in each screen's `ROTULOS` because that's the screen's word list.
   */
  setImage: string;
  /** `name.back`. */
  voltar: string;
}

/**
 * `#create-application-name-step`. A centered column: the image picker 5rem below the title, the 28rem field with the floating label and, 3rem below, the two buttons at the ends ("Voltar" on the left with an arrow, and the create button on the right).
 */
export function PassoDoNome({
  acao,
  voltarPara,
  rotulos,
  errorTitle,
  error,
  nome,
  camposOcultos,
}: {
  acao: (data: FormData) => Promise<void>;
  voltarPara: string;
  rotulos: RotulosDoPassoDoNome;
  errorTitle: string;
  error?: string;
  nome?: string;
  /**
   * Fields the previous step needs to forward via POST — today only the flow marketplace's `template`, so an error return remembers where the person came from. No counterpart in the source: there the template lives in `ui-router` state, not in the form.
   */
  camposOcultos?: Record<string, string>;
}) {
  return (
    <form className="cr-forma" action={acao}>
      <div className="cr-titulos">
        <h4 className="cr-tagline">{rotulos.tagline}</h4>
        <h2 className="cr-titulo-nome">{rotulos.tituloDoNome}</h2>
      </div>

      <div className="cr-nome">
        {camposOcultos
          ? Object.entries(camposOcultos).map(([campo, value]) => (
              <input key={campo} type="hidden" name={campo} value={value} />
            ))
          : null}

        {/*
 * The source's warning is a `BlipToastService.show('danger', …)` — a floating box with a title and message. Here it's fixed above the picker: with no client, a warning that disappears on its own doesn't disappear, and a warning that stays floating would cover the form. The title is the same.
 */}
        {error ? (
          <p className="cr-aviso" role="alert">
            <b>{errorTitle}</b>
            <span>{error}</span>
          </p>
        ) : null}

        {/*
 * Their `<upload-button>`: a 150px circle, dashed while there's no file, with the `input[type=file]` covering everything underneath. It's genuinely OPTIONAL — `uploadApplicationImageSafely` swallows the error and moves on —, and the Server Actions do the same.
 */}
        <label className="cr-foto">
          <input type="file" name="imagem" accept={IMAGE.aceitos.join(',')} />
          <span>{rotulos.setImage}</span>
        </label>

        <div className="cr-campo" data-error={error ? '' : undefined}>
          <input
            id="nome"
            name="nome"
            type="text"
            /*
             * The space is what makes `:placeholder-shown` work: it's what tells CSS the field is empty, and what makes the floating label stand up without a line of JavaScript.
             */
            placeholder=" "
            required
            minLength={TAMANHO.nomeMin}
            maxLength={TAMANHO.nomeMax}
            defaultValue={nome ?? ''}
            autoFocus
          />
          <label htmlFor="nome">{rotulos.rotuloDoNome}</label>
        </div>

        {/*
 * The `30` counter that counts down with every keystroke becomes this fixed note: it states the same limit without depending on client state.
 */}
        <p className="cr-recado">Até {TAMANHO.nomeMax} caracteres.</p>

        <div className="cr-actions">
          {/*
 * `backFromNameStep()` returns to the PREVIOUS saved state (`$ctrl.beforeNameStep`), which is the step the person came from — the invite in the router, the marketplace in the flow. Their `$watch` default, when there's no previous state, is exactly `auth.application.create.marketplace`. `bds-button variant="secondary" icon="arrow-left"`.
 */}
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
