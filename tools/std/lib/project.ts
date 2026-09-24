import fs from 'node:fs';
import path from 'node:path';
import tsMorph from 'ts-morph';
import type { Project as ProjectType } from 'ts-morph';

const { ModuleKind, ModuleResolutionKind, Project, ScriptTarget, ts } = tsMorph;

type PackageJson = { name?: string; exports?: Record<string, unknown> | string };

function exportTarget(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  return exportTarget(record.types) ?? exportTarget(record.default) ?? exportTarget(record.import);
}

function sourceTarget(workspaceDir: string, target: string | undefined): string {
  if (!target) return path.join(workspaceDir, 'src/index.ts');
  let relative = target.replace(/^\.\//, '').replace(/^dist\//, 'src/').replace(/\.d\.ts$/, '.ts').replace(/\.js$/, '.ts');
  const candidate = path.join(workspaceDir, relative);
  if (fs.existsSync(candidate)) return candidate;
  if (fs.existsSync(candidate.replace(/\.ts$/, '.tsx'))) return candidate.replace(/\.ts$/, '.tsx');
  return candidate;
}

function workspacePaths(root: string): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const group of ['apps', 'packages']) {
    const groupDir = path.join(root, group);
    if (!fs.existsSync(groupDir)) continue;
    for (const entry of fs.readdirSync(groupDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const workspaceDir = path.join(groupDir, entry.name);
      const manifestPath = path.join(workspaceDir, 'package.json');
      if (!fs.existsSync(manifestPath)) continue;
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as PackageJson;
      if (!manifest.name) continue;
      const exportsRecord = typeof manifest.exports === 'object' && manifest.exports !== null
        ? manifest.exports as Record<string, unknown>
        : { '.': manifest.exports };
      for (const [subpath, definition] of Object.entries(exportsRecord)) {
        const key = subpath === '.' ? manifest.name : `${manifest.name}/${subpath.replace(/^\.\//, '')}`;
        result[key] = [sourceTarget(workspaceDir, exportTarget(definition))];
      }
      if (!result[manifest.name]) result[manifest.name] = [path.join(workspaceDir, 'src/index.ts')];
    }
  }
  return result;
}

export function loadWorkspaceProject(root: string): ProjectType {
  const resolvedRoot = fs.realpathSync.native(path.resolve(root));
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: {
      target: ScriptTarget.ES2022,
      module: ModuleKind.ESNext,
      moduleResolution: ModuleResolutionKind.Bundler,
      jsx: ts.JsxEmit.ReactJSX,
      allowImportingTsExtensions: true,
      noEmit: true,
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
      skipLibCheck: true,
      baseUrl: resolvedRoot,
      paths: workspacePaths(resolvedRoot),
    },
  });
  project.addSourceFilesAtPaths([
    path.join(resolvedRoot, 'apps/*/src/**/*.{ts,tsx}'),
    path.join(resolvedRoot, 'apps/*/tests/**/*.{ts,tsx}'),
    path.join(resolvedRoot, 'apps/*/semente/**/*.{ts,tsx}'),
    path.join(resolvedRoot, 'packages/*/src/**/*.{ts,tsx}'),
    path.join(resolvedRoot, 'packages/*/tests/**/*.{ts,tsx}'),
  ]);
  return project;
}
