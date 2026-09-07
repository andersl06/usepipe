# Storage de anexo e áudio

O que existia antes: `PIPE_STORAGE_URL_BASE` apontava para `http://localhost:9000/pipe`, um MinIO
que **nunca existiu nesta máquina**. Mídia recebida era registrada em `anexo` e o arquivo não tinha
onde morar. O link não baixava nada, e o defeito não aparecia em teste nenhum.

A régua deste documento é a do dono: **seguir o que a Blip faz**. Os números aqui não foram
escolhidos por nós — saíram de `supernova.desk.blip.ai/static/settings.<hash>.json`, o arquivo de
configuração do Desk deles.

## 1. Disco com volume, não MinIO — e por quê

A escolha era MinIO ao lado ou disco com volume. **Disco**, por três motivos:

1. **RAM é o gargalo desta infra.** Acabamos de medir ~1,9 GB por instância de CRM
   (`2026-09-07-integracao-twenty.md` §5.3), com a decisão de uma instância por cliente. Um
   contêiner a mais por VPS custa exatamente o recurso que já está apertado, e MinIO parado não é
   de graça.
2. **A compatibilidade que o requisito pede é da INTERFACE, e ela existe.** `Armazenamento`
   (`packages/armazenamento/src/porta.ts`) é bucket + chave opaca + objeto — a forma do S3. Trocar
   por S3, R2 ou MinIO é escrever outra implementação da MESMA interface; nenhum chamador muda.
   O protocolo S3 não precisa estar rodando na máquina para o código estar pronto para ele.
3. **A URL assinada fica mais simples e mais parecida com a deles.** O modelo da Blip não é bucket
   público com presign: é **file token com validade**
   (`DEFAULT_FILE_TOKEN_EXPIRATION_IN_MILLISECONDS = 900000`, 15 minutos). Um HMAC nosso de 15
   linhas faz isso, sem SDK e sem chave de serviço a mais para guardar.

**O teto conhecido, escrito para não ser descoberto num incidente**: disco em host único, sem
replicação. No dia em que a `api` rodar em mais de uma máquina, o arquivo escrito numa não aparece
na outra. É aí que entra o backend S3 — um arquivo novo, nenhum chamador tocado.

## 2. Os números, copiados da Blip

| Constante deles | Valor | Onde vive aqui |
|---|---|---|
| `MAX_ATTACHMENT_SIZE` | 104857600 (100 MB) | `MAX_BYTES_POR_ARQUIVO` |
| `MAX_ATTACHMENT_COUNT` | 10 | `MAX_ARQUIVOS_POR_MENSAGEM` |
| `DEFAULT_FILE_TOKEN_EXPIRATION_IN_MILLISECONDS` | 900000 (15 min) | `VALIDADE_LINK_MS` |
| `IMAGE_ACCEPT_EXTENSION` | 9 tipos | `MIMES_IMAGEM` |
| `ARCHIEVE_ACCEPT_EXTENSION` | 48 tipos | `MIMES_ARQUIVO` |

Duas observações sobre o material deles:

- Apesar do nome, `..._ACCEPT_EXTENSION` contém **tipo MIME**, não extensão. E o typo `ARCHIEVE` é
  deles; aqui as variáveis se chamam pelo que são.
- `audio/amr` aparece na central de ajuda da Blip mas **não** está no `settings.json`. Seguimos o
  binário, não a documentação.

### Onde nós NÃO seguimos a Blip, de propósito

**Áudio e vídeo têm teto de 16 MB, não 100 MB.** O Desk deles valida só `MAX_ATTACHMENT_SIZE`, então
ele **deixa o atendente subir um áudio de 80 MB que a plataforma recusa depois**
(`docs/pesquisa/regras-blip.md`: documentos 100 MB, vídeo e áudio 16 MB). Recusar cedo, com o número
certo e a mensagem certa, é melhor que aceitar e falhar no fim do upload. É o único ponto em que
copiar o cliente deles seria copiar um defeito.

## 3. Isolamento por tenant

A chave do objeto é `<tenant_id>/<ano>/<mês>/<uuid><.ext>`. **O tenant é o primeiro segmento,
sempre.** Isso dá três coisas de uma vez:

