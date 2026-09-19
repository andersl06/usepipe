import { Module } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { GuardaChaveApi } from './autenticacao.js';
import { GuardaSessao } from './sessao.js';
import { ControladorAnexos } from './controladores/anexos.js';
import { ControladorCanais } from './controladores/canais.js';
import { ControladorConversas } from './controladores/conversas.js';
import { ControladorCrm } from './controladores/crm.js';
import { ControladorDesk } from './controladores/desk.js';
import {
  ControladorAtendentes,
  ControladorContatos,
  ControladorFilas,
} from './controladores/catalogo.js';
import { ControladorConvites, ControladorDominios } from './controladores/convites.js';
import { ControladorEntrada, ControladorEu } from './controladores/entrar.js';
import { ControladorGestaoAnalise } from './controladores/gestao-analise.js';
import { ControladorGestaoCadastros } from './controladores/gestao-cadastros.js';
import { ControladorGestaoConta } from './controladores/gestao-conta.js';
import { ControladorGestaoFluxo } from './controladores/gestao-fluxo.js';
import { ControladorGestaoOperacao } from './controladores/gestao-operacao.js';
import { ControladorMinhaConta } from './controladores/minha-conta.js';
import { ControladorImportacoesDeContatos } from './controladores/importacoes.js';
import { ControladorContas } from './controladores/contas.js';
import { ControladorMensagensAtivas } from './controladores/mensagens-ativas.js';
import { ControladorOperacao } from './controladores/operacao.js';
import { ControladorConexaoSso, ControladorEntradaSso } from './controladores/sso.js';
import { ControladorWebhookWhatsApp } from './controladores/webhooks-whatsapp.js';
import { ControladorWebhookInstagram } from './controladores/webhooks-instagram.js';
import { ControladorCanaisInstagram } from './controladores/canais-instagram.js';

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
    ControladorWebhookInstagram,
    ControladorEntrada,
    ControladorEntradaSso,
    ControladorEu,
    ControladorMinhaConta,
    ControladorGestaoFluxo,
    ControladorGestaoAnalise,
    ControladorGestaoOperacao,
    ControladorGestaoCadastros,
    ControladorGestaoConta,
    ControladorDesk,
    ControladorConexaoSso,
    ControladorConvites,
    ControladorDominios,
    ControladorOperacao,
    ControladorConversas,
    ControladorMensagensAtivas,
    ControladorCrm,
    ControladorAnexos,
    ControladorCanais,
    ControladorCanaisInstagram,
    ControladorContatos,
    ControladorFilas,
    ControladorAtendentes,
    ControladorImportacoesDeContatos,
    ControladorContas,
  ],
  providers: [
    { provide: APP_GUARD, useValue: new GuardaChaveApi(new Reflector()) },
    { provide: APP_GUARD, useValue: new GuardaSessao(new Reflector()) },
  ],
})
export class AppModulo {}
