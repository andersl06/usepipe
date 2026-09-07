# infra — a infraestrutura do Pipe como código

**Nada aqui foi aplicado contra conta real.** O compose de produção foi revisado linha
a linha em 07/09/2026 e teve doze defeitos corrigidos, mas continua sem ter subido.

- **Para subir a primeira vez:** [docs/specs/2026-09-07-implantacao.md](../docs/specs/2026-09-07-implantacao.md)
  — do domínio ao WhatsApp respondendo, dizendo em cada passo o que é do dono e o que é do sistema.
- **Para entender o porquê de cada decisão:** [docs/pesquisa/infra-terraform-k8s.md](../docs/pesquisa/infra-terraform-k8s.md).

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

# degrau pequeno, na VPS — a PRIMEIRA vez, com conferência e paradas explicadas
./compose/implantar.sh v1.4.2
# da segunda em diante
./compose/deploy.sh v1.4.2

# tarefas que não vivem em laço (perfil `tarefa`)
C="docker compose -f docker-compose.prod.yml --env-file /opt/pipe-dados/.env"
$C --profile tarefa run --rm migrar
$C --profile tarefa run --rm provisionar --nome "Acme" --slug acme --admin ana@acme.com.br
$C --profile tarefa run --rm backup -c 'pgbackrest --stanza=pipe check'

# terraform: ambiente é diretório, nunca workspace
cd terraform/ambientes/producao && terraform init && terraform plan

# degrau grande
kubectl kustomize k8s/base | kubectl apply -f -
kubectl kustomize k8s/tenants/exemplo-dedicado | kubectl apply -f -
```

## Pendências que este esqueleto expõe

São dívidas do produto, não do IaC — mas o IaC não funciona sem elas:

1. ~~**`apps/api` não expõe `/saude` nem `/metrics`.**~~ Resolvido: as duas rotas existem
   (`apps/api/src/controladores/operacao.ts`), sem prefixo `/v1`. `/saude` devolve 503
   quando o pool da aplicação não responde, e o compose agora sobrescreve o HEALTHCHECK
   da imagem — que ainda bate na raiz e aprova qualquer coisa abaixo de 500 — para
   apontar para ele. `/metrics` emite fila, entrega, migration pendente e latência.
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
3. **`apps/workers` não expõe porta HTTP nenhuma.** As métricas de fila e entrega saem
   da API, não dos workers, e por isso o alvo `pipe-workers` e o alerta `WorkerParado`
   foram removidos de `observabilidade/`: sem alvo, o alerta ficaria em disparo
   permanente e acordaria alguém toda madrugada sem nada a fazer. Voltam quando os
   workers publicarem `/metrics`.
4. **Nenhum Dockerfile Next aceita `ARG`.** `NEXT_PUBLIC_PIPE_GESTAO_URL`,
   `NEXT_PUBLIC_PIPE_CRM_URL` e `NEXT_PUBLIC_PIPE_DESK_URL` são embutidas no bundle em
   tempo de build, e as imagens de produção saem com `localhost` dentro. Pôr as
   variáveis no `.env` de runtime não corrige nada. O conserto é uma linha de `ARG` em
   cada um dos três, mais `--build-arg` no `construir-imagens.sh`.
5. Os valores de exemplo do Terraform (id de datacenter, plano, endpoint de bucket,
   destinatárias `age`) são inventados. Confira cada um contra o painel do provedor.
   As chaves `age1operador000…` do `.sops.yaml` são placeholders e não abrem nada.
6. ~~O `.gitignore` da raiz não ignora `*.tfvars`.~~ Resolvido por um `infra/.gitignore`
   próprio, que cobre `*.tfvars`, `.terraform/`, `*.tfstate` e `.env` em texto claro —
   sem mexer no `.gitignore` da raiz.
