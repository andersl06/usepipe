/* Script de migração (uma vez): transforma page.tsx/layout.tsx do Next em
   componentes de rota do React Router. Apagar depois de rodar. */
const fs = require('fs');
process.chdir(__dirname + '/src/paginas/fluxo');
// Os caminhos já foram recalculados pelo passo anterior; normalizo para os literais abaixo baterem.
const ler = (f) =>
  fs.readFileSync(f, 'utf8').replace(/'(\.\.\/)+(componentes|lib)\//g, "'../../$2/");
function troca(s, a, b, f) {
  if (!s.includes(a)) throw new Error(f + ': não achei: ' + a.slice(0, 70));
  return s.replace(a, b);
}

/* ---------------- canais ---------------- */
{
  let s = ler('canais/page.tsx'), f = 'canais';
  s = troca(s, "import type { Metadata } from 'next';\nimport { notFound } from 'next/navigation';\nimport { BarraDoPortal } from '../../componentes/barra-do-portal';\nimport { LogoPortal } from '../../componentes/icones-portal';\nimport { carregarCascaDoPortal } from '../../lib/portal';\nimport { BarraDoContato, UUID, carregarContato } from '../barra-do-contato';\nimport '../fluxo.css';", "import { LogoPortal } from '../../../componentes/icones-portal';\nimport { BarrasDoContato, useContato } from '../contato';", f);
  s = troca(s, "export const dynamic = 'force-dynamic';\n\nexport const metadata: Metadata = { title: 'Canais · Pipe' };\n\n", '', f);
  s = troca(s, "export default async function PaginaDeCanais({ params }: { params: Promise<{ id: string }> }) {\n  const { id } = await params;\n  if (!UUID.test(id)) notFound();\n\n  const [casca, contato] = await Promise.all([carregarCascaDoPortal(), carregarContato(id)]);\n  if (!contato) notFound();\n", 'export function PaginaDeCanais() {\n  const { contato } = useContato();\n', f);
  s = troca(s, '      <BarraDoPortal dados={casca} />\n      <BarraDoContato contato={contato} ativo="Canais" />', '      <BarrasDoContato ativo="Canais" />', f);
  fs.writeFileSync('canais/canais.tsx', s);
  fs.unlinkSync('canais/page.tsx');
}
/* ---------------- servicos ---------------- */
{
  let s = ler('servicos/page.tsx'), f = 'servicos';
  s = troca(s, "import { notFound } from 'next/navigation';\nimport { BarraDoPortal } from '../../componentes/barra-do-portal';\nimport { BarraDoContato, UUID, carregarContato } from '../barra-do-contato';\nimport { carregarCascaDoPortal } from '../../lib/portal';\nimport { carregarServicos } from '../../lib/servicos';\nimport { TelaDeServicos } from './tela';\nimport '../fluxo.css';", "import { useCascaDoPortal } from '../../../lib/casca';\nimport { useLeitura } from '../../../lib/consulta';\nimport { NaoEncontrado } from '../../nao-encontrado';\nimport { BarrasDoContato, useContato } from '../contato';\nimport { TelaDeServicos, type DadosDeServicos } from './tela';", f);
  s = troca(s, "export const dynamic = 'force-dynamic';\n\n", '', f);
  s = troca(s, "export default async function PaginaDeServicos({ params }: { params: Promise<{ id: string }> }) {\n  const { id } = await params;\n  if (!UUID.test(id)) notFound();\n  const [casca, contato, dados] = await Promise.all([\n    carregarCascaDoPortal(),\n    carregarContato(id),\n    carregarServicos(id),\n  ]);\n  if (!contato || contato.tipo !== 'roteador' || !dados.principal) notFound();\n", 'export function PaginaDeServicos() {\n  const { contato } = useContato();\n  const casca = useCascaDoPortal();\n  const leitura = useLeitura<DadosDeServicos>(`/v1/gestao/fluxos/${contato.id}/servicos`);\n  if (contato.tipo !== \'roteador\') return <NaoEncontrado />;\n  if (!leitura.data) return null;\n  const dados = leitura.data;\n  if (!dados.principal) return <NaoEncontrado />;\n', f);
  s = troca(s, '      <BarraDoPortal dados={casca} />\n      <BarraDoContato contato={contato} ativo="Serviços" />', '      <BarrasDoContato ativo="Serviços" />', f);
  fs.writeFileSync('servicos/servicos.tsx', s);
  fs.unlinkSync('servicos/page.tsx');
}
/* ---------------- log ---------------- */
{
  let s = ler('log/page.tsx'), f = 'log';
  s = troca(s, "import { notFound } from 'next/navigation';\nimport { carregarLogsDoFluxo } from '../../lib/logs-do-fluxo';\nimport { UUID } from '../barra-do-contato';\nimport { CascaDoModulo } from '../casca-do-modulo';\nimport { TelaDoLog } from './tela';", "import { useSearchParams } from 'react-router-dom';\nimport { useLeitura } from '../../../lib/consulta';\nimport { CascaDoModulo, useContato } from '../contato';\nimport { TelaDoLog } from './tela';", f);
  s = troca(s, "export const dynamic = 'force-dynamic';\n\n", '', f);
  s = troca(s, "export default async function PaginaLog({\n  params,\n  searchParams,\n}: {\n  params: Promise<{ id: string }>;\n  searchParams: Promise<{ busca?: string }>;\n}) {\n  const [{ id }, { busca = '' }] = await Promise.all([params, searchParams]);\n  if (!UUID.test(id)) notFound();\n  const logs = await carregarLogsDoFluxo(id, busca);\n  return (\n    <CascaDoModulo id={id} ativo=\"Log\">", "interface LogLido {\n  id: string;\n  criadaEm: string;\n  tipo: string;\n  conteudo: string | null;\n  metadata: unknown;\n  de: string | null;\n  para: string | null;\n}\n\nexport function PaginaLog() {\n  const { contato } = useContato();\n  const [parametros] = useSearchParams();\n  const busca = parametros.get('busca') ?? '';\n  const leitura = useLeitura<LogLido[]>(\n    `/v1/gestao/fluxos/${contato.id}/logs?busca=${encodeURIComponent(busca)}`,\n    { staleTime: 0 },\n  );\n  const logs = leitura.data ?? [];\n  return (\n    <CascaDoModulo ativo=\"Log\">", f);
  s = troca(s, "          data: log.criadaEm.toLocaleString('sv-SE'),", "          data: new Date(log.criadaEm).toLocaleString('sv-SE'),", f);
  fs.writeFileSync('log/log.tsx', s);
  fs.unlinkSync('log/page.tsx');
}
/* ---------------- conteudos ---------------- */
{
  let s = ler('conteudos/page.tsx'), f = 'conteudos';
  s = troca(s, "import { notFound } from 'next/navigation';\nimport { UUID } from '../barra-do-contato';\nimport { carregarCanalDoFluxo, carregarModelos } from '../../lib/comunicacao';\nimport { TelaDeConteudos } from './tela';\nimport { CascaDoModulo } from '../casca-do-modulo';", "import { useLeitura } from '../../../lib/consulta';\nimport type { ModeloListado } from '../../../lib/comunicacao';\nimport { CascaDoModulo, useContato } from '../contato';\nimport { TelaDeConteudos } from './tela';", f);
  s = troca(s, "export const dynamic = 'force-dynamic';\n\n", '', f);
  s = troca(s, "export default async function PaginaConteudos({ params }: { params: Promise<{ id: string }> }) {\n  const { id } = await params;\n  if (!UUID.test(id)) notFound();\n  const canalId = await carregarCanalDoFluxo(id);\n  const modelos = canalId ? await carregarModelos(canalId) : [];\n  return (\n    <CascaDoModulo id={id} ativo=\"Conteúdos\">\n      <TelaDeConteudos modelos={modelos} temWhatsapp={canalId !== null} />", "export function PaginaConteudos() {\n  const { contato } = useContato();\n  const leitura = useLeitura<{ canalId: string | null; modelos: ModeloListado[] }>(\n    `/v1/gestao/fluxos/${contato.id}/conteudos`,\n  );\n  return (\n    <CascaDoModulo ativo=\"Conteúdos\">\n      {leitura.data ? (\n        <TelaDeConteudos modelos={leitura.data.modelos} temWhatsapp={leitura.data.canalId !== null} />\n      ) : null}", f);
  fs.writeFileSync('conteudos/conteudos.tsx', s);
  fs.unlinkSync('conteudos/page.tsx');
}
/* ---------------- growth ---------------- */
{
  let s = ler('growth/layout.tsx'), f = 'growth/layout';
  s = troca(s, "import type { ReactNode } from 'react';\nimport { notFound } from 'next/navigation';\nimport { BarraDoPortal } from '../../componentes/barra-do-portal';\nimport { BarraDoContato, UUID, carregarContato } from '../barra-do-contato';\nimport { carregarCascaDoPortal } from '../../lib/portal';\nimport { NavegacaoGrowth } from './navegacao';\nimport '../fluxo.css';", "import { Outlet } from 'react-router-dom';\nimport { BarrasDoContato, useContato } from '../contato';\nimport { NavegacaoGrowth } from './navegacao';", f);
  s = troca(s, "export const dynamic = 'force-dynamic';\n\nexport default async function LayoutDeGrowth({\n  children,\n  params,\n}: {\n  children: ReactNode;\n  params: Promise<{ id: string }>;\n}) {\n  const { id } = await params;\n  if (!UUID.test(id)) notFound();\n  const [casca, contato] = await Promise.all([carregarCascaDoPortal(), carregarContato(id)]);\n  if (!contato) notFound();\n", 'export function CascaDeGrowth() {\n  const { contato } = useContato();\n  const id = contato.id;\n', f);
  s = troca(s, '      <BarraDoPortal dados={casca} />\n      <BarraDoContato contato={contato} ativo="Growth" />', '      <BarrasDoContato ativo="Growth" />', f);
  s = troca(s, '<main className="gr-miolo">{children}</main>', '<main className="gr-miolo">\n          <Outlet />\n        </main>', f);
  fs.writeFileSync('growth/casca.tsx', s);
  fs.unlinkSync('growth/layout.tsx');
  fs.unlinkSync('growth/page.tsx');
  let m = ler('growth/mensagens-ativas/page.tsx');
  m = troca(m, "import { notFound } from 'next/navigation';\nimport { UUID } from '../../barra-do-contato';\nimport { carregarGrowth } from '../../../lib/growth';\nimport { TelaDeMensagensAtivas } from './tela';", "import { useLeitura } from '../../../../lib/consulta';\nimport type { DadosDeGrowth } from '../../../../lib/growth';\nimport { useContato } from '../../contato';\nimport { TelaDeMensagensAtivas } from './tela';", 'growth/ma');
  m = troca(m, "export const dynamic = 'force-dynamic';\n\nexport default async function PaginaMensagensAtivas({\n  params,\n}: {\n  params: Promise<{ id: string }>;\n}) {\n  const { id } = await params;\n  if (!UUID.test(id)) notFound();\n  const dados = await carregarGrowth();\n  return <TelaDeMensagensAtivas dados={dados} />;", 'export function PaginaMensagensAtivas() {\n  const { contato } = useContato();\n  const leitura = useLeitura<DadosDeGrowth>(`/v1/gestao/fluxos/${contato.id}/growth`);\n  if (!leitura.data) return null;\n  return <TelaDeMensagensAtivas dados={leitura.data} />;', 'growth/ma');
  fs.writeFileSync('growth/mensagens-ativas/mensagens-ativas.tsx', m);
  fs.unlinkSync('growth/mensagens-ativas/page.tsx');
  fs.renameSync('growth/clicktracker/page.tsx', 'growth/clicktracker/clicktracker.tsx');
}
/* ---------------- configuracoes ---------------- */
{
  let s = ler('configuracoes/layout.tsx'), f = 'configuracoes/layout';
  s = troca(s, "import type { ReactNode } from 'react';\nimport { CascaDoModulo } from '../casca-do-modulo';", "import { Outlet } from 'react-router-dom';\nimport { CascaDoModulo, useContato } from '../contato';", f);
  s = s.replace(/export default async function LayoutConfiguracoes\(\{\n  children,\n  params,\n\}: \{\n  children: ReactNode;\n  params: Promise<\{ id: string \}>;\n\}\) \{\n  const \{ id \} = await params;\n/, 'export function CascaDeConfiguracoes() {\n  const { contato } = useContato();\n  const id = contato.id;\n');
  if (s.includes('await params')) throw new Error('configuracoes layout: assinatura diferente');
  s = troca(s, '<CascaDoModulo id={id} ativo="Configurações">', '<CascaDoModulo ativo="Configurações">', f);
  s = troca(s, '<div className="cf-conteudo">{children}</div>', '<div className="cf-conteudo">\n            <Outlet />\n          </div>', f);
  fs.writeFileSync('configuracoes/casca.tsx', s);
  fs.unlinkSync('configuracoes/layout.tsx');
  fs.unlinkSync('configuracoes/page.tsx');
  let a = ler('configuracoes/api/page.tsx');
  a = troca(a, "export default async function PaginaApiDoBot({ params }: { params: Promise<{ id: string }> }) {\n  const { id } = await params;\n  return <TelaDeConexao identificador={id} />;", 'export function PaginaApiDoBot() {\n  const { contato } = useContato();\n  return <TelaDeConexao identificador={contato.id} />;', 'cf/api');
  a = troca(a, "import { TelaDeConexao } from './tela';", "import { useContato } from '../../contato';\nimport { TelaDeConexao } from './tela';", 'cf/api');
  fs.writeFileSync('configuracoes/api/api.tsx', a);
  fs.unlinkSync('configuracoes/api/page.tsx');
  let k = ler('configuracoes/keys/page.tsx');
  k = troca(k, 'export default function PaginaChavesDoBot() {', 'export function PaginaChavesDoBot() {', 'cf/keys');
  fs.writeFileSync('configuracoes/keys/keys.tsx', k);
  fs.unlinkSync('configuracoes/keys/page.tsx');
}
/* ---------------- integracoes ---------------- */
{
  fs.writeFileSync('integracoes/casca.tsx', "import { Outlet } from 'react-router-dom';\nimport { CascaDoModulo } from '../contato';\nimport './cabecalho-de-pagina.css';\nimport './integracoes.css';\n\nexport function CascaDeIntegracoes() {\n  return (\n    <CascaDoModulo ativo=\"Integrações\">\n      <Outlet />\n    </CascaDoModulo>\n  );\n}\n");
  fs.unlinkSync('integracoes/layout.tsx');
  let p = ler('integracoes/page.tsx');
  p = p.replace(/export default (async )?function (\w+)\([^)]*\) \{/, (m, a, nome) => `export function ${nome}() {`);
  if (p.includes('await params')) {
    p = p.replace(/\n  const \{ id \} = await params;\n/, '\n  const { contato } = useContato();\n  const id = contato.id;\n');
    p = p.replace('import { IlustracaoIntegracao', "import { useContato } from '../contato';\nimport { IlustracaoIntegracao");
  }
  fs.writeFileSync('integracoes/integracoes.tsx', p);
  fs.unlinkSync('integracoes/page.tsx');
  let w = ler('integracoes/webhook/page.tsx');
  w = troca(w, "import { TelaDoWebhook } from './tela';", "import { useContato } from '../../contato';\nimport { TelaDoWebhook } from './tela';", 'webhook');
  w = troca(w, "export default async function PaginaWebhook({ params }: { params: Promise<{ id: string }> }) {\n  const { id } = await params;\n  return <TelaDoWebhook fluxoId={id} />;", 'export function PaginaWebhook() {\n  const { contato } = useContato();\n  return <TelaDoWebhook fluxoId={contato.id} />;', 'webhook');
  fs.writeFileSync('integracoes/webhook/webhook.tsx', w);
  fs.unlinkSync('integracoes/webhook/page.tsx');
}
/* ---------------- contatos ---------------- */
{
  fs.writeFileSync('contatos/casca.tsx', "import { Outlet } from 'react-router-dom';\nimport { BarrasDoContato } from '../contato';\nimport './contatos.css';\n\nexport function CascaDeContatos() {\n  return (\n    <div className=\"pt-app\">\n      <BarrasDoContato ativo=\"Contatos\" />\n      <main>\n        <Outlet />\n      </main>\n    </div>\n  );\n}\n");
  fs.unlinkSync('contatos/layout.tsx');
  let s = ler('contatos/page.tsx'), f = 'contatos';
  s = troca(s, "import { listarContatosDoFluxo } from '../../../lib/contatos-do-fluxo';", "import { useLeitura } from '../../../lib/consulta';\nimport type { ContatoListado } from '../../../lib/contatos-do-fluxo';\nimport { useContato } from '../contato';", f);
  s = troca(s, "export const dynamic = 'force-dynamic';\n\n", '', f);
  s = troca(s, "export default async function ListaContatosDoBot({ params }: { params: Promise<{ id: string }> }) {\n  const { id } = await params;\n  const contatos = await listarContatosDoFluxo(id);\n", 'export function ListaContatosDoBot() {\n  const { contato: bot } = useContato();\n  const id = bot.id;\n  const leitura = useLeitura<ContatoListado[]>(`/v1/gestao/fluxos/${id}/contatos`);\n  const contatos = leitura.data ?? [];\n', f);
  s = troca(s, 'formatarUltimaInteracao(contato.ultimaConversa)', 'formatarUltimaInteracao(contato.ultimaConversa ? new Date(contato.ultimaConversa) : null)', f);
  fs.writeFileSync('contatos/lista.tsx', s);
  fs.unlinkSync('contatos/page.tsx');
  let d = ler('contatos/[contatoId]/page.tsx'), g = 'detalhe';
  d = troca(d, "import { notFound } from 'next/navigation';\n", "import { useParams, useSearchParams } from 'react-router-dom';\n", g);
  d = troca(d, "import { carregarDetalheContatoDoFluxo } from '../../../../lib/contatos-do-fluxo';", "import { ErroDaApi } from '../../../../lib/api';\nimport { useLeitura } from '../../../../lib/consulta';\nimport type { DetalheDoContato } from '../../../../lib/contatos-do-fluxo';\nimport { NaoEncontrado } from '../../../nao-encontrado';\nimport { useContato } from '../../contato';", g);
  d = troca(d, "export const dynamic = 'force-dynamic';\n\n", '', g);
  d = troca(d, "export default async function DetalheContatoDoBot({\n  params,\n  searchParams,\n}: {\n  params: Promise<{ id: string; contatoId: string }>;\n  searchParams: Promise<{ ticketId?: string }>;\n}) {\n  const [{ id, contatoId }, { ticketId }] = await Promise.all([params, searchParams]);\n  const dados = await carregarDetalheContatoDoFluxo(id, contatoId, ticketId);\n  if (!dados) notFound();\n", "export function DetalheContatoDoBot() {\n  const { contato: bot } = useContato();\n  const id = bot.id;\n  const { contatoId = '' } = useParams();\n  const [parametros] = useSearchParams();\n  const ticketId = parametros.get('ticketId') ?? undefined;\n  const leitura = useLeitura<DetalheDoContato>(\n    `/v1/gestao/fluxos/${id}/contatos/${contatoId}${ticketId ? `?ticketId=${encodeURIComponent(ticketId)}` : ''}`,\n  );\n  if (leitura.error instanceof ErroDaApi && leitura.error.status === 404) return <NaoEncontrado />;\n  if (!leitura.data) return null;\n  const dados = leitura.data;\n", g);
  fs.mkdirSync('contatos/detalhe', { recursive: true });
  fs.writeFileSync('contatos/detalhe/detalhe.tsx', d);
  fs.unlinkSync('contatos/[contatoId]/page.tsx');
  fs.renameSync('contatos/[contatoId]/editar.tsx', 'contatos/detalhe/editar.tsx');
  fs.rmdirSync('contatos/[contatoId]');
}
console.log('rotas ok');