- um cliente nunca compartilha prefixo com outro;
- no dia em que virar bucket S3, a política de acesso por prefixo já está desenhada;
- o `uuid` no fim impede adivinhar o objeto do vizinho mesmo para quem souber o `tenant_id`.

O `tenant_id` vem **sempre da credencial**, nunca do corpo nem da URL. Além disso:

- `chaveDoTenant` recusa `..`, barra inicial e barra invertida — travessia de diretório e chave de
  outro cliente morrem antes de tocar o disco;
- o backend de disco resolve o caminho e **depois** prova que ele está sob a raiz. A ordem importa:
  comparar texto antes de normalizar é exatamente como `../` passa;
- a extensão do nome original entra na chave só para o arquivo ter cara de arquivo ao baixar. Ela
  **não decide tipo em lugar nenhum**.

## 4. O link: assinado, curto, e nunca público

**Nenhum objeto é servido por URL pública adivinhável por id.** O link é

```
<base>/v1/anexos/<anexoId>?expira=<epoch_ms>&assinatura=<hmac>
```

com `HMAC-SHA256(<anexoId>.<expira>)` usando o chaveiro que já protege o token da Meta
(`PIPE_CHAVES_SEGREDO`) — uma chave a menos para rotacionar. Validade de 15 minutos, a da Blip.

**A leitura não exige sessão nem chave de API, e isso é decisão, não esquecimento**: é a Meta que
baixa a mídia do nosso link para entregá-la ao cliente, e ela não tem cookie nosso. A credencial é a
própria assinatura — por isso ela é por anexo e curta.

Conferido, e coberto por teste: link sem assinatura, assinatura adulterada, validade esticada na
mão, e **assinatura de um anexo reaproveitada em outro id**. Link vencido e link forjado dão a mesma
resposta, porque distinguir contaria a quem tenta qual metade do palpite acertou.

## 5. Carimbo do tipo real — antivírus não, isto sim

A Blip **não** faz sniffing no cliente: valida MIME declarado e delega a ClamAV e DLP no servidor
deles. Nós não teremos antivírus — foi a decisão — então a conferência de tipo é obrigatória, e ela
olha os **primeiros bytes**.

O motivo é um só: extensão e `Content-Type` do upload são texto que o cliente escreveu. Um `.png`
que na verdade é HTML vira XSS na sessão de quem abrir o "anexo".

- Quando os bytes revelam um tipo, **ganham os bytes** — um PNG declarado como PDF é gravado como
  PNG, e um vídeo disfarçado de documento passa a responder ao teto de 16 MB, não ao de 100 MB.
- Quando não há assinatura reconhecível (texto, CSV), fica o declarado — que já passou pela lista de
  aceitos. Não se adivinha.
- **HTML e SVG saem sempre como `application/octet-stream` + `Content-Disposition: attachment`**,
  com `X-Content-Type-Options: nosniff`. Os dois continuam aceitos (a Blip aceita), mas SVG é XML
  executável, e servir qualquer um deles inline no nosso domínio é entregar execução de script na
  sessão de quem abriu. Por isso `tipoDoMime('image/svg+xml')` é `documento`, e não `imagem`.

## 6. O upload

`POST /v1/anexos?nome=<nome>` com o arquivo no **corpo cru** e o tipo no `Content-Type` — a forma do
`PUT Object` do S3, e sem `multer` no projeto. O parser de corpo cru é montado só neste caminho:
aplicá-lo a tudo transformaria o webhook da Meta numa porta para receber 100 MB de JSON.

Aceita chave de API **ou** sessão (`ChaveOuSessao`), como o envio de mensagem.

## 7. O que ficou de fora, e quando entra

| Deixado de fora | Quando fazer |
|---|---|
| Backend S3/R2 | quando a `api` rodar em mais de um host |
| Varredura de anexo órfão (arquivo sem linha) | quando o disco incomodar; hoje é lixo barato |
| Antivírus | decidido: não |
| Miniatura de imagem e duração de áudio (`largura`, `altura`, `duracao_seg` estão na tabela e ficam nulos) | quando a tela precisar |
| Limite de 10 arquivos POR MENSAGEM | a constante existe e vai na resposta do upload; quem vai aplicá-la é a tela, que é quem monta a mensagem |
