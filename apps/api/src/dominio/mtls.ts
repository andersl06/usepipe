import https from 'node:https';
import { sql } from 'drizzle-orm';
import { decifrar } from '@pipe/db';
import { chaveiro, noTenant } from '../banco.js';

/**
 * mTLS de saída: a Pipe apresenta o certificado do cliente quando ELA chama os
 * endereços dele.
 *
 * É o que a origem faz com o que a tela `/mtls` cadastra
 * (`docs/pesquisa/blip-certificados-mtls.md`): o `.pfx` fica associado a
 * `hosts`, e quando a plataforma chama um desses hosts apresenta o certificado
 * (autenticação mútua). Não é a Pipe exigindo certificado de ninguém — é a Pipe
 * como CLIENTE TLS.
 *
 * Quem usa: a entrega dos webhooks de saída (`webhooks-saida.ts`, via
 * `chamarComMtls`) e o botão "Testar" da tela de Integrações. A futura ação de
 * chamada externa do Builder (`ProcessHttp`, que o motor de `dominio/fluxo.ts`
 * hoje não executa) entra pelo mesmo `chamarComMtls(tenantId, url, ...)`.
 *
 * **Casamento por host.** O cadastro guarda URLs (`https://api.cliente.com.br`,
 * `https://api.cliente.com.br:8443/x`); o que casa é `hostname` + porta, o
 * caminho é ignorado — um certificado é da máquina, não da rota. Host sem
 * certificado = chamada normal. Dois certificados para o mesmo host: vale o
 * cadastrado por último.
 *
 * **Cache.** O índice de hosts de cada tenant vive `TTL_INDICE_MS` em memória
 * e o `https.Agent` (que carrega o `.pfx` decifrado) vive por certificado até
 * `esquecerCertificadosMtls` — chamado por quem cadastra/exclui em
 * `gestao/certificados.ts`. Certificado não é editável (só criado e excluído),
 * então um agente por id nunca fica com conteúdo velho; a invalidação só
 * precisa tirá-lo do mapa. Com mais de uma instância da api, o TTL curto é o
 * que limita o atraso de quem não recebeu a invalidação.
 *
 * O `.pfx` decifrado só existe dentro do `Agent`; nunca em log.
 */

const TTL_INDICE_MS = Number(process.env['PIPE_MTLS_TTL_INDICE_MS'] ?? 60_000);

interface HostComCertificado {
  certificadoId: string;
  hostname: string;
  /** `''` = porta padrão (443), como `URL.port`. */
  porta: string;
}

interface IndiceDoTenant {
  lidoEm: number;
  hosts: HostComCertificado[];
}

const indicePorTenant = new Map<string, IndiceDoTenant>();
const agentePorCertificado = new Map<string, https.Agent>();

/** Uma URL cadastrada em `certificado_mtls_host` vira `hostname` + porta; inválida (não devia existir) é ignorada. */
function hostDe(certificadoId: string, url: string): HostComCertificado | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return null;
    return { certificadoId, hostname: u.hostname, porta: u.port };
  } catch {
    return null;
  }
}

async function indiceDe(tenantId: string): Promise<IndiceDoTenant> {
  const guardado = indicePorTenant.get(tenantId);
  if (guardado && Date.now() - guardado.lidoEm < TTL_INDICE_MS) return guardado;

  const linhas = await noTenant(tenantId, async (tx) => {
    const { rows } = await tx.execute<{ certificado_id: string; host: string }>(sql`
      select h.certificado_id, h.host
        from certificado_mtls_host h
        join certificado_mtls c on c.id = h.certificado_id
       where c.tenant_id = ${tenantId}::uuid
         and c.arquivo_cifrado is not null
       order by c.criado_em desc, h.criado_em asc
    `);
    return rows;
  });
  const hosts: HostComCertificado[] = [];
  for (const linha of linhas) {
    const host = hostDe(linha.certificado_id, linha.host);
    if (host) hosts.push(host);
  }

  // Agente de certificado que sumiu do índice (excluído em outra instância,
  // ou entre um TTL e outro) morre aqui, junto com os sockets dele.
  if (guardado) {
    const vivos = new Set(hosts.map((h) => h.certificadoId));
    for (const antigo of guardado.hosts) {
      if (!vivos.has(antigo.certificadoId)) descartarAgente(antigo.certificadoId);
    }
  }

  const indice = { lidoEm: Date.now(), hosts };
  indicePorTenant.set(tenantId, indice);
  return indice;
}

function descartarAgente(certificadoId: string): void {
  const agente = agentePorCertificado.get(certificadoId);
  if (!agente) return;
  agente.destroy();
  agentePorCertificado.delete(certificadoId);
}

