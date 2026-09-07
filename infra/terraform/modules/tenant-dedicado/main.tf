# Módulo: o cliente que exigiu separação física.
#
# Este é o ÚNICO caso em que um cliente vira recurso de Terraform. Cliente comum é
# linha no banco com RLS (§4 da spec) e nasce por script, em segundos, sem apply.
# Namespace por tenant como padrão seria multiplicar N deployments de uma aplicação
# que já é multi-tenant no código: paga-se N vezes o custo de operar, e não se
# ganha isolamento que a RLS não dê.
#
# O que muda aqui: namespace próprio, cota, banco próprio e um hostname próprio.
# O compose/imagem é o mesmo — a diferença é a variável de ambiente que diz que
# aquela instalação atende um tenant só.

terraform {
  required_version = ">= 1.11"
  required_providers {
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.35"
    }
  }
}

variable "tenant" {
  description = "Identificador curto do cliente. Vira namespace, label e prefixo de banco."
  type        = string
  validation {
    condition     = can(regex("^[a-z0-9-]{3,20}$", var.tenant))
    error_message = "Use minúsculas, números e hífen."
  }
}

variable "cpu_teto" {
  type    = string
  default = "4"
}

variable "memoria_teto" {
  type    = string
  default = "8Gi"
}

resource "kubernetes_namespace" "tenant" {
  metadata {
    name = "pipe-${var.tenant}"
    labels = {
      "app.kubernetes.io/part-of" = "pipe"
      "usepipe.com.br/tenant"        = var.tenant
    }
  }
}

# Cota é o que impede que o cliente dedicado derrube o cluster inteiro por causa de
# um pico de fila. Sem ela, "dedicado" isola o dado e não isola o recurso.
# https://kubernetes.io/docs/concepts/policy/resource-quotas/
resource "kubernetes_resource_quota" "tenant" {
  metadata {
    name      = "cota"
    namespace = kubernetes_namespace.tenant.metadata[0].name
  }
  spec {
    hard = {
      "requests.cpu"    = var.cpu_teto
      "requests.memory" = var.memoria_teto
      "limits.cpu"      = var.cpu_teto
      "limits.memory"   = var.memoria_teto
      "pods"            = "40"
    }
  }
}

# Pod sem requests declarado consome a cota inteira e trava o namespace. O
# LimitRange dá um valor padrão para o pod que esqueceu de declarar.
# https://kubernetes.io/docs/concepts/policy/limit-range/
resource "kubernetes_limit_range" "tenant" {
  metadata {
    name      = "padrao"
    namespace = kubernetes_namespace.tenant.metadata[0].name
  }
  spec {
    limit {
      type = "Container"
      default = {
        cpu    = "500m"
        memory = "512Mi"
      }
      default_request = {
        cpu    = "100m"
        memory = "256Mi"
      }
    }
  }
}

output "namespace" { value = kubernetes_namespace.tenant.metadata[0].name }
