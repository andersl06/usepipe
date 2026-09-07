# Produção do degrau pequeno: uma VPS só do Pipe.
#
# Este arquivo é curto de propósito. Ambiente é diretório, não workspace: workspace
# compartilha backend e credencial, e a recomendação da HashiCorp é justamente não
# usá-lo quando dev e prod exigem credenciais separadas.
# https://developer.hashicorp.com/terraform/cli/workspaces
#
# A regra que evita triplicar bloco: TUDO que é lógica vive em `modules/`; o
# ambiente só escolhe valores. Se você começar a copiar `resource` para cá, o
# módulo está errado.

terraform {
  required_version = ">= 1.11"
  required_providers {
    hostinger  = { source = "hostinger/hostinger", version = "~> 0.1" }
    cloudflare = { source = "cloudflare/cloudflare", version = "~> 5.0" }
  }
}

# Nenhum token no código. `HOSTINGER_API_TOKEN` e `CLOUDFLARE_API_TOKEN` saem do
# arquivo SOPS do operador e vivem só na sessão do shell que roda o apply.
provider "hostinger" {}
provider "cloudflare" {}

variable "zone_id" { type = string }
variable "email_acme" { type = string }
variable "repositorio_git" { type = string }

module "vps" {
  source = "../../modules/vps-pipe"

  nome            = "pipe-prod"
  ambiente        = "producao"
  plano           = "hostingercom-vps-kvm4-usd-1m"
  data_center_id  = 13
  template_id     = 1002
  fqdn_traefik    = "traefik.pipe.com.br"
  email_acme      = var.email_acme
  repositorio_git = var.repositorio_git
}

module "dns" {
  source = "../../modules/dns"

  zone_id = var.zone_id
  destino = module.vps.ipv4
  apex    = "pipe.com.br"
}

output "ip" { value = module.vps.ipv4 }
