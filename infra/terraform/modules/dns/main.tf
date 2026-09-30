# DNS-only records for the apex, fixed services and tenant wildcard hosts.
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
  description = "Cloudflare zone ID."
  type        = string
}

variable "destino" {
  description = "Public IPv4 address of the edge."
  type        = string
}

variable "apex" {
  description = "Domain apex or staging subzone served by this edge."
  type        = string
}

locals {
  names = toset(["www", "api", "login", "crm", "metricas", "*", "*.desk"])
}

resource "cloudflare_dns_record" "subdominio" {
  for_each = local.names
  zone_id  = var.zone_id
  name     = "${each.key}.${var.apex}"
  type     = "A"
  content  = var.destino
  ttl      = 300
  proxied  = false
}

resource "cloudflare_dns_record" "apex" {
  zone_id = var.zone_id
  name    = var.apex
  type    = "A"
  content = var.destino
  ttl     = 300
  proxied = false
}

resource "cloudflare_dns_record" "caa" {
  zone_id = var.zone_id
  name    = var.apex
  type    = "CAA"
  ttl     = 300
  data = {
    flags = 0
    tag   = "issue"
    value = "letsencrypt.org"
  }
}
