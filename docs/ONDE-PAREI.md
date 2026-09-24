# Onde parei — 07/09/2026, fim da tarde

Nota de retomada. Escrita porque a sessão ia acabar por limite de token e o
trabalho está em três frentes ao mesmo tempo. Leia isto antes de qualquer coisa.

## A referência do Blip Desk está completa

`C:\Users\anderson.linhares\blip-desk-ref-2` é a pasta ÚNICA (as demais
`blip-desk-ref*` são parciais e podem ser apagadas). O dono salvou a página do
Blip Desk aba por aba e todos os **oito micro-frontends** estão lá:

| pasta em `deskmfe.blip.ai/beagle/` | aba | tamanho |
|---|---|---|
| `blip-calls-mfe` | Chamadas | 11 MB |
| `blip-transcription-mfe` | Transcrição de áudio | 7,9 MB |
| `desk-analytics-mfe` | Analytics | 2,9 MB |
| `desk-active-message` | Mensagens Ativas | 2,7 MB |
| `desk-contact-history` | Contatos | 1,7 MB |
| `desk-tickets-mfe` | Bulk ticket | 876 KB |
| `blip-ticket-metadata` | Metadados do ticket | 624 KB |
| `desk-preferences-mfe` | Preferências | 420 KB |

Mais a casca (`app.js` 5 MB, `vendor.js` 7,8 MB), a folha de estilo compilada
(969 KB, 3.349 classes) e `settings.*.json` (as regras de operação).

Os zips originais estão em `C:\Users\anderson.linhares\Downloads\desk`. O dono
disse que o que não está lá não é necessário (era a Ajuda).

## A régua de cópia, decidida com o dono

- **Regra: replica, sem perguntar.** Estados, transições, validações, tempos,
  limites, ordem das etapas, vocabulário em português. "Achou a regra, replica" —
  palavras dele. Nada de simplificar, juntar tela, renomear ou reordenar: ele
  acha o layout e a regra deles muito bons e quer semelhança, não releitura.
- **Visual: semelhante, não decalcado.** Mesma disposição, hierarquia e ordem de
  grandeza das medidas, com as NOSSAS cores (tokens `--p-*`), os nossos ícones e
  a nossa marca.
- **Não entra no repositório**: trecho de código, nome de classe deles, folha de
  estilo, ícone, som ou imagem. Ícone vem de conjunto livre (Lucide, Phosphor,
  Tabler) ou nosso.
- **Não abrir** `blip-desk-ref-2/webpack---*`: são 194 arquivos de código-fonte
  original recuperados por sourcemap. As regras estão todas no que é observável
  (folha compilada, `settings.json`, bundles), então abrir não acrescenta e só
  cria a discussão de "olhou o fonte e reescreveu".
- Em `referencias-blip/pesquisa/` pode citar o seletor ao lado do número: é referência de
  medição, e é o que torna a medida conferível depois. Em `apps/**`, não.

Já commitado: `referencias-blip/pesquisa/blip-desk-regras.md` (43 chaves com valor em
português) e `blip-desk-vocabulario.md` (296 textos de tela por aba).

## Estado das três frentes

**1. CRM = fork do Twenty** — ENTREGUE e no ar em `http://localhost:3500` com a
nossa imagem. Entra com `tim@apple.dev` / `tim@apple.dev` (conta de semente do
próprio Twenty). Português como padrão, verde `#4a5d23` no lugar do azul, creme
no lugar do cinza, marca trocada, nada desligado. Detalhes em
`docs/specs/2026-09-07-fork-do-twenty.md` §6 a §12.
Reconstruir: `docker build --target twenty -f packages/twenty-docker/twenty/Dockerfile -t pipe-crm:local .`
na raiz do fork, depois `docker compose -p pipe-crm up -d` (rode DUAS vezes: o
worker não sobe na primeira, porque o `up` aborta durante os 228 passos de
upgrade do servidor).

**Pendências do dono nesta frente**: desligar `TELEMETRY_ENABLED` (vem `true` e
reporta ao Twenty), e o nome da entidade jurídica para o rodapé dos e-mails.

**2. Integração Twenty ↔ apps do Pipe** — agente estava em andamento. Decisões já
tomadas pelo dono: **uma instância do Twenty por cliente** (isolamento físico, não
multi-workspace) e **login pelo mesmo Google dos dois lados** (sem senha-sombra
guardada por nós). A API já ganhou fila de espelho do CRM
(`consumirEspelhoCrm`, `agendarVarreduraEspelhoCrm` em `apps/api/src/filas.ts`).

**3. Desk com a anatomia do Blip** — agente em andamento, trabalhando sobre a
pasta de referência. Pendente: aplicar as 43 regras onde o domínio já suporta
(inatividade 10 min → ausente, +10 → offline, verificando a cada 5 s; "digitando"
4 s; histórico de 40 por página; anexo 100 MB / 10 arquivos; aviso de versão a
cada 5 min) e levantar as abas que agora existem por dentro.

## O que estava aberto e não é dos agentes

- **A LP** (`apps/site`) está parada por decisão do dono ("vamos deixar a LP de
  lado por enquanto"). O que ficou marcado `PREENCHER`: quatro números da faixa
  "A conta" e quatro depoimentos. Os dois painéis escuros com telas falsas ainda
  precisam virar captura real — a do CRM só faz sentido agora que o Twenty está
  de pé.
- **A extensão do Chrome caiu** e não voltou. Para ver tela renderizada, use
  Chrome headless direto:
  `"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --disable-gpu --hide-scrollbars --screenshot="C:\caminho\saida.png" --window-size=1440,900 http://localhost:3400/`
  (o caminho de saída precisa ser absoluto no formato do Windows). SPA que depende
  de JS sai em branco assim — serve para a LP, não para o CRM.
- **Portas em desenvolvimento**: api 3000, Gestão 3100, Desk 3200, CRM caseiro
  3300, LP 3400, Twenty 3500.
