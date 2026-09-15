# Certificados de autenticação (mTLS) — a tela `/mtls` do fragmento do contrato

Fonte: captura `anderson_da_silva_linhares_g813s.blip.ai (6).zip`, rota
`/application/tenant/mtls`. O `mtls.html` do host
`{conta}.tenant.fragment.blip.ai` é **só a casca** (10,7 KB, `<div id="root">`
vazio): tudo abaixo sai do bundle `static/js/main.e8593b01.chunk.js` (o mesmo
hash da captura "empresa") e das folhas do blip-ds que a rota carregou
(pedaços `49`, `29`, `85/87/88/89/90`, `17-20`, `68`, `79/80`, `94`, `8`, `51`,
`60`). Os arquivos `wss---*` desta captura têm 29 e 62 bytes: **nenhum quadro
LIME foi gravado**. O contrato dos comandos saiu do código (`class Ft`).

Implementação nossa: `apps/gestao/src/app/contrato/certificados/` e
`apps/gestao/src/lib/certificados.ts`.

## Rota, guarda e flag

|           | origem                                                                  | Pipe                                 |
| --------- | ----------------------------------------------------------------------- | ------------------------------------ |
| rota      | `/mtls` (`cn`), componente `zt`                                         | `/contrato/certificados`             |
| guarda    | `Z.d(members, roleId)` — leitura de `tenant-members`                    | `conta.membros.ler`                  |
| cartão    | `mtls` no grupo `generalSettings`, ícone `lock`                         | `certificados`, ícone `cadeado`      |
| flag      | `enable-tenant-mtls-certificates`                                       | nenhuma (não temos flag)             |
| cabeçalho | `setHeaderContent({ redirect: "/", text: "Certificados MTLS de {0}" })` | seta + "Certificados MTLS de {nome}" |

## Os comandos LIME (`class Ft`)

Todos para `postmaster@mtls.blip.ai`. Falha: o `catch` lê
`JSON.parse(JSON.parse(e).message)` → `{ status, reason: { code } }`.

| método              | uri                                                                           | quando                                 | resposta                                  |
| ------------------- | ----------------------------------------------------------------------------- | -------------------------------------- | ----------------------------------------- |
| `get`               | `/certificates-mtls/{tenantId}`                                               | ao abrir e a cada `certificateUpdated` | `response.items[]`                        |
| `get`               | `/upload-certificate-uri/{tenantId}`                                          | antes do upload                        | `response` = URL de upload                |
| `POST` HTTP (axios) | a URL acima, `multipart/form-data` com `password` e `file`                    | "Finalizar"                            | `data: { storage_id, name, contract_id }` |
| `set`               | `/certificates-mtls`, `type: application/vnd.iris.mtls.certificate-info+json` | depois do upload                       | —                                         |
| `delete`            | `/certificate-mtls/{tenantId}/{certificateId}`                                | "Deletar" no alerta do certificado     | —                                         |
| `delete`            | `/certificate-mtls/{tenantId}/host/{hostId}`                                  | "Deletar" no alerta do host            | —                                         |

Recurso do `set`:

```json
{
  "certificate_id": "{storage_id}:{tenantId}-{name}",
  "description": "texto até 50",
  "hosts": ["https://…", "https://…"]
}
```

Item da lista (`class Bt`), campo a campo: `certificate_id`, `contract_id`,
`description`, `hosts` (cada um `{ host_id, host }`), `status`
(`valid` | `invalid` | `underValidation`), `expiration_date`.

## A tela (`zt`)

`bds-grid#certificates containerFluid margin="y-5" direction="column" gap="2"`
com dois `bds-paper`:

1. **Apresentação (`xt`)** — `bds-grid gap="8" margin="5"`: à esquerda
   `bds-illustration.mtls-lock-illustration type="spots" name="lock-2"`; à
   direita, título fs-24 bold com margem **"Criptografia ponta a ponta"**,
   subtítulo fs-16 (texto abaixo) e `bds-button icon="add"` **"Cadastrar novo
   certificado"**, que abre `bds-modal#certificate-modal size="dynamic"`.
2. **Listagem (`Pt`)** — `bds-grid padding="3"`: título fs-24 bold
   **"Certificados MTLS"**, subtítulo fs-16 **"Listagem de certificados MTLS"** e
   `bds-table#certificates-table` com as colunas **Descrição · Expiração ·
   Status · Ações**. Enquanto carrega, `bds-loading-spinner` no lugar da tabela.

Subtítulo da apresentação, literal (com o erro de digitação deles):

> O mTLS (abreviação de TLS mútuo no inglês) é um método de autenticação que
> verifica se cada parte em uma conexão de rede tem uma chave privada para
> garantir autenticidade da identifcação. Você pode cadastrar certificados de
> autenticação que serão usados nas suas operações no Blip.

