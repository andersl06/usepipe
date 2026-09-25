import { useState, type FormEvent } from 'react';
import { Illustration } from '@pipe/ui';
import { IconePortal } from '../../../../componentes/icones-portal';
import { useRead } from '../../../../lib/consulta';
import { numero } from '../../../../lib/formato';
import { useContact } from '../../contato';
import { createLinkTracked } from './gravar';
import type { LinkRastreado, Resultado } from './dados';

/**
 * Growth › Links rastreados — tela irmã do `growth/clicktracker` que já
 * existe (aquele é a medição de anúncios Click-to-WhatsApp da Meta; este é o
 * link curto com contagem de clique de verdade, backend em
 * `apps/api/src/dominio/rastreador-de-cliques.ts`, já testado). Sem ficha da
 * Blip para medir — a origem não tem esta tela —, então a forma segue a dos
 * outros itens do menu (`mensagens-ativas/tela.tsx`, `pagamentos.tsx`):
 * `gr-container`/`gr-cabeca`/`gr-lista`/`gr-tabela-rolagem` e o modal de
 * criação em `gr-sobreposicao`/`gr-modal`.
 *
 * Sem filtro de período na tela (a leitura aceita `?desde=&ate=`, mas nada no
 * pedido pede um seletor de datas aqui) — "Cliques" é sempre o total; se um
 * dia precisar do corte por período, é um `<input type="date">` a mais nesta
 * mesma leitura.
 */

/** Copia o link curto para a área de transferência — mesma ideia (palavra, não ícone) de `paginas/contrato/copiar.tsx`. */
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

      <div className="gr-modal-acoes">
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
    `/v1/gestao/fluxos/${flowId}/links-rastreados`,
  );
  const links = read.data?.data ?? [];

  return (
    <div className="gr-container">
      <header className="gr-cabeca">
        <div>
          <h1>Links rastreados</h1>
          <p>Crie links curtos para suas campanhas e acompanhe quantas pessoas clicaram.</p>
        </div>
        <div className="gr-cabeca-acoes">
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
          <div className="gr-tabela-rolagem">
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
          <div className="gr-vazio">
            <Illustration nome="vazio" tamanho={72} />
            <h2>Crie o primeiro link rastreado</h2>
            <p>Cadastre um destino e receba um link curto para medir os cliques da campanha.</p>
          </div>
        )}
      </section>

      {create ? (
        <div
          className="gr-sobreposicao"
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
