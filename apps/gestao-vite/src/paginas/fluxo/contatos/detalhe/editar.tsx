import { useState } from 'react';
import { IconePortal } from '../../../../componentes/icones-portal';
import { salvarContato } from './gravar';

interface Propriedades {
  contatoId: string;
  nome: string | null;
  email: string | null;
  telefone: string | null;
  documento: string | null;
  identidade: string | null;
  atributos: Record<string, unknown>;
}

/** `''` (campo limpo na tela) vira `null` (apaga no banco); preenchido vai como veio. */
function ouNulo(valor: string): string | null {
  const limpo = valor.trim();
  return limpo === '' ? null : limpo;
}

/* Cartão `.user-info-card` do template `details-container`: cabeçalho
   "Informações" + lápis (`notes`), linhas rótulo 30% / valor 70% (`mt4`),
   ID do contato com dica, e "Extras" (`mt5`) com as chaves do JSON.
   `PATCH /v1/contatos/:id` — `gravar.ts`. */
export function InformacoesContato(props: Propriedades) {
  const [editando, setEditando] = useState(false);
  const [aviso, setAviso] = useState('');
  const [salvando, setSalvando] = useState(false);
  const cidade = typeof props.atributos['city'] === 'string' ? props.atributos['city'] : null;
  const genero = typeof props.atributos['gender'] === 'string' ? props.atributos['gender'] : null;
  const extras = Object.entries(props.atributos).filter(
    ([chave]) => !['city', 'gender'].includes(chave),
  );
  const generoExibido = genero === 'male' ? 'Masculino' : genero === 'female' ? 'Feminino' : genero;

  async function salvar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);
    setAviso('');
    setSalvando(true);
    const resultado = await salvarContato(props.contatoId, {
      nome: ouNulo(String(dados.get('nome') ?? '')),
      email: ouNulo(String(dados.get('email') ?? '')),
      telefone_e164: ouNulo(String(dados.get('telefone') ?? '')),
      documento: ouNulo(String(dados.get('documento') ?? '')),
      atributos: {
        city: ouNulo(String(dados.get('cidade') ?? '')),
        gender: ouNulo(String(dados.get('genero') ?? '')),
      },
    });
    setSalvando(false);
    if (!resultado.ok) {
      setAviso(resultado.erro);
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
            <Linha nome="nome" rotulo="Nome" valor={props.nome} editando={editando} classe="ct-fs-6" primeira />
            <Linha nome="email" rotulo="E-mail" valor={props.email} editando={editando} classe="ct-fs-6" />
            <Linha
              nome="telefone"
              rotulo="Telefone"
              valor={props.telefone}
              editando={editando}
              classe="ct-fs-6"
            />
            <Linha nome="cidade" rotulo="Cidade" valor={cidade} editando={editando} classe="ct-f4" />
            <Linha
              nome="documento"
              rotulo="Documento"
              valor={props.documento}
              editando={editando}
              classe="ct-f4"
            />
            <div className="ct-linha">
              <span className="ct-rotulo ct-f4">Gênero</span>
              {editando ? (
                <select className="ct-selecao" name="genero" defaultValue={genero ?? ''}>
                  <option value="">Selecione o gênero</option>
                  <option value="male">Masculino</option>
                  <option value="female">Feminino</option>
                </select>
              ) : (
                <span className="ct-valor ct-f4">{generoExibido || '-'}</span>
              )}
            </div>
            {props.identidade ? (
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
                  <span className="ct-valor-interno" title={props.identidade}>
                    <span className="ct-valor-texto">{props.identidade}</span>
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
          {extras.map(([chave, valor]) => (
            <div className="ct-linha ct-linha--extra" key={chave}>
              <span className="ct-chave-extra">{chave}</span>
              <span className="ct-valor-extra">
                {typeof valor === 'string' ? valor : JSON.stringify(valor)}
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
  valor,
  editando,
  classe,
  primeira,
}: {
  nome: string;
  rotulo: string;
  valor: string | null;
  editando: boolean;
  classe: string;
  primeira?: boolean;
}) {
  return (
    <div className={primeira ? 'ct-linha ct-linha--primeira' : 'ct-linha'}>
      <span className={`ct-rotulo ${classe}`}>{rotulo}</span>
      {editando ? (
        <input className="ct-entrada" type="text" name={nome} defaultValue={valor ?? ''} />
      ) : (
        <span className={`ct-valor ${classe}`}>{valor || '-'}</span>
      )}
    </div>
  );
}
