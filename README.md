# Victor's Strike Counter

A lightweight, cartoon-styled web app that tracks disciplinary **strikes** for Victor. The count is stored on a small **Fastify + SQLite** API so **everyone sees the same number**; only someone with an **admin token** can change it.

## Features

- **Shared count** — One canonical strike total for all visitors (not per-browser).
- **Half strikes** — Adjust in steps of **0.5** or **1.0**; the UI shows a clipped “half” Victor head for 0.5.
- **Centered strike row** — Up to three strike icons stay centered; extras extend to the right without shifting the first three.
- **Timeout** — At **3.0+** strikes, a “VICTOR'S IN TIMEOUT!” banner appears.
- **Zero strikes** — Shows **good_victor.png** and the line *Victor, you're a good boy!*
- **Admin lock** — Strike buttons stay disabled until you unlock with the server’s `ADMIN_TOKEN` (stored in `sessionStorage` for that session only).

## Tech stack

| Layer | Technology |
|--------|------------|
| Frontend | React 19, TypeScript, Vite 8, Tailwind CSS 4, Lucide icons |
| Backend | Node.js 22, Fastify 5, better-sqlite3 |
| Deploy | Docker Compose: **nginx** (static SPA + `/api` proxy) + **api** |

## Repository layout

```
├── api/                 # Fastify API + Dockerfile
├── web/                 # nginx.conf + Dockerfile for the SPA image
├── public/              # Static assets (Victor images, favicon)
├── src/                 # React app
├── docker-compose.yml   # api + web + SQLite volume
├── .env.example         # Copy to `.env` for Docker (ADMIN_TOKEN)
└── package.json         # Frontend scripts
```

## Prerequisites

- **Node.js 22+** (local dev and frontend build)
- **Docker** + Docker Compose (Pi or server deploy)

## Local development

Run the **API** and **frontend** in two terminals.

### 1. API (terminal 1)

```bash
cd api
export ADMIN_TOKEN='dev-secret-change-me'
export SQLITE_PATH='./strikes.db'
npm install
npm start
```

Listens on **http://127.0.0.1:3000**.

### 2. Frontend (terminal 2)

```bash
npm install
npm run dev
```

Vite proxies **`/api`** to `http://127.0.0.1:3000`. Open the URL Vite prints (e.g. http://localhost:5173).

Use **Controls → Unlock to change strikes** and enter the same value as `ADMIN_TOKEN`.

### Scripts (frontend)

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server with HMR and API proxy |
| `npm run build` | Typecheck + production bundle to `dist/` |
| `npm run preview` | Serve `dist/` locally |
| `npm run lint` | ESLint |

## HTTP API

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/strikes` | None | `{ "count": number }` |
| `PUT` | `/api/strikes` | `Authorization: Bearer <ADMIN_TOKEN>` | Body `{ "count": number }`. Count must be ≥ 0 in **0.5** steps. Returns `{ "count": number }`. |

If `ADMIN_TOKEN` is unset, `PUT` responds with **503**.

## Deploy with Docker Compose (e.g. Raspberry Pi)

1. Copy **`.env.example`** to **`.env`** in the repo root (same folder as `docker-compose.yml`).

2. Set a long random **`ADMIN_TOKEN`** in `.env`:

   ```bash
   openssl rand -hex 32
   ```

3. Start:

   ```bash
   docker compose up -d --build
   ```

4. Open **http://&lt;host-ip&gt;:8080** (map a different host port in `docker-compose.yml` if you like).

SQLite data is in the Docker volume **`strikes-data`**, mounted at **`/data`** in the API container (`/data/strikes.db`).

### Cross-build for ARM64 (Pi from another machine)

```bash
docker buildx build --platform linux/arm64 -f api/Dockerfile -t victor-strikes-api ./api
docker buildx build --platform linux/arm64 -f web/Dockerfile -t victor-strikes-web .
```

Or run **`docker compose build`** directly **on the Pi** so the default platform matches.

### HTTPS / remote access

Put **Caddy**, **Traefik**, or **Cloudflare Tunnel** in front of the stack if you need TLS or a public hostname. The app itself is plain HTTP on port 80 inside the web container.

## Security

- The admin token is **shared-secret** protection: anyone who knows it can change strikes. Do **not** commit `.env` or bake the token into the frontend.
- This is appropriate for a **trusted household** context, not for strong adversarial security.

## License

This project is **private** (see `package.json`). Add a license file if you open-source it later.
