import { ErroPipe } from '../erros.js';

/**
 * Envio de e-mail — o que o convite e o alerta de recategorização de modelo usam.
 *
 * Mesmo desenho de `whatsapp/cliente-graph.ts`: uma interface, um remetente real
 * e um dublê, escolhidos por variável de ambiente (`PIPE_EMAIL_MODO`), com
 * `definirRemetente` para o teste trocar em tempo de execução.
 *
 * **O real é HTTP, não SMTP.** Não há `nodemailer` (nem outro cliente SMTP) no
 * repositório, e esta tarefa não pode instalar pacote. O remetente real fala com
 * um endpoint configurável no formato dos provedores transacionais de hoje —
 * `POST <PIPE_EMAIL_URL>` com `Authorization: Bearer <PIPE_EMAIL_TOKEN>` e o JSON
 * `{ from, to, subject, text, html }`, que é o contrato do Resend
 * (`https://api.resend.com/emails`) e, com URL trocada, o de Postmark/SendGrid com
 * um adaptador mínimo. Quando SMTP direto for necessário, é UMA classe nova aqui,
 * sem mexer em quem chama.
 *
 * **Quem chama nunca cai por causa do e-mail.** `enviarEmailSemDerrubar` é a
 * porta de uso: registra a falha e devolve `false`, como `enfileirarEspelhoCrm`
 * em `filas.ts` — o convite existe e o modelo foi recategorizado com ou sem o
 * aviso, e a resposta já carrega o link/o webhook para o caso de o e-mail não ir.
 */

export interface Email {
  /** Destinatários, já normalizados (minúsculas, sem repetição). */
  para: string[];
  assunto: string;
  /** Corpo em texto puro. É o que vale; `html`, quando vem, é a versão bonita do mesmo texto. */
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

/** `PIPE_EMAIL_REMETENTE`: o `from` de todo e-mail. Sem ele o real não sobe. */
function remetenteDoAmbiente(): { url: string; token: string; de: string; timeoutMs: number } {
  const url = process.env['PIPE_EMAIL_URL'] ?? 'https://api.resend.com/emails';
  const token = process.env['PIPE_EMAIL_TOKEN'] ?? '';
  const de = process.env['PIPE_EMAIL_REMETENTE'] ?? '';
  if (!token || !de) {
    throw new ErroPipe(
      500,
      'email_sem_credencial',
      'Faltam PIPE_EMAIL_TOKEN e PIPE_EMAIL_REMETENTE: sem eles não há como mandar e-mail no modo real.',
    );
  }
  const timeoutMs = Number(process.env['PIPE_EMAIL_TIMEOUT_MS'] ?? 5000);
  return { url, token, de, timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 5000 };
}

/** Tira o token de texto que vai virar mensagem de erro. Mesmo cuidado de `cliente-graph.ts`. */
function esconder(texto: string, segredo: string): string {
  return segredo.length >= 8 ? texto.split(segredo).join('«segredo»') : texto;
}

export class RemetenteHttp extends RemetenteDeEmail {
  readonly nome = 'real' as const;

  /** `buscar` injetável, para o teste exercitar o real sem rede. */
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
      throw new ErroPipe(
        502,
        'email_inacessivel',
        `O provedor de e-mail não respondeu: ${esconder(String((erro as Error)?.message ?? erro), token)}`,
      );
    }
    if (!resposta.ok) {
      const texto = await resposta.text().catch(() => '');
      throw new ErroPipe(
        502,
        'email_recusado',
        `O provedor de e-mail recusou (HTTP ${resposta.status}): ${esconder(texto.slice(0, 200), token)}`,
        { http: resposta.status },
      );
    }
  }
}

/**
 * O dublê: guarda o que "enviou" numa lista compartilhada, como
 * `ClienteGraphDuble.chamadas`. É o padrão fora de produção — e-mail de
 * desenvolvimento indo para uma caixa real é o jeito de convidar gente por engano.
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

/** Troca o remetente em tempo de execução. Existe para o teste. */
export function definirRemetente(novo: RemetenteDeEmail | null): void {
  remetenteAtual = novo;
}

/**
 * Envia sem derrubar quem chamou. Lista vazia é "ninguém para avisar", não erro.
 * `contexto` nomeia o gesto no log (`convite`, `modelo-recategorizado`).
 */
export async function enviarEmailSemDerrubar(email: Email, contexto: string): Promise<boolean> {
  if (email.para.length === 0) return false;
  try {
    await remetente().enviar(email);
    return true;
  } catch (erro) {
    console.error(`[email] não enviou ${contexto} para ${email.para.join(', ')}: ${(erro as Error).message}`);
    return false;
  }
}
