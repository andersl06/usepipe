import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CardClosureTicket, avisarTicketFinalizado, type ClosureTag } from '@pipe/ui';
import type { EtiquetaDoDesk } from '@pipe/contracts';
import type { LinhaConversationAberta } from '../lib/monitoramento';
import { api } from '../lib/api';
import { useRead } from '../lib/consulta';

/**
 * O menu do monitoramento mantém a rota de operação da Gestão, mas usa o mesmo
 * cartão do Desk: a Blip mostra um único `close-modal` nos dois pontos.
 */
export function ModalFinalizarMonitoring({
  linha,
  aoFechar,
}: {
  linha: LinhaConversationAberta;
  aoFechar: () => void;
}) {
  const [selecionadas, setSelecionadas] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const consultas = useQueryClient();
  const read = useRead<{ etiquetas: EtiquetaDoDesk[] }>('/v1/etiquetas?escopo=conversa');
  const etiquetas: ClosureTag[] = read.data?.etiquetas ?? [];

  useEffect(() => {
    if (!etiquetas.length) return;
    setSelecionadas((current) => current.length
      ? current
      : etiquetas.filter((etiqueta) => linha.etiquetas.includes(etiqueta.nome)).map((etiqueta) => etiqueta.id));
  }, [etiquetas, linha.etiquetas]);

  async function finalizar() {
    setEnviando(true);
    setError(null);
    try {
      await api.post(`/v1/gestao/monitoramento/conversas/${linha.id}/finalizar`, { etiqueta_ids: selecionadas });
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