### Estado vazio

A tabela fica **só com o cabeçalho** — não há mensagem de lista vazia, nem
ilustração, nem botão extra. Se o `get` falhar, toast `danger` "Erro ao carregar
certificados MTLS" e a mesma tabela vazia.

### Estado preenchido — uma linha por certificado

| célula    | conteúdo                                                                                                                                                                                            |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Descrição | `minWidth: 20rem`, `title={description}`, typo fs-14                                                                                                                                                |
| Expiração | `wt.a(new Date(expiration_date), "pt-BR")` = `toLocaleDateString` dia/mês/ano 2 dígitos, **UTC** → `13/09/2026`                                                                                     |
| Status    | `bds-chip-tag`: `valid` → `success` "Válido"; `invalid` → `disabled` "Inválido"; `underValidation` → `default` "Em validação". Comparação sem caixa; o que não casa vira `default` + "Em validação" |
| Ações     | `maxWidth: 5rem`: `bds-button-icon icon="trash"` (abre o alerta de exclusão) e `icon="edit"` (abre o modal de hosts), ambos `size="short" variant="secondary"`                                      |

## Modais e alertas

### Cadastro — `bds-modal#certificate-modal` (`yt`)

A caixa do modal é reescrita por JS: `margin: 0 auto; height: 500px`. Dentro:
`bds-stepper` com três `bds-step` — **Upload do certificado · Informações do
certificado · Conferência** —, uma `div` com estilo em linha (`40rem × 18rem`,
teto de `20rem`, `overflowY: scroll`, `padding: 2rem`, `margin: 2rem 0`,
`border: 1px solid #ccc`, `borderRadius: 5px`) e a fileira de botões.

| passo  | conteúdo                                                                                                                                                                                                                                                                                                                                    | "Próximo" destrava quando                           |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| 1 `ft` | `bds-upload#certificate-upload` ("Upload do certificado" / "Arraste o certificate .pfx ou clique para selecionar", `.pfx`, um arquivo) e `bds-input type="password"` "Senha" / "Insira a senha do certificado" em meia largura                                                                                                              | há nome de arquivo                                  |
| 2 `vt` | `bds-input` "Descrição" (obrigatório, até 50, "Insira a descrição do certificado", erro "Insira uma descrição válida para o certificado") e uma fileira por URL: `bds-input` "URL" (até 100, "Insira a URL do certificado", erro "Insira uma URL HTTPS válida") com "-" (`variant="delete"`, só se houver mais de uma) e "+" (só na última) | descrição preenchida e toda URL preenchida e válida |
| 3 `Ot` | `bds-list`: "Confirme as informações do certificado" (fs-20 bold) e, em fs-16 bold, "Arquivo", "Descrição", "URL", cada valor num `bds-list-item`                                                                                                                                                                                           | — ("Finalizar")                                     |

URL válida: não repete uma das já digitadas **e** casa
`^https:\/\/[a-zA-Z0-9\-\.]+\.[a-zA-Z]{2,}(:\d+)?(\/.*)?$`.

Botões: "Voltar" nos passos 2 e 3 (`marginRight: 8px`), "Próximo" nos passos 1 e
2, "Finalizar" no 3 (com carregamento). Em "Finalizar" o arquivo é conferido:
sem arquivo → "Ocorreu um erro ao fazer o upload do arquivo, verifique se o
certificado e a senha estão corretos"; tipo diferente de
`application/x-pkcs12` → "O arquivo deve ser do tipo .pfx"; mais de 10 MB → "O
arquivo deve ter no máximo 10MB". Sucesso: toast "Certificado enviado com
sucesso", formulário limpo, volta ao passo 1 e fecha.

### Hosts — `bds-modal#hosts-modal` (`kt`)

`title="Hosts do certificado"` — no web component isso é o **atributo** `title`
do HTML (dica do navegador), não um cabeçalho. Dentro, um `bds-paper` com
`padding="3"`: fs-20 **"Gerencie o host do certificado {descrição}"**
(`maxWidth: 40rem`) e `bds-table#hosts-table` (`maxWidth 40rem`, `maxHeight
20rem`, rolagem) com **Host · Ações** — o host em fs-14 (`minWidth 20rem`) e a
lixeira `short`/`secondary` (`maxWidth 5rem`).

### Excluir certificado — `bds-alert#remove-certificate-alert` (`St`)

Topo `warning` com ícone `warning`: **"Atenção"**. Corpo: **"Deseja realmente
deletar esse certificado? Esta ação nao pode ser desfeita!"** (sem acento em
"nao", como lá). Ações: **Cancelar** e **Deletar**, ambos `secondary`. A caixa é
empurrada por JS: `position:relative;margin:auto;top: 40%`. Sucesso: "Certificado
removido com sucesso"; falha: "Falha ao tentar deletar certificado.".

