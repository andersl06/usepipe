import 'reflect-metadata';
import express from 'express';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import type { Request } from 'express';
import type { Server } from 'node:http';
import { origemPermitida, origensPermitidas } from '@pipe/autenticacao';
import { AppModulo } from './app.modulo.js';
import { MAX_BYTES_POR_ARQUIVO } from '@pipe/armazenamento';
import { fecharBancos } from './banco.js';
import { FiltroDeErro } from './erros.js';
import { ligarCanalDeEventos } from './eventos-ws.js';
import { fecharTempoReal } from './tempo-real.js';
import {
  agendarRenovacaoInstagram,
  agendarVarreduraDicionarioCrm,
  agendarVarreduraDownloadMidia,
  agendarVarreduraEspelhoCrm,
  agendarVarreduraSla,
  consumirRenovacaoInstagram,
  consumirChecagemSla,
  consumirDicionarioCrm,
  consumirDownloadMidia,
  consumirEntrada,
  consumirEspelhoCrm,
  fecharFilas,
} from './filas.js';
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

  // Upload de anexo entra como corpo CRU, e só nesta rota.
  //
  // Antes do `express.json` porque o parser que casa primeiro ganha, e escopado ao
  // caminho porque o teto aqui é de 100 MB — aplicá-lo a tudo transformaria o webhook
  // da Meta numa porta para mandar 100 MB de JSON.
  //
  // Corpo cru, e não multipart: `multipart/form-data` exigiria `multer`, e um upload
  // de UM arquivo cabe inteiro em `POST` com `Content-Type` do próprio arquivo — que
  // é, aliás, a forma do `PUT Object` do S3.
  app.use(
    '/v1/anexos',
    express.raw({ type: () => true, limit: MAX_BYTES_POR_ARQUIVO }),
  );

  // Importação de contatos entra como TEXTO cru (o CSV), e só nesta rota — mesmo
  // raciocínio do anexo: o teto de 20 MB daqui não pode valer para o webhook.
  app.use(
    '/v1/contatos/importacoes',
    express.text({ type: () => true, limit: process.env['PIPE_LIMITE_IMPORTACAO'] ?? '20mb' }),
  );

  // A foto do perfil do WhatsApp vai em base64 no JSON: 5 MB viram ~6,7 MB. Teto
  // próprio, só nesta rota, pelo mesmo motivo dos dois acima.
  app.use('/v1/canais/whatsapp/:id/perfil', express.json({ limit: '8mb' }));

  // O exemplo de mídia do cabeçalho do modelo de mensagem vai do mesmo jeito
  // (base64 no JSON), e o tipo mais pesado é o documento: 100 MB viram ~134 MB.
  // Teto próprio, só nesta rota — `lerMidiaDoCabecalho` recusa por tipo antes.
  app.use(
    '/v1/canais/whatsapp/:id/modelos',
    express.json({ limit: process.env['PIPE_LIMITE_MODELO'] ?? '140mb' }),
  );

  // O desenho do Builder vai inteiro no `PUT` (o mapa do editor, com `$cardContent`
  // de cada bloco): um fluxo de cliente passa fácil de 2 MB. Teto próprio, só aqui.
  app.use(
    '/v1/gestao/fluxos/:id/builder',
    express.json({ limit: process.env['PIPE_LIMITE_BUILDER'] ?? '16mb' }),
  );

  // O `.pfx` do certificado mTLS vai em base64 no JSON, junto da descrição, dos
  // hosts e da SENHA — que por isso não pode ir em querystring nem cabeçalho,
  // onde acabaria em log de proxy; é o que descarta o corpo cru de `/v1/anexos`
  // aqui. Teto de 10 MB do arquivo (regra da origem, conferida de novo em
  // `gestao/certificados.ts`) vira ~13,4 MB de base64.
  app.use(
    '/v1/gestao/contrato/certificados',
    express.json({ limit: process.env['PIPE_LIMITE_CERTIFICADO'] ?? '15mb' }),
  );

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
// 3000, e não 3100: a Gestão roda em 3100, o Desk em 3200 e o CRM em 3300. Com o
// padrão antigo, quem subisse a api antes da Gestão tomava a porta dela, e a
// Gestão morria em EADDRINUSE — que é o que acontecia nesta máquina.
export async function subirApi(porta = Number(process.env['PORT'] ?? 3000)): Promise<ApiNoAr> {
  const app = await criarAplicacao();
  consumirEntrada();
  consumirEspelhoCrm();
  await agendarVarreduraEspelhoCrm();
  consumirDicionarioCrm();
  await agendarVarreduraDicionarioCrm();
  consumirDownloadMidia();
  await agendarVarreduraDownloadMidia();
  consumirChecagemSla();
  await agendarVarreduraSla();
  consumirRenovacaoInstagram();
  await agendarRenovacaoInstagram();
  await app.listen(porta);
  // Depois do `listen`: o canal se pendura no `upgrade` do servidor HTTP que já está
  // no ar, e não abre porta própria. Uma porta só para o Desk, a Gestão e o CRM.
  const canal = ligarCanalDeEventos(app.getHttpServer() as Server);
  const url = (await app.getUrl()).replace('[::1]', '127.0.0.1');
  return {
    url,
    fechar: async () => {
      // O canal primeiro: socket vivo segura o `close` do servidor HTTP e o
      // desligamento pendura até o timeout.
      await canal.fechar();
      await fecharTempoReal();
      await app.close();
      await fecharFilas();
      await fecharBancos();
    },
  };
}
