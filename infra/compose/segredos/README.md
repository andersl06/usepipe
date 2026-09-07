# segredos

Aqui vivem `producao.enc.env`, `producao-crm.enc.env` e os equivalentes de
homologação — **cifrados pelo SOPS**, e só assim. As regras de quem consegue
decifrar estão em [`../../.sops.yaml`](../../.sops.yaml).

```bash
cd infra
sops compose/segredos/producao.enc.env          # edita já decifrado
sops updatekeys compose/segredos/producao.enc.env  # depois de trocar destinatária
```

Arquivo em texto claro nesta pasta é defeito, não pressa. O modelo do conteúdo
está em [`../.env.prod.exemplo`](../.env.prod.exemplo).
