import { Avatar, Botao, Campo, Etiqueta, Seletor, Tabela, type Coluna } from '@pipe/ui';
import { Bloco, CabecalhoDaSecao } from '../../../componentes/configuracoes/cabecalho';
import { Formulario, FormularioDeLinha } from '../../../componentes/configuracoes/formulario';
import {
  lerEspaco,
  listarConvitesPendentes,
  listarMembros,
  listarPapeis,
  usuarioAtual,
} from '../../../lib/configuracoes-dados';
import type { ConvitePendente, Membro, ResumoDePapel } from '../../../lib/configuracoes-comum';
import { dataHora, desde } from '../../../lib/formato';
import { acaoAlternarMembro, acaoCancelarConvite, acaoConvidar, acaoDefinirPapel } from '../acoes';

export const dynamic = 'force-dynamic';

/**
 * Membros.
 *
 * No Twenty são três abas — Team, Invite, Roles. Aqui são três blocos na mesma
 * tela, porque a nossa lista cabe: uma aba que esconde um formulário de duas
 * caixas custa mais um clique do que informa.
 *
 * A diferença que importa em relação ao Twenty é o que acontece ao tirar alguém:
 * lá o membro sai do espaço; aqui ele é **desativado**. `usuario` é referenciado
 * por conversa, avaliação, lead e log de auditoria — apagar a linha apagaria a
 * autoria de tudo o que a pessoa fez, que é exatamente o que uma auditoria de
 * contrato vai procurar.
 *
 * Três coisas que o Twenty tem aqui e não vieram: convite por link público
 * (convite é para UM endereço, e link que qualquer um usa é o oposto disso),
 * reenviar convite (convidar de novo já invalida o anterior e emite outro) e
 * papéis de agente e de chave de API, que no Pipe não existem — chave carrega
 * escopo, não papel.
 */

function colunasDaEquipe(euId: string, papeis: ResumoDePapel[], fuso: string): readonly Coluna<Membro>[] {
  return [
    {
      chave: 'nome',
      rotulo: 'Pessoa',
      celula: (m) => (
        <span className="cfg-pessoa">
          <Avatar nome={m.nome} />
          <span>
            <b>{m.nome}</b>
            <span className="sub mono">{m.email}</span>
          </span>
        </span>
      ),
    },
    {
      chave: 'papel',
      rotulo: 'Papel',
      celula: (m) => (
        <FormularioDeLinha acao={acaoDefinirPapel} campos={{ usuarioId: m.id }}>
          <label>
            <span className="cfg-oculto">Papel de {m.nome}</span>
            <Seletor name="papelId" defaultValue={m.papelId ?? ''}>
              <option value="">Sem papel</option>
              {papeis.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </Seletor>
          </label>
          <Botao type="submit">Aplicar</Botao>
        </FormularioDeLinha>
      ),
    },
    {
      chave: 'acesso',
      rotulo: 'Último acesso',
      celula: (m) =>
        m.ultimoAcessoEm ? (
          <span title={dataHora(m.ultimoAcessoEm, fuso)}>{desde(m.ultimoAcessoEm, fuso)}</span>
        ) : (
          <span className="sub">Nunca entrou</span>
        ),
    },
    {
      chave: 'estado',
      rotulo: 'Acesso',
      celula: (m) => (
        <FormularioDeLinha
          acao={acaoAlternarMembro}
          campos={{ usuarioId: m.id, ativo: m.ativo ? 'nao' : 'sim' }}
        >
          <Etiqueta tom={m.ativo ? 'neutro' : 'alerta'}>{m.ativo ? 'Ativo' : 'Desativado'}</Etiqueta>
          {m.id === euId ? (
            <span className="sub">é você</span>
          ) : (
            <Botao type="submit" variante={m.ativo ? 'perigo' : 'padrao'}>
              {m.ativo ? 'Desativar' : 'Reativar'}
            </Botao>
          )}
        </FormularioDeLinha>
      ),
    },
  ];
}

function colunasDeConvites(fuso: string): readonly Coluna<ConvitePendente>[] {
  return [
    { chave: 'email', rotulo: 'E-mail', celula: (c) => <span className="mono">{c.email}</span> },
    { chave: 'papel', rotulo: 'Papel', celula: (c) => <Etiqueta>{c.papel}</Etiqueta> },
    {
      chave: 'vence',
      rotulo: 'Vence',
      celula: (c) => <span title={dataHora(c.expiraEm, fuso)}>{desde(c.expiraEm, fuso)}</span>,
    },
    {
      chave: 'quem',
      rotulo: 'Convidado por',
      celula: (c) => c.convidadoPor ?? <span className="sub">—</span>,
    },
    {
      chave: 'acao',
      rotulo: 'Ação',
      celula: (c) => (
        <FormularioDeLinha acao={acaoCancelarConvite} campos={{ id: c.id }}>
          <Botao type="submit" variante="perigo">
            Cancelar
          </Botao>
        </FormularioDeLinha>
      ),
    },
  ];
}

export default async function PaginaMembros() {
  // Em série, nunca em `Promise.all`: cada uma abre a sua transação com o tenant
  // fixado, e paralelizar aqui é o caminho conhecido para perder `pipe.tenant_id`.
  const eu = await usuarioAtual();
  const espaco = await lerEspaco();
  const membros = await listarMembros();
  const papeis = await listarPapeis();
  const convites = await listarConvitesPendentes();

  return (
    <>
      <CabecalhoDaSecao titulo="Membros">
        Quem tem acesso a este espaço, com que papel, e quem ainda foi só convidado.
      </CabecalhoDaSecao>

      <Bloco
        titulo="Convidar"
        descricao="O convite vale sete dias, serve uma vez só e é para este endereço — convidar de novo cancela o anterior."
      >
        <Formulario acao={acaoConvidar} rotuloBotao="Convidar" className="cfg-form-linha">
          <label className="cfg-campo">
            <span>E-mail</span>
            <Campo
              name="email"
              type="email"
              required
              placeholder="pessoa@empresa.com.br"
              autoComplete="off"
              inputMode="email"
            />
          </label>
          <label className="cfg-campo">
            <span>Papel</span>
            <Seletor name="papelId" required defaultValue="">
              <option value="" disabled>
                Escolha um papel
              </option>
              {papeis.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </Seletor>
          </label>
        </Formulario>
      </Bloco>

      {convites.length > 0 ? (
        <Bloco titulo="Convites pendentes">
          <Tabela
            colunas={colunasDeConvites(espaco.fuso)}
            linhas={convites}
            chaveDaLinha={(c) => c.id}
          />
        </Bloco>
      ) : null}

      <Bloco
        titulo="Equipe"
        descricao="Desativar tira o acesso e mantém a história: o que a pessoa fez continua com o nome dela."
      >
        <Tabela
          colunas={colunasDaEquipe(eu.id, papeis, espaco.fuso)}
          linhas={membros}
          chaveDaLinha={(m) => m.id}
          larguraMinima={720}
          vazio="Ninguém ainda. Convide alguém acima."
        />
      </Bloco>
    </>
  );
}
