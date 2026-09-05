import { Module } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { GuardaChaveApi } from './autenticacao.js';
import { ControladorConversas } from './controladores/conversas.js';
import {
  ControladorAtendentes,
  ControladorContatos,
  ControladorFilas,
} from './controladores/catalogo.js';
import { ControladorWebhookWhatsApp } from './controladores/webhooks-whatsapp.js';

/**
 * Módulo raiz.
 *
 * Sem injeção por tipo de construtor de propósito: os controladores chamam funções
 * de domínio direto, como o Desk faz com `servidor/consultas.ts`. Isso dispensa
 * `emitDecoratorMetadata`, que brigaria com o `verbatimModuleSyntax` do tsconfig da
 * base, e deixa toda regra testável sem subir o Nest.
 *
 * O guarda é registrado como valor pronto pelo mesmo motivo.
 */
@Module({
  controllers: [
    ControladorWebhookWhatsApp,
    ControladorConversas,
    ControladorContatos,
    ControladorFilas,
    ControladorAtendentes,
  ],
  providers: [{ provide: APP_GUARD, useValue: new GuardaChaveApi(new Reflector()) }],
})
export class AppModulo {}
