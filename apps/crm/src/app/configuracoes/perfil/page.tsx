import Link from 'next/link';
import { Avatar, Campo, Etiqueta } from '@pipe/ui';
import { Bloco, CabecalhoDaSecao } from '../../../componentes/configuracoes/cabecalho';
import { Formulario } from '../../../componentes/configuracoes/formulario';
import { SeletorDeTema } from '../../../componentes/configuracoes/seletor-de-tema';
import { lerEspaco, usuarioAtual } from '../../../lib/configuracoes-dados';
import { dataHora } from '../../../lib/formato';
import { acaoSalvarPerfil } from '../acoes';

export const dynamic = 'force-dynamic';

/**
 * Perfil da pessoa.
 *
 * No Twenty isto são DUAS telas: "Profile" (foto, nome, e-mail, senha, zona de
 * perigo) e "Experience" (tema, idioma, escala, formatos de data e número).
 * Aqui é uma, e a razão é contável: das treze coisas que as duas telas de lá
 * oferecem, o Pipe tem quatro. Uma tela com quatro controles e outra com um não
 * seriam duas telas — seriam uma tela e uma sala de espera.
 *
 * O que ficou de fora, e por quê:
 *
 * - **Sobrenome separado.** `usuario.nome` é um campo só, e quebrar em dois
 *   exigiria migration para resolver um problema que ninguém tem.
 * - **Trocar e-mail, trocar senha, excluir a conta, encerrar sessões.** Todas
 *   dependem da sessão do próprio CRM, que ainda não existe (`banco.ts` resolve
 *   tudo por variável de ambiente). Botão que não faz o que promete é pior do
 *   que botão ausente, e a regra do projeto é explícita: item que não funciona
 *   não aparece.
 * - **Escala da interface e formatos de data.** A régua de densidade é do design
 *   system e vale igual para os três aplicativos; deixá-la configurável por
 *   pessoa desfaz o que `packages/ui` existe para garantir.
 */
export default async function PaginaPerfil() {
  const pessoa = await usuarioAtual();
  const espaco = await lerEspaco();

  return (
    <>
      <CabecalhoDaSecao titulo="Perfil">
        Seu nome e sua foto, como as outras pessoas do espaço veem, e o tema desta tela.
      </CabecalhoDaSecao>

      <Bloco titulo="Foto e nome" descricao="É o que aparece ao lado de cada lead que é seu.">
        <Formulario acao={acaoSalvarPerfil}>
          <div className="cfg-avatar">
            <Avatar nome={pessoa.nome} />
            <label className="cfg-campo">
              <span>Nome</span>
              <Campo
                name="nome"
                defaultValue={pessoa.nome}
                required
                maxLength={120}
                autoComplete="name"
              />
            </label>
          </div>
          <label className="cfg-campo">
            <span>Endereço da foto</span>
            <Campo
              name="avatarUrl"
              type="url"
              defaultValue={pessoa.avatarUrl ?? ''}
              placeholder="https://…"
              inputMode="url"
            />
            <span className="sub">
              Em branco, o Pipe usa as iniciais do nome. Envio de arquivo entra quando houver
              armazenamento de imagem no CRM.
            </span>
          </label>
        </Formulario>
      </Bloco>

      <Bloco
        titulo="Acesso"
        descricao="O e-mail é a chave da conta: trocar exige refazer o vínculo com o Google."
      >
        <dl className="cfg-lista">
          <div>
            <dt>E-mail</dt>
            <dd className="mono">{pessoa.email}</dd>
          </div>
          <div>
            <dt>Papel</dt>
            <dd>
              {pessoa.papeis.length === 0 ? (
                <span className="sub">Nenhum papel atribuído.</span>
              ) : (
                pessoa.papeis.map((p) => <Etiqueta key={p}>{p}</Etiqueta>)
              )}
            </dd>
          </div>
          <div>
            <dt>Último acesso</dt>
            <dd>{dataHora(pessoa.ultimoAcessoEm, espaco.fuso)}</dd>
          </div>
        </dl>
      </Bloco>

      <Bloco
        titulo="Aparência"
        descricao="Fica guardado neste navegador. Cada aparelho tem a sua escolha."
      >
        <SeletorDeTema />
      </Bloco>

      <Bloco
        titulo="Idioma e fuso"
        descricao="Os dois são do espaço de trabalho, não da pessoa: relatório e SLA precisam do mesmo dia para todo mundo."
      >
        <dl className="cfg-lista">
          <div>
            <dt>Idioma</dt>
            <dd>Português (Brasil)</dd>
          </div>
          <div>
            <dt>Fuso horário</dt>
            <dd className="mono">{espaco.fuso}</dd>
          </div>
        </dl>
        <p className="sub">
          O fuso se muda em <Link href="/configuracoes/espaco">Espaço de trabalho</Link>.
        </p>
      </Bloco>
    </>
  );
}
