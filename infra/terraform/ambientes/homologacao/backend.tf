# Onde mora o estado — a decisão que derruba projeto quando é feita errado.
#
# Bucket S3-compatível, PRIVADO, com versionamento ligado. Versionamento é o que
# permite voltar um estado corrompido; sem ele, um `terraform state rm` errado é
# definitivo.
#
# Tranca: `use_lockfile = true`. O S3 passou a trancar sozinho por escrita
# condicional a partir do Terraform 1.10 (estável no 1.11), e os argumentos de
# DynamoDB estão depreciados — não existe mais motivo para manter uma tabela só
# para isso. https://developer.hashicorp.com/terraform/language/backend/s3
#
# Antes do primeiro apply, confirme que o endpoint suporta escrita condicional
# (If-None-Match). Provedor S3-compatível que não suporta aceita o apply e NÃO
# tranca: dois applies simultâneos corrompem o estado em silêncio. Teste uma vez,
# rodando dois `terraform plan` ao mesmo tempo — o segundo tem que reclamar.
#
# O bucket é criado à mão, uma vez, fora do Terraform: código que guarda o próprio
# estado no recurso que ele cria não tem como ser destruído nem recriado.
terraform {
  backend "s3" {
    bucket       = "pipe-tfstate"
    key          = "homologacao/terraform.tfstate"
    region       = "auto"
    use_lockfile = true

    # Endpoint não-AWS (R2/B2): sem estas, o backend tenta falar com a AWS.
    endpoints                   = { s3 = "https://<conta>.r2.cloudflarestorage.com" }
    skip_credentials_validation = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_metadata_api_check     = true
    use_path_style              = true
  }
}
