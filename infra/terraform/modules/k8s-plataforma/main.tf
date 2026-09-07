# Módulo: o que roda DENTRO do cluster e não é o Pipe — ingress, TLS e métrica.
#
# Fronteira consciente: Terraform instala os componentes de plataforma (Helm), e o
# Pipe em si é aplicado por Kustomize/Flux a partir de `infra/k8s/`. Misturar as
# duas coisas faz `terraform apply` virar deploy de aplicação, e aí toda correção
# de bug espera um plan.
#
# Nada de `kubernetes_manifest` aqui: esse recurso exige cluster acessível já no
# plan e quebra o pipeline no dia em que o cluster ainda não existe. CRD e
# ClusterIssuer ficam em `infra/k8s/valores/` e são aplicados pelo Kustomize.

terraform {
  required_version = ">= 1.11"
  required_providers {
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.17"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.35"
    }
  }
}

variable "email_acme" { type = string }

variable "namespace_app" {
  description = "Namespace da instalação compartilhada. Um só: o Pipe já é multi-tenant no código."
  type        = string
  default     = "pipe-prod"
}

resource "kubernetes_namespace" "app" {
  metadata {
    name   = var.namespace_app
    labels = { "app.kubernetes.io/part-of" = "pipe" }
  }
}

# Traefik, o mesmo do degrau pequeno. Não é gosto: o ingress-nginx mantido pelo
# projeto Kubernetes foi aposentado em março de 2026, sem correção de segurança.
# https://www.kubernetes.dev/blog/2025/11/12/ingress-nginx-retirement/
# Usar o mesmo ingress nos dois degraus significa um jeito só de escrever rota e
# um jeito só de depurar TLS às duas da manhã.
resource "helm_release" "traefik" {
  name             = "traefik"
  repository       = "https://traefik.github.io/charts"
  chart            = "traefik"
  namespace        = "traefik"
  create_namespace = true
  values           = [file("${path.root}/../../../k8s/valores/traefik-values.yaml")]
}

# cert-manager em vez do ACME embutido do Traefik: no cluster há mais de uma
# réplica de ingress, e o armazenamento em arquivo do Traefik não é compartilhável.
# https://cert-manager.io/docs/installation/helm/
resource "helm_release" "cert_manager" {
  name             = "cert-manager"
  repository       = "https://charts.jetstack.io"
  chart            = "cert-manager"
  namespace        = "cert-manager"
  create_namespace = true

  set {
    name  = "crds.enabled"
    value = "true"
  }
}

# Métrica e alerta. O chart traz Prometheus, Alertmanager, Grafana e os exporters
# de nó — que no degrau pequeno são quatro contêineres montados na mão.
resource "helm_release" "monitoramento" {
  name             = "kube-prometheus-stack"
  repository       = "https://prometheus-community.github.io/helm-charts"
  chart            = "kube-prometheus-stack"
  namespace        = "observabilidade"
  create_namespace = true
  values           = [file("${path.root}/../../../k8s/valores/kube-prometheus-stack-values.yaml")]
}

output "namespace_app" { value = kubernetes_namespace.app.metadata[0].name }
