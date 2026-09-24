import fs from 'node:fs';
import path from 'node:path';
import { readMap } from '../../../../../../tools/std/lib/map.ts';
import { splitIdentifier } from '../../../../../../tools/std/pt-detect.ts';

const std = path.resolve(import.meta.dirname, '../..');
const rows = fs.readFileSync(path.join(std, 'out/glossary-token-frequency.csv'), 'utf8').trim().split('\n').slice(1);
const counts = new Map(rows.map((line) => { const [group, token, count] = line.split(','); return [group + ':' + token, Number(count)]; }));
const strip = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replaceAll('-', '');
const backendScopes = new Set(['packages-db', 'packages-contracts', 'packages-autenticacao', 'packages-armazenamento', 'packages-tempo-real', 'packages-mcp', 'workers', 'api', 'infra']);
const mapRows = readMap(path.join(std, 'map'));
const phraseCount = (group, phrase) => {
  const parts = splitIdentifier(phrase);
  return mapRows.filter((row) => (backendScopes.has(row.scope) ? 'backend' : 'front') === group).reduce((total, row) => {
    const words = splitIdentifier(row.old);
    return total + words.filter((_, i) => parts.every((part, j) => words[i + j] === part)).length;
  }, 0);
};
const portal = 'referencias-blip/portal/INDICE.md';
const entries = [
  ['conversa','conversation','chat'],['contato','contact','customer'],['fila','queue','line',portal],
  ['atendente','agent','attendant'],['atendimento','attendance','ticket / conversation',portal],
  ['ticket','ticket','session',portal],['fluxo','flow','workflow'],['roteador','router','routing bot',portal],
  ['bloco','block','step'],['canal','channel','medium'],['mensagem','message','communication'],
  ['construtor','builder','editor',portal],['ações em massa','bulk-ticket','bulk actions',portal],
  ['mensagem ativa','activeMessage','outbound message',portal],
  ['anexo','attachment','media'],['sessão','session','ticket'],['entrar','login','sign-in'],
  ['convite','invitation','invite'],['gestão','management','administration'],
  ['operação','operations','operation'],['monitoramento','monitoring','tracking',portal],
  ['monitoria','monitoring','quality review'],['histórico','history','archive',portal],
  ['relatório','report','analytics',portal],['esforço','effort','workload'],
  ['satisfação','satisfaction','survey',portal],['métrica','metric','measure'],
  ['janela','window','timeframe'],['distribuição','distribution','routing'],
  ['análise','analysis','analytics',portal],['cadastro','registration','record'],
  ['contrato','contract','subscription'],['membro','member','user'],
  ['novidades','updates','news'],['conta','account','tenant'],
  ['permissão','permission','authorization'],['escopo','scope','permission'],
  ['chave','key','token'],['estado','state','status'],
  ['importação','import','ingestion'],['espelho','mirror','sync'],
  ['varredura','sweep','scan'],['entrega','delivery','dispatch'],
  ['entrada','inbound','input'],['agregação','aggregation','rollup'],
  ['dicionário','dictionary','schema'],['mídia','media','asset'],
  ['controlador','controller','handler'],['domínio','domain','business-logic'],
  ['página','page','screen'],['componente','component','widget'],
  ['contexto','context','scope'],['casca','shell','layout'],
  ['trilho','rail','sidebar'],['painel','panel','dashboard'],
  ['compositor','composer','editor'],['ponte','bridge','adapter'],
  ['armazenamento','storage','store'],['autenticação','authentication','auth'],
  ['tempo-real','realtime','real-time'],
  ['erro','error','failure'],['cartão','card','tile'],['valor','value','amount'],
  ['usuário','user','member'],['requisição','request','petition'],
  ['busca','search','lookup'],['ações','actions','operations'],
  ['dados','data','payload'],['papel','role','permission'],
  ['coluna','column','field'],['filtro','filter','predicate'],
  ['configurações','settings','configuration'],['segredo','secret','credential'],
  ['descrição','description','summary'],['leitura','read','reading'],
  ['seção','section','area'],['condição','condition','rule'],
  ['seleção','selection','choice'],['ordem','order','sequence'],
  ['prioridade','priority','rank'],['destino','destination','target'],
  ['modelo','template','model'],['arquivo','file','attachment'],
  ['banco','database','bank'],['encerramento','closure','completion']
];
const ambiguous = new Set(['atendimento','sessão','monitoria','relatório','análise','cadastro','conta','estado','entrada','painel','modelo','mídia','chave','janela','espelho']);
const byGroup = { backend: [], front: [] };
for (const [pt, en, alternate, source = ''] of entries) {
  for (const group of ['backend', 'front']) {
    const occurrences = pt.includes(' ') ? phraseCount(group, pt) : counts.get(group + ':' + strip(pt).toLowerCase()) ?? 0;
    const proposal = group === 'backend' && pt === 'atendimento' ? 'ticket' : en;
    const isAmbiguous = ambiguous.has(pt);
    byGroup[group].push({
      term_pt: pt, term_en: proposal, blip_source: source,
      ambiguity: isAmbiguous ? 'AMBIGUOUS' : 'none',
      candidates: isAmbiguous ? [en, alternate].join(' / ') : alternate,
      occurrences: String(occurrences),
      notes: pt === 'atendimento'
        ? 'Módulo=attendance; sessão humana=ticket; conversa de canal=conversation. Schema conversa e rotas Desk distinguem contextos.'
        : occurrences === 0 ? 'Sem token PT exato no mapa deste grupo; termo exigido pelo plano ou já inglês no código.' : 'Contagem de tokens exatos no old do mapa deste grupo.'
    });
  }
}
for (const [group, account] of [['backend', '1'], ['front', '2']]) {
  const terms = byGroup[group];
  fs.writeFileSync(path.join(std, 'out', 'glossary-codex' + account + '.json'), JSON.stringify({ terms }, null, 2) + '\n');
  const tokenRows = rows.filter((line) => line.startsWith(group + ',')).sort((a,b) => Number(b.split(',')[2]) - Number(a.split(',')[2]));
  fs.writeFileSync(path.join(std, 'prompts/glossary', group + '.md'),
    fs.readFileSync(path.join(std, 'prompts/TEMPLATE-glossary.md'), 'utf8') +
    '\n\n## Token frequency (' + group + ')\n\n' + tokenRows.map((line) => line.slice(group.length + 1)).join('\n') + '\n');
}
const first = byGroup.backend;
const second = new Map(byGroup.front.map((term) => [term.term_pt, term]));
const display = first.map((term) => {
  const front = second.get(term.term_pt);
  const total = Number(term.occurrences) + Number(front.occurrences);
  const conflict = term.term_en !== front.term_en;
  const ambiguousTerm = term.ambiguity === 'AMBIGUOUS' || front.ambiguity === 'AMBIGUOUS' || conflict;
  const recommended = conflict ? front.term_en : term.term_en;
  const candidates = conflict ? [term.term_en, ...front.candidates.split(' / ')] : term.candidates.split(' / ');
  const other = [...new Set(candidates.map((value) => value.trim()))].filter((value) => value !== recommended).join(' / ');
  return { pt: term.term_pt, en: recommended, source: term.blip_source || front.blip_source,
    ambiguous: ambiguousTerm, other, total, backend: term.occurrences, front: front.occurrences };
}).sort((a, b) => b.total - a.total || a.pt.localeCompare(b.pt));
const table = display.map((r) => '| ' + [
  r.pt, r.en, r.source, r.ambiguous ? 'AMBIGUOUS' : 'none',
  `Recomendado: ${r.en}; alternativa: ${r.other}; evidência: ${r.total} (${r.backend} backend + ${r.front} front)`,
  'no'
].join(' | ') + ' |');
const otherAmbiguous = display.filter((r) => r.ambiguous && r.pt !== 'atendimento')
  .map((r) => `- **${r.pt}** (${r.total}): ${r.en} recomendado; alternativa ${r.other}. Conferir o sentido no uso local antes de aplicar.`);
