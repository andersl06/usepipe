import { useState, type FormEvent } from 'react';
import { Illustration } from '@pipe/ui';
import { IconePortal } from '../../../../components/icones-portal';
import { useRead } from '../../../../lib/query';
import { numero } from '../../../../lib/format';
import { useContact } from '../../contact';
import { createLinkTracked } from './gravar';
import type { LinkRastreado, Resultado } from './data';

/**
 * Growth › Links rastreados — a sibling screen to the existing `growth/clicktracker` (that one measures Meta's Click-to-WhatsApp ad performance; this one is the short link with real click counting, backed by `apps/api/src/dominio/rastreador-de-cliques.ts`, already tested). No Blip reference for this screen — the origin doesn't have it —, so its shape follows the other menu items (`mensagens-ativas/tela.tsx`, `pagamentos.tsx`): `gr-container`/`gr-cabeca`/`gr-lista`/`gr-tabela-rolagem` and the creation modal in `gr-sobreposicao`/`gr-modal`.
 *
 * No period filter on the screen (the read endpoint accepts `?desde=&ate=`, but nothing in the request calls for a date picker here) — "Cliques" is always the total; if a period cut is ever needed, it's one more `<input type="date">` on this same read.
 */

/** Copies the short link to the clipboard — same idea (word, not icon) as `paginas/contrato/copiar.tsx`. */
function BotaoCopiarLink({ url, nome }: { url: string; nome: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      className="gr-botao"
      type="button"
      aria-label={`Copiar o link de ${nome}`}
      onClick={() => {
        void navigator.clipboard?.writeText(url).then(() => setCopiado(true));
      }}
    >
      {copiado ? 'Copiado' : 'Copiar link'}
    </button>
  );
}

function FormularioDeLink({ flowId, toCreate }: { flowId: string; toCreate: () => void }) {
  const [nome, setNome] = useState('');
  const [destination, setDestination] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<Resultado<LinkRastreado> | null>(null);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    setResultado(null);
    const r = await createLinkTracked(flowId, { nome: nome.trim(), destination: destination.trim() });
    setEnviando(false);
    if (r.ok) {
      setNome('');
      setDestination('');
      toCreate();
    } else {
      setResultado(r);
    }
  }

  const errorName = resultado && !resultado.ok && resultado.campo === 'nome' ? resultado.error : null;
  const errorDestination = resultado && !resultado.ok && resultado.campo === 'destino' ? resultado.error : null;
  const errorGeneral = resultado && !resultado.ok && !resultado.campo ? resultado.error : null;

  return (
    <form className="gr-formulario" onSubmit={(e) => void enviar(e)}>
      <label>
        Nome do link
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Anúncio de setembro"
          required
          disabled={enviando}
        />
      </label>
      {errorName ? (
        <p className="gr-aviso" role="alert">
          {errorName}
        </p>
      ) : null}

      <label>
        URL de destino
        <input
          type="url"
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          placeholder="https://exemplo.com/promo"
          required
          disabled={enviando}
        />
      </label>
      {errorDestination ? (
        <p className="gr-aviso" role="alert">
          {errorDestination}
        </p>
      ) : null}

      {errorGeneral ? (
        <p className="gr-aviso" role="alert">
          {errorGeneral}
        </p>
      ) : null}

      <div className="gr-modal-actions">
        <button className="gr-botao gr-botao-primario" type="submit" disabled={enviando}>
          {enviando ? 'Criando…' : 'Criar link'}
        </button>
      </div>
    </form>
  );
}

export default function PageTrackedLinks() {
  const { contact } = useContact();
  const flowId = contact.id;
  const [create, setCreate] = useState(false);
  const read = useRead<{ data: LinkRastreado[] }>(
    `/v1/management/flows/${flowId}/links-tracked`,
  );
  const links = read.data?.data ?? [];

  return (
    <div className="gr-container">
      <header className="gr-cabeca">
        <div>
          <h1>Links rastreados</h1>
          <p>Crie links curtos para suas campanhas e acompanhe quantas pessoas clicaram.</p>
        </div>
        <div className="gr-header-actions">
          <button
            className="gr-botao gr-botao-primario"
            type="button"
            onClick={() => setCreate(true)}
          >
            Criar link
          </button>
        </div>
      </header>

      <section className="gr-lista">
        {links.length ? (
          <div className="gr-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Link curto</th>
                  <th>Destino</th>
                  <th>Cliques</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {links.map((link) => (
                  <tr key={link.id}>
                    <td>{link.nome}</td>
                    <td>{link.urlCurta}</td>
                    <td>{link.destinationUrl}</td>
                    <td className="num">{numero(link.cliques)}</td>
                    <td>
                      <BotaoCopiarLink url={link.urlCurta} nome={link.nome} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="gr-empty">
            <Illustration nome="vazio" tamanho={72} />
            <h2>Crie o primeiro link rastreado</h2>
            <p>Cadastre um destino e receba um link curto para medir os cliques da campanha.</p>
          </div>
        )}
      </section>

      {create ? (
        <div
          className="gr-overlay"
          role="presentation"
          onMouseDown={(e) => e.target === e.currentTarget && setCreate(false)}
        >
          <section
            className="gr-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="gr-titulo-link-rastreado"
          >
            <header className="gr-modal-cabeca">
              <div>
                <h2 id="gr-titulo-link-rastreado">Criar link rastreado</h2>
              </div>
              <button
                className="gr-icone-botao"
                type="button"
                aria-label="Fechar"
                onClick={() => setCreate(false)}
              >
                <IconePortal nome="fechar" tamanho={20} />
              </button>
            </header>
            <FormularioDeLink flowId={flowId} toCreate={() => setCreate(false)} />
          </section>
        </div>
      ) : null}
    </div>
  );
}
