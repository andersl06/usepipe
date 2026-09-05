# Site do Pipe

Site estático em HTML e CSS puro. Sem framework, sem build, sem dependência de pacote.

```
index.html            landing page
blog/index.html       listagem de 6 pautas
ferramentas/index.html listagem de 8 ferramentas grátis
assets/site.css       tokens, componentes, tema claro e escuro
assets/site.js        alternador de tema e menu no celular
assets/*.svg          logo e favicon
```

## Ver localmente

Qualquer servidor estático serve. Os caminhos são absolutos (`/assets/...`), então abrir o
arquivo direto no navegador não funciona: precisa de um servidor.

```bash
cd apps/site
python -m http.server 8080
# http://127.0.0.1:8080
```

## Subir na VPS

O Traefik já roda na VPS OVH (`149.56.12.166`, em `/opt/stack`). O domínio ainda não foi
definido, então ele vem de variável.

```bash
# na VPS, dentro de /opt/stack/pipe-site
echo "SITE_HOST=pipe.com.br" > .env     # trocar pelo domínio escolhido
docker compose up -d --build
```

Antes do primeiro `up`, confirme o nome da rede do Traefik e ajuste no `docker-compose.yml`
se for diferente de `traefik`:

```bash
docker network ls
```

Para publicar uma alteração depois:

```bash
docker compose up -d --build
```

## Pendências antes de ir ao ar

- Definir o domínio e trocar `https://pipe.com.br/` nas tags `canonical`, `og:url` e no JSON-LD
  das três páginas.
- Gerar `assets/og-pipe.png` em 1200x630 (é a imagem de compartilhamento; hoje o caminho existe
  no `<meta>`, mas o arquivo ainda não).
- Publicar as páginas internas de ferramenta e de blog. Hoje os links apontam para URLs que
  ainda não existem e retornam a home, por causa do `error_page 404 /index.html` do nginx.
- Trocar `contato@pipe.com.br` no botão de demonstração pelo e-mail ou link de agenda real.
