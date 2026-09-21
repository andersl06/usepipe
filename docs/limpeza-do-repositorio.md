# Levantamento para publicação do Pipe no GitHub

Data: 21/09/2026. Inventário somente-leitura: nenhum arquivo foi removido, movido, renomeado ou alterado.

## Resumo executivo

- Diretório de trabalho: **5,34 GiB**; .git: **11,80 MiB** (5.031 objetos, 11,54 MiB em git count-objects -vH; 12.369.826 bytes no diretório).
- O HEAD tem 1.105 arquivos e **14,49 MiB** (git ls-tree -rl HEAD). O volume local é sobretudo ignorado: docs/capturas/ **4,06 GiB**, .capturas/ **434,30 MiB**, node_modules/ **549,00 MiB**, .turbo/ **5,68 MiB**.
- A limpeza local proposta reduz pelo menos **5,03 GiB**. O corte público remove cerca de **2,4 MiB rastreados conhecidos**, mas elimina risco de propriedade intelectual, privacidade e segredos.

Os cinco riscos mais graves:

1. docs/capturas/: 25.857 arquivos (4,06 GiB) de portais Blip, bundles portal.js, HTML, imagens e identificadores pessoais. Está ignorado, mas não pode entrar numa cópia/manual de publicação.
2. .playwright-cli/ e output/playwright/ são capturas rastreadas, inclusive no commit 06d8d298…; precisam sair também do histórico público.
3. O .env local tem valores para segredo Google e chaves do Pipe. Está ignorado e não apareceu no histórico, mas não pode ser selecionado numa publicação manual.
4. docs/pesquisa/ contém material de referência de Blip, Salesforce, Chatwoot e Twenty rastreado; por decisão do dono, não é código publicável.
5. Infra e docs citam os extintos apps/desk e apps/gestao, enquanto os workspaces vivos são desk-vite e gestao-vite.

## Método e evidência

Foram executados em 21/09/2026, em leitura: git ls-files, git ls-tree -rl HEAD, git log --all -G <padrão>, git count-objects -vH, medição recursiva com Get-ChildItem, git check-ignore -v e rg em manifestos, turbo.json, Docker/infra, docs e fontes. Foram lidos package.json, pnpm-workspace.yaml, turbo.json, docker-compose.yml, Dockerfiles e manifestos dos workspaces.

## 1. O que não pode ir ao GitHub

