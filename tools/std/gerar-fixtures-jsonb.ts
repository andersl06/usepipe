/**
 * Gera as fixtures jsonb (STD-06) SINTÉTICAS: nenhuma linha real de tenant de cliente é
 * lida. Tudo roda dentro de UM tenant descartável, criado e apagado por este script
 * (mesmo padrão de `apps/api/tests/ajuda.ts` `montarCenario`, que a suíte de teste já usa
 * contra este mesmo banco local) — cria só o que é dele, nunca lê nem exporta linha de
 * outro tenant.
 *
 * Decisão do dono (24/09/2026): dump de dado real do Postgres local foi recusado pelo
 * classificador de permissão do agente (Sensitive-Source Provenance) e o dono decidiu não
 * insistir — fixture passa a ser 100% sintética, produzida chamando o código de produção
 * de verdade (o motor do fluxo, `emitir()`, o controlador de contatos, `registrarAuditoria`),
 * nunca lida à mão. Isso é uma prova mais fraca que dado real: não cobre formato legado que
 * só existe em documento já gravado por uma versão antiga do código — só formato que o
 * código ATUAL ainda produz. Ver `01-34-SUMMARY.md` §Deviations / §Known limitations.
 *
 * `conta.atributos` fica de fora (decisão do dono): não existe hoje nenhum caminho de
 * código que escreva essa coluna — nem controlador da `api`, nem `apps/crm`, nem semente.
 * `lead.utm`/`lead.customizados` também não têm rota de escrita própria (só o script de
 * semente do CRM, `apps/crm/semente/semente-crm.ts:625-654`, os grava) — a fixture aqui
 * reproduz o MESMO formato desse script via insert direto (citado por linha), sem rodar a
 * semente inteira. `template_mensagem.variaveis` só é gravada por `sincronizarModelos`
 * (`apps/api/src/dominio/whatsapp/modelos.ts:187-217`), que fala com a Graph API da Meta
 * por rede — reproduz a MESMA transformação determinística daquele arquivo
 * (`Array.from({length}, (_, i) => \`Variável ${i + 1}\`)`) sem a chamada de rede.
 *
 * A parte que precisa de `drizzle-orm`/`@pipe/db`/código de domínio da `api` mora em
 * `apps/api/tests/gerar-fixtures-jsonb.helper.ts` (não `tools/std/`): esses pacotes só
 * estão instalados no `node_modules` da workspace `@pipe/api`, e a resolução de módulo do
 * Node segue o caminho do ARQUIVO que importa, não o cwd — `tools/std` não os enxerga.
 * Este arquivo só faz o bootstrap de variável de ambiente (tem de vir antes de qualquer
 * import que as leia) e a redação antes de escrever em `apps/api/tests/fixtures/jsonb/`.
 *
 * Uso: `pnpm --filter @pipe/api exec tsx ../../tools/std/gerar-fixtures-jsonb.ts` (precisa
 * do Docker com `pipe-postgres` no ar). Roda por cima do MESMO banco que os testes usam; a
 * limpeza no fim apaga só o tenant que este script criou.
 */

process.env['PIPE_FILAS'] ??= 'memoria';
process.env['PIPE_WHATSAPP_CLIENTE'] ??= 'duble';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
// ProcessHttp em modo memória roda `executarProcessHttp` (chamada HTTP de verdade) em
// linha por padrão. Aqui a fixture quer só a suspensão (entrada/contexto/pedido), sem
// nenhum request saindo da máquina — por isso o job fica parado num array em memória
// (`PIPE_PROCESS_HTTP_EM_MEMORIA=1`) e a varredura que o consumiria é adiada bem além da
// vida deste script (`PIPE_PROCESS_HTTP_VARREDURA_MS`).
process.env['PIPE_PROCESS_HTTP_EM_MEMORIA'] ??= '1';
process.env['PIPE_PROCESS_HTTP_VARREDURA_MS'] ??= '3600000';

import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { redigir } from './redacao.js';

const RAIZ = fileURLToPath(new URL('../../', import.meta.url));
const FIXTURES = `${RAIZ}apps/api/tests/fixtures/jsonb/`;
mkdirSync(FIXTURES, { recursive: true });

const { gerarRegistros } = await import('../../apps/api/tests/gerar-fixtures-jsonb.helper.js');

const arquivos = await gerarRegistros();

for (const [arquivo, registros] of arquivos) {
  const redigidos = registros.map((registro) => {
    const copia: Record<string, unknown> = {};
    for (const [chave, valor] of Object.entries(registro)) {
      copia[chave] = chave === 'id' ? valor : redigir(valor);
    }
    return copia;
  });
  writeFileSync(`${FIXTURES}${arquivo}`, `${JSON.stringify(redigidos, null, 2)}\n`);
  console.log(`wrote ${arquivo} (${redigidos.length} registro(s), gerado)`);
}

console.log(`\n${arquivos.size} arquivo(s) de fixture gerados em ${FIXTURES}`);
