import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CardClosureTicket, avisarTicketFinalizado, type ClosureTag } from '@pipe/ui';
import type { EtiquetaDoDesk } from '@pipe/contracts';
import type { ConversationOpenRow } from '../lib/monitoring';
import { api } from '@pipe/ui/api';
import { useRead } from '../lib/query';

/**
 * The Monitoring menu keeps the Gestão operation route but reuses Desk's closing card because Blip shows one `close-modal` in both places.
 */
export function ModalFinishMonitoring({
  linha,
  aoFechar,
}: {
  linha: ConversationOpenRow;
  aoFechar: () => void;
}) {
  const [selecionadas, setSelecionadas] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const consultas = useQueryClient();
  const read = useRead<{ etiquetas: EtiquetaDoDesk[] }>('/v1/etiquetas?escopo=conversa');
  const etiquetas: ClosureTag[] = (read.data?.etiquetas ?? []).map((e) => ({
    id: e.id,
    nome: e.nome,
    cor: e.cor,
    requiredInClosure: e.requiredInClosure,
  }));

  useEffect(() => {
    if (!etiquetas.length) return;
    setSelecionadas((current) => current.length
      ? current
      : etiquetas.filter((etiqueta) => linha.labels.includes(etiqueta.nome)).map((etiqueta) => etiqueta.id));
  }, [etiquetas, linha.labels]);

  async function finalizar() {
    setEnviando(true);
    setError(null);
    try {
      await api.post(`/v1/management/monitoring/conversations/${linha.id}/finalize`, { etiqueta_ids: selecionadas });
      await consultas.invalidateQueries({ queryKey: ['api'] });
      avisarTicketFinalizado(linha.ticket);
      aoFechar();
    } catch (causa) {
      setError(causa instanceof Error ? causa.message : 'Não foi possível finalizar o ticket.');
      setEnviando(false);
    }
  }

  return (
    <CardClosureTicket
      numero={linha.ticket}
      etiquetas={etiquetas}
      selecionadas={selecionadas}
      error={error}
      enviando={enviando}
      aoSelecionar={setSelecionadas}
      aoCancelar={aoFechar}
      aoFinalizar={() => void finalizar()}
    />
  );
}
