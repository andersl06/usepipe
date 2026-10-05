import 'reflect-metadata';
import express from 'express';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import type { Request } from 'express';
import type { Server } from 'node:http';
import { origemPermitida, origensPermitidas } from '@pipe/authentication';
import { AppModulo } from './app.modulo.js';
import { MAX_BYTES_BY_FILE } from '@pipe/storage';
import { fecharBancos } from './database.js';
import { ErrorFilter } from './errors.js';
import { connectChannelOfEvents } from './eventos-ws.js';
import { closeRealtime } from './realtime.js';
import {
  scheduleRenewalInstagram,
  scheduleSweepDictionaryCrm,
  scheduleSweepDownloadMedia,
  scheduleSweepMirrorCrm,
  scheduleSweepSla,
  consumeAutoClose,
  scheduleAutoClose,
  scheduleSweepProcessHttp,
  consumeRenewalInstagram,
  consumeCheckSla,
  consumeDictionaryCrm,
  consumeDownloadMedia,
  consumeInbound,
  consumirProcessHttp,
  consumeSweepProcessHttp,
  consumeMirrorCrm,
  closeQueues,
} from './queues.js';
import { measureRequest } from './metrics.js';
import { logRequests } from './request-log.js';
import { assertTenantDomainConfig } from './tenant-domain-config.js';
import { closeDelayedJobs, consumeDelayedJobs, scheduleSweepDelayedJobs } from './delayed-jobs.js';
import { registerScheduledMessages } from './domain/scheduled-messages.js';
import { registerInputExpirations } from './domain/input-expiration-job.js';

/**
 * Start Nest with a custom JSON parser that preserves raw request bytes in `corpoCru`. Meta signs those bytes with `X-Hub-Signature-256`; reserializing parsed JSON can change spacing or key order and make valid webhooks fail signature verification.
 */
export async function createApplication(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModulo, { bodyParser: false });

  // First in the chain so every request leaves a trace, including those refused by CORS or by a later parser.
  app.use(logRequests());

  /**
   * Credentialed CORS uses fixed `PIPE_ORIGENS` plus strictly validated tenant hosts. Never wildcard it: browsers reject `*` with `credentials: true`, and allowing arbitrary origins would expose authenticated requests from signed-in users.
   */
  const permitidas = origensPermitidas();
  app.enableCors({
    origin: (origem: string | undefined, responder: (error: Error | null, ok?: boolean) => void) => {
      // A request without `Origin` is not from a browser, for example curl, Prometheus, or a customer integration. CORS does not govern it; authentication still does.
      responder(null, origem === undefined || origemPermitida(origem, permitidas));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['authorization', 'content-type'],
    maxAge: 600,
  });

  // Measure unmatched routes too so they appear in metrics.
  app.use(measureRequest);

  // Accept raw attachment uploads only on this route.
  //
  // Register this parser before `express.json` because the first matching parser wins. Scope its 100 MB limit to the attachment route; applying it globally would expand the webhook's allowed body size.
  // da Meta numa porta para mandar 100 MB de JSON.
  //
  // Use one raw POST body with the file's own `Content-Type`, as S3 `PUT Object` does. Multipart would require `multer` for a single file. This avoids `multipart/form-data`.
  app.use(
    '/v1/attachments',
    express.raw({ type: () => true, limit: MAX_BYTES_BY_FILE }),
  );

  // Accept the contact-import CSV as raw text only on this route. Its 20 MB limit must not apply to webhooks.
  app.use(
    '/v1/contacts/imports',
    express.text({ type: () => true, limit: process.env['PIPE_LIMITE_IMPORTACAO'] ?? '20mb' }),
  );

  // A foto do perfil do WhatsApp vai em base64 no JSON: 5 MB viram ~6,7 MB. Teto
  // A WhatsApp profile photo is base64 in JSON: 5 MB expands to about 6.7 MB. Give this route its own limit, as for attachment and import uploads.
  app.use('/v1/channels/whatsapp/:id/profile', express.json({ limit: '8mb' }));

  // Template header sample media is base64 in JSON. A 100 MB document grows to roughly 134 MB; give this route its own limit after `lerMidiaDoCabecalho` validates type.
  app.use(
    '/v1/channels/whatsapp/:id/templates',
    express.json({ limit: process.env['PIPE_LIMITE_MODELO'] ?? '140mb' }),
  );

  // O desenho do Builder vai inteiro no `PUT` (o mapa do editor, com `$cardContent`
  // Send the entire Builder graph in `PUT`, including each block's `$cardContent`. A customer flow can exceed 2 MB, so this route has its own limit.
  app.use(
    '/v1/management/flows/:id/builder',
    express.json({ limit: process.env['PIPE_LIMITE_BUILDER'] ?? '16mb' }),
  );

  // Send the mTLS `.pfx`, description, hosts, and password as JSON body. Never use query strings or headers, which proxy logs may capture; this also rules out the raw body pattern used by `/v1/anexos`. A 10 MB certificate file limit (`gestao/certificados.ts`) expands to about 13.4 MB in base64.
  // aqui. Teto de 10 MB do arquivo (regra da origem, conferida de novo em
  // `gestao/certificados.ts`) vira ~13,4 MB de base64.
  app.use(
    '/v1/management/contract/certificates',
    express.json({ limit: process.env['PIPE_LIMITE_CERTIFICADO'] ?? '15mb' }),
  );

  app.use(
    express.json({
      limit: process.env['PIPE_LIMITE_CORPO'] ?? '2mb',
      verify: (request, _resposta, corpo) => {
        (request as Request & { corpoCru?: Buffer }).corpoCru = Buffer.from(corpo);
      },
    }),
  );
  app.useGlobalFilters(new ErrorFilter());

  return app;
}

export interface ApiNoAr {
  url: string;
  fechar: () => Promise<void>;
}

/** Start listening; port 0 lets the OS choose, as tests require. Tests pass `porta = 0`. */
// Use 3000 rather than 3100: Management uses 3100, Desk 3200, and CRM 3300. The old API default could take Management's port first and make it fail with EADDRINUSE.
export async function upApi(porta = Number(process.env['PORT'] ?? 3000)): Promise<ApiNoAr> {
  assertTenantDomainConfig();
  const app = await createApplication();
  consumeInbound();
  consumirProcessHttp();
  consumeSweepProcessHttp();
  await scheduleSweepProcessHttp();
  consumeMirrorCrm();
  await scheduleSweepMirrorCrm();
  consumeDictionaryCrm();
  await scheduleSweepDictionaryCrm();
  consumeDownloadMedia();
  await scheduleSweepDownloadMedia();
  consumeCheckSla();
  await scheduleSweepSla();
  consumeAutoClose();
  await scheduleAutoClose();
  consumeRenewalInstagram();
  await scheduleRenewalInstagram();
  registerScheduledMessages();
  registerInputExpirations();
  consumeDelayedJobs();
  await scheduleSweepDelayedJobs();
  await app.listen(porta);
  // Attach realtime to the existing HTTP server's `upgrade` after `listen`; do not open another port. One API port serves Desk, Management, and CRM.
  const channel = connectChannelOfEvents(app.getHttpServer() as Server);
  const url = (await app.getUrl()).replace('[::1]', '127.0.0.1');
  return {
    url,
    fechar: async () => {
      // O canal primeiro: socket vivo segura o `close` do servidor HTTP e o
      // Close the event channel first: a live socket keeps HTTP server `close` waiting and can stall shutdown until timeout.
      await channel.fechar();
      await closeRealtime();
      await app.close();
      await closeQueues();
      await closeDelayedJobs();
      await fecharBancos();
    },
  };
}
