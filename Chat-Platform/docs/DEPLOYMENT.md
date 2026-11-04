# Deployment guide (free-tier friendly)

SyncGrid needs: long-lived WebSocket connections, an always-running worker, MongoDB, Redis, and somewhere to keep uploads.
Hosts that **sleep when idle** (Render's free web services, Hugging Face Spaces, etc.) break the WebSocket server and the worker — avoid those.

Everything is driven by [`docker-compose.yml`](../docker-compose.yml) profiles:

| Profile | Adds |
|---|---|
| *(none)* | `mongodb`, `redis`, `api`, `websocket`, `worker`, `frontend` |
| `proxy` | **Caddy**: one public origin (`/` → SPA, `/api` → API, `/ws` → WebSocket), automatic HTTPS |
| `tunnel` | **Cloudflare Tunnel**: public HTTPS/WSS without opening any port |
| `scale` | a second WebSocket instance |
| `observability` | Prometheus + Grafana + Redis exporter (bound to localhost) |
| `alerts` | Alertmanager → Discord |
| `backup` | daily `mongodump` into `./backups` |

## 0. Configure `.env`

```bash
cd Chat-Platform
cp .env.example .env
# generate hex secrets (safe inside connection URLs):
openssl rand -hex 32   # JWT_SECRET
openssl rand -hex 24   # MONGO_PASSWORD, REDIS_PASSWORD, GRAFANA_PASSWORD
```

Set at least `JWT_SECRET`, `MONGO_PASSWORD`, `REDIS_PASSWORD`. For the same-origin proxy setups below also set:

```ini
VITE_API_URL=/api
VITE_WS_URL=/ws
TRUST_PROXY=1                 # so per-IP rate limits see real client IPs behind Caddy/Cloudflare
BIND_ADDR=127.0.0.1           # only the proxy is public
DOMAIN=chat.example.com       # or :80 behind a tunnel
CORS_ORIGIN=https://chat.example.com   # exactly your public origin (also enforced on the WebSocket upgrade)
APP_URL=https://chat.example.com       # used in email links
```

> **Changing database passwords later:** MongoDB/Redis only read the password when their volume is first created.
> If you started the stack earlier with different credentials, reset with `docker compose down -v` (this deletes data) or change the password inside the database.

## Option A — your own PC + Cloudflare Tunnel (free, no card)

Best for demos and evaluation. The app is reachable while your computer and Docker are running.

**Quick, no account (random URL each run)**
```bash
docker compose --profile proxy up -d --build     # with DOMAIN=:80
cloudflared tunnel --url http://localhost:80      # prints https://<random>.trycloudflare.com
```
Because the URL is only known after the tunnel starts, then set `CORS_ORIGIN` and `APP_URL` to that URL in `.env` and run
`docker compose --profile proxy up -d api websocket worker` to pick them up.

**Stable hostname (needs a domain added to a free Cloudflare account)**
1. Cloudflare Zero Trust → Networks → Tunnels → create a tunnel → copy its token into `.env` as `TUNNEL_TOKEN`.
2. Public hostname `chat.example.com` → service `http://caddy:80`.
3. `.env`: `DOMAIN=:80`, `CORS_ORIGIN`/`APP_URL` = `https://chat.example.com`.
4. `docker compose --profile proxy --profile tunnel up -d --build`

## Option B — always-on free VM (Oracle Cloud "Always Free") + free subdomain

1. Create an Always Free Ubuntu VM (ARM Ampere is the generous one; a card is needed only for identity verification). If your region shows "out of capacity", retry later or pick another region.
2. Open ports **80 and 443**: in the VCN security list *and* on the VM (`sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT`, same for 443 — Oracle images block them by default).
3. Install Docker, `git clone` your repo, create `.env`.
4. Get a free subdomain (e.g. DuckDNS → `yourname.duckdns.org` → the VM's public IP).
5. `.env`: `DOMAIN=yourname.duckdns.org`, `CORS_ORIGIN=APP_URL=https://yourname.duckdns.org`, `TRUST_PROXY=1`, `BIND_ADDR=127.0.0.1`.
6. `docker compose --profile proxy --profile backup up -d --build` — Caddy obtains and renews the Let's Encrypt certificate by itself.

(Google Cloud's free `e2-micro` also works but has 1 GB RAM; keep MongoDB/Redis on managed free tiers if you use it.)

## Email (free options)

Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` for the worker.

| Provider | Free allowance | Notes |
|---|---|---|
| Brevo | ~300 emails/day | SMTP relay `smtp-relay.brevo.com:587`; verify your sender address |
| Gmail | ~500/day | `smtp.gmail.com:587` with an **app password** (needs 2-step verification) |

Without SMTP, emails (verification, password reset, invitations, offline mentions) are only logged by the worker.
For local testing run Mailpit (`pnpm infra:up` includes it): `SMTP_HOST=localhost SMTP_PORT=1025`, inbox at <http://localhost:8025>.

## File storage

Default: the `uploads` Docker volume (persistent on a VM; **lost** on hosts with ephemeral disks).
For durable, shareable storage use any S3-compatible bucket — Cloudflare R2 (generous free tier), Backblaze B2, AWS S3:

```ini
S3_BUCKET=syncgrid-uploads
S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com   # empty for AWS
S3_REGION=auto                                            # e.g. us-east-1 for AWS
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
```
Files stay private: the API checks channel membership on every download and streams from the bucket.

## Backups & restore

`--profile backup` writes `./backups/syncgrid-<timestamp>.gz` daily and keeps 7 days (`BACKUP_KEEP_DAYS`, `BACKUP_INTERVAL_SECONDS`). Copy that folder off the machine.

```bash
# restore into the running database (replaces existing documents with the same _id)
docker compose cp backups/syncgrid-XXXX.gz mongodb:/tmp/restore.gz
docker compose exec mongodb sh -c 'mongorestore -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --archive=/tmp/restore.gz --gzip'
```
Redis uses AOF persistence; uploaded files are in the `uploads` volume (or your bucket).

## Monitoring & alerts

`--profile observability`: Grafana at <http://localhost:3001> (user `admin`, password `GRAFANA_PASSWORD`), Prometheus at :9090 — both bound to localhost; reach them over SSH (`ssh -L 3001:localhost:3001 user@server`) rather than exposing them.

Alerts (high 5xx rate, queue backlog, failed jobs, memory spike, target down):
1. Discord → channel settings → Integrations → Webhooks → copy the URL.
2. Save just that URL into `ops/alertmanager/discord_webhook_url` (git-ignored).
3. `docker compose --profile observability --profile alerts up -d`

## Scaling the WebSocket tier

Add instances (`--profile scale` shows the pattern: another `websocket` service with a unique `INSTANCE_ID`) and let the proxy balance them (in the Caddyfile: `reverse_proxy websocket:8080 websocket-2:8080`). No sticky sessions are needed — Redis delivers every frame to the instance that owns the recipient's socket, and clients reconnect automatically.

## Verify the deployment

```bash
cd Chat-Platform
API_URL=https://chat.example.com/api WS_URL=wss://chat.example.com/ws pnpm e2e
```
Notes: the suite registers ~20 throw-away accounts, and production mode rate-limits credential endpoints (`AUTH_RATE_LIMIT`, default 30 per 15 min per IP), so run it **once** per window, against a staging copy, or temporarily raise `AUTH_RATE_LIMIT`. The email flows run only if a Mailpit instance is reachable (`MAILPIT_URL`); otherwise they're skipped.
Then do a manual two-device chat over HTTPS and send one real email through your SMTP provider.

## What was verified, and what wasn't

Tested locally in Docker: the hardened stack (passworded MongoDB/Redis, localhost-bound ports) behind Caddy on one origin (`DOMAIN=:80`) — 134-check e2e, both browser suites, real SMTP via Mailpit, S3 storage against an S3-compatible server, backup **and restore**, Prometheus scraping, every Grafana panel query returning data, Alertmanager discovered by Prometheus and routing a test alert to the Discord receiver.
**Not** tested (needs your accounts/domain): Let's Encrypt issuance, Cloudflare Tunnel, an Oracle/GCP VM, delivery to a real Discord channel, a real SMTP provider, Cloudflare R2/B2.
