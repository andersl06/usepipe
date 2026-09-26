import { useEffect, useState } from 'react';
import { Botao, Campo, Etiqueta, Seletor } from '@pipe/ui';
import { useChannelWhatsapp } from './shell';
import { useRead } from '../../../../lib/query';
import { gravarPerfilWhatsapp } from '../../../../lib/channels-gravar';
import { CATEGORIAS_DO_PERFIL, LIMITES_DO_PERFIL, type PerfilVisivel } from '../../../../lib/channels';

/** `data:image/…` — the same format the flow's photo uses to cross the JSON. */
function lerComoDataUrl(file: File): Promise<string | null> {
  return new Promise((resolver) => {
    const leitor = new FileReader();
    leitor.onload = () => resolver(typeof leitor.result === 'string' ? leitor.result : null);
    leitor.onerror = () => resolver(null);
    leitor.readAsDataURL(file);
  });
}

const rotulo = { display: 'flex', flexDirection: 'column' as const, gap: '4px' };

function rotuloDoStatusMeta(status: string | null): string {
  if (!status) return '';
  const rotulos: Record<string, string> = {
    APPROVED: 'Aprovado',
    PENDING_REVIEW: 'Em análise',
    REJECTED: 'Rejeitado',
    NONE: 'Sem alteração pendente',
    AVAILABLE_WITHOUT_REVIEW: 'Disponível sem análise',
  };
  return rotulos[status] ?? status;
}

/** Accordion 1: read-only — Blip requires Meta approval to change it; we don't yet submit that change. */
function DisplayAccordionName({ perfil }: { perfil: PerfilVisivel }) {
  return (
    <details className="cw-acordeao" open>
      <summary>Nome de exibição da empresa</summary>
      <div className="cw-acordeao-corpo">
        <p className="sub" style={{ margin: 0 }}>
          O nome adotado passa por avaliação e aprovação da Meta.
        </p>
        <label style={rotulo}>
          <span className="sub">Nome de exibição da empresa</span>
          <Campo value={perfil.nome.display ?? ''} readOnly disabled />
        </label>
        {perfil.nome.status ? (
          <Etiqueta tom={perfil.nome.status === 'APPROVED' ? 'sucesso' : 'alerta'}>
            Status: {rotuloDoStatusMeta(perfil.nome.status)}
          </Etiqueta>
        ) : null}
        {perfil.nome.novoNome ? (
          <Etiqueta tom="alerta">
            Nome pendente de aprovação: {perfil.nome.novoNome} ({rotuloDoStatusMeta(perfil.nome.novoStatus)})
          </Etiqueta>
        ) : null}
      </div>
    </details>
  );
}

/** Accordion 2: a feature Blip has that the Cloud API we consume today doesn't expose — disabled, "em breve" (coming soon). */
function UserAccordionName() {
  return (
    <details className="cw-acordeao">
      <summary>Nome de usuário da empresa</summary>
      <div className="cw-acordeao-corpo">
        <label style={rotulo}>
          <span className="sub">Nome de usuário da empresa</span>
          <Campo value="" disabled placeholder="Em breve" />
        </label>
        <Etiqueta tom="neutro">Em breve</Etiqueta>
      </div>
    </details>
  );
}

