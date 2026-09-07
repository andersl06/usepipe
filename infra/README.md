# infra — a infraestrutura do Pipe como código

Esqueleto. **Nada aqui foi aplicado contra conta real.** Antes do primeiro `apply`,
leia [docs/pesquisa/infra-terraform-k8s.md](../docs/pesquisa/infra-terraform-k8s.md),
que traz o porquê de cada decisão e o passo a passo.

```
terraform/
  modules/         toda a lógica: máquina, DNS, cluster, plataforma, cliente dedicado
  ambientes/       só valores. producao/ e homologacao/, diretórios separados, estados separados
compose/           degrau pequeno: uma VPS com tudo
k8s/               degrau grande: base Kustomize, values de Helm, overlay do cliente dedicado
observabilidade/   prometheus, alertas e roteamento — servem aos dois degraus
.sops.yaml         quem consegue decifrar qual segredo
```

## Comandos

```bash
# construir as seis imagens (api, workers, desk, gestao, crm, site) com tag por
# versão e `latest`, e imprimir o tamanho de cada uma
./infra/construir-imagens.sh v1.4.2
./infra/construir-imagens.sh v1.4.2 api      # só uma
PUBLICAR=1 ./infra/construir-imagens.sh v1.4.2

# degrau pequeno, na VPS
./compose/deploy.sh v1.4.2

# terraform: ambiente é diretório, nunca workspace
cd terraform/ambientes/producao && terraform init && terraform plan

# degrau grande
kubectl kustomize k8s/base | kubectl apply -f -
kubectl kustomize k8s/tenants/exemplo-dedicado | kubectl apply -f -
```

## Pendências que este esqueleto expõe

São dívidas do produto, não do IaC — mas o IaC não funciona sem elas:

1. **`apps/api` não expõe `/saude` nem `/metrics`.** Sem o primeiro, o healthcheck
   mente e a publicação gradual não tem juiz. Sem o segundo, metade dos alertas
   nunca dispara. É a primeira coisa a construir.
2. ~~**Só `apps/site` tem Dockerfile.**~~ Resolvido: `api`, `workers`, `desk`, `gestao`
   e `crm` têm Dockerfile multi-estágio e `infra/construir-imagens.sh` constrói as seis.
   Tamanhos medidos: api 305 MB, workers 274 MB, desk 319 MB, gestão 321 MB, crm 320 MB,
   site 74 MB — dos quais ~240 MB são a camada `node:22-alpine` **compartilhada** pelas
   cinco de aplicação; o que cada uma acrescenta fica entre 35 MB e 81 MB.
   Duas armadilhas ficaram registradas nos Dockerfiles: `pnpm deploy` não serve neste
   monorepo (empacota com as regras do `npm pack`, que respeitam o `.gitignore` da raiz,
   onde `dist/` está ignorado — sai imagem com `src/` e sem `dist/`), e
   `packages/db` declara `dotenv` como devDependency mas o importa de `migrar.ts`,
   código que roda em produção. O segundo é conserto de uma linha em
   `packages/db/package.json` e hoje está contornado por um `cp` no Dockerfile.
3. **Métrica de fila e de entrega** (`pipe_fila_idade_item_mais_velho_segundos`,
   `pipe_mensagem_entrega_total`) precisa ser emitida pelos workers.
4. Os valores de exemplo (id de datacenter, plano, endpoint de bucket, destinatárias
   age) são inventados. Confira cada um contra o painel do provedor.
5. O `.gitignore` da raiz ignora `.env.*` e **não** ignora `*.tfvars`. Por isso o
   modelo aqui se chama `env.prod.exemplo`, sem ponto — e `*.tfvars` precisa ser
   acrescentado ao `.gitignore` antes do primeiro `terraform apply`.
