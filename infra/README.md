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
2. **Só `apps/site` tem Dockerfile.** As imagens `ghcr.io/pipe/*` referenciadas aqui
   ainda não existem.
3. **Métrica de fila e de entrega** (`pipe_fila_idade_item_mais_velho_segundos`,
   `pipe_mensagem_entrega_total`) precisa ser emitida pelos workers.
4. Os valores de exemplo (id de datacenter, plano, endpoint de bucket, destinatárias
   age) são inventados. Confira cada um contra o painel do provedor.
5. O `.gitignore` da raiz ignora `.env.*` e **não** ignora `*.tfvars`. Por isso o
   modelo aqui se chama `env.prod.exemplo`, sem ponto — e `*.tfvars` precisa ser
   acrescentado ao `.gitignore` antes do primeiro `terraform apply`.
