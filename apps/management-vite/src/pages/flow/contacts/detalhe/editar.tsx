import { useState } from 'react';
import { IconePortal } from '@pipe/ui/icones-portal';
import { Select } from '@pipe/ui/select';
import { saveContact } from './gravar';

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

/*
 * `.user-info-card` card from the `details-container` template: "Informações" header + pencil (`notes`), label 30% / value 70% rows (`mt4`), contact ID with a tooltip, and "Extras" (`mt5`) with the JSON keys. `PATCH /v1/contatos/:id` — `gravar.ts`.
 */
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
    const resultado = await saveContact(props.contactId, {
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
    <section className="ct-information">
      <div className="ct-information-content">
        <div className="ct-usuario-info">
          <div className="ct-information-header">
            <span className="ct-information-title">Informações</span>
            {editando ? (
              <div className="ct-edit-actions">
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
              // ponytail: no dedicated column for "test user" in the
              // contact schema; the checkbox stays visual, as before, until there's somewhere to store it.
              <label className="ct-box-test">
                <input type="checkbox" />
                <span>Usuário de teste</span>
              </label>
            ) : null}
            <Linha
              nome="nome"
              rotulo="Nome"
              value={props.nome}
              editando={editando}
              classe="ct-fs-6"
              first
            />
            <Linha
              nome="email"
              rotulo="E-mail"
              value={props.email}
              editando={editando}
              classe="ct-fs-6"
            />
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
                <Select
                  className="ct-selection"
                  name="genero"
                  defaultValue={genero ?? ''}
                  aria-label="Gênero"
                >
                  <option value="">Selecione o gênero</option>
                  <option value="male">Masculino</option>
                  <option value="female">Feminino</option>
                </Select>
              ) : (
                <span className="ct-value ct-f4">{generoExibido || '-'}</span>
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
                <span className="ct-value-container">
                  <span className="ct-value-internal" title={props.identity}>
                    <span className="ct-value-text">{props.identity}</span>
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
              <span className="ct-key-extra">{key}</span>
              <span className="ct-value-extra">
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
    <div className={first ? 'ct-linha ct-line--first' : 'ct-linha'}>
      <span className={`ct-rotulo ${classe}`}>{rotulo}</span>
      {editando ? (
        <input className="ct-input" type="text" name={nome} defaultValue={value ?? ''} />
      ) : (
        <span className={`ct-value ${classe}`}>{value || '-'}</span>
      )}
    </div>
  );
}
