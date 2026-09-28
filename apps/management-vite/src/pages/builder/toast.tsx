import { useEffect, useRef, useState } from 'react';
import { Icone } from '@pipe/ui';
import { expireToasts, type Toast, type ToastTone } from './toast-queue';

const GLIFO_POR_TOM: Record<ToastTone, 'cheque' | 'alerta' | 'perigo'> = {
  sucesso: 'cheque',
  aviso: 'alerta',
  perigo: 'perigo',
};

/**
 * The Builder's single toast (F-6.1 K, D-56): bottom-left, gradient by tone, up to 6 stacked
 * with the newest on top (array order does that on its own — see `toast-queue.ts`). Keeps its
 * own copy of the list so a paused item's deadline (`expireToasts`) can be pushed forward every
 * tick without the parent needing a setter beyond `onFechar`.
 */
export function BuilderToasts({
  toasts,
  onFechar,
  onPausar,
  onRetomar,
}: {
  toasts: Toast[];
  onFechar: (id: number) => void;
  onPausar: (id: number) => void;
  onRetomar: (id: number) => void;
}) {
  const [local, setLocal] = useState<Toast[]>(toasts);
  const pausadosRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    setLocal((prev) => {
      const porId = new Map(prev.map((t) => [t.id, t] as const));
      return toasts.map((t) => porId.get(t.id) ?? t);
    });
  }, [toasts]);

  useEffect(() => {
    const cronometro = setInterval(() => {
      setLocal((prev) => {
        const proximo = expireToasts(prev, Date.now(), pausadosRef.current);
        if (proximo.length !== prev.length) {
          const restam = new Set(proximo.map((t) => t.id));
          for (const t of prev) if (!restam.has(t.id)) onFechar(t.id);
        }
        return proximo;
      });
    }, 250);
    return () => clearInterval(cronometro);
  }, [onFechar]);

  function pausar(id: number): void {
    pausadosRef.current.add(id);
    onPausar(id);
  }

  function retomar(id: number): void {
    pausadosRef.current.delete(id);
    onRetomar(id);
  }

  if (local.length === 0) return null;

  return (
    <div className="bl-toast-lista">
      {local.map((toast) => (
        <div
          key={toast.id}
          className={`bl-toast bl-toast--${toast.tom}`}
          role={toast.tom === 'perigo' ? 'alert' : 'status'}
          onMouseEnter={() => pausar(toast.id)}
          onMouseLeave={() => retomar(toast.id)}
          onClick={() => onFechar(toast.id)}
        >
          <Icone nome={GLIFO_POR_TOM[toast.tom]} tamanho={24} className="bl-toast-icone" />
          <div className="bl-toast-texto">
            {toast.titulo ? <strong className="bl-toast-titulo">{toast.titulo}</strong> : null}
            <span>{toast.texto}</span>
          </div>
          <button
            type="button"
            className="close"
            aria-label="Fechar"
            onClick={(e) => {
              e.stopPropagation();
              onFechar(toast.id);
            }}
          >
            <Icone nome="x" tamanho={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
