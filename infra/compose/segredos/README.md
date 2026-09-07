# segredos

Aqui vivem `producao.enc.env` e o equivalente de homologação — **cifrados pelo
SOPS**, e só assim. As regras de quem consegue decifrar estão em
[`../../.sops.yaml`](../../.sops.yaml).

**Um arquivo por ambiente, não um por serviço.** Houve um `producao-crm.enc.env`
aqui; ele saiu porque `apps/crm` é código nosso, no mesmo monorepo, lendo o mesmo
banco — o segundo arquivo cifrado não separava nada e era mais uma coisa para
esquecer de criar antes do primeiro `up`. Quando o fork AGPLv3 do Twenty entrar,
ele ganha o próprio: aí a separação existe por licença, não por hábito.

```bash
cd infra
sops compose/segredos/producao.enc.env          # edita já decifrado
sops updatekeys compose/segredos/producao.enc.env  # depois de trocar destinatária
```

Arquivo em texto claro nesta pasta é defeito, não pressa. O modelo do conteúdo
está em [`../env.prod.exemplo`](../env.prod.exemplo).
