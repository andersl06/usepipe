/* Script de migração (uma vez): as páginas da Análise viram componentes de rota. */
const fs = require('fs');
process.chdir(__dirname + '/src/paginas/fluxo/analise');
// Normaliza a profundidade dos imports para os literais abaixo baterem
// (`../../../../componentes` → `../../../componentes`; `../../../../../lib` → `../../../../lib`).
const ler = (f) =>
  fs
    .readFileSync(f, 'utf8')
    .replace(/'\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/(componentes|lib)\//g, "'../../../../$1/")
    .replace(/'\.\.\/\.\.\/\.\.\/\.\.\/(componentes|lib)\//g, "'../../../$1/");
function troca(s, a, b, f) {
  if (!s.includes(a)) throw new Error(f + ': não achei: ' + a.slice(0, 80));
  return s.replace(a, b);
}
const IMP = "import { useLeitura } from '../../../../lib/consulta';\nimport { useContato } from '../contato';";
const IMP2 = "import { useLeitura } from '../../../../../lib/consulta';\nimport { useContato } from '../../contato';";

/* ---- casca (layout.tsx) ---- */
{
  let s = ler('layout.tsx'), f = 'layout';
  s = troca(s, "import type { Metadata } from 'next';\nimport type { ReactNode } from 'react';\nimport { notFound } from 'next/navigation';\nimport { BarraDoPortal } from '../../../componentes/barra-do-portal';\nimport { carregarCascaDoPortal } from '../../../lib/portal';\nimport { BarraDoContato, UUID, carregarContato } from '../barra-do-contato';\n", "import { Outlet } from 'react-router-dom';\nimport { BarrasDoContato, useContato } from '../contato';\n", f);
  s = troca(s, "import '../fluxo.css';\n", '', f);
  s = troca(s, "export const dynamic = 'force-dynamic';\n\nexport const metadata: Metadata = {\n  title: 'Análise · Pipe',\n};\n\nexport default async function LayoutDaAnalise({\n  children,\n  params,\n}: {\n  children: ReactNode;\n  params: Promise<{ id: string }>;\n}) {\n  const { id } = await params;\n  if (!UUID.test(id)) notFound();\n\n  const [casca, contato] = await Promise.all([carregarCascaDoPortal(), carregarContato(id)]);\n  if (!contato) notFound();\n", "export function CascaDaAnalise() {\n  const { contato } = useContato();\n  const id = contato.id;\n", f);
  s = troca(s, '      <BarraDoPortal dados={casca} />\n      <BarraDoContato contato={contato} ativo="Análise" />', '      <BarrasDoContato ativo="Análise" />', f);
  s = troca(s, '          {children}\n        </VistaDaAnalise>', '          <Outlet />\n        </VistaDaAnalise>', f);
  fs.writeFileSync('casca.tsx', s);
  fs.unlinkSync('layout.tsx');
  fs.unlinkSync('page.tsx');
}
/* ---- dashboard ---- */
{
  let s = ler('dashboard/page.tsx'), f = 'dashboard';
  const ini = s.indexOf('import');
  const corpoIni = s.indexOf('export const dynamic');
  const doc = s.slice(0, corpoIni).replace(/^import[\s\S]*?\n\n/, '');
  s = `import { useSearchParams } from 'react-router-dom';\n${IMP2}\nimport type { RespostaDoDashboard } from './resposta';\nimport { TelaDoDashboard } from './tela';\nimport './dashboard.css';\n\n` + doc.replace(/^[\s\S]*?(\/\*\*)/, '$1') + `export function PaginaDoDashboard() {
  const { contato } = useContato();
  const [busca] = useSearchParams();
  const q = new URLSearchParams();
  for (const chave of ['periodo', 'de', 'ate', 'contatos']) {
    const v = busca.get(chave);
    if (v) q.set(chave, v);
  }
  const leitura = useLeitura<RespostaDoDashboard>(
    \`/v1/gestao/fluxos/\${contato.id}/analise/dashboard?\${q.toString()}\`,
  );
  if (!leitura.data) return null;
  const { periodo, intervalo, hoje, dados, lista } = leitura.data;
  return (
    <TelaDoDashboard
      id={contato.id}
      periodo={periodo}
      intervalo={intervalo}
      hoje={hoje}
      dados={dados}
      lista={lista}
    />
  );
}
`;
  void ini;
  fs.writeFileSync('dashboard/dashboard.tsx', s);
  fs.unlinkSync('dashboard/page.tsx');
  fs.writeFileSync('dashboard/resposta.ts', `import type { DadosDoDashboard, Intervalo, Periodo } from '@pipe/core/analise';

/** O que \`GET /v1/gestao/fluxos/:id/analise/dashboard\` responde (\`RespostaDoDashboard\` na api). */
export interface RespostaDoDashboard {
  periodo: Periodo;
  intervalo: Intervalo;
  hoje: string;
  dados: DadosDoDashboard;
  lista: { tipo: 'interacao' | 'rejeicao'; nomes: string[] } | null;
}
`);
}
/* ---- dicionário ---- */
{
  let s = ler('dicionario-de-dados/page.tsx'), f = 'dicionario';
  s = troca(s, "import type { Metadata } from 'next';\n", '', f);
  s = troca(s, "import { notFound } from 'next/navigation';\n", "import { useSearchParams } from 'react-router-dom';\nimport { useContato } from '../../contato';\n", f);
  s = troca(s, "export const dynamic = 'force-dynamic';\n\nexport const metadata: Metadata = {\n  title: 'Dicionário de dados · Pipe',\n};\n\nconst UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;\n", '', f);
  s = troca(s, "export default async function PaginaDoDicionario({\n  params,\n  searchParams,\n}: {\n  params: Promise<{ id: string }>;\n  searchParams: Promise<{ path?: string | string[] }>;\n}) {\n  const { id } = await params;\n  if (!UUID.test(id)) notFound();\n  const { path } = await searchParams;\n  const [pedida, subPedida] = (typeof path === 'string' ? path : '').split(':');", "export function PaginaDoDicionario() {\n  const { contato } = useContato();\n  const id = contato.id;\n  const [busca] = useSearchParams();\n  const [pedida, subPedida] = (busca.get('path') ?? '').split(':');", f);
  fs.writeFileSync('dicionario-de-dados/dicionario.tsx', s);
  fs.unlinkSync('dicionario-de-dados/page.tsx');
}
/* ---- gerenciador ---- */
{
  let s = ler('gerenciador-de-relatorios/page.tsx'), f = 'gerenciador';
  s = troca(s, "import type { Metadata } from 'next';\nimport { notFound } from 'next/navigation';\nimport { fusoDoTenant } from '../../../../../lib/banco';\nimport { carregarContato, UUID } from '../../barra-do-contato';\n", "import { useContato } from '../../contato';\n", f);
  s = troca(s, "export const dynamic = 'force-dynamic';\n\nexport const metadata: Metadata = {\n  title: 'Gerenciador de Relatórios · Pipe',\n};\n\n", '', f);
  s = troca(s, "export default async function PaginaDoGerenciador({ params }: { params: Promise<{ id: string }> }) {\n  const { id } = await params;\n  if (!UUID.test(id)) notFound();\n  const contato = await carregarContato(id);\n  if (!contato) notFound();\n  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: await fusoDoTenant() }).format(\n    new Date(),\n  );", "export function PaginaDoGerenciador() {\n  const { contato, fuso } = useContato();\n  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: fuso }).format(new Date());", f);
  fs.writeFileSync('gerenciador-de-relatorios/gerenciador.tsx', s);
  fs.unlinkSync('gerenciador-de-relatorios/page.tsx');
}
/* ---- jornada ---- */
{
  let s = ler('jornada/page.tsx'), f = 'jornada';
  s = troca(s, "import { notFound } from 'next/navigation';\nimport { fusoDoTenant, janelaDeDatas } from '../../../../../lib/banco';\nimport { carregarJornada } from '../../../../../lib/analise-portal';\nimport { UUID, carregarContato } from '../../barra-do-contato';\nimport { hojeNoFuso, periodoDaUrl, somarDias } from '../pecas';\n", "import { useSearchParams } from 'react-router-dom';\nimport type { ArestaDaJornada } from '@pipe/core/analise';\n" + IMP2 + '\n', f);
  s = troca(s, "export default async function PaginaDaJornada({\n  params,\n  searchParams,\n}: {\n  params: Promise<{ id: string }>;\n  searchParams: Promise<Record<string, string | string[] | undefined>>;\n}) {\n  const [{ id }, busca, fuso] = await Promise.all([params, searchParams, fusoDoTenant()]);\n  if (!UUID.test(id)) notFound();\n  const hoje = hojeNoFuso(fuso);\n  const { de, ate } = periodoDaUrl(busca, somarDias(hoje, -1), hoje);\n  const [contato, janela] = await Promise.all([carregarContato(id), janelaDeDatas(fuso, de, ate)]);\n  if (!contato) notFound();\n  const arestas = await carregarJornada(id, janela);\n  return (\n    <JornadaDosContatos\n      arestas={arestas}\n      de={de}\n      ate={ate}\n      min={somarDias(hoje, -30)}\n      max={somarDias(hoje, 1)}\n      roteador={contato.tipo === 'roteador'}\n    />\n  );", "interface RespostaDaJornada {\n  arestas: ArestaDaJornada[];\n  de: string;\n  ate: string;\n  min: string;\n  max: string;\n  roteador: boolean;\n}\n\nexport function PaginaDaJornada() {\n  const { contato } = useContato();\n  const [busca] = useSearchParams();\n  const q = new URLSearchParams();\n  for (const chave of ['de', 'ate']) {\n    const v = busca.get(chave);\n    if (v) q.set(chave, v);\n  }\n  const leitura = useLeitura<RespostaDaJornada>(\n    `/v1/gestao/fluxos/${contato.id}/analise/jornada?${q.toString()}`,\n  );\n  if (!leitura.data) return null;\n  const { arestas, de, ate, min, max, roteador } = leitura.data;\n  return (\n    <JornadaDosContatos arestas={arestas} de={de} ate={ate} min={min} max={max} roteador={roteador} />\n  );", f);
  fs.writeFileSync('jornada/pagina.tsx', s);
  fs.unlinkSync('jornada/page.tsx');
}
/* ---- mensagens ativas ---- */
{
  let s = ler('mensagens-ativas/page.tsx'), f = 'ma';
  s = troca(s, "import { notFound } from 'next/navigation';\nimport { IconePortal } from '../../../../../componentes/icones-portal';\nimport { fusoDoTenant } from '../../../../../lib/banco';\nimport {\n  PERIODOS_DE_CALENDARIO,\n  PERIODOS_FIXOS,\n  ROTULO_DO_PERIODO,\n  carregarMensagensAtivas,\n  hojeNoFuso,\n  intervaloDoPeriodo,\n  lerPeriodo,\n} from '../../../../../lib/analise';\n", "import { useSearchParams } from 'react-router-dom';\nimport {\n  PERIODOS_DE_CALENDARIO,\n  PERIODOS_FIXOS,\n  ROTULO_DO_PERIODO,\n  type DadosDeMensagensAtivas,\n  type Intervalo,\n  type Periodo,\n} from '@pipe/core/analise';\nimport { IconePortal } from '../../../../../componentes/icones-portal';\n" + IMP2 + '\n', f);
  s = troca(s, "export const dynamic = 'force-dynamic';\n\nconst UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;\nconst texto = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined);\n\n", "interface RespostaDeMensagensAtivas {\n  periodo: Periodo;\n  intervalo: Intervalo;\n  hoje: string;\n  limite: string;\n  template: string | null;\n  dados: DadosDeMensagensAtivas;\n}\n\n", f);
  const a = s.indexOf('export default async function PaginaDeMensagensAtivas');
  const b = s.indexOf('  return (\n    <div className="ma-tela">');
  if (a < 0 || b < 0) throw new Error('ma: corpo');
  s = s.slice(0, a) + `export function PaginaDeMensagensAtivas() {
  const { contato } = useContato();
  const [busca] = useSearchParams();
  const q = new URLSearchParams();
  for (const chave of ['periodo', 'de', 'ate', 'template']) {
    const v = busca.get(chave);
    if (v) q.set(chave, v);
  }
  const leitura = useLeitura<RespostaDeMensagensAtivas>(
    \`/v1/gestao/fluxos/\${contato.id}/analise/mensagens-ativas?\${q.toString()}\`,
  );
  if (!leitura.data) return null;
  const { periodo, intervalo, hoje, limite, template, dados } = leitura.data;
` + s.slice(b);
  fs.writeFileSync('mensagens-ativas/pagina.tsx', s);
  fs.unlinkSync('mensagens-ativas/page.tsx');
}
/* ---- relatórios ---- */
{
  fs.writeFileSync('relatorios/pagina.tsx', `import type { RelatorioPersonalizado } from '@pipe/core/analise';
${IMP2}
import { RelatoriosPersonalizados } from './relatorios';
import './relatorios.css';

interface RespostaDosRelatorios {
  relatorios: RelatorioPersonalizado[];
  fuso: string;
}

/** \`auth.application.detail.analytics.reports\` — o painel \`#reportsContent\`. */
export function PaginaDosRelatorios() {
  const { contato } = useContato();
  const leitura = useLeitura<RespostaDosRelatorios>(
    \`/v1/gestao/fluxos/\${contato.id}/analise/relatorios\`,
  );
  if (!leitura.data) return null;
  return (
    <RelatoriosPersonalizados
      relatorios={leitura.data.relatorios}
      agora={new Date()}
      fuso={leitura.data.fuso}
    />
  );
}
`);
  fs.unlinkSync('relatorios/page.tsx');
}
/* ---- visão geral ---- */
{
  let s = ler('visao-geral/page.tsx'), f = 'vg';
  s = troca(s, "import { notFound } from 'next/navigation';\nimport { fusoDoTenant, janelaDeDatas } from '../../../../../lib/banco';\nimport { carregarVisaoGeral } from '../../../../../lib/analise-portal';\nimport { UUID } from '../../barra-do-contato';\nimport { hojeNoFuso, periodoDaUrl, somarDias } from '../pecas';\n", "import { useSearchParams } from 'react-router-dom';\nimport type { VisaoGeral as DadosDaVisaoGeral } from '@pipe/core/analise';\n" + IMP2 + '\n', f);
  s = troca(s, "export default async function PaginaDaVisaoGeral({\n  params,\n  searchParams,\n}: {\n  params: Promise<{ id: string }>;\n  searchParams: Promise<Record<string, string | string[] | undefined>>;\n}) {\n  const [{ id }, busca, fuso] = await Promise.all([params, searchParams, fusoDoTenant()]);\n  if (!UUID.test(id)) notFound();\n  const hoje = hojeNoFuso(fuso);\n  const { de, ate } = periodoDaUrl(busca, somarDias(hoje, -7), hoje);\n  const dados = await carregarVisaoGeral(id, await janelaDeDatas(fuso, de, ate), fuso);\n  return <VisaoGeral dados={dados} de={de} ate={ate} />;", "interface RespostaDaVisaoGeral {\n  dados: DadosDaVisaoGeral;\n  de: string;\n  ate: string;\n}\n\nexport function PaginaDaVisaoGeral() {\n  const { contato } = useContato();\n  const [busca] = useSearchParams();\n  const q = new URLSearchParams();\n  for (const chave of ['de', 'ate']) {\n    const v = busca.get(chave);\n    if (v) q.set(chave, v);\n  }\n  const leitura = useLeitura<RespostaDaVisaoGeral>(\n    `/v1/gestao/fluxos/${contato.id}/analise/visao-geral?${q.toString()}`,\n  );\n  if (!leitura.data) return null;\n  const { dados, de, ate } = leitura.data;\n  return <VisaoGeral dados={dados} de={de} ate={ate} />;", f);
  fs.writeFileSync('visao-geral/pagina.tsx', s);
  fs.unlinkSync('visao-geral/page.tsx');
}
console.log('analise ok');
