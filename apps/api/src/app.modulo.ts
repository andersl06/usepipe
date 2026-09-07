import { Module } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { GuardaChaveApi } from './autenticacao.js';
import { GuardaSessao } from './sessao.js';
import { ControladorConversas } from './controladores/conversas.js';
import {
  ControladorAtendentes,
  ControladorContatos,
  ControladorFilas,
} from './controladores/catalogo.js';
import { ControladorEntrada, ControladorEu } from './controladores/entrar.js';
import { ControladorOperacao } from './controladores/operacao.js';
import { ControladorWebhookWhatsApp } from './controladores/webhooks-whatsapp.js';

/**
 * Módulo raiz.
 *
 * Sem injeção por tipo de construtor de propósito: os controladores chamam funções
 * de domínio direto, como o Desk faz com `servidor/consultas.ts`. Isso dispensa
 * `emitDecoratorMetadata`, que brigaria com o `verbatimModuleSyntax` do tsconfig da
 * base, e deixa toda regra testável sem subir o Nest.
 *
 * Os guardas são registrados como valor pronto pelo mesmo motivo. São DOIS, e cada um
 * cuida do que está marcado: `@Escopos(...)` é chave de API (integração), `@ComSessao()`
 * é cookie de navegador (as telas). Rota sem marca nenhuma é pública de propósito —
 * o webhook da Meta, que se autentica pela assinatura, e `/saude`.
 */
@Module({
  controllers: [
    ControladorWebhookWhatsApp,
    ControladorEntrada,
    ControladorEu,
    ControladorOperacao,
    ControladorConversas,
    ControladorContatos,
    ControladorFilas,
    ControladorAtendentes,
  ],
  providers: [
    { provide: APP_GUARD, useValue: new GuardaChaveApi(new Reflector()) },
    { provide: APP_GUARD, useValue: new GuardaSessao(new Reflector()) },
  ],
})
export class AppModulo {}
