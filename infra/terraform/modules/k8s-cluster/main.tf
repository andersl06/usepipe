# Módulo: o cluster do degrau grande, e o Postgres FORA dele.
#
# Escrito contra a DigitalOcean por dois motivos práticos: painel de controle sem
# custo e Postgres gerenciado com pgvector e PITR na mesma conta. Trocar de nuvem
# aqui é trocar dois blocos de recurso; nada em `infra/k8s/` depende deste arquivo.
# https://registry.terraform.io/providers/digitalocean/digitalocean/latest/docs/resources/kubernetes_cluster

terraform {
  required_version = ">= 1.11"
  required_providers {
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = "~> 2.0"
    }
  }
}

variable "nome" { type = string }
variable "regiao" {
  description = "Região. Cliente brasileiro sente latência de painel; a fila e o webhook da Meta, quase não."
  type        = string
}
variable "versao_k8s" {
  description = "Versão fixada de propósito: upgrade de cluster é decisão, não efeito colateral de apply."
  type        = string
}
variable "tamanho_no" { type = string }
variable "min_nos" {
  type    = number
  default = 2
}

variable "max_nos" {
  type    = number
  default = 6
}

resource "digitalocean_kubernetes_cluster" "pipe" {
  name    = var.nome
  region  = var.regiao
  version = var.versao_k8s
  # Painel em alta disponibilidade custa; ligue quando o SLA prometido ao cliente
  # não couber numa janela de indisponibilidade do painel (que não derruba os pods,
  # mas impede escalar e publicar durante o incidente).
  ha = true

  maintenance_policy {
    day        = "sunday"
    start_time = "06:00"
  }

  node_pool {
    name       = "${var.nome}-app"
    size       = var.tamanho_no
    auto_scale = true
    min_nodes  = var.min_nos
    max_nodes  = var.max_nos
    # PodDisruptionBudget só protege de verdade se houver nó sobrando para
    # receber o pod despejado. Dois nós é o piso.
  }
}

# Postgres gerenciado, fora do cluster. A justificativa longa está no documento:
# operador em cluster é bom software e é a peça que transforma incidente de 20
# minutos em madrugada quando não há plantão que saiba fazer failover na mão.
resource "digitalocean_database_cluster" "postgres" {
  name       = "${var.nome}-pg"
  engine     = "pg"
  version    = "16"
  size       = "db-s-2vcpu-4gb"
  region     = var.regiao
  node_count = 2 # primário + réplica: failover gerenciado é metade do motivo de pagar por isto

  lifecycle {
    prevent_destroy = true
  }
}

# `vector` precisa ser habilitada explicitamente: sem ela, packages/ai não sobe.
resource "digitalocean_database_postgresql_config" "pipe" {
  cluster_id = digitalocean_database_cluster.postgres.id
  timezone   = "America/Sao_Paulo"
}

resource "digitalocean_database_db" "pipe" {
  cluster_id = digitalocean_database_cluster.postgres.id
  name       = "pipe"
}

# O papel da aplicação NÃO é o dono das tabelas (README, §isolamento). O Terraform
# cria os dois usuários; quem define quem é dono do quê é a migration.
resource "digitalocean_database_user" "dono" {
  cluster_id = digitalocean_database_cluster.postgres.id
  name       = "pipe"
}

resource "digitalocean_database_user" "app" {
  cluster_id = digitalocean_database_cluster.postgres.id
  name       = "pipe_app"
}

# Só o cluster fala com o banco. Sem isto, o banco gerenciado nasce aberto à
# internet com senha — que é como a maioria dos vazamentos de Postgres acontece.
resource "digitalocean_database_firewall" "pipe" {
  cluster_id = digitalocean_database_cluster.postgres.id
  rule {
    type  = "k8s"
    value = digitalocean_kubernetes_cluster.pipe.id
  }
}

output "kubeconfig" {
  value     = digitalocean_kubernetes_cluster.pipe.kube_config[0].raw_config
  sensitive = true
}

output "endpoint" { value = digitalocean_kubernetes_cluster.pipe.endpoint }

output "postgres_host" { value = digitalocean_database_cluster.postgres.private_host }

# A senha existe no estado do Terraform em texto claro — é assim que o Terraform
# funciona, e por isso o bucket de estado é privado e cifrado.
# https://developer.hashicorp.com/terraform/language/state/sensitive-data
output "postgres_senha_app" {
  value     = digitalocean_database_user.app.password
  sensitive = true
}
