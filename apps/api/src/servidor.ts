import 'reflect-metadata';
import express from 'express';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import type { Request } from 'express';
import { origemPermitida, origensPermitidas } from '@pipe/autenticacao';
import { AppModulo } from './app.modulo.js';
import { fecharBancos } from './banco.js';
import { FiltroDeErro } from './erros.js';
import { consumirEntrada, fecharFilas } from './filas.js';
import { medirRequisicao } from './metricas.js';

/**
 * Sobe a aplicação Nest.
 *
 * O parser de JSON é montado à mão para guardar o **corpo cru** em `corpoCru`: a
 * assinatura `X-Hub-Signature-256` da Meta é sobre os bytes que chegaram, e
 * reserializar o objeto muda espaço e ordem de chave. Sem isso a assinatura nunca
 * bate e o webhook fica "misteriosamente" recusando tudo.
 */
export async function criarAplicacao(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModulo, { bodyParser: false });

  /**
   * CORS com credencial: a API mora em `api.usepipe.com.br` e as telas em `app.`,
   * `gestao.` e `crm.`. A lista vem de `PIPE_ORIGENS` e **nunca é curinga** — com
   * `credentials: true` o navegador recusa `*`, e mesmo que aceitasse seria abrir a
   * API para qualquer site fazer requisição autenticada em nome de quem está logado.
   */
  const permitidas = origensPermitidas();
  app.enableCors({
    origin: (origem: string | undefined, responder: (erro: Error | null, ok?: boolean) => void) => {
      // Sem `Origin` é chamada que não veio de navegador (curl, o Prometheus, a
      // integração do cliente). O CORS não a governa; a autenticação, sim.
      responder(null, origem === undefined || origemPermitida(origem, permitidas));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['authorization', 'content-type'],
    maxAge: 600,
  });

  // Antes de tudo: o que não casa com rota nenhuma também precisa aparecer no gráfico.
  app.use(medirRequisicao);

  app.use(
    express.json({
      limit: process.env['PIPE_LIMITE_CORPO'] ?? '2mb',
      verify: (requisicao, _resposta, corpo) => {
        (requisicao as Request & { corpoCru?: Buffer }).corpoCru = Buffer.from(corpo);
      },
    }),
  );
  app.useGlobalFilters(new FiltroDeErro());

  return app;
}

export interface ApiNoAr {
  url: string;
  fechar: () => Promise<void>;
}

/** Sobe e escuta. `porta = 0` deixa o sistema escolher — é o que o teste usa. */
export async function subirApi(porta = Number(process.env['PORT'] ?? 3100)): Promise<ApiNoAr> {
  const app = await criarAplicacao();
  consumirEntrada();
  await app.listen(porta);
  const url = (await app.getUrl()).replace('[::1]', '127.0.0.1');
  return {
    url,
    fechar: async () => {
      await app.close();
      await fecharFilas();
      await fecharBancos();
    },
  };
}
