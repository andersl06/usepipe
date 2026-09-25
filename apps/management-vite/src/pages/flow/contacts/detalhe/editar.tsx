import { useState } from 'react';
import { IconePortal } from '../../../../components/icones-portal';
import { Selection } from '../../../../components/selection';
import { salvarContact } from './gravar';

interface Properties {
  contactId: string;
  nome: string | null;
  email: string | null;
  telefone: string | null;
  document: string | null;
  identity: string | null;
  atributos: Record<string, unknown>;
}

/** `''` (campo limpo na tela) vira `null` (apaga no banco); preenchido vai como veio. */
function ouNulo(value: string): string | null {
  const limpo = value.trim();
  return limpo === '' ? null : limpo;
}

/* Cartão `.user-info-card` do template `details-container`: cabeçalho
   "Informações" + lápis (`notes`), linhas rótulo 30% / valor 70% (`mt4`),
   ID do contato com dica, e "Extras" (`mt5`) com as chaves do JSON.
   `PATCH /v1/contatos/:id` — `gravar.ts`. */
export function InformationContact(props: Properties) {
  const [editando, setEditando] = useState(false);
  const [aviso, setAviso] = useState('');
  const [salvando, setSalvando] = useState(false);
  const city = typeof props.atributos['city'] === 'string' ? props.atributos['city'] : null;
  const genero = typeof props.atributos['gender'] === 'string' ? props.atributos['gender'] : null;
  const extras = Object.entries(props.atributos).filter(
    ([key]) => !['city', 'gender'].includes(key),
  );
  const generoExibido = genero === 'male' ? 'Masculino' : genero === 'female' ? 'Feminino' : genero;

  async function salvar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const data = new FormData(evento.currentTarget);
    setAviso('');
    setSalvando(true);
    const resultado = await salvarContact(props.contactId, {
      nome: ouNulo(String(data.get('nome') ?? '')),
      email: ouNulo(String(data.get('email') ?? '')),
      telefone_e164: ouNulo(String(data.get('telefone') ?? '')),
      document: ouNulo(String(data.get('documento') ?? '')),
      atributos: {
        city: ouNulo(String(data.get('cidade') ?? '')),
        gender: ouNulo(String(data.get('genero') ?? '')),
      },
    });
    setSalvando(false);
    if (!resultado.ok) {
      setAviso(resultado.error);
      return;
    }
    setEditando(false);
  }

  return (
    <section className="ct-informacoes">
      <div className="ct-informacoes-conteudo">
        <div className="ct-usuario-info">
          <div className="ct-informacoes-cabeca">
            <span className="ct-informacoes-titulo">Informações</span>
            {editando ? (
              <div className="ct-editar-acoes">
                <button
                  className="ct-botao-icone ct-botao-icone--curto"
                  type="button"
                  title="Cancelar"
                  aria-label="Cancelar"
                  onClick={() => {
                    setEditando(false);
                    setAviso('');
                  }}
                >
                  <IconePortal nome="fechar" tamanho={24} />
                </button>
                <button
                  className="ct-botao-icone ct-botao-icone--curto"
                  type="submit"
                  form="ct-formulario-edicao"
                  title="Salvar"
                  aria-label="Salvar"
                  disabled={salvando}
                >
                  <IconePortal nome="concluido" tamanho={24} />
                </button>
              </div>
            ) : (
              <span className="ct-dica">
                <button
                  className="ct-botao-icone ct-botao-icone--curto"
                  type="button"
                  title="Editar contato"
                  aria-label="Editar contato"
                  onClick={() => {
                    setEditando(true);
                    setAviso('');
                  }}
                >
                  <IconePortal nome="anotacoes" tamanho={24} />
                </button>
              </span>
            )}
          </div>
          <form id="ct-formulario-edicao" onSubmit={(evento) => void salvar(evento)}>
            {editando ? (
              // ponytail: sem coluna própria para "usuário de teste" no schema do
              // contato; a caixa fica visual, como já estava, até existir onde gravar.
              <label className="ct-caixa-teste">
                <input type="checkbox" />
                <span>Usuário de teste</span>
              </label>
            ) : null}
            <Linha nome="nome" rotulo="Nome" value={props.nome} editando={editando} classe="ct-fs-6" first />
            <Linha nome="email" rotulo="E-mail" value={props.email} editando={editando} classe="ct-fs-6" />
            <Linha
              nome="telefone"
              rotulo="Telefone"
              value={props.telefone}
              editando={editando}
              classe="ct-fs-6"
            />
            <Linha nome="cidade" rotulo="Cidade" value={city} editando={editando} classe="ct-f4" />
            <Linha
              nome="documento"
              rotulo="Documento"
              value={props.document}
              editando={editando}
              classe="ct-f4"
            />
            <div className="ct-linha">
              <span className="ct-rotulo ct-f4">Gênero</span>
              {editando ? (
                <Selection className="ct-selecao" name="genero" defaultValue={genero ?? ''} aria-label="Gênero">
                  <option value="">Selecione o gênero</option>
                  <option value="male">Masculino</option>
                  <option value="female">Feminino</option>
                </Selection>
              ) : (
                <span className="ct-valor ct-f4">{generoExibido || '-'}</span>
              )}
            </div>
            {props.identity ? (
              <div className="ct-linha ct-linha--centro">
                <span className="ct-rotulo-campo">
                  <span className="ct-f4">ID do contato</span>
                  <span
                    className="ct-info"
                    title="Identificador único que representa o contato dentro da plataforma"
                  >
                    <IconePortal nome="informacao" tamanho={16} />
                  </span>
                </span>
                <span className="ct-valor-container">
                  <span className="ct-valor-interno" title={props.identity}>
                    <span className="ct-valor-texto">{props.identity}</span>
                  </span>
                </span>
              </div>
            ) : null}
            {aviso ? (
              <p role="alert" className="ct-aviso">
                {aviso}
              </p>
            ) : null}
          </form>
        </div>
        <div className="ct-extras">
          <div className="ct-linha ct-linha--extras">
            <span className="ct-rotulo ct-fs-6">Extras</span>
          </div>
          {extras.map(([key, value]) => (
            <div className="ct-linha ct-linha--extra" key={key}>
              <span className="ct-chave-extra">{key}</span>
              <span className="ct-valor-extra">
                {typeof value === 'string' ? value : JSON.stringify(value)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Linha({
  nome,
  rotulo,
  value,
  editando,
  classe,
  first,
}: {
  nome: string;
  rotulo: string;
  value: string | null;
  editando: boolean;
  classe: string;
  first?: boolean;
}) {
  return (
    <div className={first ? 'ct-linha ct-linha--primeira' : 'ct-linha'}>
      <span className={`ct-rotulo ${classe}`}>{rotulo}</span>
      {editando ? (
        <input className="ct-entrada" type="text" name={nome} defaultValue={value ?? ''} />
      ) : (
        <span className={`ct-valor ${classe}`}>{value || '-'}</span>
      )}
    </div>
  );
}