const glossary = [
  '# Glossário de domínio — proposta para o portão 1',
  '',
  'Status: PROPOSED',
  '',
  'Contagem: tokens PT exatos de `old` no inventário real, separados conforme os escopos de 01-08. Zero significa que a forma exata não foi classificada como token PT; não significa ausência do conceito. Nenhuma linha está aprovada. Termos Blip prevalecem quando nomeiam o mesmo conceito (D-01).',
  '',
  '## Terms',
  '',
  '| term_pt | term_en | blip_source | ambiguity | decision | approved |',
  '|---|---|---|---|---|---|',
  ...table,
  '',
  '## Ambiguous: atendimento',
  '',
  'A palavra cobre três objetos distintos (D-02). A divergência das propostas diretas foi preservada: backend sugeriu `ticket`, front sugeriu `attendance`.',
  '',
  '| Sentido | Recomendação | Evidência | Alternativa |',
  '|---|---|---|---|',
  '| Módulo do Portal | `attendance` | `referencias-blip/portal/INDICE.md`: caminhos `/attendance/desk/*`; opções de fila, equipe, histórico e monitoramento agrupadas ali. | `service` |',
  '| Sessão humana de atendimento | `ticket` | `apps/api/src/controladores/desk.ts`: `GET tickets/:id` abre atendimento antigo; `packages/db/src/schema/conversas.ts`: `conversa` tem fila, atendente, atribuição e encerramento; Blip usa ticket no histórico. | `session` |',
  '| Conversa no canal | `conversation` | `apps/api/src/controladores/desk.ts`: `GET conversas/:id` abre conversa ativa; `packages/db/src/schema/conversas.ts`: `mensagem.conversaId` liga mensagens à conversa. | `chat` |',
  '',
  'A linha geral `atendimento → attendance` aplica-se somente ao módulo. Mapeamentos de sessão e conversa devem usar `ticket` e `conversation` após aprovação do portão. O inventário registra ' + display.find((r) => r.pt === 'atendimento').total + ' tokens exatos de `atendimento`, sem decidir automaticamente o sentido de cada ocorrência.',
  '',
  '## Evidência de contagem zero',
  '',
  '- `ticket`: já é termo inglês no código; `apps/api/src/controladores/desk.ts` declara `GET tickets/:id` e usa `TicketDoDesk`. Por isso `isPtToken` não o inclui na frequência PT.',
  '- `métrica`: o uso real está em `packages/core/src/metricas/` e em `packages/db/src/schema/gestao.ts` (`metricaDiaria`). A forma exata não foi classificada pelo léxico PT do inventário; a forma plural aparece em caminhos.',
  '- `tempo-real`: `packages/tempo-real/package.json` usa `@pipe/tempo-real`; o inventário separa o composto em `tempo` e `real`, sem uma linha de token composto.',
  '',
  'Compostos como `ações em massa` e `mensagem ativa` foram contados como sequências exatas em `old`. `check-map` compara tokens unitários; o portão 2 deve revisar a correspondência dos compostos explicitamente.',
  '',
  '## Other ambiguous terms',
  '',
  ...otherAmbiguous,
  '',
  'As alternativas acima são propostas para revisão do dono; nenhuma delas autoriza um rename antes de D-03.',
  ''
].join('\n');
fs.writeFileSync(path.join(std, 'GLOSSARY.md'), glossary);
