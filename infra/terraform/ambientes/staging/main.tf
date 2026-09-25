# Homologação: a mesma coisa, menor e em subdomínio próprio.
#
# Existe para que migration e release sejam vistas rodando antes do cliente ver.
# A máquina é menor porque o que se valida aqui é comportamento, não capacidade.

terraform {
  required_version = ">= 1.11"
  required_providers {
    hostinger  = { source = "hostinger/hostinger", version = "~> 0.1" }
    cloudflare = { source = "cloudflare/cloudflare", version = "~> 5.0" }
  }
}

provider "hostinger" {}
provider "cloudflare" {}

variable "zone_id" { type = string }
variable "email_acme" { type = string }
variable "repositorio_git" { type = string }

module "vps" {
  source = "../../modules/vps-pipe"

  nome            = "pipe-homolog"
  ambiente        = "homologacao"
  plano           = "hostingercom-vps-kvm2-usd-1m"
  data_center_id  = 13
  template_id     = 1002
  fqdn_traefik    = "traefik.hml.usepipe.com.br"
  email_acme      = var.email_acme
  repositorio_git = var.repositorio_git
}

module "dns" {
  source = "../../modules/dns"

  zone_id = var.zone_id
  destino = module.vps.ipv4
  # Homologação não tem apex e não fica atrás do proxy: quando o TLS quebra,
  # você quer ver o erro do Traefik, não a página de erro da Cloudflare.
  subdominios = {
    "app.hml"    = false
    "gestao.hml" = false
    "crm.hml"    = false
    "api.hml"    = false
  }
}

output "ip" { value = module.vps.ipv4 }
