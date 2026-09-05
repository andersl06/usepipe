import Link from 'next/link';
import { janelaAberta, pertoDeExpirar, segundosRestantes } from '@pipe/core';
import { decorrido, duracaoCurta } from '../servidor/formato';
import type { ConversaDaLista, TipoCanalBanco } from '../servidor/consultas';

/** Rótulo curto do canal, do jeito que o atendente fala. */
const CANAL: Record<TipoCanalBanco, string> = {
  whatsapp_cloud: 'WHATSAPP',
  instagram: 'INSTAGRAM',
  email: 'E-MAIL',
  widget: 'SITE',
};

const RESUMO_POR_TIPO: Record<string, string> = {
  audio: '🎙 Áudio',
  imagem: '🖼 Imagem',
  documento: '📎 Documento',
  video: '🎬 Vídeo',
  localizacao: '📍 Localização',
};

function resumoDaUltima(conversa: ConversaDaLista): string {
  const prefixo = RESUMO_POR_TIPO[conversa.ultimaMensagemTipo ?? 'texto'];
  if (prefixo && conversa.ultimaMensagemTipo !== 'texto') return prefixo;
  return conversa.ultimaMensagem ?? 'Sem mensagem ainda';
}

export function ListaConversas({
  conversas,
  selecionadaId,
  busca,
  agora,
}: {
  conversas: ConversaDaLista[];
  selecionadaId: string | null;
  busca: string;
  agora: Date;
}) {
  return (
    <>
      <form className="busca" action="/">
        <input
          type="search"
          name="busca"
          defaultValue={busca}
          placeholder="Buscar por nome do contato ou por fila"
          aria-label="Buscar atendimento"
        />
      </form>

      {conversas.length === 0 ? (
        <p className="vazio">
          Nenhum atendimento na sua fila{busca ? ` para “${busca}”` : ''}. Rode{' '}
          <code>pnpm seed:demo</code> se você esperava ver a demonstração.
        </p>
      ) : (
        <ul className="convs">
          {conversas.map((conversa) => {
            const temJanela = conversa.canalTipo === 'whatsapp_cloud';
            const aberta = janelaAberta(conversa.janelaExpiraEm, agora);
            const expirando = temJanela && pertoDeExpirar(conversa.janelaExpiraEm, agora);
            const fechada = temJanela && !aberta;
            return (
              <li key={conversa.id}>
                <Link
                  className="conv"
                  href={`/?conversa=${conversa.id}`}
                  aria-current={conversa.id === selecionadaId ? 'true' : undefined}
                >
                  <span className="nm">{conversa.contatoNome ?? 'Sem nome'}</span>
                  <span className="t">
                    {conversa.ultimaMensagemEm ? decorrido(conversa.ultimaMensagemEm, agora) : '—'}
                  </span>
                  <span className="sn">{resumoDaUltima(conversa)}</span>
                  <span className="meta">
                    {conversa.filaNome ? (
                      <span className="pill q">{conversa.filaNome.toUpperCase()}</span>
                    ) : null}
                    <span className="pill ch">{CANAL[conversa.canalTipo]}</span>
                    {conversa.prioridade === 'alta' ? <span className="pill hi">ALTA</span> : null}
                    {conversa.prioridade === 'media' ? (
                      <span className="pill med">MÉDIA</span>
                    ) : null}
                    {conversa.estado === 'em_espera' ? (
                      <span className="pill info">EM ESPERA</span>
                    ) : null}
                    {expirando ? (
                      <span className="pill med">
                        JANELA {duracaoCurta(segundosRestantes(conversa.janelaExpiraEm, agora))}
                      </span>
                    ) : null}
                    {fechada ? <span className="pill hi">JANELA FECHADA</span> : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
