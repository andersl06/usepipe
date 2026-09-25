import { createHash, createHmac } from 'node:crypto';
import { PipeError } from '../../errors.js';
import { modoDaConexao, versaoDaApi } from '../whatsapp/cliente-graph.js';

/** Cliente do Messenger. A API de Página usa o Graph principal, não graph.instagram.com. */
export interface PageMessenger { id?: string; name?: string }
export abstract class ClienteGraphMessenger {
  abstract readonly nome: 'real' | 'duble';
  abstract fetchPage(): Promise<PageMessenger>;
  abstract checkSecretOfApp(secret: string): Promise<boolean>;
  abstract assinarWebhook(pageId: string): Promise<unknown>;
  abstract desassinarWebhook(paginaId: string): Promise<unknown>;
  abstract configurarPerfil(perfil: Record<string, unknown>): Promise<unknown>;
}

function esconder(texto: string, segredo: string): string {
  return segredo.length >= 8 ? texto.split(segredo).join('«segredo»') : texto;
}

export class ClienteGraphMessengerReal extends ClienteGraphMessenger {
  readonly nome = 'real' as const;
  constructor(private readonly token = '', private readonly buscar: typeof fetch = fetch) { super(); }
  private url(caminho: string, query: Record<string, string> = {}): string {
    const url = new URL(`https://graph.facebook.com/${process.env['MESSENGER_API_VERSAO'] ?? versaoDaApi()}/${caminho}`);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    return url.toString();
  }
  private async pedir<T>(caminho: string, init: RequestInit = {}, consulta: Record<string, string> = {}): Promise<T> {
    let resposta: Response;
    try { resposta = await this.buscar(this.url(caminho, consulta), { ...init, headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json', ...init.headers } }); }
    catch (error) { throw new PipeError(502, 'meta_unreachable', esconder(String((error as Error).message), this.token)); }
    const corpo = await resposta.json().catch(() => ({})) as { error?: { message?: string } };
    if (!resposta.ok || corpo.error) throw new PipeError(502, 'meta_refused', esconder(corpo.error?.message ?? `HTTP ${resposta.status}`, this.token));
    return corpo as T;
  }
  fetchPage(): Promise<PageMessenger> { return this.pedir('me', {}, { fields: 'id,name' }); }
  async checkSecretOfApp(segredo: string): Promise<boolean> {
    try { await this.pedir('me', {}, { fields: 'id', appsecret_proof: createHmac('sha256', segredo).update(this.token).digest('hex') }); return true; }
    catch (erro) { if (erro instanceof PipeError && erro.codigo === 'meta_refused') return false; throw erro; }
  }
  assinarWebhook(paginaId: string): Promise<unknown> { return this.pedir(`${paginaId}/subscribed_apps`, { method: 'POST', body: JSON.stringify({ subscribed_fields: ['messages', 'messaging_postbacks', 'messaging_optins'].join(',') }) }); }
  desassinarWebhook(paginaId: string): Promise<unknown> { return this.pedir(`${paginaId}/subscribed_apps`, { method: 'DELETE' }); }
  configurarPerfil(perfil: Record<string, unknown>): Promise<unknown> {
    // conferir com token real: a Página aceita me/messenger_profile com token de página.
    return this.pedir('me/messenger_profile', { method: 'POST', body: JSON.stringify(perfil) });
  }
}

export class ClienteGraphMessengerDuble extends ClienteGraphMessenger {
  readonly nome = 'duble' as const;
  static readonly chamadas: { acao: string; pageId?: string; perfil?: Record<string, unknown> }[] = [];
  static reiniciar(): void { this.chamadas.length = 0; }
  static idOfPage(token: string): string { return `1${BigInt(`0x${createHash('sha256').update(token).digest('hex').slice(0, 14)}`).toString().padStart(16, '0').slice(0, 16)}`; }
  constructor(private readonly token = '') { super(); }
  fetchPage(): Promise<PageMessenger> { ClienteGraphMessengerDuble.chamadas.push({ acao: 'buscar_pagina' }); if (!this.token || this.token.startsWith('invalido')) return Promise.reject(new PipeError(502, 'meta_refused', 'Token inválido.')); const id = ClienteGraphMessengerDuble.idOfPage(this.token); return Promise.resolve({ id, name: 'Página de Ensaio' }); }
  checkSecretOfApp(segredo: string): Promise<boolean> { ClienteGraphMessengerDuble.chamadas.push({ acao: 'conferir_segredo' }); return Promise.resolve(!segredo.startsWith('bad')); }
  assinarWebhook(paginaId: string): Promise<unknown> { ClienteGraphMessengerDuble.chamadas.push({ acao: 'assinar', pageId: paginaId }); return Promise.resolve({ success: true }); }
  desassinarWebhook(paginaId: string): Promise<unknown> { ClienteGraphMessengerDuble.chamadas.push({ acao: 'desassinar', pageId: paginaId }); return Promise.resolve({ success: true }); }
  configurarPerfil(perfil: Record<string, unknown>): Promise<unknown> { ClienteGraphMessengerDuble.chamadas.push({ acao: 'perfil', perfil }); return Promise.resolve({ result: 'success' }); }
}
let fabrica: ((token?: string) => ClienteGraphMessenger) | null = null;
export function clienteGraphMessenger(token?: string): ClienteGraphMessenger { fabrica ??= modoDaConexao() === 'real' ? (t) => new ClienteGraphMessengerReal(t) : (t) => new ClienteGraphMessengerDuble(t); return fabrica(token); }
export function definirFabricaGraphMessenger(nova: ((token?: string) => ClienteGraphMessenger) | null): void { fabrica = nova; }
