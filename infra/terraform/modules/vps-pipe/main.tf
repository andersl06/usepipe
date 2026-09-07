# Módulo: uma VPS que roda o Pipe inteiro (degrau pequeno).
#
# O módulo entrega a MÁQUINA e o estado inicial dela — nada mais. Deploy de código,
# migration e segredo ficam fora do Terraform de propósito: são coisas que mudam
# várias vezes por dia, e `terraform apply` não é ferramenta de release.
#
# Provedor: Hostinger, porque a conta já existe e o provider é oficial.
# Trocar de provedor é trocar este arquivo; os módulos `dns` e o compose não mudam.
# https://registry.terraform.io/providers/hostinger/hostinger/latest/docs/resources/vps

terraform {
  required_version = ">= 1.11"
  required_providers {
    hostinger = {
      source  = "hostinger/hostinger"
      version = "~> 0.1"
    }
  }
}

variable "nome" {
  description = "Nome da máquina. Vira hostname e prefixo de tudo que o módulo cria."
  type        = string
}

variable "ambiente" {
  description = "homologacao ou producao. Só entra em tag e hostname; a separação real é o diretório de ambiente."
  type        = string
  validation {
    condition     = contains(["homologacao", "producao"], var.ambiente)
    error_message = "ambiente precisa ser homologacao ou producao."
  }
}

variable "plano" {
  description = "Slug do plano na Hostinger (ex.: hostingercom-vps-kvm4-usd-1m)."
  type        = string
}

variable "data_center_id" {
  description = "Datacenter. Cliente brasileiro sente latência de painel; prefira o mais próximo do Brasil disponível."
  type        = number
}

variable "template_id" {
  description = "Imagem base. Ubuntu LTS puro — a imagem 'com Docker' do provedor vem com versão que você não controla."
  type        = number
}

variable "chaves_ssh" {
  description = "IDs de chave SSH já cadastradas. Senha de root existe porque o provedor exige, mas o acesso é por chave."
  type        = list(string)
  default     = []
}

variable "fqdn_traefik" {
  description = "Host do painel do Traefik; usado só para montar o cloud-init."
  type        = string
}

variable "email_acme" {
  description = "E-mail da conta Let's Encrypt. Recebe aviso de certificado prestes a vencer — use um que alguém lê."
  type        = string
}

variable "repositorio_git" {
  description = "URL do repositório clonado em /opt/pipe pelo cloud-init. Deploy posterior é git pull + compose up."
  type        = string
}

# O script de pós-instalação é o único ponto onde Terraform toca o sistema operacional.
# Ele instala Docker, cria /opt/pipe e registra os timers de backup e de teste de
# restauração. Tudo idempotente: rodar duas vezes não quebra nada.
resource "hostinger_vps_post_install_script" "pipe" {
  name    = "${var.nome}-bootstrap"
  content = templatefile("${path.module}/cloud-init.yaml", {
    repositorio_git = var.repositorio_git
    email_acme      = var.email_acme
    fqdn_traefik    = var.fqdn_traefik
  })
}

resource "hostinger_vps" "pipe" {
  plan                   = var.plano
  data_center_id         = var.data_center_id
  template_id            = var.template_id
  hostname               = var.nome
  ssh_key_ids            = var.chaves_ssh
  post_install_script_id = hostinger_vps_post_install_script.pipe.id

  lifecycle {
    # Recriar a VPS de produção por causa de uma mudança de template é perda de dado.
    # Para trocar de máquina, suba a nova ao lado e migre; não deixe o Terraform decidir.
    prevent_destroy = true
  }
}

output "ipv4" {
  description = "IP público. CONFIRA o nome deste atributo no provider antes do primeiro apply."
  value       = hostinger_vps.pipe.ipv4
}

output "id" {
  value = hostinger_vps.pipe.id
}