function CompanyAccordionData({
  channelId,
  numeroAtivado,
  perfil,
  aoGravar,
}: {
  channelId: string;
  numeroAtivado: string;
  perfil: PerfilVisivel;
  aoGravar: (novo: PerfilVisivel) => void;
}) {
  const [categoria, setCategoria] = useState(perfil.categoria);
  const [endereco, setEndereco] = useState(perfil.endereco);
  const [email, setEmail] = useState(perfil.email);
  const [description, setDescription] = useState(perfil.description);
  const [foto, setFoto] = useState<File | null>(null);
  const [previaFoto, setPreviaFoto] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);
  const [gravandoFoto, setGravandoFoto] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCategoria(perfil.categoria);
    setEndereco(perfil.endereco);
    setEmail(perfil.email);
    setDescription(perfil.description);
  }, [perfil]);

  const mudou =
    categoria !== perfil.categoria || endereco !== perfil.endereco || email !== perfil.email || description !== perfil.description;

  async function salvar() {
    setGravando(true);
    setError(null);
    const resultado = await gravarPerfilWhatsapp(channelId, { categoria, endereco, email, description });
    setGravando(false);
    if (!resultado.ok) {
      setError(resultado.error);
      return;
    }
    aoGravar(resultado.value);
  }

  async function salvarFoto() {
    if (!foto) return;
    setGravandoFoto(true);
    setError(null);
    const dataUrl = await lerComoDataUrl(foto);
    if (!dataUrl) {
      setGravandoFoto(false);
      setError('Não foi possível ler a imagem.');
      return;
    }
    const resultado = await gravarPerfilWhatsapp(channelId, { foto: dataUrl });
    setGravandoFoto(false);
    if (!resultado.ok) {
      setError(resultado.error);
      return;
    }
    setFoto(null);
    setPreviaFoto(null);
    aoGravar(resultado.value);
  }

  return (
    <details className="cw-acordeao" open>
      <summary>Dados da empresa</summary>
      <div className="cw-acordeao-corpo">
        {error ? <Etiqueta tom="erro">{error}</Etiqueta> : null}

        <div>
          <p className="sub" style={{ marginBottom: '8px' }}>
            Altere a imagem exibida para seus contatos do WhatsApp. Recomendamos uma resolução mínima
            de 640x640 pixels. É possível importar arquivos nos formatos JPG, JPEG ou PNG.
          </p>
          <div className="cw-foto-linha">
            <img src={previaFoto ?? perfil.fotoUrl ?? undefined} alt="" />
            <label className="btn fantasma">
              Alterar imagem
              <input
                type="file"
                accept="image/jpeg,image/png"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  setFoto(file);
                  setPreviaFoto(file ? URL.createObjectURL(file) : null);
                }}
              />
            </label>
            <Botao type="button" variante="primario" disabled={!foto || gravandoFoto} onClick={() => void salvarFoto()}>
              {gravandoFoto ? 'Salvando…' : 'Salvar imagem'}
            </Botao>
          </div>
        </div>

        <label style={rotulo}>
          <span className="sub">Número ativado</span>
          <Campo value={numeroAtivado} readOnly disabled />
        </label>

        <label style={rotulo}>
          <span className="sub">Categoria da empresa</span>
          <Seletor value={categoria} onChange={(e) => setCategoria(e.target.value)} disabled={gravando}>
            {CATEGORIAS_DO_PERFIL.map((c) => (
              <option key={c.value} value={c.value}>
                {c.rotulo}
              </option>
            ))}
          </Seletor>
        </label>

        <label style={rotulo}>
          <span className="sub">Endereço comercial</span>
          <Campo
            value={endereco}
            maxLength={LIMITES_DO_PERFIL.endereco}
            onChange={(e) => setEndereco(e.target.value)}
            disabled={gravando}
          />
          <span className="cw-contador">
            {endereco.length}/{LIMITES_DO_PERFIL.endereco}
          </span>
        </label>

        <label style={rotulo}>
          <span className="sub">E-mail de contato</span>
          <Campo
            type="email"
            value={email}
            maxLength={LIMITES_DO_PERFIL.email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={gravando}
          />
          <span className="cw-contador">
            {email.length}/{LIMITES_DO_PERFIL.email}
          </span>
        </label>

        <label style={rotulo}>
          <span className="sub">Descrição da empresa</span>
          <textarea
            className="campo"
            rows={3}
            maxLength={LIMITES_DO_PERFIL.descricao}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={gravando}
          />
          <span className="cw-contador">
            {description.length}/{LIMITES_DO_PERFIL.descricao}
          </span>
        </label>

        <div className="cl-actions">
          <Botao type="button" variante="primario" disabled={!mudou || gravando} onClick={() => void salvar()}>
            {gravando ? 'Salvando…' : 'Salvar'}
          </Botao>
        </div>
      </div>
    </details>
  );
}

function PreViewPanel({ nome, perfil }: { nome: string; perfil: PerfilVisivel }) {
  return (
    <aside className="cw-preview">
      <img className="cw-preview-avatar" src={perfil.fotoUrl ?? undefined} alt="" />
      <strong>{nome}</strong>
      {perfil.sobre ? <p className="sub" style={{ margin: 0 }}>{perfil.sobre}</p> : null}
      {perfil.email ? <div className="cw-preview-linha">{perfil.email}</div> : null}
      {perfil.endereco ? <div className="cw-preview-linha">{perfil.endereco}</div> : null}
      {perfil.sites[0] ? <div className="cw-preview-linha">{perfil.sites[0]}</div> : null}
    </aside>
  );
}

/**
 * Company profile — `FICHA-canal-whatsapp.md` §2. The field table there (address/e-mail) came with SWAPPED VALUES in the capture — a Blip UI bug, recorded and not copied (§2, "Relevant finding"): here Endereço comercial writes to `endereco`, E-mail de contato writes to `email`, without the swap.
 *
 * The channel is the BOT's (`useChannelWhatsapp`); reading the profile requires `canal.gerenciar` in the `api` — without it, the `api` returns 403 and the tab says so.
 */
export function AbaPerfil() {
  const { channel, saude } = useChannelWhatsapp();
  const read = useRead<PerfilVisivel>(`/v1/channels/whatsapp/${channel.id}/profile`, { retry: false });
  const [perfil, setPerfil] = useState<PerfilVisivel | null>(null);

  useEffect(() => {
    if (read.data) setPerfil(read.data);
  }, [read.data]);

  if (read.error) return <p role="alert" className="cb-typo-16">Não foi possível carregar o perfil: {read.error.message}</p>;
  if (!perfil) return null;

  return (
    <div>
      <h3 style={{ marginTop: 0 }}>Quais informações serão exibidas no seu perfil do WhatsApp?</h3>
      <p className="sub">Essas informações estarão visíveis para todos os seus clientes</p>

      <div className="cw-perfil">
        <div className="cw-accordions">
          <DisplayAccordionName perfil={perfil} />
          <UserAccordionName />
          <CompanyAccordionData
            channelId={channel.id}
            numeroAtivado={saude?.numero ?? channel.numero ?? ''}
            perfil={perfil}
            aoGravar={setPerfil}
          />
        </div>
        <PreViewPanel nome={saude?.displayName ?? perfil.nome.display ?? channel.nome} perfil={perfil} />
      </div>
    </div>
  );
}