### Excluir host — `bds-alert#remove-host-alert` (`Ut`)

Igual, com **"Deseja realmente deletar esse host? Esta ação nao pode ser
desfeita!"**. Sucesso: "Host removido com sucesso"; falha: "Falha ao tentar
deletar host.". Se o certificado fica sem host, o modal de hosts fecha e a lista
recarrega depois de 1 s.

## Medidas das peças (blip-ds)

| peça                       | medida                                                                                                                                                                                                                                                        | fonte                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `bds-grid`                 | `display:flex`; `gap--2` 16, `gap--8` 64; `margin--y-5` 40/40, `margin--5` 40, `margin--b-2` 16, `margin--t-1` 8; `padding--3` 24; `xxs--N` com 8 de cada lado; `container-fluid` 100% → 848 (≥905) → 944 (≥993) → 1232 (≥1280) → 1328 (≥1440) → 1424 (≥1920) | `49`                                                   |
| `bds-paper`                | raio 16; elevação padrão `static` = `0 2px 8px -2px` sombra-1                                                                                                                                                                                                 | `49`                                                   |
| `bds-typo`                 | fs-24 1.5rem/100%, fs-20 1.25rem/100%, fs-16/14/12 a 150%; `margin` em fs-20/24 = 22 embaixo                                                                                                                                                                  | `49`                                                   |
| `bds-button`               | `solid`/`primary`/`medium` por padrão; 40 de altura, `0 16`, raio 8, vão 4, rótulo fs-14 bold; `--disabled` 50%                                                                                                                                               | `29`                                                   |
| `bds-button-icon`          | 40×40 no `short`, recheio 8, raio 8, ícone `medium`                                                                                                                                                                                                           | `bdscss/iconButtonCss.css`, `bds-button-icon.entry.js` |
| `bds-table`                | raio 8, borda 6%; cabeçalho com régua de 20%; `th` 0 8 (16 nas pontas), 64, fs-14 semi-bold; linha 64 com fio de 16%, a última sem fio                                                                                                                        | `90`, `87`, `89`, `88`                                 |
| `bds-chip-tag`             | 24 de altura, raio 12, `0 4`, texto fs-12 bold a 8 de cada lado                                                                                                                                                                                               | `41` (captura pessoal)                                 |
| `bds-modal`                | véu preto a 70%; caixa até 1000, recheio 32, raio 8; `close-button` à direita, 16 abaixo; `--dynamic` com 40 em cima e embaixo                                                                                                                                | `68`                                                   |
| `bds-alert`                | caixa até 424, raio 8; topo 64 mín., `12 16`, ícone x-large (32), título fs-16 bold a 8; corpo `12 16`, 8 abaixo, fs-14; ações à direita, `12 16`, 16 após o primeiro                                                                                         | `20`, `19`, `18`, `17`                                 |
| `bds-stepper` / `bds-step` | stepper com 16 e divisor de 1,5 (`0 8`, mín. 24); step com 8, bola de 24 e texto fs-16; ativo em negrito                                                                                                                                                      | `80`, `79`                                             |
| `bds-upload`               | mín. 400, coluna com 16; ícone `upload` xxx-large; título fs-16 bold, subtítulo fs-14; caixa de soltar com borda de 20%, raio 8, `23 16`; texto "Arraste e solte seus arquivos aqui ou clique para fazer upload do arquivo"                                   | `94`                                                   |
| `bds-input`                | borda de 20%, raio 8, `7 4 8 12` com rótulo; rótulo fs-12 bold a 2; texto 14/22; mensagem fs-12 com ícone `error`                                                                                                                                             | `8`                                                    |
| `bds-toast`                | 440 de largura, `8 16`, raio 8; contêiner `top-right` a 24                                                                                                                                                                                                    | `bds-toast.entry.js` (captura do Desk)                 |

A folha do fragmento tem `*{box-sizing:border-box}`: vale para a `div` em linha
do cadastro, não para o que vive no shadow DOM das peças.

## O que não foi achado

- **O helper do toast (`Object(m.g)({ type, message })`)**: não está nem no
  `main` nem no `107` como `bds-toast` criado à mão; posição, ícone e duração do
  toast desta tela ficaram sem conferir.
- **A ilustração `spots/lock-2`**: a captura não trouxe o JSON dela (só vieram
  quatro ilustrações de outras telas), então também não há tamanho medido.
- **Nenhum quadro LIME**: sem certificados na conta, nem o `get` rendeu um
  item de verdade para conferir o formato de `expiration_date` e `status`.
