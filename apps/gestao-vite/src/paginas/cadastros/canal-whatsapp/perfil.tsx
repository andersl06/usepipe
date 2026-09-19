import { useEffect, useState } from 'react';
import { Botao, Campo, Etiqueta, Seletor } from '@pipe/ui';
import { useCanalWhatsapp } from './casca';
import { useLeitura } from '../../../lib/consulta';
import { gravarPerfilWhatsapp } from '../../../lib/canais-gravar';
import { CATEGORIAS_DO_PERFIL, LIMITES_DO_PERFIL, type PerfilVisivel } from '../../../lib/canais';

/** `data:image/…` — mesmo formato que a foto do fluxo usa para atravessar o JSON. */
function lerComoDataUrl(arquivo: File): Promise<string | null> {
  return new Promise((resolver) => {
    const leitor = new FileReader();
    leitor.onload = () => resolver(typeof leitor.result === 'string' ? leitor.result : null);
    leitor.onerror = () => resolver(null);
    leitor.readAsDataURL(arquivo);
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

/** Acordeão 1: só leitura — a Blip exige aprovação da Meta para trocar; nós ainda não mandamos essa troca. */
function AcordeaoNomeDeExibicao({ perfil }: { perfil: PerfilVisivel }) {
  return (
    <details className="cw-acordeao" open>
      <summary>Nome de exibição da empresa</summary>
      <div className="cw-acordeao-corpo">
        <p className="sub" style={{ margin: 0 }}>
          O nome adotado passa por avaliação e aprovação da Meta.
        </p>
        <label style={rotulo}>
          <span className="sub">Nome de exibição da empresa</span>
          <Campo value={perfil.nome.exibicao ?? ''} readOnly disabled />
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

/** Acordeão 2: recurso que a Blip tem e a Cloud API que consumimos hoje não expõe — desabilitado, "em breve". */
function AcordeaoNomeDeUsuario() {
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

function AcordeaoDadosDaEmpresa({
  canalId,
  numeroAtivado,
  perfil,
  aoGravar,
}: {
  canalId: string;
  numeroAtivado: string;
  perfil: PerfilVisivel;
  aoGravar: (novo: PerfilVisivel) => void;
}) {
  const [categoria, setCategoria] = useState(perfil.categoria);
  const [endereco, setEndereco] = useState(perfil.endereco);
  const [email, setEmail] = useState(perfil.email);
  const [descricao, setDescricao] = useState(perfil.descricao);
  const [foto, setFoto] = useState<File | null>(null);
  const [previaFoto, setPreviaFoto] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);
  const [gravandoFoto, setGravandoFoto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    setCategoria(perfil.categoria);
    setEndereco(perfil.endereco);
    setEmail(perfil.email);
    setDescricao(perfil.descricao);
  }, [perfil]);

  const mudou =
    categoria !== perfil.categoria || endereco !== perfil.endereco || email !== perfil.email || descricao !== perfil.descricao;

  async function salvar() {
    setGravando(true);
    setErro(null);
    const resultado = await gravarPerfilWhatsapp(canalId, { categoria, endereco, email, descricao });
    setGravando(false);
    if (!resultado.ok) {
      setErro(resultado.erro);
      return;
    }
    aoGravar(resultado.valor);
  }

  async function salvarFoto() {
    if (!foto) return;
    setGravandoFoto(true);
    setErro(null);
    const dataUrl = await lerComoDataUrl(foto);
    if (!dataUrl) {
      setGravandoFoto(false);
      setErro('Não foi possível ler a imagem.');
      return;
    }
    const resultado = await gravarPerfilWhatsapp(canalId, { foto: dataUrl });
    setGravandoFoto(false);
    if (!resultado.ok) {
      setErro(resultado.erro);
      return;
    }
    setFoto(null);
    setPreviaFoto(null);
    aoGravar(resultado.valor);
  }

  return (
    <details className="cw-acordeao" open>
      <summary>Dados da empresa</summary>
      <div className="cw-acordeao-corpo">
        {erro ? <Etiqueta tom="erro">{erro}</Etiqueta> : null}

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
                  const arquivo = e.target.files?.[0] ?? null;
                  setFoto(arquivo);
                  setPreviaFoto(arquivo ? URL.createObjectURL(arquivo) : null);
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
              <option key={c.valor} value={c.valor}>
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
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            disabled={gravando}
          />
          <span className="cw-contador">
            {descricao.length}/{LIMITES_DO_PERFIL.descricao}
          </span>
        </label>

        <div className="cl-acoes">
          <Botao type="button" variante="primario" disabled={!mudou || gravando} onClick={() => void salvar()}>
            {gravando ? 'Salvando…' : 'Salvar'}
          </Botao>
        </div>
      </div>
    </details>
  );
}

function PainelDePreVisualizacao({ nome, perfil }: { nome: string; perfil: PerfilVisivel }) {
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
 * Perfil da empresa — `FICHA-canal-whatsapp.md` §2. A tabela de campos ali
 * (endereço/e-mail) veio com os VALORES trocados na captura — bug de UI da
 * Blip, registrado e não copiado (§2, "Achado relevante"): aqui Endereço
 * comercial grava em `endereco`, E-mail de contato grava em `email`, sem troca.
 */
export function AbaPerfil() {
  const { canal } = useCanalWhatsapp();
  const leitura = useLeitura<PerfilVisivel>(`/v1/canais/whatsapp/${canal.id}/perfil`);
  const [perfil, setPerfil] = useState<PerfilVisivel | null>(null);

  useEffect(() => {
    if (leitura.data) setPerfil(leitura.data);
  }, [leitura.data]);

  if (!perfil) return null;

  return (
    <div>
      <h3 style={{ marginTop: 0 }}>Quais informações serão exibidas no seu perfil do WhatsApp?</h3>
      <p className="sub">Essas informações estarão visíveis para todos os seus clientes</p>

      <div className="cw-perfil">
        <div className="cw-acordeoes">
          <AcordeaoNomeDeExibicao perfil={perfil} />
          <AcordeaoNomeDeUsuario />
          <AcordeaoDadosDaEmpresa
            canalId={canal.id}
            numeroAtivado={canal.numero ?? canal.numeroId ?? ''}
            perfil={perfil}
            aoGravar={setPerfil}
          />
        </div>
        <PainelDePreVisualizacao nome={canal.nomeExibicao ?? perfil.nome.exibicao ?? canal.nome} perfil={perfil} />
      </div>
    </div>
  );
}