async function agenteDoCertificado(tenantId: string, certificadoId: string): Promise<https.Agent | null> {
  const guardado = agentePorCertificado.get(certificadoId);
  if (guardado) return guardado;

  const linha = await noTenant(tenantId, async (tx) => {
    const { rows } = await tx.execute<{ arquivo_cifrado: string | null; senha_cifrada: string | null }>(sql`
      select arquivo_cifrado, senha_cifrada from certificado_mtls
       where id = ${certificadoId}::uuid and tenant_id = ${tenantId}::uuid
       limit 1
    `);
    return rows[0] ?? null;
  });
  if (!linha?.arquivo_cifrado || !linha.senha_cifrada) return null;

  // Decifrado aqui e entregue ao Agent; `decifrar` lança `SegredoErro` se a
  // chave saiu do chaveiro — e a entrega registra o erro como qualquer outro.
  const chaves = chaveiro();
  const agente = new https.Agent({
    pfx: Buffer.from(decifrar(linha.arquivo_cifrado, chaves), 'base64'),
    passphrase: decifrar(linha.senha_cifrada, chaves),
    keepAlive: true,
  });
  agentePorCertificado.set(certificadoId, agente);
  return agente;
}

/**
 * O `https.Agent` com o certificado do cliente para esta URL, ou `null` quando
 * o host não tem certificado (ou a URL não é HTTPS): aí a chamada é a normal.
 */
export async function agenteMtlsPara(tenantId: string, url: string): Promise<https.Agent | null> {
  let alvo: URL;
  try {
    alvo = new URL(url);
  } catch {
    return null;
  }
  if (alvo.protocol !== 'https:') return null;

  const indice = await indiceDe(tenantId);
  const casa = indice.hosts.find((h) => h.hostname === alvo.hostname && h.porta === alvo.port);
  if (!casa) return null;
  return agenteDoCertificado(tenantId, casa.certificadoId);
}

/**
 * Esquece o índice do tenant e os agentes dos certificados dele (ou de um só).
 * Sem tenant, tudo.
 */
export function esquecerCertificadosMtls(tenantId?: string, certificadoId?: string): void {
  if (!tenantId) {
    for (const id of [...agentePorCertificado.keys()]) descartarAgente(id);
    indicePorTenant.clear();
    return;
  }
  const indice = indicePorTenant.get(tenantId);
  if (indice) {
    for (const h of indice.hosts) {
      if (!certificadoId || h.certificadoId === certificadoId) descartarAgente(h.certificadoId);
    }
  }
  if (certificadoId) descartarAgente(certificadoId);
  indicePorTenant.delete(tenantId);
}

/* ------------------------------------------------------------- chamada */

export interface PedidoDeSaida {
  metodo?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers: Record<string, string>;
  body?: string;
  timeoutMs: number;
}

/** O que os dois caminhos (com e sem certificado) devolvem — o subconjunto de `Response` que a entrega usa. */
export interface RespostaDeSaida {
  ok: boolean;
  status: number;
  texto: () => Promise<string>;
}

/** `https.request` com o agente: o `fetch` global (undici) não aceita `https.Agent`. */
function pedirComAgente(url: string, pedido: PedidoDeSaida, agente: https.Agent): Promise<RespostaDeSaida> {
  return new Promise((resolver, rejeitar) => {
    const requisicao = https.request(
      url,
      {
        method: pedido.metodo ?? 'POST',
        headers: pedido.headers,
        agent: agente,
        signal: AbortSignal.timeout(pedido.timeoutMs),
      },
      (resposta) => {
        const pedacos: Buffer[] = [];
        resposta.on('data', (pedaco: Buffer) => pedacos.push(pedaco));
        resposta.on('error', rejeitar);
        resposta.on('end', () => {
          const status = resposta.statusCode ?? 0;
          resolver({
            ok: status >= 200 && status < 300,
            status,
            texto: async () => Buffer.concat(pedacos).toString('utf8'),
          });
        });
      },
    );
    requisicao.on('error', rejeitar);
    requisicao.end(pedido.body);
  });
}

/**
 * Chama uma URL do cliente em nome do tenant: com o certificado dele se o host
 * tem um, e como `fetch` comum se não tem. Ponto único de saída para os
 * webhooks e, amanhã, para o `ProcessHttp` do Builder.
 */
export async function chamarComMtls(
  tenantId: string,
  url: string,
  pedido: PedidoDeSaida,
): Promise<RespostaDeSaida> {
  const agente = await agenteMtlsPara(tenantId, url);
  if (agente) return pedirComAgente(url, pedido, agente);

  const resposta = await fetch(url, {
    method: pedido.metodo ?? 'POST',
    headers: pedido.headers,
    body: pedido.body,
    signal: AbortSignal.timeout(pedido.timeoutMs),
  });
  return { ok: resposta.ok, status: resposta.status, texto: () => resposta.text() };
}
