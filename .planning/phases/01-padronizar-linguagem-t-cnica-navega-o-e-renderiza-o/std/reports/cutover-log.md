# Cutover log — gate 4 (VPS)

Deploy of the renamed code to the OVH VPS (`pipe.144-217-164-204.sslip.io`),
2026-09-26, from `limpeza` at commit c30903b. Rebuilt from scratch, no backup
of the running images, per the owner's decision (D-43: nothing in that database
is real yet).

## What was done

1. Packaged the tracked tree of `limpeza` (`git archive`) and unpacked it on the
   VPS as `~/pipe-src-en`. The VPS has no git checkout; it builds from a copied
   tree, as the previous deploys did.
2. Built the four images on the VPS, one at a time (3 GB of RAM), tagged `:en`
   so the previous `:demo` images stay in place as a rollback:
   | image | size |
   |---|---|
   | pipe-api:en | 318MB |
   | pipe-workers:en | 281MB |
   | pipe-management:en | 75.8MB |
   | pipe-desk:en | 74.4MB |
   Front-end build args point at production, because Vite bakes them in:
   Desk with `VITE_BASE=/desk/`, both with `VITE_URL_API=https://<host>`, and
   Management with `VITE_PIPE_DESK_URL=https://<host>/desk/`.
3. Updated `~/pipe/docker-compose.yml` (backup kept alongside it): the four
   images now point at `:en`, the `gestao` service became `management`, and
   `PIPE_URL_ENTRADA` points at `/login`, which is the route the screens serve.
4. Updated `~/pipe/.env`: `GOOGLE_URL_RETORNO` now ends in
   `/v1/auth/google/callback` (D-36). The variable NAME stays Portuguese (D-06);
   only its value changed.
5. `docker compose up -d --remove-orphans`. The old `pipe-gestao-1` container is
   gone; the four new ones report healthy.

## Verification

| check | result |
|---|---|
| containers | api, workers, desk, management all healthy |
| `GET /` (Management) | 200 |
| `GET /login` | 200 |
| `GET /desk/login` | 200 |
| `GET /v1/conversations` | 401 (needs a session, so the new route exists) |
| `GET /v1/conversas` | 404 (the old route is gone) |
| `GET /webhooks/whatsapp` | 403 (signature required, as before) |
| API and worker logs | no errors; the two matches for "error" are the route name `schedules/exceptions` |

## Owner action still needed

Google sign-in will refuse until `https://pipe.144-217-164-204.sslip.io/v1/auth/google/callback`
is registered as an authorised redirect URI in the Google console. The old
`/retorno` URL can be removed at the same time.

## Rollback

`docker compose` with the previous file (`docker-compose.yml.antes-en-*`) brings
back the `:demo` images, which were left on disk.
