import { AlternarTema } from './alternar-tema';
import type { EstadoAtendente } from '../servidor/consultas';

/**
 * Trilho de ícones. Seis seções e nada mais: o Desk não tem relatório, não tem regra e
 * não tem configuração de fila — isso é o Pipe Gestão, e é outro aplicativo.
 *
 * Só "Atendimentos" existe nesta etapa; as outras ficam desabilitadas com o motivo no
 * `title`, em vez de virarem caminho morto.
 */

export const COR_DO_ESTADO: Record<EstadoAtendente, string> = {
  online: '#5FA84B',
  pausa: 'var(--ochre)',
  invisivel: 'var(--ink-3)',
  offline: 'var(--line-strong)',
};

const SECOES = [
  {
    chave: 'mensagem-ativa',
    titulo: 'Mensagem ativa',
    caminho: 'm21 3-9 18-2.5-7.5L2 11 21 3Z',
  },
  {
    chave: 'respostas',
    titulo: 'Respostas prontas',
    caminho: 'M4 5h16M4 10h16M4 15h9',
  },
  {
    chave: 'contatos',
    titulo: 'Contatos',
    caminho: 'M4.5 20a7.5 7.5 0 0 1 15 0',
    circulo: { cx: 12, cy: 8.5, r: 3.5 },
  },
  {
    chave: 'etiquetas',
    titulo: 'Etiquetas',
    caminho: 'M3 11V4h7l10 10-7 7L3 11Z',
  },
] as const;

export function Trilho({ iniciais, nome, estado }: {
  iniciais: string;
  nome: string;
  estado: EstadoAtendente;
}) {
  return (
    <nav className="rail" aria-label="Seções do Desk">
      <svg className="mark" viewBox="-12 -12 132 132" aria-hidden="true">
        <g
          fill="none"
          stroke="currentColor"
          strokeWidth="12"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9,99 V36 Q9,9 36,9 H63" />
          <path d="M99,9 V72 Q99,99 72,99 H36" />
        </g>
      </svg>

      <button type="button" aria-current="true" title="Atendimentos">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4L3 21l1.1-4.6A8.4 8.4 0 1 1 21 11.5Z" />
        </svg>
      </button>

      {SECOES.map((secao) => (
        <button
          key={secao.chave}
          type="button"
          disabled
          title={`${secao.titulo} — entra na próxima etapa`}
          style={{ opacity: 0.4, cursor: 'not-allowed' }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            {'circulo' in secao && secao.circulo ? (
              <circle cx={secao.circulo.cx} cy={secao.circulo.cy} r={secao.circulo.r} />
            ) : null}
            <path d={secao.caminho} />
          </svg>
        </button>
      ))}

      <div className="spacer" />
      <AlternarTema />
      <div
        className="me"
        title={`${nome} — ${estado}`}
        style={{ ['--estado-cor' as string]: COR_DO_ESTADO[estado] }}
      >
        {iniciais}
      </div>
    </nav>
  );
}
