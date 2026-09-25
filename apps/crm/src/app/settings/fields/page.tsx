import { Botao, Campo, Etiqueta, Seletor, Tabela, type Column } from '@pipe/ui';
import { Block, SectionHeader } from '../../../components/settings/cabecalho';
import {
  ConfirmationButton,
  Formulario,
  FormularioDeLinha,
} from '../../../components/settings/formulario';
import { listarCamposPersonalizados } from '../../../lib/settings-data';
import { TIPOS_DE_CAMPO, type CampoPersonalizado } from '../../../lib/settings-comum';
import { numero } from '../../../lib/format';
import { actionCreateField, acaoExcluirCampo, acaoRenomearCampo } from '../actions';

export const dynamic = 'force-dynamic';

/**
 * Campos personalizados do lead.
 *
 * **O que o Twenty tem aqui e o Pipe não vai ter.** Lá, "Data model" deixa o
 * cliente criar OBJETO e CAMPO — o que significa `alter table` em tempo de
 * execução, num banco com RLS e migrations versionadas. O Pipe decidiu o
 * contrário na fundação, e está escrito no schema: *"campo customizado por
 * tenant vive aqui, com índice GIN — nunca `alter table` em runtime"*. O valor
 * mora em `lead.customizados`, que é `jsonb`.
 *
 * Então o equivalente honesto não é "criar campo no banco": é **declarar a
 * chave**. É o que esta tela faz, em `dicionario_campo` — a mesma tabela que a
 * linguagem de consulta lê para decidir o que é consultável. Declarar aqui é o
 * que faz o campo existir para a busca, para a exportação e para quem for
 * preencher o formulário.
 *
 * Três consequências dessa decisão, todas visíveis na tela:
 *
 * - **O código não se edita.** Ele é a chave dentro do `jsonb` de cada lead;
 *   mudá-lo deixaria o valor gravado órfão na base inteira, em silêncio. Rótulo
 *   e descrição, sim.
 * - **"Preenchidos" conta leads de verdade**, varrendo `customizados`. É o
 *   número que impede excluir às cegas um campo que 400 leads usam — o
 *   equivalente ao "Mostly empty" do Twenty, ao contrário.
 * - **Excluir tira a definição, não o valor.** O que estiver gravado continua
 *   lá, e o log de auditoria guarda o código. Recadastrar o mesmo código faz o
 *   dado voltar a aparecer.
 */

const ROTULO_DO_TIPO = new Map(TIPOS_DE_CAMPO.map((t) => [t.codigo as string, t.rotulo]));

const COLUNAS: readonly Column<CampoPersonalizado>[] = [
  {
    key: 'rotulo',
    rotulo: 'Campo',
    celula: (c) => (
      <FormularioDeLinha acao={acaoRenomearCampo} campos={{ id: c.id }}>
        <label>
          <span className="cfg-oculto">Rótulo de {c.codigo}</span>
          <Campo name="rotulo" defaultValue={c.rotulo} required maxLength={120} />
        </label>
        <label>
          <span className="cfg-oculto">Descrição de {c.codigo}</span>
          <Campo name="descricao" defaultValue={c.description ?? ''} placeholder="Descrição" />
        </label>
        <Botao type="submit">Renomear</Botao>
      </FormularioDeLinha>
    ),
  },
  { key: 'codigo', rotulo: 'Código', celula: (c) => <span className="mono">{c.codigo}</span> },
  {
    key: 'tipo',
    rotulo: 'Tipo',
    celula: (c) => <Etiqueta>{ROTULO_DO_TIPO.get(c.tipo) ?? c.tipo}</Etiqueta>,
  },
  {
    key: 'preenchidos',
    rotulo: 'Leads preenchidos',
    numerica: true,
    celula: (c) => numero(c.preenchidos),
  },
  {
    key: 'acao',
    rotulo: 'Ação',
    celula: (c) => (
      <FormularioDeLinha acao={acaoExcluirCampo} campos={{ id: c.id }}>
        <ConfirmationButton
          rotulo="Excluir"
          pergunta={
            c.preenchidos > 0
              ? `${numero(c.preenchidos)} leads têm valor neste campo. O valor fica no banco; a definição some.`
              : 'Excluir a definição deste campo?'
          }
        />
      </FormularioDeLinha>
    ),
  },
];

export default async function PageFields() {
  const campos = await listarCamposPersonalizados();

  return (
    <>
      <SectionHeader titulo="Campos personalizados">
        Os campos do lead que são seus. O Pipe guarda o valor em <code>lead.customizados</code>;
        aqui você declara o que cada chave significa.
      </SectionHeader>

      <Block
        titulo="Campos do lead"
        description="O código é a chave gravada em cada lead e não muda. Rótulo e descrição, sim."
      >
        <Tabela
          colunas={COLUNAS}
          linhas={campos}
          linhaKey={(c) => c.id}
          larguraMinima={820}
          empty="Nenhum campo personalizado ainda. O lead usa só os campos que o Pipe já traz."
        />
      </Block>

      <Block
        titulo="Novo campo"
        description="Deixe o código em branco e o Pipe deriva do rótulo — sem acento, sem espaço, minúsculo."
      >
        <Formulario acao={actionCreateField} rotuloBotao="Criar campo">
          <div className="cfg-form-linha">
            <label className="cfg-campo">
              <span>Rótulo</span>
              <Campo name="rotulo" required maxLength={120} placeholder="Faturamento anual" />
            </label>
            <label className="cfg-campo">
              <span>Tipo</span>
              <Seletor name="tipo" defaultValue="texto">
                {TIPOS_DE_CAMPO.map((t) => (
                  <option key={t.codigo} value={t.codigo}>
                    {t.rotulo}
                  </option>
                ))}
              </Seletor>
            </label>
            <label className="cfg-campo">
              <span>Código (opcional)</span>
              <Campo
                name="codigo"
                maxLength={40}
                pattern="[a-z][a-z0-9_]{1,39}"
                placeholder="faturamento_anual"
                className="mono"
              />
            </label>
          </div>
          <label className="cfg-campo">
            <span>O que este campo guarda</span>
            <Campo
              name="descricao"
              maxLength={200}
              placeholder="Faturamento declarado pelo lead no formulário"
            />
          </label>
        </Formulario>
      </Block>
    </>
  );
}
