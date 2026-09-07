# Infraestrutura como código: os dois degraus

Pesquisa e decisões, 07/09/2026. O esqueleto de arquivos correspondente está em
[`infra/`](../../infra/). Nada foi aplicado contra conta real.

Este documento não reabre o que a [spec de infraestrutura](../specs/2026-09-05-infraestrutura.md)
já decidiu — topologia, isolamento por RLS, WABA do cliente, o CRM como serviço
separado. Ele responde à pergunta seguinte: **como isso vira código, e o que muda
quando o primeiro cliente grande chegar.**

Dois degraus, e a fronteira entre eles é explícita:

| | Degrau pequeno | Degrau grande |
|---|---|---|
| Onde | uma VPS, Docker Compose | Kubernetes gerenciado |
| Quando | do primeiro cliente até os gatilhos da §7 da spec | quando os gatilhos chegarem, ou quando um contrato exigir |
| Custo de máquina | ~US$ 25–40/mês | ~US$ 150–250/mês |
| Custo real | seu tempo quando cair | seu tempo aprendendo antes de cair |

O erro comum é subir o segundo degrau cedo demais, "para já estar pronto". Ele não
deixa nada pronto: dobra a superfície de operação enquanto o produto ainda tem um
cliente. O outro erro é subir tarde demais, no meio do incidente. Os gatilhos da §7
da spec existem para que a decisão seja consulta, e este documento escreve o que
fazer quando ela vier.

---

## 1. Estrutura do repositório de IaC

**Decisão: `infra/` dentro deste monorepo, módulos em `terraform/modules/`, uma raiz
por ambiente em `terraform/ambientes/<ambiente>/`. Diretórios, não workspaces.**

### Por que dentro do monorepo

Repositório de infraestrutura separado é a prática de time grande, e o motivo dela é
controle de acesso: quem mexe em produção não é quem mexe em código. Aqui é a mesma
pessoa. Separar produziria dois repositórios que precisam ser versionados juntos —
a migration que exige uma variável nova e o compose que a fornece — sem ganhar
nada. Quando existir uma segunda pessoa com acesso a produção e não a código,
separe; é `git filter-repo` e uma tarde.

O fork do Twenty é a exceção que confirma a regra: ele está em repositório próprio
porque a razão é **licença**, não organização.

### Por que diretórios, e não workspaces

