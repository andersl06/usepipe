# Módulo: os cinco nomes do Pipe apontando para um destino só.
#
# Existe separado do módulo de VPS porque o destino muda de natureza entre os dois
# degraus (IP da VPS no pequeno, IP do load balancer no grande) e o resto é igual.
# https://registry.terraform.io/providers/cloudflare/cloudflare/latest/docs/resources/dns_record

terraform {
  required_version = ">= 1.11"
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }
}

variable "zone_id" {
  description = "Zona do domínio na Cloudflare."
  type        = string
}

variable "destino" {
  description = "IPv4 de destino: a VPS no degrau pequeno, o load balancer no grande."
  type        = string
}

variable "subdominios" {
  description = <<-TXT
    Mapa nome => proxied. O tenant é resolvido pelo login, não pelo subdomínio
    (§3 da spec), então esta lista é curta e fixa; subdomínio por cliente só
    aparece se o white-label exigir, e aí vira outra entrada aqui.
  TXT
  type        = map(bool)
  default = {
    "app"    = true  # Desk
    "gestao" = true
    "crm"    = true
    "api"    = false # webhook da Meta e MCP: proxy da Cloudflare atrapalha depuração de assinatura e stream
  }
}

variable "apex" {
  description = "Domínio raiz (site). Vazio não cria o registro do apex."
  type        = string
  default     = ""
}

resource "cloudflare_dns_record" "subdominio" {
  for_each = var.subdominios

  zone_id = var.zone_id
  name    = each.key
  type    = "A"
  content = var.destino
  # TTL baixo é o que permite trocar de máquina numa emergência sem esperar cache.
  # Com proxy da Cloudflare ligado o TTL é ignorado, mas o registro sem proxy usa.
  ttl     = 300
  proxied = each.value
}

resource "cloudflare_dns_record" "apex" {
  count = var.apex == "" ? 0 : 1

  zone_id = var.zone_id
  name    = "@"
  type    = "A"
  content = var.destino
  ttl     = 300
  proxied = true
}
