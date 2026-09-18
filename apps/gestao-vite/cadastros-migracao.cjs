/* Converte as páginas de Regras/Atendentes/Comunicação/Preferências. Uma vez. */
const fs = require('fs');
const path = require('path');
const D = path.join(__dirname, 'src', 'paginas', 'cadastros');
const ler = (f) => fs.readFileSync(path.join(D, f), 'utf8');
const gravar = (f, s) => fs.writeFileSync(path.join(D, f), s);
const troca = (s, a, b, f) => {
  if (!s.includes(a)) throw new Error(f + ': não achei: ' + a.slice(0, 70));
  return s.replace(a, b);
};
function comum(s) {
  s = s.replace(/^'use client';\r?\n\r?\n?/m, '');
  s = s.replace(/from '\.\.\/\.\.\/\.\.\/(lib|componentes)\//g, "from '../../$1/");
  s = s.replace(/from '\.\.\/acoes'/g, "from '../../lib/acoes'");
  s = s.replace(/from '\.\/cores'/g, "from '../../lib/cores-de-fila'");
  s = s.replace(/import Link from 'next\/link';/, "import Link from '../../componentes/link';");
  s = s.replace(/^export const dynamic = 'force-dynamic';\n\n?/m, '');
  return s;
}
const LEITURA = "import { useLeitura } from '../../lib/consulta';\n";

/** Troca `export default async function X() {\n  const … = await carregarY(…);` por leitura com hook. */
function leitura(s, nome, chamada, tipo, caminho, f) {
  const re = new RegExp(`export default async function ${nome}\\(\\) \\{\\n  const (\\{[^}]*\\}|\\w+) = await ${chamada};\\n`);
  const m = s.match(re);
  if (!m) throw new Error(f + ': prelúdio não achado');
  const novo = `export function ${nome}() {\n  const leitura = useLeitura<${tipo}>('${caminho}');\n  if (!leitura.data) return null;\n  const ${m[1]} = leitura.data;\n`;
  return s.replace(m[0], novo);
}

/* ---------------- Regras › atendimento ---------------- */
{
  let s = comum(ler('regras-atendimento.tsx')), f = 'regras-atendimento';
  s = troca(s, "import { carregarRegrasDeFila } from '../../lib/cadastros';", LEITURA + "import type { FilaParaEscolher, RegraDeFilaCadastrada } from '../../lib/cadastros';", f);
  s = s.replace("import { FormularioRegraFila } from './formulario';", "import { FormularioRegraFila } from './regras-atendimento-formulario';");
  s = leitura(s, 'PaginaRegrasDeAtendimento', 'carregarRegrasDeFila\\(\\)', 'RegrasDeFila', '/v1/gestao/regras/atendimento', f);
  s = s.replace(/^(import [^\n]*\n)+/, (m) => m + "\ninterface RegrasDeFila {\n  regras: RegraDeFilaCadastrada[];\n  filas: FilaParaEscolher[];\n  padroes: { inbox: string; fila: string | null }[];\n}\n");
  gravar('regras-atendimento.tsx', s);
  gravar('regras-atendimento-formulario.tsx', comum(ler('regras-atendimento-formulario.tsx')));
}
/* ---------------- Regras › horários ---------------- */
{
  let s = comum(ler('regras-horarios.tsx')), f = 'regras-horarios';
  s = troca(s, "import { fusoDoTenant } from '../../lib/banco';\n", '', f);
  s = troca(s, "import { carregarHorarios } from '../../lib/cadastros';", LEITURA + "import type { Horarios } from '../../lib/cadastros';", f);
  s = s.replace("import { FormulariosDeHorario } from './formulario';", "import { FormulariosDeHorario } from './regras-horarios-formulario';");
  s = troca(s, "export default async function PaginaHorarios() {\n  // Em série, e não em `Promise.all`: as duas abrem `comTenant` por dentro.\n  const fuso = await fusoDoTenant();\n  const { horarios, filasSemHorario, agora } = await carregarHorarios();", "export function PaginaHorarios() {\n  const leitura = useLeitura<Horarios & { fuso: string }>('/v1/gestao/regras/horarios');\n  if (!leitura.data) return null;\n  const { fuso, horarios, filasSemHorario, agora } = leitura.data;", f);
  gravar('regras-horarios.tsx', s);
  gravar('regras-horarios-formulario.tsx', comum(ler('regras-horarios-formulario.tsx')));
}
/* ---------------- Atendentes › gestão ---------------- */
{
  let s = comum(ler('atendentes-gestao.tsx')), f = 'atendentes-gestao';
  s = troca(s, "import { carregarAtendentes } from '../../lib/cadastros';", LEITURA + "import type { AtendenteCadastrado } from '../../lib/cadastros';", f);
  s = leitura(s, 'PaginaGestaoDeAtendentes', 'carregarAtendentes\\(\\)', 'AtendenteCadastrado[]', '/v1/gestao/atendentes/gestao', f);
  gravar('atendentes-gestao.tsx', s);
}
/* ---------------- Atendentes › filas ---------------- */
{
  let s = comum(ler('atendentes-filas.tsx')), f = 'atendentes-filas';
  s = troca(s, "import { carregarFilas } from '../../lib/cadastros';", LEITURA + "import type { FilaCadastrada, HorarioParaEscolher } from '../../lib/cadastros';", f);
  s = s.replace("import { FormularioFila } from './formulario';", "import { FormularioFila } from './atendentes-filas-formulario';");
  s = leitura(s, 'PaginaFilas', 'carregarFilas\\(\\)', '{ filas: FilaCadastrada[]; horarios: HorarioParaEscolher[] }', '/v1/gestao/atendentes/filas', f);
  gravar('atendentes-filas.tsx', s);
  gravar('atendentes-filas-formulario.tsx', comum(ler('atendentes-filas-formulario.tsx')));
}
/* ---------------- Atendentes › pausas ---------------- */
{
  let s = comum(ler('atendentes-pausas.tsx')), f = 'atendentes-pausas';
  s = troca(s, "import { carregarPausas } from '../../lib/cadastros';", LEITURA + "import type { UsoDePausas } from '../../lib/cadastros';", f);
  s = s.replace("import { FormularioMotivoPausa } from './formulario';", "import { FormularioMotivoPausa } from './atendentes-pausas-formulario';");
  s = leitura(s, 'PaginaPausas', 'carregarPausas\\(\\)', 'UsoDePausas', '/v1/gestao/atendentes/pausas', f);
  gravar('atendentes-pausas.tsx', s);
  gravar('atendentes-pausas-formulario.tsx', comum(ler('atendentes-pausas-formulario.tsx')));
}
/* ---------------- Comunicação › modelos ---------------- */
{
  let s = comum(ler('comunicacao-modelos.tsx')), f = 'comunicacao-modelos';
  s = s.replace("import { FormularioModelo } from './formulario';", "import { FormularioModelo } from './comunicacao-modelos-formulario';");
  const m = s.match(/export default async function PaginaModelos\(\) \{\n(?:  \/\/[^\n]*\n)*  const modelos = await carregarModelos\(\);\n  const canais = await carregarCanaisWhatsapp\(\);\n/);
  if (!m) throw new Error(f + ': prelúdio');
  s = s.replace(m[0], "export function PaginaModelos() {\n  const leitura = useLeitura<{ modelos: ModeloListado[]; canais: CanalWhatsapp[] }>(\n    '/v1/gestao/comunicacao/modelos',\n  );\n  if (!leitura.data) return null;\n  const { modelos, canais } = leitura.data;\n");
  s = s.replace(/  carregarCanaisWhatsapp,\n/, '').replace(/  carregarModelos,\n/, '');
  s = s.replace(/(\} from '\.\.\/\.\.\/lib\/comunicacao';\n)/, "  type CanalWhatsapp,\n  type ModeloListado,\n$1" + LEITURA);
  gravar('comunicacao-modelos.tsx', s);
  gravar('comunicacao-modelos-formulario.tsx', comum(ler('comunicacao-modelos-formulario.tsx')));
}
/* ---------------- Comunicação › respostas prontas ---------------- */
{
  let s = comum(ler('comunicacao-respostas.tsx')), f = 'comunicacao-respostas';
  s = troca(s, "import { carregarRespostasProntas } from '../../lib/comunicacao';", LEITURA + "import type { RespostaProntaListada } from '../../lib/comunicacao';", f);
  s = s.replace("import { FormularioRespostaPronta } from './formulario';", "import { FormularioRespostaPronta } from './comunicacao-respostas-formulario';");
  s = leitura(s, 'PaginaRespostasProntas', 'carregarRespostasProntas\\(\\)', 'RespostaProntaListada[]', '/v1/gestao/comunicacao/respostas-prontas', f);
  gravar('comunicacao-respostas.tsx', s);
  gravar('comunicacao-respostas-formulario.tsx', comum(ler('comunicacao-respostas-formulario.tsx')));
}
/* ---------------- Preferências ---------------- */
{
  fs.unlinkSync(path.join(D, 'configuracoes.tsx'));
  let s = comum(ler('configuracoes-regras.tsx')), f = 'configuracoes-regras';
  s = troca(s, "import { carregarRegras, ROTULO_ALVO, ROTULO_ESCOPO } from '../../lib/configuracoes';", LEITURA + "import {\n  ROTULO_ALVO,\n  ROTULO_ESCOPO,\n  type FilaConfigurada,\n  type RegraSlaConfigurada,\n} from '../../lib/configuracoes';", f);
  s = leitura(s, 'PaginaRegras', 'carregarRegras\\(\\)', '{ filas: FilaConfigurada[]; regras: RegraSlaConfigurada[] }', '/v1/gestao/configuracoes/regras', f);
  gravar('configuracoes-regras.tsx', s);

  s = comum(ler('configuracoes-dados.tsx')); f = 'configuracoes-dados';
  s = troca(s, "import { carregarDados } from '../../lib/configuracoes';", LEITURA + "import type { CanalConfigurado, EtiquetaConfigurada } from '../../lib/configuracoes';", f);
  s = leitura(s, 'PaginaDados', 'carregarDados\\(\\)', '{ etiquetas: EtiquetaConfigurada[]; canais: CanalConfigurado[] }', '/v1/gestao/configuracoes/dados', f);
  gravar('configuracoes-dados.tsx', s);

  s = comum(ler('configuracoes-gerais.tsx')); f = 'configuracoes-gerais';
  s = troca(s, "import { carregarGerais } from '../../lib/configuracoes';", LEITURA + "import type { ConfiguracoesGerais } from '../../lib/configuracoes';", f);
  s = leitura(s, 'PaginaConfiguracoesGerais', 'carregarGerais\\(\\)', 'ConfiguracoesGerais', '/v1/gestao/configuracoes/gerais', f);
  gravar('configuracoes-gerais.tsx', s);
}
console.log('cadastros ok');