A HashiCorp é explícita: workspaces servem a múltiplas cópias quase idênticas que
podem compartilhar com segurança um backend e um conjunto de credenciais, e **não**
servem quando ambientes exigem credenciais e controle de acesso separados
([workspaces](https://developer.hashicorp.com/terraform/cli/workspaces)). Produção e
homologação do Pipe exigem: o token que pode destruir a VPS de produção não deve
estar carregado na sessão em que se mexe em homologação.

Há um motivo mais grosseiro, e ele é o decisivo: com workspaces, o comando que
destrói produção é o mesmo que destrói homologação, e a diferença é uma linha
invisível de estado. Com diretórios, a diferença é o `cd` — que aparece no
histórico do shell e na sua cabeça.

### Como não triplicar o mesmo bloco

A regra é uma só e cabe numa frase: **`ambientes/` só escolhe valores; toda lógica
vive em `modules/`.** As raízes de produção e homologação em `infra/terraform/ambientes/`
têm ~45 linhas cada, e a diferença entre elas é tamanho de máquina, hostname e um
`proxied = false` em homologação. No dia em que aparecer um `resource` copiado numa
raiz, o módulo está errado — é sinal de que falta uma variável, não de que falta
flexibilidade.

Não existe um terceiro nível (`global/`, `bootstrap/`) porque hoje há exatamente um
recurso global: o bucket de estado, criado à mão de propósito (§2).

---

## 2. Estado do Terraform

**Decisão: backend `s3` num bucket privado e versionado, com `use_lockfile = true`.
O bucket é criado à mão, uma vez. O estado é tratado como segredo.**

Três propriedades, e cada uma corresponde a um jeito conhecido de perder o projeto:

**Onde mora.** Estado local no notebook morre com o notebook e não sobrevive a
duas máquinas. Bucket S3-compatível resolve, e o Terraform 1.10+ tranca sozinho por
escrita condicional no próprio S3 — os argumentos de DynamoDB estão depreciados e
não há mais motivo para manter uma tabela só para isso
([backend s3](https://developer.hashicorp.com/terraform/language/backend/s3)).

**Como se tranca.** `use_lockfile = true`, e uma verificação que quase ninguém faz:
provedor S3-compatível que não implementa escrita condicional aceita a configuração
e **não tranca**. Dois `apply` simultâneos corrompem o estado em silêncio. O teste é
de trinta segundos e roda uma vez: dispare dois `terraform plan` ao mesmo tempo — o
segundo tem que reclamar de lock. Se não reclamar, troque de bucket ou use o nível
gratuito do HCP Terraform, que traz estado versionado e tranca sem bucket nenhum.

**Como não se perde.** Versionamento de objeto ligado no bucket. É o que permite
voltar depois de um `terraform state rm` errado — que é como o estado costuma ser
perdido, não por incêndio no datacenter. E o bucket **não** é criado pelo Terraform
que o usa: código que guarda o próprio estado no recurso que cria não pode ser
destruído nem recriado.

**O estado é segredo.** Ele guarda senha de banco em texto claro — não é bug, é
como o Terraform funciona
([sensitive data in state](https://developer.hashicorp.com/terraform/language/state/sensitive-data)).
Daí decorre a regra do §3: o Terraform não cria segredo de aplicação.

---

## 3. Segredos

**Decisão: SOPS com chaves `age`. Arquivo cifrado versionado no repositório, chave
privada nunca. Terraform não gera nem guarda segredo de aplicação. Token de canal
do cliente não entra em variável de ambiente: fica cifrado no banco.**

### Por que SOPS + age, e não um cofre

Um cofre (Vault, Infisical) responde a três perguntas que o SOPS não responde: quem
leu, quando rotacionar automaticamente, e como emitir credencial de vida curta. As
três importam — e nenhuma importa ainda. O que importa agora é que o segredo não
esteja em `.env` versionado e que perder o notebook não seja perder produção.

`age` em vez de GPG pelo motivo prosaico de que GPG tem chaveiro, agente e data de
validade que expira num feriado. A chave `age` é uma linha de texto. E o arquivo
cifrado do SOPS mantém a estrutura: muda uma variável, o diff mostra uma linha —
com um blob cifrado inteiro, toda revisão vira fé.

A migração, quando vier, tem caminho conhecido: mover a fonte da verdade para um
cofre e sincronizar com o External Secrets Operator, mantendo os manifestos iguais
([Flux — secrets management](https://fluxcd.io/flux/security/secrets-management/)).

### Onde cada segredo mora

| Segredo | Onde | Como chega no contêiner |
|---|---|---|
| Senha do Postgres, chave da Anthropic, chave do bucket | `infra/compose/segredos/*.enc.env` (SOPS) | `deploy.sh` decifra para `/opt/pipe-dados/.env`, modo 600, e o compose lê |
| **Token da Meta e segredo de app do cliente** | `canal.config`, cifrado no banco | a aplicação decifra em memória, por canal |
| Chave que cifra `canal.config` (`PIPE_CHAVE_CANAIS`) | SOPS | ambiente |
| Chave `age` privada | máquina do operador + cópia offline; a de deploy só na VPS | não entra em contêiner nenhum |
| Token de API do provedor e da Cloudflare | SOPS, exportado no shell do `apply` | não entra em contêiner nenhum |

A linha em negrito é a que a spec já tinha decidido e que a infraestrutura precisa
respeitar: o token da Meta **não** pode ser variável de ambiente do processo, porque
um tenant tem mais de um número e cada número tem seu token. `.env.example` do
repositório traz `WHATSAPP_TOKEN_ACESSO` como *fallback* de instalação de um número
só — em produção multi-tenant ele fica vazio.

### Rotação

- **Chave de canal (`PIPE_CHAVE_CANAIS`)**: envelope. Cada valor cifrado carrega o
  id da chave que o gerou (`PIPE_CHAVE_CANAIS_ID`). Rotacionar é publicar a chave
  nova como corrente, manter a antiga para leitura, e recifrar em segundo plano.
  Sem o id junto do dado cifrado, rotação vira parada programada.
- **Token da Meta**: é do cliente e expira na conta dele. O produto precisa avisar
  antes de expirar — é alerta, não tarefa manual.
- **Chave `age`**: `sops updatekeys` nos arquivos. Muda quem abre; o conteúdo fica.
- **Senha do Postgres**: as duas (`pipe` e `pipe_app`) mudam com uma janela: nova
  senha, `deploy.sh`, reinício. Não é online — e não precisa ser nesta escala.
- **O que rotaciona sozinho**: certificado TLS, pelo ACME. É o único.

### O que NÃO fazer, e que é tentador

Gerar a senha do banco com `random_password` no Terraform e passá-la para a
aplicação. Funciona, e coloca a senha em texto claro no estado — que já é onde ela
está no caso do banco gerenciado (§2), mas ali é inevitável e ali para. Estender o
padrão para chave de IA e chave de cifra de canal seria transformar o arquivo de
estado no cofre da empresa, sem controle de acesso e sem auditoria.

---

## 4. O degrau pequeno: Compose de produção

Arquivo: [`infra/compose/docker-compose.prod.yml`](../../infra/compose/docker-compose.prod.yml).
O que ele tem além do compose de desenvolvimento, e o porquê de cada item:

**TLS automático (Traefik v3, desafio HTTP).** Resolver ACME configurado por flag,
armazenamento em `acme.json` com modo 600, redirecionamento de 80 para 443 no
próprio entrypoint
([certificate resolvers](https://doc.traefik.io/traefik/reference/install-configuration/tls/certificate-resolvers/acme/)).
`exposedbydefault=false` é a linha que impede que um contêiner novo vire rota
pública por acidente. O socket do Docker é montado somente leitura: com escrita, quem
tomar o Traefik é root na máquina.

**Teto de CPU e memória por serviço.** `deploy.resources.limits` vale no
`docker compose up`, sem Swarm nenhum — o conselho contrário circula bastante e
deixa os serviços sem limite algum
([Compose Deploy Specification](https://docs.docker.com/reference/compose-file/deploy/)).
A soma dos limites passa do total da máquina de propósito: não é reserva, é teto.
O que ele compra é que um vazamento no worker não mata o Postgres junto.

**Healthcheck em tudo que recebe tráfego**, e `deploy.sh` sobe com `--wait`: sem
isso, "deploy ok" significa "o contêiner iniciou", que é diferente de "o contêiner
responde". *Pendência: `apps/api` ainda não expõe `/saude`.*

**Postgres e Redis sem porta publicada, numa rede `internal: true`.** Duas trancas:
a rede interna corta a saída para a internet (um Postgres comprometido não exfiltra
sozinho) e o `ufw` do cloud-init fecha o resto. Depuração é `docker compose exec` ou
túnel SSH — não um mapeamento de porta que fica aberto para sempre.

**`restart: unless-stopped`**, não `always`: `always` sobe de volta o contêiner que
você parou de propósito no meio de um incidente.

**Rotação de log.** `json-file` sem limite enche o disco em semanas e derruba o
Postgres junto. É a causa mais chata de indisponibilidade em VPS, e são quatro
linhas.

**Redis com `maxmemory-policy noeviction`.** BullMQ perdendo job por despejo
silencioso é a mensagem que o cliente jura ter enviado e que nunca saiu.

**Migration como serviço de tarefa**, rodada antes do código novo (§9 da spec).

---

## 5. O degrau grande: Kubernetes

### 5.1 Namespace por tenant ou cluster por tenant?

**Nenhum dos dois como padrão.** É a decisão mais importante deste documento e ela
contraria a pergunta.

O Pipe **já é multi-tenant no código**: um banco, `tenant_id` em toda tabela, RLS
ligada, falha fechada. Namespace por tenant significaria N cópias do Deployment, N
HPAs, N Ingress e N certificados de uma aplicação que foi construída justamente para
não precisar disso. O isolamento ganho é de rede e de cota; o isolamento de dado —
o que o cliente pergunta na RFP — continua vindo da RLS, exatamente como no
namespace único.

E há um detalhe que faz a conta virar: **namespace não é fronteira de rede por
padrão**. Sem NetworkPolicy, pod de qualquer namespace alcança o banco. Quem acha
que "namespace por tenant" isola alguma coisa sem escrever política de rede está
comprando o custo e não levando o benefício.

Então:

- **Padrão: um namespace (`pipe-prod`) com a aplicação escalada horizontalmente.**
  O tenant continua sendo linha no banco. É o degrau pequeno com mais réplicas e
  autocura.
- **Exceção: namespace dedicado**, pelo módulo `tenant-dedicado`, para o cliente
  que exigiu separação por contrato. Mesma base Kustomize, mesma imagem, mesma
  migration — muda namespace, hostname, cota e a variável que diz que aquela
  instalação atende um tenant só.
- **Cluster por cliente: só com o contrato na mão e o preço no orçamento.**

### 5.2 O custo real de cluster por cliente

O custo de máquina engana porque é baixo. Painel de controle é grátis na
DigitalOcean, na Hetzner e em outros provedores, enquanto EKS, GKE e AKS cobram
US$ 0,10/hora por cluster (~US$ 73/mês) só pelo painel
([comparativo de preço](https://oneuptime.com/blog/post/2026-02-09-managed-kubernetes-pricing-comparison/view),
[provedores com painel gratuito](https://softweb.uk/insights/stop-paying-for-kubernetes-5-providers-with-free-control-planes-2026)).
Nó de 4 vCPU / 8 GB sai por cerca de € 6,50/mês na Hetzner e a partir de US$ 12/mês
na DigitalOcean; há quem estime cluster por tenant em torno de US$ 12 por tenant por
mês em infraestrutura
([vcluster](https://www.vcluster.com/blog/multi-tenancy-in-kubernetes-comparing-isolation-and-costs)).

Se a conta parasse aí, cluster por cliente seria barato. Ela não para: **o custo
adicional de nuvem de rodar vários clusters é pequeno perto do custo operacional de
operá-los** — cada cluster a mais é mais um upgrade, mais uma política, mais uma
pilha de observabilidade e mais um alvo de plantão
([Spectro Cloud](https://www.spectrocloud.com/blog/kubernetes-multi-tenant-vs-single-tenant-clusters)).

Com dez clientes dedicados, a conta de máquina cresce ~US$ 500/mês e a conta de
tempo cresce dez janelas de upgrade, dez certificados para renovar e dez lugares
onde investigar quando alguém disser "está lento". Numa operação de uma pessoa, a
segunda conta é a que estoura primeiro.

**Regra proposta:** cluster dedicado só quando o contrato o exigir por escrito e o
preço cobrir uma linha de operação dedicada. Namespace dedicado atende quase todo
mundo que pede "ambiente separado", e custa uma cota.

### 5.3 As peças, e por que cada uma

**Ingress: Traefik.** Não é preferência. O ingress-nginx mantido pelo projeto
Kubernetes foi **aposentado em março de 2026** — sem release, sem correção de bug e
sem correção de segurança
([anúncio](https://www.kubernetes.dev/blog/2025/11/12/ingress-nginx-retirement/),
[comitês de direção e segurança](https://www.kubernetes.io/blog/2026/01/29/ingress-nginx-statement/)).
A recomendação do projeto é migrar para o Gateway API ou para outro controlador. O
Traefik é o mesmo do degrau pequeno: um jeito só de escrever rota e de depurar TLS
às duas da manhã. Os manifestos ficam em `Ingress` clássico (que segue disponível e
congelado) e a migração para `HTTPRoute` é troca de arquivo, não de arquitetura.

**TLS: cert-manager**, não o ACME embutido do Traefik. Com duas réplicas de ingress,
o armazenamento em arquivo do ACME não é compartilhável e as réplicas brigam pelo
mesmo desafio. Dois `ClusterIssuer`, produção e teste — descobrir o limite semanal
de emissão da Let's Encrypt durante um incidente significa ficar sem certificado até
a semana seguinte.

**HPA**: por CPU na `api`, por **tamanho de fila** nos `workers`. Worker esperando
resposta da Meta ou do provedor de IA fica com CPU baixa e fila crescendo; escalar
por CPU ali é escalar pelo sinal errado. Descida lenta nos dois (janela de
estabilização de 10–15 min): atendimento tem pico curto, e encolher no meio do pico
cria o segundo pico.

**PodDisruptionBudget: `minAvailable: 1` com duas réplicas.** A armadilha vale ser
escrita: `minAvailable: 2` com duas réplicas proíbe qualquer despejo e **trava a
drenagem de nó para sempre** — o PDB que protege demais vira o incidente. Sobe para
2 quando o mínimo do HPA subir para 3.

**requests e limits em todo contêiner.** Sem `requests`, o pod é BestEffort e é o
primeiro a morrer sob pressão de memória — e o escalonador não tem como saber se ele
cabe no nó. Em namespace dedicado, `ResourceQuota` mais `LimitRange`: sem o segundo,
um pod sem `requests` declarado consome a cota inteira e trava o namespace.

### 5.4 Onde o Postgres roda

**Recomendação: gerenciado, fora do cluster.**

O [CloudNativePG](https://cloudnative-pg.io/docs/) é bom software — projeto CNCF,
failover automático, upgrade de versão maior declarativo, réplica síncrona por
quórum e backup contínuo pelo
[plugin Barman Cloud](https://cloudnative-pg.io/plugin-barman-cloud/docs/intro/).
Não é dele a objeção. A objeção é: quando o failover não completa às 3h da manhã, a
diferença entre 20 minutos e uma madrugada é ter alguém que já fez aquilo antes. Com
banco gerenciado, esse alguém é o provedor, e o preço dele é menor que o de uma
madrugada por trimestre.

Duas condições em que a recomendação se inverte, e o manifesto
[`postgres-cnpg.yaml`](../../infra/k8s/valores/postgres-cnpg.yaml) existe para elas:

1. o Postgres gerenciado do provedor não oferece **pgvector** — sem ele, `@pipe/ai`
   não sobe;
2. o cliente exigiu que o dado não saia do cluster dele.

Em qualquer dos casos, uma advertência que já custou dado a muita gente: **alta
disponibilidade não é backup.** Três instâncias com failover automático replicam
fielmente o `DELETE` errado. O backup é o plugin Barman para storage de objetos, e
vale o mesmo teste de restauração do §7.

---

## 6. Como um cliente novo é provisionado

Do zero ao funcionando, no caminho padrão (instalação compartilhada). O ponto
importante da lista: **Terraform não aparece.** Cliente comum não é infraestrutura,
é linha no banco.

| # | Passo | O que é | Quem faz | Tempo |
|---|---|---|---|---|
| 1 | Contrato de tratamento de dados assinado | jurídico (§6 da spec) | comercial | — |
| 2 | `pnpm tenant:criar --nome "Acme" --dominio acme.com.br` | **script** contra a API de administração | operador | segundos |
| 3 | Seed do tenant: filas, horários, papéis, modelos de resposta | **seed** parametrizado | o mesmo script | segundos |
| 4 | Usuário administrador e convite por e-mail | script | o mesmo script | segundos |
| 5 | Conexão do WhatsApp pelo cadastro embutido da Meta | **manual, e por definição** — o WABA é do cliente (§5 da spec) | cliente, com acompanhamento | 15–40 min |
| 6 | Token e segredo do canal gravados cifrados em `canal.config` | automático, ao fim do passo 5 | fluxo de cadastro | — |
| 7 | URL do webhook registrada na Meta (`/webhooks/whatsapp/<id do canal>`) | automático | fluxo de cadastro | — |
| 8 | **Verificação**: mandar e receber uma mensagem de verdade | manual, e não pule | operador | 5 min |
| 9 | Cliente aparece no inventário e nas métricas com rótulo `tenant` | automático | — | — |

Passos 2 a 4 são um comando só e devem terminar em menos de um minuto. Se
provisionar cliente levar mais que isso, o gargalo comercial passa a ser você.

**Migration nunca faz parte do provisionamento de cliente.** Ela roda na publicação,
para todos os tenants de uma vez. Migration por cliente é o caminho para ter
clientes em versões diferentes do esquema — e ninguém volta disso.

### O caminho do cliente dedicado

Aí sim há Terraform, e a ordem importa:

1. `terraform apply` do módulo `tenant-dedicado` → namespace, cota, LimitRange.
2. Banco: instância gerenciada nova, ou `Cluster` do CNPG no namespace.
3. DNS: `acme.pipe.com.br` e irmãos, pelo módulo `dns`.
4. Segredo: `sops` cria `k8s/tenants/acme/segredos.enc.yaml`; o Flux decifra.
5. `kubectl apply -k k8s/tenants/acme` → a mesma base, outro namespace.
6. Migration na base nova, seed, usuário — os passos 2 a 4 da tabela acima.
7. Passos 5 a 9 iguais.

Meio dia de trabalho na primeira vez, uma hora nas seguintes. É esse número que
precisa estar embutido no preço do plano dedicado.

---

## 7. Backup e restauração

**RPO e RTO propostos**, para entrar em contrato:

| | Alvo | Como se sustenta |
|---|---|---|
| **RPO** (dado que se aceita perder) | **5 minutos** | WAL contínuo com `archive_timeout = 60s`. Sem esse ajuste, num banco parado de madrugada o WAL demora horas a encher e o RPO real vira horas — a armadilha clássica de PITR |
| **RTO** degrau pequeno | **4 horas** | restaurar o último full + WAL numa VPS nova, subir o compose, apontar o DNS |
| **RTO** degrau grande | **1 hora** | banco gerenciado com réplica e failover; a aplicação sobe sozinha |
| Anexos (storage de objetos) | RPO ~0 | versionamento no bucket; anexo não é apagado, é versionado |

O RTO só vale como promessa depois de ter sido **cronometrado**. Até lá é estimativa,
e o documento deve dizer isso ao cliente.

### Como se testa

Três camadas, com custo crescente:

1. **Diário, automático**: `pgbackrest verify` confere somas de verificação de
   backup e WAL no repositório. Barato, e não prova restauração.
2. **Semanal, automático** — [`restaurar-teste.sh`](../../infra/compose/backup/restaurar-teste.sh):
   restaura o último backup num diretório descartável, sobe um Postgres temporário e
   faz três perguntas que separam "o processo terminou" de "o dado está lá":
   as tabelas existem; há atendimento gravado; e **o dado mais novo é recente** — um
   backup que restaura dados de três semanas atrás passa nas duas primeiras e ainda
   assim é um desastre. Publica `pipe_restauracao_ok`, `pipe_restauracao_segundos`
   (o RTO medido) e `pipe_restauracao_atraso_dado_segundos` (o RPO medido).
   Semanal, e não trimestral: o custo é um contêiner efêmero e a diferença é
   descobrir o problema três semanas antes
   ([prática recomendada](https://severalnines.com/blog/automating-backups-and-disaster-recovery-in-postgresql-at-scale-pgbackrest-vs-barman/)).
3. **Trimestral, manual**: restauração completa numa VPS nova, com cronômetro,
   seguindo o procedimento escrito e sem consultar quem escreveu o script. É o único
   teste que valida também o procedimento e a pessoa.

O alerta `RestauracaoNaoValida` é o mais importante do arquivo de alertas e o menos
óbvio: ele dispara quando o backup **existe e não restaura**.

### O interruptor de homem morto

Se a VPS inteira morrer, o Prometheus morre junto e não alerta ninguém. Por isso o
`backup.sh` faz um *ping* num serviço externo gratuito (healthchecks.io ou
equivalente) ao terminar com sucesso: quem alerta é o serviço de fora que **parou
de receber** o ping. É o mecanismo mais barato que existe contra "o monitoramento
morreu junto com a máquina", e cabe em três linhas.

### O que ainda não está resolvido

**Restauração de um tenant só.** Cliente que apaga a fila errada não quer o banco
inteiro de ontem — quer o dado dele. Com um banco compartilhado, isso é restaurar
para um banco paralelo e copiar as linhas daquele `tenant_id` de volta. É
procedimento, não ferramenta, e ele não existe ainda. Deve ser escrito antes do
terceiro cliente, não depois do primeiro pedido.

---

## 8. Observabilidade mínima

O critério é um só: **o que dispara chamada precisa exigir ação**. Alerta que toca e
não exige ação é o mecanismo pelo qual todos os alertas passam a ser ignorados.

Duas severidades, e a diferença é uma decisão, não um rótulo:

- **`acorda`** — toca o telefone às 3h, por um canal que fura o modo silencioso.
  API fora do ar por 2 min; worker parado; banco fora do ar; mais de 20% de falha de
  entrega num canal por 10 min; item de fila parado há 15 min; menos de 10% de disco;
  **teste de restauração falhando**.
- **`ticket`** — e-mail, vira tarefa no dia seguinte. Backup atrasado; teste de
  restauração atrasado; certificado vencendo em menos de 10 dias; disco que acaba em
  uma semana no ritmo atual (`predict_linear`); migration pendente; p95 alto.

**Métrica**: Prometheus com 15 dias de retenção — o suficiente para investigar o
incidente da semana passada; série histórica de negócio já vive em `metrica_diaria`,
no Postgres. Se a RAM apertar antes de a máquina crescer, o substituto pronto é o
VictoriaMetrics, que fala PromQL e usa uma fração da memória
([comparativo](https://performance.qa/blog/prometheus-vs-victoriametrics/)).

**Log**: estruturado em JSON com `tenant_id`, `usuario_id` e id de requisição em toda
linha (§8 da spec), em `stdout`, com rotação no driver do Docker. **Loki não entra
agora**: `docker compose logs` resolve com um cliente e alguns milhares de
atendimentos por dia, e Loki mais Promtail são dois serviços a operar por um ganho
que só aparece quando há mais de uma máquina. Entra quando houver.

**Alerta**: Alertmanager, com `repeat_interval` de 4 horas para `ticket` e 30 minutos
para `acorda`, e regra de inibição para que a queda da máquina não produza doze
mensagens onde a primeira — a que diz o que houve — se perde.

**De fora**: um verificador externo gratuito nas quatro URLs públicas, mais o
interruptor de homem morto do §7. Monitoramento que roda só dentro da máquina
monitorada não é monitoramento.

**Painel**: Grafana, em perfil opcional do compose. Alerta é obrigatório; painel é
conforto, e sobe quando alguém for de fato olhar.

**Exportável, como a §8 da spec exige**: as métricas já saem em formato Prometheus,
então "apontar para o Grafana/Datadog do cliente" é conceder um endpoint com escopo
de tenant — trabalho de produto, não de infraestrutura. O formato está certo desde
o começo, e é isso que importa agora.

### Custo

Prometheus, Alertmanager, dois exporters e o Grafana cabem em menos de 1 GB de RAM
na mesma VPS e custam R$ 0 de licença. O verificador externo tem nível gratuito
suficiente. A conta que cresce é a de retenção de log, e é justamente a que está
adiada.

---

## 9. O que este documento não resolve

Escrito para não ser redescoberto:

1. **`apps/api` não expõe `/saude` nem `/metrics`.** Sem o primeiro, o healthcheck do
   compose mente e a publicação gradual não tem juiz. Sem o segundo, metade dos
   alertas nunca dispara. É a primeira dívida a pagar, e é pequena.
2. **Só `apps/site` tem Dockerfile.** As imagens `ghcr.io/pipe/*` referenciadas no
   compose e nos manifestos ainda não existem. Falta também o pipeline que as
   constrói e etiqueta.
3. **Métricas de negócio não são emitidas**: `pipe_fila_idade_item_mais_velho_segundos`
   e `pipe_mensagem_entrega_total` estão nos alertas e não existem no código.
4. **Restauração de um tenant só** (§7) é procedimento não escrito.
5. **Publicação sem interrupção no degrau pequeno** não existe: `compose up -d` numa
   máquina só derruba e sobe. Com `--wait` a janela é de segundos e o Traefik
   devolve erro nela. Aceitável hoje; resolver com duas réplicas atrás do Traefik
   antes do primeiro cliente que reclamar.
6. Os valores de exemplo em `infra/` (id de datacenter, slug de plano, endpoint de
   bucket, destinatárias `age`) são inventados.

---

## Fontes

- [Terraform — Manage workspaces](https://developer.hashicorp.com/terraform/cli/workspaces)
- [Terraform — Backend Type: s3](https://developer.hashicorp.com/terraform/language/backend/s3)
- [Terraform — Sensitive data in state](https://developer.hashicorp.com/terraform/language/state/sensitive-data)
- [Flux — Secrets management (SOPS)](https://fluxcd.io/flux/security/secrets-management/)
- [Docker — Compose Deploy Specification](https://docs.docker.com/reference/compose-file/deploy/)
- [Traefik — ACME certificate resolvers](https://doc.traefik.io/traefik/reference/install-configuration/tls/certificate-resolvers/acme/)
- [Kubernetes — Ingress NGINX Retirement](https://www.kubernetes.dev/blog/2025/11/12/ingress-nginx-retirement/)
- [Kubernetes — Statement from the Steering and Security Response Committees](https://www.kubernetes.io/blog/2026/01/29/ingress-nginx-statement/)
- [Kubernetes — Resource Quotas](https://kubernetes.io/docs/concepts/policy/resource-quotas/)
- [Kubernetes — Limit Ranges](https://kubernetes.io/docs/concepts/policy/limit-range/)
- [cert-manager — instalação e emissores ACME](https://cert-manager.io/docs/configuration/acme/)
- [CloudNativePG — documentação](https://cloudnative-pg.io/docs/)
- [CloudNativePG — Barman Cloud Plugin](https://cloudnative-pg.io/plugin-barman-cloud/docs/intro/)
- [Spectro Cloud — multi-tenant vs single-tenant clusters](https://www.spectrocloud.com/blog/kubernetes-multi-tenant-vs-single-tenant-clusters)
- [vcluster — multi-tenancy: comparando isolamento e custo](https://www.vcluster.com/blog/multi-tenancy-in-kubernetes-comparing-isolation-and-costs)
- [Comparativo de preço de Kubernetes gerenciado (2026)](https://oneuptime.com/blog/post/2026-02-09-managed-kubernetes-pricing-comparison/view)
- [Provedores com painel de controle gratuito (2026)](https://softweb.uk/insights/stop-paying-for-kubernetes-5-providers-with-free-control-planes-2026)
- [Severalnines — pgBackRest vs Barman, automação de DR](https://severalnines.com/blog/automating-backups-and-disaster-recovery-in-postgresql-at-scale-pgbackrest-vs-barman/)
- [VictoriaMetrics vs Prometheus (2026)](https://performance.qa/blog/prometheus-vs-victoriametrics/)
- [Provider Terraform da Hostinger](https://registry.terraform.io/providers/hostinger/hostinger/latest/docs/resources/vps)
- [Provider Terraform da DigitalOcean — kubernetes_cluster](https://registry.terraform.io/providers/digitalocean/digitalocean/latest/docs/resources/kubernetes_cluster)
- [Provider Terraform da Cloudflare — dns_record](https://registry.terraform.io/providers/cloudflare/cloudflare/latest/docs/resources/dns_record)
