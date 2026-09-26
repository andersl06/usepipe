import { PipeError } from '../errors.js';

/**
 * Email sending for invitations and template recategorization alerts follows `whatsapp/cliente-graph.ts`: one interface, real and double senders selected by `PIPE_EMAIL_MODO`, and `definirRemetente` for test injection. The real sender uses HTTP, not SMTP: no `nodemailer` client is installed. It posts `{ from, to, subject, text, html }` to configurable `POST <PIPE_EMAIL_URL>` with `Authorization: Bearer <PIPE_EMAIL_TOKEN>`, matching Resend (`https://api.resend.com/emails`); Postmark or SendGrid would need a small adapter, and direct SMTP another sender class. Callers use `enviarEmailSemDerrubar`: it logs failure and returns `false`, as `enfileirarEspelhoCrm` does in `filas.ts`. Invitations and recategorization succeed even if notification fails; the response contains the link or webhook fallback.
 */

export interface Email {

  para: string[];
  assunto: string;
  /** Plain text is authoritative; optional `html` is a styled rendering of the same content. */
  texto: string;
  html?: string;
}

export function modoDoEmail(): 'real' | 'duble' {
  return process.env['PIPE_EMAIL_MODO'] === 'real' ? 'real' : 'duble';
}

export abstract class RemetenteDeEmail {
  abstract readonly nome: 'real' | 'duble';
  abstract enviar(email: Email): Promise<void>;
}

/** `PIPE_EMAIL_REMETENTE` supplies every email's `from`; the real sender refuses to start without it. */
function remetenteDoAmbiente(): { url: string; token: string; de: string; timeoutMs: number } {
  const url = process.env['PIPE_EMAIL_URL'] ?? 'https://api.resend.com/emails';
  const token = process.env['PIPE_EMAIL_TOKEN'] ?? '';
  const de = process.env['PIPE_EMAIL_REMETENTE'] ?? '';
  if (!token || !de) {
    throw new PipeError(
      500,
      'email_without_credential',
      'Faltam PIPE_EMAIL_TOKEN e PIPE_EMAIL_REMETENTE: sem eles não há como mandar e-mail no modo real.',
    );
  }
  const timeoutMs = Number(process.env['PIPE_EMAIL_TIMEOUT_MS'] ?? 5000);
  return { url, token, de, timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 5000 };
}

/** Tira o token de texto que vai virar mensagem de erro. Mesmo cuidado de `cliente-graph.ts`. */
function esconder(texto: string, secret: string): string {
  return secret.length >= 8 ? texto.split(secret).join('«segredo»') : texto;
}

export class RemetenteHttp extends RemetenteDeEmail {
  readonly nome = 'real' as const;

  /** Inject `buscar` so tests exercise the real sender without network access. */
  constructor(private readonly buscar: typeof fetch = fetch) {
    super();
  }

  async enviar(email: Email): Promise<void> {
    const { url, token, de, timeoutMs } = remetenteDoAmbiente();
    let resposta: Response;
    try {
      resposta = await this.buscar(url, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          from: de,
          to: email.para,
          subject: email.assunto,
          text: email.texto,
          ...(email.html ? { html: email.html } : {}),
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (erro) {
      throw new PipeError(
        502,
        'email_unreachable',
        `O provedor de e-mail não respondeu: ${esconder(String((erro as Error)?.message ?? erro), token)}`,
      );
    }
    if (!resposta.ok) {
      const texto = await resposta.text().catch(() => '');
      throw new PipeError(
        502,
        'email_refused',
        `O provedor de e-mail recusou (HTTP ${resposta.status}): ${esconder(texto.slice(0, 200), token)}`,
        { http: resposta.status },
      );
    }
  }
}

/**
 * The test double records what it "sent" in a shared list, like `ClienteGraphDuble.chamadas`. Keep it as the nonproduction default so development email cannot accidentally invite real people.
 */
export class RemetenteDuble extends RemetenteDeEmail {
  readonly nome = 'duble' as const;

  static readonly enviados: Email[] = [];

  static reiniciar(): void {
    RemetenteDuble.enviados.length = 0;
  }

  enviar(email: Email): Promise<void> {
    RemetenteDuble.enviados.push({ ...email, para: [...email.para] });
    return Promise.resolve();
  }
}

let remetenteAtual: RemetenteDeEmail | null = null;

export function remetente(): RemetenteDeEmail {
  remetenteAtual ??= modoDoEmail() === 'real' ? new RemetenteHttp() : new RemetenteDuble();
  return remetenteAtual;
}


export function definirRemetente(novo: RemetenteDeEmail | null): void {
  remetenteAtual = novo;
}

/**
 * Send email without failing the caller. An empty recipient list means nobody to notify, not an error. `contexto` labels the operation in logs (`convite`, `modelo-recategorizado`).
 */
export async function enviarEmailSemDerrubar(email: Email, context: string): Promise<boolean> {
  if (email.para.length === 0) return false;
  try {
    await remetente().enviar(email);
    return true;
  } catch (error) {
    console.error(`[email] não enviou ${context} para ${email.para.join(', ')}: ${(error as Error).message}`);
    return false;
  }
}
