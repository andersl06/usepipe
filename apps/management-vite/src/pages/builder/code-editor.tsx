import Editor, { loader } from '@monaco-editor/react';
// Core editor plus JavaScript highlighting only: no TypeScript language service, no CDN.
import * as monaco from 'monaco-editor/editor';
import 'monaco-editor/languages/definitions/javascript/register';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';

self.MonacoEnvironment = { getWorker: () => new EditorWorker() };
loader.config({ monaco });

/** Same surface as the Builder side panel fields (`.bl-panel .campo`). */
monaco.editor.defineTheme('pipe-builder', {
  base: 'vs-dark',
  inherit: true,
  rules: [],
  colors: {
    'editor.background': '#282828',
    'editor.foreground': '#f6f6f6',
    'editorGutter.background': '#282828',
    'editorLineNumber.foreground': '#6b6b6b',
  },
});

/** Script source editor for `ExecuteScript`/`ExecuteScriptV2`; loaded on demand by the actions panel. */
export default function CodeEditor({
  value,
  onChange,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  return (
    <div className="bl-campo-codigo-monaco">
      <Editor
        height="240px"
        language="javascript"
        theme="pipe-builder"
        value={value}
        onChange={(v) => onChange(v ?? '')}
        options={{
          ariaLabel,
          minimap: { enabled: false },
          fontFamily: "'IBM Plex Mono', ui-monospace, Menlo, Consolas, monospace",
          fontSize: 13,
          tabSize: 2,
          lineNumbersMinChars: 3,
          scrollBeyondLastLine: false,
          automaticLayout: true,
        }}
      />
    </div>
  );
}