| Caminho | Tamanho | Por que (evidência) | Ação sugerida |
|---|---:|---|---|
| .env | 1.077 B | git check-ignore -v .env retorna .gitignore:4:.env. Inspeção sem imprimir valores encontrou GOOGLE_CLIENTE_SEGREDO, PIPE_CHAVES_SEGREDO e PIPE_CHAVE_SEGREDO_ATUAL preenchidos. git log --all -- .env não retornou commit. | Manter exclusivamente local; nunca publicar. Manter somente .env.example sem valores reais. |
| docs/capturas/ e docs/capturas/blip/** | 4.064,76 MiB; 25.857 arquivos | git check-ignore -v retorna .gitignore:12:docs/capturas/; git ls-files docs/capturas não retornou arquivos. Há supernova.blip.ai/portal.js, diretórios zip*, HTML, imagens e hosts anderson-da-silva-linhares-g813s.blip.ai. | Mover para arquivo privado externo; continuar ignorado. Nunca incluir em repositório/backup público. |
| .capturas/ | 434,30 MiB | .gitignore:11:.capturas/; capturas locais. | Mover para arquivo privado ou descartar localmente após validação; manter ignorado. |
| .playwright-cli/ | 372.786 B; 32 arquivos | git ls-files lista 27 YAML e 5 PNG. git log --all -- .playwright-cli associa-os a 06d8d298…; há referência ao portal Blip. | Apagar do corte público, ignorar no repo novo e **reescrever histórico** se publicar o atual. |
| output/playwright/ | 497.990 B; 8 PNG | Rastreado no HEAD; git log --all -- output/playwright associa a 06d8d298…; inclui blip-gerenciador-zip9.png. | Apagar do corte público e **reescrever histórico**. |
| Pesquisa de terceiros: docs/pesquisa/blip-*.md, regras-blip.md, onboarding-blip.md, visual-blip-salesforce.md, salesforce-estrutura-e-visual.md, chatwoot*.md, twenty.md | subconjunto de docs/pesquisa/: 1.295.661 B / 58 arquivos | git ls-files os mostra no HEAD; git log --all -- docs/pesquisa mostra o lote principal em bc99e190…. Documentam DOM, regras e comportamento de produtos de terceiros. | Mover para acervo privado; retirar do corte público e **reescrever histórico**. Confirmar juridicamente se algum resumo pode ser público. |
| Fixtures EAA… em packages/db/tests/auditoria.test.ts e segredo.test.ts | pequeno | git log --all -G EAA[A-Za-z0-9_-]+ retornou somente 6a0cc568… e 05b433dc…. git show revelou EAAG-secreto e EAAG-token-da-meta, fixtures sintéticas. Buscas por sk-, BEGIN, password=, JWT e .env no histórico não retornaram ocorrência. | Manter; não há evidência de credencial real. |

Não foram encontrados certificados/chaves locais pem/key/pfx/p12/crt/cer fora de dependências, nem rastreados. Isso não substitui scanner de segredos antes do push.

## 2. Código morto e referências mortas

| Caminho | Tamanho | Por que (evidência) | Ação sugerida |
|---|---:|---|---|
| apps/desk | inexistente | Test-Path apps/desk = False; rg encontra referências em infra/construir-imagens.sh, infra/compose/docker-compose.prod.yml, infra/README.md e docs/superpowers/plans. O workspace real é apps/desk-vite (@pipe/desk-vite). | Reescrever/remover referências; não há pasta a apagar. |
| apps/gestao | inexistente | Test-Path apps/gestao = False; README manda pnpm --filter @pipe/gestao dev; THIRD_PARTY_NOTICES, Docker ignores e docs apontam ao Next antigo. O real é apps/gestao-vite. | Reescrever/remover referências; não há pasta a apagar. |
| packages/mcp | pequeno | Manifesto @pipe/mcp; rg encontrou só o próprio manifesto, cópias de manifesto em Dockerfiles e nota que o chama de esqueleto. Nenhum manifesto declara dependência e não há script raiz. | **Duvidoso, candidato a retirar**; confirmar plano com o dono. |
| packages/tempo-real | pequeno | Manifesto @pipe/tempo-real; nenhum outro package.json o declara e rg só retornou o pacote. | **Duvidoso, candidato a retirar**; confirmar se será ativado. |
| Deploy do Desk antigo | texto/configuração | infra/construir-imagens.sh usa padrão api workers desk gestao-vite crm site; compose/README ainda citam Desk, mas não existe apps/desk/Dockerfile. | Corrigir antes de publicar/deployar; não apagar sem decisão operacional. |

Não classifiquei apps/ponte como morto: tem script raiz, testes e especificação. core, contracts, db, ui, autenticação e armazenamento têm consumidores declarados. A suspeita de mcp/tempo-real não é prova de remoção.

## 3. Duplicações e documentação contraditória

| Caminho | Tamanho | Por que (evidência) | Ação sugerida |
|---|---:|---|---|
| Domínio Gestão em apps/api/src/dominio/gestao/ e equivalentes em apps/gestao-vite/src/ | 27.198 B em pares idênticos | Agrupamento de hashes de git ls-tree -rl HEAD encontrou pares de cores-de-fila, nota-avaliacao, passos-da-implantacao, pesquisa, regra-fila e regras-de-nome. | Manter agora; centralizar em pacote somente se ambos consumidores seguirem vivos. |
| Ícones/ativos Pipe em Desk, Gestão, Site e UI | maior par: 186.722 B cada | Mesmo agrupamento encontrou icones-portal.tsx idêntico em Desk/Gestão e SVGs idênticos em até quatro locais. | Baixa prioridade; centralizar depois, não apagar às cegas. |
| packages/db/drizzle/meta/0004 a 0012_snapshot.json | 2.825.010 B (9 cópias) | Mesmo hash, 313.890 B por arquivo. São metadados de migração; packages/db está em trabalho concorrente e não foi inspecionado/alterado. | **Duvidoso:** revisar depois com responsável de DB; não remover nesta limpeza. |
| README, infra/README, THIRD_PARTY_NOTICES, plano Superpowers e pesquisa | texto | rg encontrou @pipe/gestao, apps/gestao/**, apps/desk/** e Node 20; o root exige Node >=22 e os apps atuais são Vite. | Reescrever como documentação atual ou mover para histórico privado. |

## 4. Artefatos que não deveriam estar versionados

| Caminho | Tamanho | Por que (evidência) | Ação sugerida |
|---|---:|---|---|
| node_modules/ e apps/**/node_modules/ | ao menos 549,00 MiB na raiz | Local; .gitignore contém node_modules/; ausente de git ls-files. | Ignorar (já está); nunca adicionar. |
| .turbo/ | 5,68 MiB | .gitignore:8:.turbo/; cache. | Ignorar (já está). |
| .capturas/ e docs/capturas/ | 4,49 GiB combinados | Capturas locais/terceiros, ambas ignoradas. | Ignorar e mover fora do checkout para reduzir volume. |
| .playwright-cli/ | 372.786 B | Saída de automação rastreada; commit 06d8d298…. | Remover do corte, ignorar no repo novo, reescrever histórico atual. |
| output/playwright/ | 497.990 B | Screenshots de revisão rastreados. | Remover do corte, ignorar no repo novo, reescrever histórico atual. |
| undefined/original-crop-logo.png | 1.400 B | Diretório acidental; rastreado em a8025fca…; rg não achou consumidor. | Apagar do corte público; prevenir geração acidental. |
| dist/, build/, .next/, *.log, .env* (exceto exemplos) | quando existirem | Já ignorados; turbo.json declara dist/** e .next/** como saída. | Manter ignorados; conferir antes de corte. |

## 5. Mapa vivo do produto

| Caminho | Papel / evidência | Ação sugerida |
|---|---|---|
| apps/api | API Nest; @pipe/api depende de core, db, contracts, autenticação, armazenamento e workers; Dockerfile. | Manter. |
| apps/gestao-vite | SPA Vite/React de gestão; scripts e Dockerfile próprios; substituta do Next antigo. | Manter. |
| apps/desk-vite | SPA Vite/React de atendimento; workspace ativo @pipe/desk-vite. | Manter. |
| apps/workers | Workers BullMQ; dependências core/db e Dockerfile. | Manter. |
| apps/ponte | Serviço LIME; script, testes e especificação. | Manter. |
| apps/crm | CRM Next; Dockerfile e dependências declaradas. | Manter. |
| apps/site | Landing page/blog/ferramentas estáticas; Dockerfile e serviço de produção. | Manter. |
| packages/ai | Utilitários de IA referidos por fontes, mas sem consumidor no manifesto. | Manter por ora; corrigir declaração se compartilhado. |
| packages/armazenamento | Portas/limites de anexos; dependência da API. | Manter. |
| packages/autenticacao | Autenticação; dependência da API. | Manter. |
| packages/contracts | Contratos usados por apps e tempo-real. | Manter. |
| packages/core | Domínio compartilhado por API, apps e workers. | Manter. |
| packages/db | Drizzle/schema/migrações; usado por API, CRM, Gestão, Ponte e workers. | Manter. |
| packages/ui | Design system dos front-ends. | Manter. |
| packages/mcp e packages/tempo-real | Sem consumidores declarados; ver seção 2. | Manter somente após confirmação. |

## Como publicar no GitHub sem levar isto

### Recomendação: novo repositório a partir de corte limpo

Criar um diretório/repositório novo **fora deste checkout**, copiar apenas conteúdo revisado, iniciar novo histórico e publicar. Não executar aqui.

Entrariam: arquivos de configuração da raiz revisados; apps/api, gestao-vite, desk-vite, workers, ponte, crm, site; packages/ai, armazenamento, autenticacao, contracts, core, db, ui (mcp/tempo-real somente se confirmados); docker/, infra/ corrigida; e documentação do Pipe sem pesquisa/capturas de terceiros.

Não entrariam: .env, docs/capturas/, .capturas/, .playwright-cli/, output/playwright/, undefined/, node_modules/, .turbo/, dist/, build/, .next/, logs, material de pesquisa de terceiros, certificados e segredos.

Prós: nenhum blob/commit antigo é levado; revisão simples e menor risco. Contras: perde-se autoria/histórico, que deve ficar preservado apenas em ambiente privado autorizado.

### Alternativa: sanitizar o histórico atual com git filter-repo

Remover de **todos os commits** as capturas rastreadas, undefined/ e documentação/material de terceiros; depois escanear segredos e corrigir referências. Excluir do HEAD não basta: artefatos em 06d8d298… continuam recuperáveis no histórico.

Prós: preserva a linhagem remanescente. Contras: exige backup privado, force-push e novo clone por todos; erro de seleção pode deixar material acessível. Com Git de 11,80 MiB e histórico recente, o repositório novo é a opção mais segura e barata.

Nenhuma operação de limpeza ou publicação foi executada.
